import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type {
  FeishuDocCacheStateView,
  FeishuDocContentView,
  FeishuDocMediaPreviewResult,
  FeishuDocTreeBranchInput,
  FeishuDocTreeBranchResult,
  FeishuDocTreeLoadInput,
  FeishuDocTreeLoadResult,
  FeishuDocTreeQuery,
  FeishuDocTreeView,
  FeishuDocWhiteboardPreviewResult,
  FeishuDocWorkspacePullResult,
  FeishuDocWorkspacePushResult,
  FeishuDocsCapabilitiesView,
  FeishuWorkspaceDocInput,
} from "../../../../../shared/desktop-feishu";
import {
  resolveDesktopFeishuDocMediaPreviewUrl,
  resolveDesktopFeishuDocWhiteboardPreviewUrl,
} from "../../../../../shared/desktop-feishu-oauth";
import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import type { DesktopFeishuDocRuntimePort } from "../../abstraction/ports/desktop-feishu-doc-runtime.ports";
import type { DesktopFeishuStorePort } from "../../abstraction/ports/desktop-feishu-store.ports";
import type { DesktopWorkspaceQueryPort } from "../../../workspace/abstraction/ports/desktop-workspace.ports";
import {
  FeishuDocMarkdownWorkspaceCache,
  type FeishuDocMarkdownWorkspaceEntry,
} from "./feishu-doc-markdown-workspace-cache";
import { FeishuDocAssetCache } from "./feishu-doc-asset-cache";
import {
  DesktopFeishuOpenApiError,
  isDesktopFeishuAccessTokenExpiredError,
} from "./desktop-feishu-openapi-client";
import { feishuDocIRToMdx } from "./feishu-doc-mdx-codec";
import { FeishuDocIRWorkspaceCache } from "./feishu-doc-ir-workspace-cache";
import { runDesktopFeishuStoreMutation } from "./desktop-feishu-store-mutation";

type DesktopFeishuDocWorkspaceRuntimePort = {
  openDocument(input: { workspaceId: string; docId: string }): Promise<{ source: "cache" | "remote"; ir: FeishuDocIR }>;
  pullLatest(input: { workspaceId: string; docId: string; overwrite: boolean }): Promise<{ ir: FeishuDocIR; backupPath?: string }>;
  pushDocument(input: { workspaceId: string; docId: string }): Promise<{ status: "succeeded" | "blocked" | "failed"; message?: string }>;
};

type DesktopFeishuDocTreeLoaderPort = {
  loadRoot(input: FeishuDocTreeLoadInput): Promise<FeishuDocTreeLoadResult>;
  loadBranch(input: FeishuDocTreeBranchInput): Promise<FeishuDocTreeBranchResult>;
};

type DesktopFeishuDocContentSourcePort = {
  readDocumentContent(accessToken: string, docId: string): Promise<FeishuDocContentView>;
  readDocumentIR?(accessToken: string, docId: string): Promise<FeishuDocIR>;
};

type DesktopFeishuDocRuntimeDeps =
  | DesktopFeishuStorePort
  | DesktopFeishuDocTreeLoaderPort
  | {
      store: DesktopFeishuStorePort;
      loader: DesktopFeishuDocTreeLoaderPort;
      contentSource?: DesktopFeishuDocContentSourcePort;
      accessToken?: (input?: { forceRefresh?: boolean }) => Promise<string>;
      fetchImpl?: typeof fetch;
      docWorkspaceRuntime?: DesktopFeishuDocWorkspaceRuntimePort;
      workspaceQuery?: DesktopWorkspaceQueryPort;
    };

type FeishuDocPreviewBinary = {
  contentType: string;
  bytes: Uint8Array;
};

const FEISHU_OPEN_API_BASE_URL = "https://open.feishu.cn/open-apis";

