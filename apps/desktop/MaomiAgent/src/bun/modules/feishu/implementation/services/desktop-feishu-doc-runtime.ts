import { createHash } from "node:crypto";
import { access, rename } from "node:fs/promises";
import { join } from "node:path";

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
import {
  FeishuDocDraftWorkspaceCache,
  type FeishuDocDraftWorkspaceEntry,
} from "./feishu-doc-draft-workspace-cache";
import { FeishuDocAssetCache } from "./feishu-doc-asset-cache";
import {
  FeishuDocSourceWorkspaceCache,
  type FeishuDocSourceSnapshot,
  type FeishuDocSourceWorkspaceEntry,
} from "./feishu-doc-source-workspace-cache";
import {
  DesktopFeishuOpenApiError,
  isDesktopFeishuAccessTokenExpiredError,
} from "./desktop-feishu-openapi-client";
import { feishuDocIRToMdx } from "./feishu-doc-mdx-codec";
import { feishuDocIRToSourceMarkdown } from "./feishu-doc-source-markdown-codec";
import { FeishuDocIRWorkspaceCache } from "./feishu-doc-ir-workspace-cache";
import { assessFeishuDocPush } from "./feishu-doc-push-assessor";
import { buildFeishuDocCurrentIR } from "./feishu-doc-working-copy-compiler";
import { runDesktopFeishuStoreMutation } from "./desktop-feishu-store-mutation";

type DesktopFeishuDocWorkspaceRuntimePort = {
  openDocument(input: { workspaceId: string; docId: string }): Promise<{ source: "cache" | "remote"; ir: FeishuDocIR }>;
  pullLatest(input: { workspaceId: string; docId: string; overwrite: boolean }): Promise<{ ir: FeishuDocIR; backupPath?: string }>;
  pushDocument(input: { workspaceId: string; docId: string }): Promise<{ status: "succeeded" | "blocked" | "failed"; message?: string }>;
};

type FeishuDocRemoteWriterPort = {
  createDocument(input: { accessToken: string; title: string }): Promise<{ documentId: string; title: string }>;
};

type DesktopFeishuDocTreeLoaderPort = {
  loadRoot(input: FeishuDocTreeLoadInput): Promise<FeishuDocTreeLoadResult>;
  loadBranch(input: FeishuDocTreeBranchInput): Promise<FeishuDocTreeBranchResult>;
};