function openApiBinaryUrl(path: string): string {
  return `${FEISHU_OPEN_API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

const DEFAULT_FEISHU_DOC_ANALYSIS: FeishuDocContentView["analysis"] = {
  riskyBlocks: [],
  riskySync: false,
  syncMode: null,
  riskyBlockMode: "safe",
};

const FEISHU_DOC_ASSET_CACHE_DIRECTORY = join(".maomi", "feishu-docs", "_assets");

function deriveDocTitle(docId: string, markdown: string): string {
  const heading = markdown
    .split(/\r?\n/)
    .slice(0, 8)
    .find((line) => /^#\s+/.test(line.trim()));

  return heading?.replace(/^#\s+/, "").trim() || docId;
}

function hasFeishuImagePreviewGap(markdown: string): boolean {
  const imageTags = markdown.match(/<FeishuImage\b[^>]*\/?\s*>/gi) ?? [];
  return imageTags.some((tag) => /\btoken\s*=\s*"/i.test(tag) && !/\bsrc\s*=\s*"/i.test(tag));
}

function escapeFeishuDocsAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildFeishuImagePreviewUrlMap(ir: FeishuDocIR): Map<string, string> {
  const urls = new Map<string, string>();

  for (const asset of Object.values(ir.assets)) {
    if (asset.kind !== "image" || asset.status !== "cached" || !asset.absolutePath?.trim()) {
      continue;
    }

    urls.set(asset.token, pathToFileURL(asset.absolutePath).toString());
  }

  return urls;
}

function mergeFeishuImagePreviewSources(markdown: string, ir: FeishuDocIR): string {
  const previewUrlMap = buildFeishuImagePreviewUrlMap(ir);
  if (previewUrlMap.size === 0) {
    return markdown;
  }

  return markdown.replace(/<FeishuImage\b([^>]*)\/?\s*>/gi, (fullMatch, rawAttributes: string) => {
    const token = /\btoken\s*=\s*"([^"]+)"/i.exec(rawAttributes)?.[1]?.trim();
    if (!token) {
      return fullMatch;
    }

    const previewUrl = previewUrlMap.get(token);
    if (!previewUrl) {
      return fullMatch;
    }

    const escapedPreviewUrl = escapeFeishuDocsAttribute(previewUrl);
    const trimmedAttributes = rawAttributes.trim();
    const nextAttributes = /\bsrc\s*=\s*"[^"]*"/i.test(trimmedAttributes)
      ? trimmedAttributes.replace(/\bsrc\s*=\s*"[^"]*"/i, `src="${escapedPreviewUrl}"`)
      : `${trimmedAttributes}${trimmedAttributes ? " " : ""}src="${escapedPreviewUrl}"`;

    return fullMatch.endsWith("/>")
      ? `<FeishuImage ${nextAttributes} />`
      : `<FeishuImage ${nextAttributes}>`;
  });
}

function createFeishuPreviewDownloadError(input: {
  label: string;
  status: number;
  detail: string;
}): DesktopFeishuOpenApiError {
  let code: number | undefined;
  let message = input.detail.trim();

  if (message) {
    try {
      const parsed = JSON.parse(message) as { code?: unknown; msg?: unknown };
      code = typeof parsed.code === "number" ? parsed.code : undefined;
      if (typeof parsed.msg === "string" && parsed.msg.trim()) {
        message = parsed.msg.trim();
      }
    } catch {
      // Keep the original text when the preview endpoint does not return JSON.
    }
  }

  return new DesktopFeishuOpenApiError({
    message: `${input.label}预览下载失败（${input.status}）${message ? `：${message.slice(0, 240)}` : ""}`,
    status: input.status,
    code,
    responseText: input.detail,
  });
}

function isStorePort(value: DesktopFeishuDocRuntimeDeps): value is DesktopFeishuStorePort {
  return "read" in value && "write" in value;
}

function isRuntimeBundle(
  value: DesktopFeishuDocRuntimeDeps,
): value is {
  store: DesktopFeishuStorePort;
  loader: DesktopFeishuDocTreeLoaderPort;
  contentSource?: DesktopFeishuDocContentSourcePort;
  accessToken?: (input?: { forceRefresh?: boolean }) => Promise<string>;
  fetchImpl?: typeof fetch;
  docWorkspaceRuntime?: DesktopFeishuDocWorkspaceRuntimePort;
  workspaceQuery?: DesktopWorkspaceQueryPort;
} {
  return "store" in value && "loader" in value;
}

export class DesktopFeishuDocRuntime implements DesktopFeishuDocRuntimePort {
  private readonly store: DesktopFeishuStorePort | null;
  private readonly loader: DesktopFeishuDocTreeLoaderPort;
  private readonly contentSource: DesktopFeishuDocContentSourcePort | null;
  private readonly accessToken: ((input?: { forceRefresh?: boolean }) => Promise<string>) | null;
  private readonly fetchImpl: typeof fetch;
  private readonly docWorkspaceRuntime: DesktopFeishuDocWorkspaceRuntimePort | null;
  private readonly workspaceQuery: DesktopWorkspaceQueryPort | null;

  constructor(deps: DesktopFeishuDocRuntimeDeps) {
    if (isRuntimeBundle(deps)) {
      this.store = deps.store;
      this.loader = deps.loader;
      this.contentSource = deps.contentSource ?? null;
      this.accessToken = deps.accessToken ?? null;
      this.fetchImpl = deps.fetchImpl ?? fetch;
      this.docWorkspaceRuntime = deps.docWorkspaceRuntime ?? null;
      this.workspaceQuery = deps.workspaceQuery ?? null;
      return;
    }

    if (isStorePort(deps)) {
      this.store = deps;
      this.loader = this.createStoreBackedLoader(deps);
      this.contentSource = null;
      this.accessToken = null;
      this.fetchImpl = fetch;
      this.docWorkspaceRuntime = null;
      this.workspaceQuery = null;
      return;
    }

    this.store = null;
    this.loader = deps;
    this.contentSource = null;
    this.accessToken = null;
    this.fetchImpl = fetch;
    this.docWorkspaceRuntime = null;
    this.workspaceQuery = null;
  }

  async getDocsCapabilities(): Promise<FeishuDocsCapabilitiesView> {
    return {
      mode: "developer",
      accessKind: "developer_oauth",
      accessLabel: "智能助手 OAuth",
      managedMcpId: "desktop.feishu.smart-assistant",
      endpoint: "desktop://feishu-assistant/docs",
      availableTools: [
        "search-doc",
        "fetch-doc",
        "create-doc",
        "update-doc",
        "docs.list_nodes",
      ],
      toolDetails: [
        {
          name: "search-doc",
          description: "Search Feishu docs and wiki nodes.",
        },
        {
          name: "fetch-doc",
          description: "Read Feishu doc content and tree metadata.",
        },
      ],
      canSearchDocs: true,
      canListDocs: true,
      canFetchDocs: true,
      canUpdateDocs: true,
      canBrowseTree: true,
      canReadDocs: true,
      canWriteDocs: true,
    };
  }

  async loadDocTreeRoot(input: FeishuDocTreeLoadInput): Promise<FeishuDocTreeLoadResult> {
    await this.rememberDocTreeRootToken(input.token);
    return this.loader.loadRoot(input);
  }

  private async rememberDocTreeRootToken(token: string): Promise<void> {
    const normalizedToken = token.trim();
    if (!this.store || !normalizedToken) {
      return;
    }

    await runDesktopFeishuStoreMutation(this.store, (snapshot) => {
      snapshot.docTreeCache.lastRootToken = normalizedToken;
      snapshot.docTreeCache.lastRootUpdatedAt = new Date().toISOString();
    });
  }

  async loadDocTreeBranch(input: FeishuDocTreeBranchInput): Promise<FeishuDocTreeBranchResult> {
    return this.loader.loadBranch(input);
  }

  async getDocTree(input: FeishuDocTreeQuery): Promise<FeishuDocTreeView> {
    if (!input.docId) {
      return {
        root: input.root,
        nodes: [],
        hasMore: false,
      };
    }

    const result = input.root === "document"
      ? await this.loadDocTreeBranch({
          rootToken: input.docId,
          parentToken: input.docId,
          forceRefresh: input.forceRefresh,
        })
      : await this.loadDocTreeRoot({
          token: input.docId,
          forceRefresh: input.forceRefresh,
        });

    return {
      root: input.root,
      parentDocId: input.docId,
      nodes: result.nodes,
      hasMore: result.hasMore,
      ...(result.pageToken ? { pageToken: result.pageToken } : {}),
    };
  }

  async getDocContent(docId: string): Promise<FeishuDocContentView> {
    const existing = await this.readStoredDoc(docId) ?? undefined;

    if (this.contentSource && this.accessToken) {
      try {
        const item = await this.contentSource.readDocumentContent(await this.accessToken(), docId);
        if (this.store) {
          await runDesktopFeishuStoreMutation(this.store, (snapshot) => {
            snapshot.docs[docId] = item;
          });
        }
        return item;
      } catch {
        if (existing) {
          return existing;
        }
        throw new Error("文档内容加载失败");
      }
    }

    if (existing) {
      return existing;
    }

    throw new Error("文档内容加载失败");
  }

  private requireStore(): DesktopFeishuStorePort {
    if (!this.store) {
      throw new Error("Desktop Feishu doc store is not configured");
    }
    return this.store;
  }

  private async readStoredDoc(docId: string): Promise<FeishuDocContentView | null> {
    if (!this.store) {
      return null;
    }

    const snapshot = await this.store.read();
    return snapshot.docs[docId] ?? null;
  }

  private async persistDoc(item: FeishuDocContentView): Promise<void> {
    if (!this.store) {
      return;
    }

    await runDesktopFeishuStoreMutation(this.store, (snapshot) => {
      snapshot.docs[item.docId] = item;
    });
  }

  private createDocContentView(input: {
    docId: string;
    markdown: string;
    title?: string;
    existing?: FeishuDocContentView | null;
    cache?: FeishuDocCacheStateView;
    message?: string;
  }): FeishuDocContentView {
    const title = input.title?.trim()
      ? input.title.trim()
      : input.existing?.title?.trim()
        ? input.existing.title.trim()
        : deriveDocTitle(input.docId, input.markdown);
    const analysis = input.existing?.analysis ?? DEFAULT_FEISHU_DOC_ANALYSIS;
    const message = input.message ?? input.existing?.message;
    const cache = input.cache ?? input.existing?.cache;

    return {
      ...(input.existing ?? {
        docId: input.docId,
        title,
        markdown: "",
        length: 0,
        totalLength: 0,
        offset: 0,
        analysis,
      }),
      docId: input.docId,
      title,
      markdown: input.markdown,
      length: input.markdown.length,
      totalLength: input.markdown.length,
      offset: 0,
      analysis,
      ...(message ? { message } : {}),
      ...(cache ? { cache } : {}),
    };
  }

  private async resolveWorkspaceMarkdownCache(workspaceId: string): Promise<FeishuDocMarkdownWorkspaceCache | null> {
    const directoryPath = await this.resolveWorkspaceDirectoryPath(workspaceId);
    return directoryPath ? new FeishuDocMarkdownWorkspaceCache(directoryPath) : null;
  }

  private async resolveWorkspaceDirectoryPath(workspaceId: string): Promise<string | null> {
    if (!this.workspaceQuery) {
      return null;
    }

    const workspace = await this.workspaceQuery.get(workspaceId);
    if (!workspace?.directoryPath.trim()) {
      return null;
    }

    return workspace.directoryPath;
  }

  private async persistWorkspaceIR(input: {
    workspaceRoot: string;
    docId: string;
    ir: FeishuDocIR;
  }): Promise<void> {
    const cache = new FeishuDocIRWorkspaceCache(input.workspaceRoot);
    await cache.writeRemote(input.docId, input.ir);
    await cache.writeDocument(input.docId, input.ir);
    await cache.writeBase(input.docId, input.ir);
  }

  private async hydrateWorkspaceDocumentAssets(input: {
    workspaceId: string;
    docId: string;
    workspaceRoot: string;
    ir: FeishuDocIR;
  }): Promise<FeishuDocIR> {
    const assetEntries = Object.entries(input.ir.assets);
    if (assetEntries.length === 0) {
      return input.ir;
    }

    const assetCacheRoot = join(input.workspaceRoot, FEISHU_DOC_ASSET_CACHE_DIRECTORY);
    const assetCache = new FeishuDocAssetCache(assetCacheRoot);
    const nextAssets = { ...input.ir.assets };
    let changed = false;

    for (const [token, asset] of assetEntries) {
      if (asset.kind !== "image") {
        continue;
      }

      if (asset.status === "cached" && asset.absolutePath?.trim()) {
        continue;
      }

      if (asset.status === "cached" && asset.localPath.trim()) {
        const absolutePath = join(assetCacheRoot, asset.localPath);
        nextAssets[token] = {
          ...asset,
          absolutePath,
        };
        changed = true;
        continue;
      }

      try {
        const preview = await this.downloadPreviewBinary({
          token,
          label: "文档图片",
          openApiPath: `/drive/v1/medias/${encodeURIComponent(token)}/download`,
        });
        const cachedAsset = await assetCache.writeAsset({
          workspaceId: input.workspaceId,
          docId: input.docId,
          token,
          kind: asset.kind,
          mime: preview.contentType || asset.mime || "application/octet-stream",
          bytes: preview.bytes,
          width: asset.width,
          height: asset.height,
          name: asset.name,
        });
        nextAssets[token] = {
          ...asset,
          ...cachedAsset,
        };
        changed = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        nextAssets[token] = {
          ...asset,
          status: "error",
          error: message,
        };
        changed = true;
      }
    }

    return changed
      ? {
          ...input.ir,
          assets: nextAssets,
        }
      : input.ir;
  }

  private async readWorkspaceRemoteContentFromIR(
    input: FeishuWorkspaceDocInput,
  ): Promise<{ ir: FeishuDocIR; markdown: string; title: string; workspaceRoot: string } | null> {
    if (!this.accessToken || !this.contentSource?.readDocumentIR) {
      return null;
    }

    const workspaceRoot = await this.resolveWorkspaceDirectoryPath(input.workspaceId);
    if (!workspaceRoot) {
      return null;
    }

    const remoteIR = await this.contentSource.readDocumentIR(await this.accessToken(), input.docId);
    const hydratedIR = await this.hydrateWorkspaceDocumentAssets({
      workspaceId: input.workspaceId,
      docId: input.docId,
      workspaceRoot,
      ir: remoteIR,
    });
    const markdown = feishuDocIRToMdx(hydratedIR).trimEnd();

    return {
      ir: hydratedIR,
      markdown,
      title: hydratedIR.document.title || input.docId,
      workspaceRoot,
    };
  }

  private async readWorkspaceMarkdownState(
    workspaceId: string,
    docId: string,
  ): Promise<{
    cache: FeishuDocMarkdownWorkspaceCache;
    document: FeishuDocMarkdownWorkspaceEntry | null;
    base: FeishuDocMarkdownWorkspaceEntry | null;
  } | null> {
    const cache = await this.resolveWorkspaceMarkdownCache(workspaceId);
    if (!cache) {
      return null;
    }

    const [document, base] = await Promise.all([cache.readDocument(docId), cache.readBase(docId)]);
    return { cache, document, base };
  }

  private buildWorkspaceCacheState(input: {
    workspaceId: string;
    document: FeishuDocMarkdownWorkspaceEntry;
    base: FeishuDocMarkdownWorkspaceEntry | null;
    previous?: FeishuDocCacheStateView;
    lastPulledAt?: string;
    lastPushedAt?: string;
  }): FeishuDocCacheStateView {
    const lastPulledAt = input.lastPulledAt ?? input.previous?.lastPulledAt;
    const lastPushedAt = input.lastPushedAt ?? input.previous?.lastPushedAt;

    return {
      workspaceId: input.workspaceId,
      cacheRelativePath: input.document.relativePath,
      cacheAbsolutePath: input.document.absolutePath,
      ...(input.base
        ? {
            baseRelativePath: input.base.relativePath,
            baseAbsolutePath: input.base.absolutePath,
            baseRemoteChecksum: input.base.checksum,
          }
        : {}),
      hasBaseline: Boolean(input.base),
      hasLocalChanges: input.base ? input.document.checksum !== input.base.checksum : true,
      localChecksum: input.document.checksum,
      ...(lastPulledAt ? { lastPulledAt } : {}),
      ...(lastPushedAt ? { lastPushedAt } : {}),
      status: input.base ? "cached" : "local_only",
    };
  }

  private async readWorkspaceDocFromCache(
    input: FeishuWorkspaceDocInput,
    existing?: FeishuDocContentView | null,
  ): Promise<FeishuDocContentView | null> {
    const state = await this.readWorkspaceMarkdownState(input.workspaceId, input.docId);
    if (!state?.document) {
      return null;
    }

    const current = existing ?? await this.readStoredDoc(input.docId);
    const item = this.createDocContentView({
      docId: input.docId,
      title: current?.title,
      markdown: state.document.markdown,
      existing: current,
      cache: this.buildWorkspaceCacheState({
        workspaceId: input.workspaceId,
        document: state.document,
        base: state.base,
        previous: current?.cache,
      }),
    });

    await this.persistDoc(item);
    return item;
  }

  private async writeWorkspaceDoc(input: {
    workspaceId: string;
    docId: string;
    markdown: string;
    title?: string;
    existing?: FeishuDocContentView | null;
    baseMarkdown?: string;
    lastPulledAt?: string;
    lastPushedAt?: string;
  }): Promise<FeishuDocContentView | null> {
    const state = await this.readWorkspaceMarkdownState(input.workspaceId, input.docId);
    if (!state) {
      return null;
    }

    const base = typeof input.baseMarkdown === "string"
      ? await state.cache.writeBase(input.docId, input.baseMarkdown)
      : state.base;
    const document = await state.cache.writeDocument(input.docId, input.markdown);
    const current = input.existing ?? await this.readStoredDoc(input.docId);
    const item = this.createDocContentView({
      docId: input.docId,
      title: input.title,
      markdown: document.markdown,
      existing: current,
      cache: this.buildWorkspaceCacheState({
        workspaceId: input.workspaceId,
        document,
        base,
        previous: current?.cache,
        lastPulledAt: input.lastPulledAt,
        lastPushedAt: input.lastPushedAt,
      }),
    });

    await this.persistDoc(item);
    return item;
  }

  private createStoreBackedLoader(store: DesktopFeishuStorePort): DesktopFeishuDocTreeLoaderPort {
    return {
      loadRoot: async (input) => {
        const snapshot = await store.read();
        const nodes = Object.values(snapshot.docs).map((doc: any) => ({
          id: doc.docId,
          token: doc.docId,
          kind: "document" as const,
          docId: doc.docId,
          title: doc.title,
          docType: "doc",
          hasChild: false,
          updateTime: doc.updatedAt,
        }));

        if (nodes.every((item) => item.token !== input.token)) {
          nodes.unshift({
            id: input.token,
            token: input.token,
            kind: "document" as const,
            docId: input.token,
            title: input.token,
            docType: "doc",
            hasChild: false,
            updateTime: new Date().toISOString(),
          });
        }

        return {
          rootToken: input.token,
          rootKind: "document",
          nodes,
          hasMore: false,
          source: "cache",
          refreshing: false,
          stale: false,
          loadedAt: new Date().toISOString(),
        };
      },
      loadBranch: async (input) => ({
        rootToken: input.rootToken,
        parentToken: input.parentToken,
        nodes: [],
        hasMore: false,
        source: "cache",
        refreshing: false,
        stale: false,
        loadedAt: new Date().toISOString(),
      }),
    };
  }

  async getDocMediaPreviewUrls(input: { fileTokens: string[] }): Promise<FeishuDocMediaPreviewResult> {
    return {
      items: input.fileTokens.map((fileToken) => ({
        fileToken,
        tmpDownloadUrl: resolveDesktopFeishuDocMediaPreviewUrl(fileToken),
      })),
      errors: [],
    } as unknown as FeishuDocMediaPreviewResult;
  }

  async getDocWhiteboardPreviewUrls(input: {
    whiteboardTokens: string[];
  }): Promise<FeishuDocWhiteboardPreviewResult> {
    return {
      items: input.whiteboardTokens.map((whiteboardToken) => ({
        whiteboardToken,
        tmpDownloadUrl: resolveDesktopFeishuDocWhiteboardPreviewUrl(whiteboardToken),
      })),
      errors: [],
    } as unknown as FeishuDocWhiteboardPreviewResult;
  }

  async readDocMediaPreview(fileToken: string): Promise<FeishuDocPreviewBinary> {
    const normalizedToken = fileToken.trim();
    return this.downloadPreviewBinary({
      token: normalizedToken,
      label: "文档图片",
      openApiPath: `/drive/v1/medias/${encodeURIComponent(normalizedToken)}/download`,
    });
  }

  async readDocWhiteboardPreview(whiteboardToken: string): Promise<FeishuDocPreviewBinary> {
    const normalizedToken = whiteboardToken.trim();
    return this.downloadPreviewBinary({
      token: normalizedToken,
      label: "文档白板",
      openApiPath: `/drive/v1/medias/${encodeURIComponent(normalizedToken)}/download`,
    });
  }

  private async downloadPreviewBinary(input: {
    token: string;
    label: string;
    openApiPath: string;
  }): Promise<FeishuDocPreviewBinary> {
    const normalizedToken = input.token.trim();
    if (!normalizedToken) {
      throw new Error(`${input.label} token 不能为空`);
    }

    if (!this.accessToken) {
      throw new Error(`${input.label}预览当前不可用`);
    }

    const readResponse = async (forceRefresh = false): Promise<Response> => this.fetchImpl(openApiBinaryUrl(input.openApiPath), {
      method: "GET",
      headers: {
        authorization: `Bearer ${await this.accessToken?.({ forceRefresh })}`,
      },
    });

    let response = await readResponse(false);
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error = createFeishuPreviewDownloadError({
        label: input.label,
        status: response.status,
        detail,
      });
      if (!isDesktopFeishuAccessTokenExpiredError(error)) {
        throw error;
      }

      response = await readResponse(true);
      if (!response.ok) {
        throw createFeishuPreviewDownloadError({
          label: input.label,
          status: response.status,
          detail: await response.text().catch(() => ""),
        });
      }
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new Error(`${input.label}预览返回了空内容`);
    }

    return {
      contentType: response.headers.get("content-type")?.trim() || "application/octet-stream",
      bytes,
    };
  }

  async openWorkspaceDoc(input: FeishuWorkspaceDocInput): Promise<FeishuDocContentView> {
    const cached = await this.readWorkspaceDocFromCache(input);
    if (cached && hasFeishuImagePreviewGap(cached.markdown)) {
      try {
        const remoteFromIR = await this.readWorkspaceRemoteContentFromIR(input);
        if (remoteFromIR) {
          await this.persistWorkspaceIR({
            workspaceRoot: remoteFromIR.workspaceRoot,
            docId: input.docId,
            ir: remoteFromIR.ir,
          });

          const nextMarkdown = cached.cache?.hasLocalChanges === true
            ? mergeFeishuImagePreviewSources(cached.markdown, remoteFromIR.ir)
            : remoteFromIR.markdown;

          if (nextMarkdown !== cached.markdown || cached.cache?.hasLocalChanges !== true) {
            return await this.writeWorkspaceDoc({
              workspaceId: input.workspaceId,
              docId: input.docId,
              title: cached.cache?.hasLocalChanges === true ? cached.title : remoteFromIR.title,
              markdown: nextMarkdown,
              existing: cached,
              ...(cached.cache?.hasLocalChanges === true
                ? {}
                : {
                    baseMarkdown: remoteFromIR.markdown,
                    lastPulledAt: new Date().toISOString(),
                  }),
            }) ?? this.createDocContentView({
              docId: input.docId,
              title: cached.cache?.hasLocalChanges === true ? cached.title : remoteFromIR.title,
              markdown: nextMarkdown,
              existing: cached,
            });
          }
        }
      } catch {
        return cached;
      }
    }

    if (cached) {
      return cached;
    }

    if (cached?.cache?.hasLocalChanges !== true) {
      try {
        const remoteFromIR = await this.readWorkspaceRemoteContentFromIR(input);
        if (remoteFromIR) {
          await this.persistWorkspaceIR({
            workspaceRoot: remoteFromIR.workspaceRoot,
            docId: input.docId,
            ir: remoteFromIR.ir,
          });
          return await this.writeWorkspaceDoc({
            workspaceId: input.workspaceId,
            docId: input.docId,
            title: remoteFromIR.title,
            markdown: remoteFromIR.markdown,
            existing: cached ?? undefined,
            baseMarkdown: remoteFromIR.markdown,
            lastPulledAt: new Date().toISOString(),
          }) ?? this.createDocContentView({
            docId: input.docId,
            title: remoteFromIR.title,
            markdown: remoteFromIR.markdown,
            existing: cached,
          });
        }
      } catch {
        if (cached) {
          return cached;
        }
      }
    }

    const remote = await this.getDocContent(input.docId);
    return await this.writeWorkspaceDoc({
      workspaceId: input.workspaceId,
      docId: input.docId,
      title: remote.title,
      markdown: remote.markdown,
      existing: remote,
      baseMarkdown: remote.markdown,
      lastPulledAt: new Date().toISOString(),
    }) ?? remote;
  }

  async getWorkspaceDocLocalDraft(input: FeishuWorkspaceDocInput): Promise<FeishuDocContentView> {
    return await this.readWorkspaceDocFromCache(input) ?? this.openWorkspaceDoc(input);
  }

  async saveWorkspaceDocLocalDraft(input: {
    workspaceId: string;
    docId: string;
    title: string;
    markdown?: string;
    force?: boolean;
  }): Promise<FeishuDocContentView> {
    const current = await this.getWorkspaceDocLocalDraft({
      workspaceId: input.workspaceId,
      docId: input.docId,
    });
    const markdown = input.markdown ?? current.markdown ?? "";
    const item = await this.writeWorkspaceDoc({
      workspaceId: input.workspaceId,
      docId: input.docId,
      title: input.title,
      markdown,
      existing: current,
    });

    if (item) {
      return item;
    }

    const fallback = this.createDocContentView({
      docId: input.docId,
      title: input.title,
      markdown,
      existing: current,
    });
    await this.persistDoc(fallback);
    return fallback;
  }

  async pullWorkspaceDoc(input: FeishuWorkspaceDocInput): Promise<FeishuDocWorkspacePullResult> {
    const currentState = await this.readWorkspaceMarkdownState(input.workspaceId, input.docId);
    const existing = await this.readStoredDoc(input.docId) ?? undefined;

    const remoteFromIR = await this.readWorkspaceRemoteContentFromIR(input).catch(() => null);
    if (remoteFromIR) {
      await this.persistWorkspaceIR({
        workspaceRoot: remoteFromIR.workspaceRoot,
        docId: input.docId,
        ir: remoteFromIR.ir,
      });

      return {
        item: await this.writeWorkspaceDoc({
          workspaceId: input.workspaceId,
          docId: input.docId,
          title: remoteFromIR.title,
          markdown: remoteFromIR.markdown,
          existing,
          baseMarkdown: remoteFromIR.markdown,
          lastPulledAt: new Date().toISOString(),
        }) ?? this.createDocContentView({
          docId: input.docId,
          title: remoteFromIR.title,
          markdown: remoteFromIR.markdown,
          existing,
        }),
        pullStatus: !currentState?.document
          ? "created"
          : currentState.document.markdown === remoteFromIR.markdown
              && currentState.base?.markdown === remoteFromIR.markdown
            ? "noop"
            : "updated",
      };
    }

    const remote = await this.getDocContent(input.docId);

    return {
      item: await this.writeWorkspaceDoc({
        workspaceId: input.workspaceId,
        docId: input.docId,
        title: remote.title,
        markdown: remote.markdown,
        existing: existing ?? remote,
        baseMarkdown: remote.markdown,
        lastPulledAt: new Date().toISOString(),
      }) ?? remote,
      pullStatus: !currentState?.document
        ? "created"
        : currentState.document.markdown === remote.markdown
            && currentState.base?.markdown === remote.markdown
          ? "noop"
          : "updated",
    };
  }

  async pushWorkspaceDoc(input: {
    workspaceId: string;
    docId: string;
    title: string;
    markdown?: string;
    force?: boolean;
  }): Promise<FeishuDocWorkspacePushResult> {
    const item = await this.saveWorkspaceDocLocalDraft(input);
    return {
      item,
      pushStatus: item.cache?.hasBaseline && !item.cache.hasLocalChanges ? "noop" : "accepted",
      message: item.cache?.hasBaseline && !item.cache.hasLocalChanges
        ? undefined
        : "本地草稿已写入工作区文件，远端推送仍待接线。",
      warnings: item.analysis.riskyBlocks,
    };
  }

  async openDocIR(input: { workspaceId: string; docId: string }): Promise<{ source: "cache" | "remote"; ir: FeishuDocIR }> {
    return this.requireDocWorkspaceRuntime().openDocument(input);
  }

  async pullDocIR(input: { workspaceId: string; docId: string; overwrite: boolean }): Promise<{ ir: FeishuDocIR; backupPath?: string }> {
    return this.requireDocWorkspaceRuntime().pullLatest(input);
  }

  async pushDocIR(input: { workspaceId: string; docId: string }): Promise<{ status: "succeeded" | "blocked" | "failed"; message?: string }> {
    return this.requireDocWorkspaceRuntime().pushDocument(input);
  }

  private requireDocWorkspaceRuntime(): DesktopFeishuDocWorkspaceRuntimePort {
    if (!this.docWorkspaceRuntime) {
      throw new Error("Feishu document IR workspace runtime is not configured");
    }
    return this.docWorkspaceRuntime;
  }
}