type DesktopFeishuDocContentSourcePort = {
  readDocumentContent(accessToken: string, docId: string): Promise<FeishuDocContentView>;
  readDocumentBundle?(accessToken: string, docId: string): Promise<{
    content: FeishuDocContentView;
    ir: FeishuDocIR;
    source: FeishuDocSourceSnapshot;
  }>;
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
      remoteWriter?: FeishuDocRemoteWriterPort;
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

function trimText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const DEFAULT_FEISHU_DOC_ANALYSIS: FeishuDocContentView["analysis"] = {
  riskyBlocks: [],
  riskySync: false,
  syncMode: null,
  riskyBlockMode: "safe",
};

const FEISHU_DOC_ASSET_CACHE_DIRECTORY = join(".maomi", "feishu-docs", "_assets");

function sanitizeWorkspaceDocId(value: string, fallback: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized || fallback;
}

function resolveWorkspaceOriginalMarkdownPath(workspaceRoot: string, docId: string): string {
  return join(workspaceRoot, ".maomi", "feishu-docs", `${sanitizeWorkspaceDocId(docId, "untitled-doc")}.md`);
}

function resolveWorkspaceBaselineMarkdownPath(workspaceRoot: string, docId: string): string {
  return join(workspaceRoot, ".maomi", "feishu-docs", "baselines", `${sanitizeWorkspaceDocId(docId, "untitled-doc")}.base.md`);
}

function resolveWorkspaceDraftMarkdownPath(workspaceRoot: string, docId: string): string {
  return join(workspaceRoot, ".maomi", "feishu-docs", "drafts", `${sanitizeWorkspaceDocId(docId, "untitled-doc")}.draft.md`);
}

function resolveWorkspaceDocDirectoryPath(workspaceRoot: string, docId: string): string {
  return join(workspaceRoot, ".maomi", "feishu-docs", sanitizeWorkspaceDocId(docId, "untitled-doc"));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return !!error && typeof error === "object" && "code" in error;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function deriveDocTitle(docId: string, markdown: string): string {
  const heading = markdown
    .split(/\r?\n/)
    .slice(0, 8)
    .find((line) => /^#\s+/.test(line.trim()));

  return heading?.replace(/^#\s+/, "").trim() || docId;
}

function createMarkdownChecksum(markdown: string): string {
  return `sha256:${createHash("sha256").update(markdown).digest("hex")}`;
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
  remoteWriter?: FeishuDocRemoteWriterPort;
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
  private readonly remoteWriter: FeishuDocRemoteWriterPort | null;
  private readonly workspaceQuery: DesktopWorkspaceQueryPort | null;

  constructor(deps: DesktopFeishuDocRuntimeDeps) {
    if (isRuntimeBundle(deps)) {
      this.store = deps.store;
      this.loader = deps.loader;
      this.contentSource = deps.contentSource ?? null;
      this.accessToken = deps.accessToken ?? null;
      this.fetchImpl = deps.fetchImpl ?? fetch;
      this.docWorkspaceRuntime = deps.docWorkspaceRuntime ?? null;
      this.remoteWriter = deps.remoteWriter ?? null;
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
      this.remoteWriter = null;
      this.workspaceQuery = null;
      return;
    }

    this.store = null;
    this.loader = deps;
    this.contentSource = null;
    this.accessToken = null;
    this.fetchImpl = fetch;
    this.docWorkspaceRuntime = null;
    this.remoteWriter = null;
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
        const remote = await this.contentSource.readDocumentContent(await this.accessToken(), docId);
        const item = trimText(remote.docId) && remote.docId !== docId && !trimText(remote.resolvedDocId)
          ? { ...remote, resolvedDocId: remote.docId }
          : remote;
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
    resolvedDocId?: string;
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
    const resolvedDocId = trimText(input.resolvedDocId)
      ?? trimText(cache?.resolvedDocId)
      ?? trimText(input.existing?.resolvedDocId);

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
      ...(resolvedDocId ? { resolvedDocId } : {}),
      ...(message ? { message } : {}),
      ...(cache ? { cache } : {}),
    };
  }

  private async migrateWorkspacePath(fromPath: string, toPath: string): Promise<void> {
    if (!(await pathExists(fromPath)) || await pathExists(toPath)) {
      return;
    }

    await rename(fromPath, toPath);
  }

  private async migrateLegacyWorkspaceCache(input: {
    workspaceRoot: string;
    docId: string;
    legacyDocId?: string;
  }): Promise<void> {
    const legacyDocId = trimText(input.legacyDocId);
    if (!legacyDocId || legacyDocId === input.docId) {
      return;
    }

    await Promise.all([
      this.migrateWorkspacePath(
        resolveWorkspaceOriginalMarkdownPath(input.workspaceRoot, legacyDocId),
        resolveWorkspaceOriginalMarkdownPath(input.workspaceRoot, input.docId),
      ),
      this.migrateWorkspacePath(
        resolveWorkspaceBaselineMarkdownPath(input.workspaceRoot, legacyDocId),
        resolveWorkspaceBaselineMarkdownPath(input.workspaceRoot, input.docId),
      ),
      this.migrateWorkspacePath(
        resolveWorkspaceDraftMarkdownPath(input.workspaceRoot, legacyDocId),
        resolveWorkspaceDraftMarkdownPath(input.workspaceRoot, input.docId),
      ),
      this.migrateWorkspacePath(
        resolveWorkspaceDocDirectoryPath(input.workspaceRoot, legacyDocId),
        resolveWorkspaceDocDirectoryPath(input.workspaceRoot, input.docId),
      ),
    ]);
  }

  private resolveWorkspaceRemoteMetadata(input: {
    source?: FeishuDocSourceWorkspaceEntry | null;
    baseSource?: FeishuDocSourceWorkspaceEntry | null;
    previous?: FeishuDocCacheStateView;
  }): {
    requestedDocId?: string;
    resolvedDocId?: string;
    documentIdType?: "document_id" | "wiki_node_token";
  } {
    const requestedDocId = trimText(input.source?.snapshot.requestedDocId)
      ?? trimText(input.baseSource?.snapshot.requestedDocId)
      ?? trimText(input.previous?.requestedDocId);
    const resolvedDocId = trimText(input.source?.snapshot.resolvedDocId)
      ?? trimText(input.baseSource?.snapshot.resolvedDocId)
      ?? trimText(input.source?.snapshot.document.document_id)
      ?? trimText(input.baseSource?.snapshot.document.document_id)
      ?? trimText(input.previous?.resolvedDocId);
    const documentIdType = input.source?.snapshot.documentIdType
      ?? input.baseSource?.snapshot.documentIdType
      ?? input.previous?.documentIdType;

    return {
      ...(requestedDocId ? { requestedDocId } : {}),
      ...(resolvedDocId ? { resolvedDocId } : {}),
      ...(documentIdType ? { documentIdType } : {}),
    };
  }

  private async resolveWorkspaceOriginalMarkdownCache(workspaceId: string): Promise<FeishuDocMarkdownWorkspaceCache | null> {
    const directoryPath = await this.resolveWorkspaceDirectoryPath(workspaceId);
    return directoryPath ? new FeishuDocMarkdownWorkspaceCache(directoryPath) : null;
  }

  private async resolveWorkspaceDraftCache(workspaceId: string): Promise<FeishuDocDraftWorkspaceCache | null> {
    const directoryPath = await this.resolveWorkspaceDirectoryPath(workspaceId);
    return directoryPath ? new FeishuDocDraftWorkspaceCache(directoryPath) : null;
  }

  private async resolveWorkspaceSourceCache(workspaceId: string): Promise<FeishuDocSourceWorkspaceCache | null> {
    const directoryPath = await this.resolveWorkspaceDirectoryPath(workspaceId);
    return directoryPath ? new FeishuDocSourceWorkspaceCache(directoryPath) : null;
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

  private async persistWorkspaceSource(input: {
    workspaceRoot: string;
    docId: string;
    source: FeishuDocSourceSnapshot;
  }): Promise<void> {
    const cache = new FeishuDocSourceWorkspaceCache(input.workspaceRoot);
    await cache.writeDocument(input.docId, input.source);
    await cache.writeBase(input.docId, input.source);
  }

  private async persistWorkspaceOriginalMarkdown(input: {
    workspaceRoot: string;
    docId: string;
    markdown: string;
  }): Promise<void> {
    const cache = new FeishuDocMarkdownWorkspaceCache(input.workspaceRoot);
    await cache.writeDocument(input.docId, input.markdown);
    await cache.writeBase(input.docId, input.markdown);
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
  ): Promise<{
    ir: FeishuDocIR;
    markdown: string;
    title: string;
    workspaceRoot: string;
    requestedDocId?: string;
    resolvedDocId?: string;
    documentIdType?: "document_id" | "wiki_node_token";
    source?: FeishuDocSourceSnapshot;
  } | null> {
    if (!this.accessToken || (!this.contentSource?.readDocumentBundle && !this.contentSource?.readDocumentIR)) {
      return null;
    }

    const workspaceRoot = await this.resolveWorkspaceDirectoryPath(input.workspaceId);
    if (!workspaceRoot) {
      return null;
    }

    const accessToken = await this.accessToken();
    const bundle = this.contentSource.readDocumentBundle
      ? await this.contentSource.readDocumentBundle(accessToken, input.docId)
      : null;
    const remoteIR = bundle?.ir ?? await this.contentSource.readDocumentIR?.(accessToken, input.docId);
    if (!remoteIR) {
      return null;
    }
    const hydratedIR = await this.hydrateWorkspaceDocumentAssets({
      workspaceId: input.workspaceId,
      docId: input.docId,
      workspaceRoot,
      ir: remoteIR,
    });
    const markdown = bundle?.content.markdown?.trimEnd() || feishuDocIRToSourceMarkdown(hydratedIR).trimEnd();

    return {
      ir: hydratedIR,
      markdown,
      title: bundle?.content.title || hydratedIR.document.title || input.docId,
      workspaceRoot,
      requestedDocId: trimText(bundle?.source?.requestedDocId) ?? input.docId,
      resolvedDocId: trimText(bundle?.source?.document.document_id)
        ?? trimText(hydratedIR.document.id)
        ?? trimText(bundle?.content.resolvedDocId)
        ?? trimText(bundle?.content.docId),
      ...(bundle?.source?.documentIdType ? { documentIdType: bundle.source.documentIdType } : {}),
      ...(bundle?.source ? { source: bundle.source } : {}),
    };
  }

  private async readWorkspaceOriginalMarkdownState(
    workspaceId: string,
    docId: string,
  ): Promise<{
    cache: FeishuDocMarkdownWorkspaceCache;
    document: FeishuDocMarkdownWorkspaceEntry | null;
    base: FeishuDocMarkdownWorkspaceEntry | null;
  } | null> {
    const cache = await this.resolveWorkspaceOriginalMarkdownCache(workspaceId);
    if (!cache) {
      return null;
    }

    const [document, base] = await Promise.all([cache.readDocument(docId), cache.readBase(docId)]);
    return { cache, document, base };
  }

  private async readWorkspaceDraftState(
    workspaceId: string,
    docId: string,
  ): Promise<{
    cache: FeishuDocDraftWorkspaceCache;
    document: FeishuDocDraftWorkspaceEntry | null;
  } | null> {
    const cache = await this.resolveWorkspaceDraftCache(workspaceId);
    if (!cache) {
      return null;
    }

    const document = await cache.readDocument(docId);
    return { cache, document };
  }

  private async readWorkspaceSourceState(
    workspaceId: string,
    docId: string,
  ): Promise<{
    cache: FeishuDocSourceWorkspaceCache;
    document: FeishuDocSourceWorkspaceEntry | null;
    base: FeishuDocSourceWorkspaceEntry | null;
  } | null> {
    const cache = await this.resolveWorkspaceSourceCache(workspaceId);
    if (!cache) {
      return null;
    }

    const [document, base] = await Promise.all([cache.readDocument(docId), cache.readBase(docId)]);
    return { cache, document, base };
  }

  private async readWorkspaceIRState(
    workspaceId: string,
    docId: string,
  ): Promise<{
    cache: FeishuDocIRWorkspaceCache;
    document: FeishuDocIR | null;
    base: FeishuDocIR | null;
  } | null> {
    const workspaceRoot = await this.resolveWorkspaceDirectoryPath(workspaceId);
    if (!workspaceRoot) {
      return null;
    }

    const cache = new FeishuDocIRWorkspaceCache(workspaceRoot);
    const [document, base] = await Promise.all([cache.readDocument(docId), cache.readBase(docId)]);
    return { cache, document, base };
  }

  private renderWorkspacePreviewMarkdown(ir: FeishuDocIR | null): string {
    return ir ? feishuDocIRToMdx(ir).trimEnd() : "";
  }

  private buildWorkspaceCacheState(input: {
    workspaceId: string;
    original?: FeishuDocMarkdownWorkspaceEntry | null;
    baseOriginal?: FeishuDocMarkdownWorkspaceEntry | null;
    draft?: FeishuDocDraftWorkspaceEntry | null;
    source?: FeishuDocSourceWorkspaceEntry | null;
    baseSource?: FeishuDocSourceWorkspaceEntry | null;
    ir?: FeishuDocIR | null;
    baseIr?: FeishuDocIR | null;
    currentMarkdown: string;
    baselineMarkdown?: string;
    previous?: FeishuDocCacheStateView;
    lastPulledAt?: string;
    lastPushedAt?: string;
    publishModeRecommendation?: "update_existing" | "publish_new" | "pull_required";
    hasBlockedChanges?: boolean;
    hasRevisionConflict?: boolean;
    unknownBlockCount?: number;
  }): FeishuDocCacheStateView {
    const lastPulledAt = input.lastPulledAt ?? input.previous?.lastPulledAt;
    const lastPushedAt = input.lastPushedAt ?? input.previous?.lastPushedAt;
    const baseRemoteChecksum = input.baselineMarkdown
      ? createMarkdownChecksum(input.baselineMarkdown)
      : input.baseOriginal?.checksum
        ?? input.baseSource?.checksum
        ?? input.previous?.baseRemoteChecksum;
    const localChecksum = input.draft?.checksum
      ?? (input.currentMarkdown ? createMarkdownChecksum(input.currentMarkdown) : input.original?.checksum ?? input.source?.checksum ?? input.previous?.localChecksum ?? "");
    const hasBaseline = Boolean(input.original ?? input.baseOriginal ?? input.baseSource ?? input.source);
    const hasRawSourceBaseline = Boolean(input.source ?? input.baseSource);
    const hasStructuredBaseline = Boolean(input.ir ?? input.baseIr);
    const originalChecksum = input.original?.checksum
      ?? input.baseOriginal?.checksum
      ?? (input.baselineMarkdown ? createMarkdownChecksum(input.baselineMarkdown) : undefined);
    const hasLocalChanges = input.draft
      ? originalChecksum
        ? input.draft.checksum !== originalChecksum
        : true
      : false;
    const remoteMetadata = this.resolveWorkspaceRemoteMetadata({
      source: input.source,
      baseSource: input.baseSource,
      previous: input.previous,
    });
    const computedUnknownBlockCount = input.unknownBlockCount
      ?? Object.values(input.baseIr?.blocks ?? input.ir?.blocks ?? {})
        .filter((block) => block.type === "undefined")
        .length;
    const publishModeRecommendation = input.publishModeRecommendation
      ?? (hasRawSourceBaseline && hasStructuredBaseline ? "update_existing" : "pull_required");

    return {
      workspaceId: input.workspaceId,
      ...remoteMetadata,
      hasRawSourceBaseline,
      hasStructuredBaseline,
      publishModeRecommendation,
      hasBlockedChanges: input.hasBlockedChanges ?? false,
      hasRevisionConflict: input.hasRevisionConflict ?? false,
      unknownBlockCount: computedUnknownBlockCount,
      ...(input.draft
        ? {
            cacheRelativePath: input.draft.relativePath,
            cacheAbsolutePath: input.draft.absolutePath,
            draftRelativePath: input.draft.relativePath,
            draftAbsolutePath: input.draft.absolutePath,
          }
        : {}),
      ...(input.baseOriginal
        ? {
            baseRelativePath: input.baseOriginal.relativePath,
            baseAbsolutePath: input.baseOriginal.absolutePath,
            originalBaseRelativePath: input.baseOriginal.relativePath,
            originalBaseAbsolutePath: input.baseOriginal.absolutePath,
          }
        : {}),
      ...(input.original
        ? {
            originalRelativePath: input.original.relativePath,
            originalAbsolutePath: input.original.absolutePath,
          }
        : {}),
      ...(input.source
        ? {
            sourceRelativePath: input.source.relativePath,
            sourceAbsolutePath: input.source.absolutePath,
          }
        : {}),
      ...(input.baseSource
        ? {
            sourceBaseRelativePath: input.baseSource.relativePath,
            sourceBaseAbsolutePath: input.baseSource.absolutePath,
          }
        : {}),
      hasBaseline,
      hasLocalChanges,
      localChecksum,
      ...(baseRemoteChecksum ? { baseRemoteChecksum } : {}),
      ...(lastPulledAt ? { lastPulledAt } : {}),
      ...(lastPushedAt ? { lastPushedAt } : {}),
      status: hasBaseline ? "cached" : "local_only",
    };
  }

  private async readWorkspaceDocFromCache(
    input: FeishuWorkspaceDocInput,
    existing?: FeishuDocContentView | null,
  ): Promise<FeishuDocContentView | null> {
    const [originalState, draftState, sourceState, irState] = await Promise.all([
      this.readWorkspaceOriginalMarkdownState(input.workspaceId, input.docId),
      this.readWorkspaceDraftState(input.workspaceId, input.docId),
      this.readWorkspaceSourceState(input.workspaceId, input.docId),
      this.readWorkspaceIRState(input.workspaceId, input.docId),
    ]);
    const currentMarkdown = draftState?.document?.markdown
      ?? originalState?.document?.markdown
      ?? this.renderWorkspacePreviewMarkdown(irState?.document ?? null);
    if (!currentMarkdown) {
      return null;
    }

    const current = existing ?? null;
    const baselineMarkdown = (
      originalState?.base?.markdown
      ?? originalState?.document?.markdown
      ?? this.renderWorkspacePreviewMarkdown(irState?.base ?? irState?.document ?? null)
    ) || currentMarkdown;
    const sourceTitle = sourceState?.document?.snapshot.document.title;
    const irTitle = irState?.document?.document.title;
    const remoteMetadata = this.resolveWorkspaceRemoteMetadata({
      source: sourceState?.document,
      baseSource: sourceState?.base,
      previous: current?.cache,
    });
    const item = this.createDocContentView({
      docId: input.docId,
      resolvedDocId: remoteMetadata.resolvedDocId,
      title: current?.title ?? sourceTitle ?? irTitle,
      markdown: currentMarkdown,
      existing: current,
      cache: this.buildWorkspaceCacheState({
        workspaceId: input.workspaceId,
        original: originalState?.document,
        baseOriginal: originalState?.base,
        draft: draftState?.document,
        source: sourceState?.document,
        baseSource: sourceState?.base,
        ir: irState?.document,
        baseIr: irState?.base,
        currentMarkdown,
        baselineMarkdown,
        previous: current?.cache,
      }),
    });
    return item;
  }

  private async readWorkspaceRemoteDoc(input: FeishuWorkspaceDocInput): Promise<FeishuDocContentView | null> {
    if (!this.contentSource || !this.accessToken) {
      return null;
    }

    const remote = await this.contentSource.readDocumentContent(await this.accessToken(), input.docId);
    return trimText(remote.docId) && remote.docId !== input.docId && !trimText(remote.resolvedDocId)
      ? { ...remote, resolvedDocId: remote.docId }
      : remote;
  }

  private async writeWorkspaceDoc(input: {
    workspaceId: string;
    docId: string;
    markdown: string;
    title?: string;
    existing?: FeishuDocContentView | null;
    baselineMarkdown?: string;
    lastPulledAt?: string;
    lastPushedAt?: string;
  }): Promise<FeishuDocContentView | null> {
    const [originalState, draftState, sourceState, irState] = await Promise.all([
      this.readWorkspaceOriginalMarkdownState(input.workspaceId, input.docId),
      this.readWorkspaceDraftState(input.workspaceId, input.docId),
      this.readWorkspaceSourceState(input.workspaceId, input.docId),
      this.readWorkspaceIRState(input.workspaceId, input.docId),
    ]);
    if (!draftState) {
      return null;
    }

    const document = await draftState.cache.writeDocument(input.docId, input.markdown);
    const current = input.existing ?? null;
    const item = this.createDocContentView({
      docId: input.docId,
      resolvedDocId: current?.resolvedDocId,
      title: input.title,
      markdown: document.markdown,
      existing: current,
      cache: this.buildWorkspaceCacheState({
        workspaceId: input.workspaceId,
        original: originalState?.document,
        baseOriginal: originalState?.base,
        draft: document,
        source: sourceState?.document,
        baseSource: sourceState?.base,
        ir: irState?.document,
        baseIr: irState?.base,
        currentMarkdown: document.markdown,
        baselineMarkdown: input.baselineMarkdown,
        previous: current?.cache,
        lastPulledAt: input.lastPulledAt,
        lastPushedAt: input.lastPushedAt,
      }),
    });
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
    if (cached) {
      return cached;
    }

    try {
      const remoteFromIR = await this.readWorkspaceRemoteContentFromIR(input);
      if (remoteFromIR) {
        await this.migrateLegacyWorkspaceCache({
          workspaceRoot: remoteFromIR.workspaceRoot,
          docId: input.docId,
          legacyDocId: remoteFromIR.resolvedDocId,
        });
        await this.persistWorkspaceIR({
          workspaceRoot: remoteFromIR.workspaceRoot,
          docId: input.docId,
          ir: remoteFromIR.ir,
        });
        if (remoteFromIR.source) {
          await this.persistWorkspaceSource({
            workspaceRoot: remoteFromIR.workspaceRoot,
            docId: input.docId,
            source: remoteFromIR.source,
          });
        }

        await this.persistWorkspaceOriginalMarkdown({
          workspaceRoot: remoteFromIR.workspaceRoot,
          docId: input.docId,
          markdown: remoteFromIR.markdown,
        });

        const seededItem = this.createDocContentView({
          docId: input.docId,
          resolvedDocId: remoteFromIR.resolvedDocId,
          title: remoteFromIR.title,
          markdown: remoteFromIR.markdown,
        });
        return await this.readWorkspaceDocFromCache(input, seededItem) ?? seededItem;
      }
    } catch {
      // Fall back to markdown-only readers below.
    }

    const remote = await this.readWorkspaceRemoteDoc(input);
    if (!remote) {
      throw new Error("文档内容加载失败");
    }

    return this.createDocContentView({
      docId: input.docId,
      resolvedDocId: remote.docId,
      title: remote.title,
      markdown: remote.markdown,
      existing: remote,
    });
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
      baselineMarkdown: current.cache?.baseRemoteChecksum ? undefined : current.markdown,
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
    return fallback;
  }

  async pullWorkspaceDoc(input: FeishuWorkspaceDocInput): Promise<FeishuDocWorkspacePullResult> {
    let [currentOriginalState, currentDraftState, currentSourceState] = await Promise.all([
      this.readWorkspaceOriginalMarkdownState(input.workspaceId, input.docId),
      this.readWorkspaceDraftState(input.workspaceId, input.docId),
      this.readWorkspaceSourceState(input.workspaceId, input.docId),
    ]);

    const remoteFromIR = await this.readWorkspaceRemoteContentFromIR(input).catch(() => null);
    if (remoteFromIR) {
      await this.migrateLegacyWorkspaceCache({
        workspaceRoot: remoteFromIR.workspaceRoot,
        docId: input.docId,
        legacyDocId: remoteFromIR.resolvedDocId,
      });
      [currentOriginalState, currentDraftState, currentSourceState] = await Promise.all([
        this.readWorkspaceOriginalMarkdownState(input.workspaceId, input.docId),
        this.readWorkspaceDraftState(input.workspaceId, input.docId),
        this.readWorkspaceSourceState(input.workspaceId, input.docId),
      ]);
      await this.persistWorkspaceIR({
        workspaceRoot: remoteFromIR.workspaceRoot,
        docId: input.docId,
        ir: remoteFromIR.ir,
      });
      if (remoteFromIR.source) {
        await this.persistWorkspaceSource({
          workspaceRoot: remoteFromIR.workspaceRoot,
          docId: input.docId,
          source: remoteFromIR.source,
        });
      }

      await this.persistWorkspaceOriginalMarkdown({
        workspaceRoot: remoteFromIR.workspaceRoot,
        docId: input.docId,
        markdown: remoteFromIR.markdown,
      });

      const [nextOriginalState, nextSourceState] = await Promise.all([
        this.readWorkspaceOriginalMarkdownState(input.workspaceId, input.docId),
        this.readWorkspaceSourceState(input.workspaceId, input.docId),
      ]);
      const nextItem = currentDraftState?.document
        ? await this.writeWorkspaceDoc({
            workspaceId: input.workspaceId,
            docId: input.docId,
            title: remoteFromIR.title,
            markdown: remoteFromIR.markdown,
            baselineMarkdown: remoteFromIR.markdown,
            lastPulledAt: new Date().toISOString(),
          }) ?? this.createDocContentView({
            docId: input.docId,
            resolvedDocId: remoteFromIR.resolvedDocId,
            title: remoteFromIR.title,
            markdown: remoteFromIR.markdown,
          })
        : this.createDocContentView({
            docId: input.docId,
            resolvedDocId: remoteFromIR.resolvedDocId,
            title: remoteFromIR.title,
            markdown: remoteFromIR.markdown,
            cache: this.buildWorkspaceCacheState({
              workspaceId: input.workspaceId,
              original: nextOriginalState?.document,
              baseOriginal: nextOriginalState?.base,
              source: nextSourceState?.document,
              baseSource: nextSourceState?.base,
              ir: remoteFromIR.ir,
              baseIr: remoteFromIR.ir,
              currentMarkdown: remoteFromIR.markdown,
              baselineMarkdown: remoteFromIR.markdown,
              lastPulledAt: new Date().toISOString(),
            }),
          });
      const remoteSourceChecksum = nextOriginalState?.document?.checksum ?? nextSourceState?.document?.checksum ?? "";
      const pullStatus = !currentDraftState?.document && !currentOriginalState?.document && !currentSourceState?.document
        ? "created"
        : remoteSourceChecksum
            && remoteSourceChecksum === (currentOriginalState?.document?.checksum ?? currentSourceState?.document?.checksum)
            && (!currentDraftState?.document || currentDraftState.document.markdown === remoteFromIR.markdown)
          ? "noop"
          : "updated";

      return {
        item: nextItem,
        pullStatus,
      };
    }

    const remote = await this.readWorkspaceRemoteDoc(input);
    if (!remote) {
      throw new Error("文档内容加载失败");
    }

    return {
      item: currentDraftState?.document
        ? await this.writeWorkspaceDoc({
            workspaceId: input.workspaceId,
            docId: input.docId,
            title: remote.title,
            markdown: remote.markdown,
            baselineMarkdown: remote.markdown,
            lastPulledAt: new Date().toISOString(),
          }) ?? remote
        : remote,
      pullStatus: !currentDraftState?.document && !currentSourceState?.document
        ? "created"
        : currentDraftState?.document?.markdown === remote.markdown
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
    if (item.cache?.hasBaseline && !item.cache.hasLocalChanges) {
      return {
        item,
        pushStatus: "noop",
        warnings: item.analysis.riskyBlocks,
      };
    }

    const [sourceState, irState] = await Promise.all([
      this.readWorkspaceSourceState(input.workspaceId, input.docId),
      this.readWorkspaceIRState(input.workspaceId, input.docId),
    ]);
    const compile = irState?.base
      ? buildFeishuDocCurrentIR({
          base: irState.base,
          draft: item.markdown,
        })
      : { current: null, blockedChanges: [], preservedUnknownBlocks: [] };

    const assessment = assessFeishuDocPush({
      hasRawSourceBaseline: Boolean(sourceState?.base),
      base: irState?.base ?? null,
      current: compile.current,
      blockedChanges: compile.blockedChanges,
      sourceRevisionId: String(sourceState?.document?.snapshot.document.revision_id ?? sourceState?.base?.snapshot.document.revision_id ?? ""),
      baseRevisionId: irState?.base?.document.revisionId,
    });

    const decorated = this.createDocContentView({
      docId: item.docId,
      resolvedDocId: item.resolvedDocId,
      title: item.title,
      markdown: item.markdown,
      existing: item,
      cache: {
        ...item.cache,
        publishModeRecommendation: assessment.publishModeRecommendation,
        hasBlockedChanges: assessment.hasBlockedChanges,
        hasRevisionConflict: assessment.hasRevisionConflict,
        unknownBlockCount: assessment.unknownBlockCount,
      },
    });

    if (
      assessment.publishModeRecommendation === "publish_new"
      && input.force
      && this.accessToken
      && this.remoteWriter
    ) {
      const accessToken = await this.accessToken();
      const created = await this.remoteWriter.createDocument({ accessToken, title: input.title });
      await this.saveWorkspaceDocLocalDraft({
        workspaceId: input.workspaceId,
        docId: created.documentId,
        title: created.title,
        markdown: item.markdown,
        force: true,
      });
      const refreshed = await this.pullWorkspaceDoc({ workspaceId: input.workspaceId, docId: created.documentId });
      return {
        item: refreshed.item,
        pushStatus: "published_new",
        message: `已发布为新文档：${created.documentId}`,
        warnings: assessment.blockedChanges.map((entry) => entry.reason),
      };
    }

    if (assessment.status !== "ready" || !compile.current || !irState?.cache) {
      return {
        item: decorated,
        pushStatus: "blocked",
        message: assessment.status === "pull_required"
          ? "请先重新拉取远端文档基线。"
          : "当前改动不适合覆盖原文，建议发布新文档。",
        warnings: assessment.blockedChanges.map((entry) => entry.reason),
      };
    }

    await irState.cache.writeDocument(input.docId, compile.current);
    const pushed = await this.pushDocIR({ workspaceId: input.workspaceId, docId: input.docId });
    if (pushed.status !== "succeeded") {
      return {
        item: decorated,
        pushStatus: "blocked",
        message: pushed.message,
        warnings: assessment.blockedChanges.map((entry) => entry.reason),
      };
    }

    const refreshed = await this.pullWorkspaceDoc({ workspaceId: input.workspaceId, docId: input.docId });
    return {
      item: refreshed.item,
      pushStatus: "succeeded",
      warnings: assessment.blockedChanges.map((entry) => entry.reason),
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
