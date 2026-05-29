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
  FeishuDocTreeSnapshotNode,
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
  DesktopFeishuOpenApiClient,
  isDesktopFeishuAccessTokenExpiredError,
} from "./desktop-feishu-openapi-client";
import { feishuDocIRToMdx } from "./feishu-doc-mdx-codec";
import { feishuDocIRToSourceMarkdown } from "./feishu-doc-source-markdown-codec";
import { normalizeFeishuDocBlocksToIR } from "./feishu-doc-ir-normalizer";
import { FeishuDocIRWorkspaceCache } from "./feishu-doc-ir-workspace-cache";
import { FeishuDocPatchExecutor } from "./feishu-doc-patch-executor";
import { planFeishuDocPatch } from "./feishu-doc-patch-planner";
import { assessFeishuDocPush } from "./feishu-doc-push-assessor";
import { normalizeFeishuDocPermissionError } from "./feishu-doc-openapi-permissions";
import { FeishuDocRemoteMarkdownApi } from "./feishu-doc-remote-markdown-api";
import { FeishuDocRemotePatchApi } from "./feishu-doc-remote-patch-api";
import {
  applyReversibleMermaidPushResult,
  buildReversibleMermaidPushPlan,
} from "./feishu-doc-whiteboard-reversible";
import { FeishuDocWorkspaceRuntime } from "./feishu-doc-workspace-runtime";
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

type FeishuDocWhiteboardRemotePort = {
  updateWhiteboard(input: {
    whiteboardToken: string;
    inputFormat: "mermaid";
    source: string;
    overwrite: boolean;
  }): Promise<{ result: string }>;
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
      whiteboardApi?: FeishuDocWhiteboardRemotePort;
    };

type FeishuDocPreviewBinary = {
  contentType: string;
  bytes: Uint8Array;
};

type FeishuWorkspaceRemoteContent = {
  ir: FeishuDocIR;
  markdown: string;
  title: string;
  workspaceRoot: string;
  requestedDocId?: string;
  resolvedDocId?: string;
  documentIdType?: "document_id" | "wiki_node_token";
  source?: FeishuDocSourceSnapshot;
};

const FEISHU_OPEN_API_BASE_URL = "https://open.feishu.cn/open-apis";
const FEISHU_MARKDOWN_DESCENDANT_LIMIT = 1000;
const FEISHU_NATIVE_MARKDOWN_TAG_NAMES = [
  "undefined",
  "image",
  "file",
  "callout",
  "grid",
  "grid-column",
  "divider",
  "quote-container",
  "table",
  "table-cell",
  "view",
  "iframe",
  "whiteboard",
  "mindnote",
  "diagram",
  "sheet",
  "bitable",
  "board",
  "chat-card",
  "link-preview",
  "jira-issue",
  "add-ons",
  "isv",
  "okr",
  "source-synced",
  "reference-synced",
  "ai-template",
] as const;
const FEISHU_NATIVE_MARKDOWN_TAG_PATTERN = new RegExp(
  `<\\/?(?:feishu-)?(?:${FEISHU_NATIVE_MARKDOWN_TAG_NAMES.map((name) => escapeRegExp(name)).join("|")})\\b`,
  "i",
);
const FEISHU_WORKING_COPY_MARKER_PATTERN = /<!--feishu:block:[^>]+-->/i;
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\(([^)\r\n]+)\)/;
const FEISHU_DOCS_AI_OVERWRITE_STRATEGY = "docs_ai_markdown_overwrite";
const FEISHU_DOCS_MERMAID_SOURCE_MARKERS = [
  "graph ",
  "flowchart ",
  "sequenceDiagram",
  "classDiagram",
  "stateDiagram",
  "erDiagram",
  "journey",
  "mindmap",
  "timeline",
  "gitGraph",
  "pie ",
  "quadrantChart",
  "requirement",
  "xychart-beta",
  "block-beta",
  "sankey-beta",
  "packet-beta",
  "architecture-beta",
  "C4Context",
  "C4Container",
  "C4Component",
  "C4Dynamic",
  "C4Deployment",
] as const;

function openApiBinaryUrl(path: string): string {
  return `${FEISHU_OPEN_API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsFeishuNativeMarkdownTag(markdown: string): boolean {
  return FEISHU_NATIVE_MARKDOWN_TAG_PATTERN.test(markdown);
}

function containsFeishuWorkingCopyMarker(markdown: string): boolean {
  return FEISHU_WORKING_COPY_MARKER_PATTERN.test(markdown);
}

function containsMarkdownImage(markdown: string): boolean {
  return MARKDOWN_IMAGE_PATTERN.test(markdown);
}

function looksLikeFeishuDocsMermaidSource(source: string): boolean {
  const normalized = source.trimStart();
  if (!normalized) {
    return false;
  }

  return FEISHU_DOCS_MERMAID_SOURCE_MARKERS.some((marker) => normalized.startsWith(marker));
}

function normalizeFenceLanguage(info: string): string {
  const [language = ""] = info.trim().split(/\s+/, 1);
  return language.trim().toLowerCase();
}

function transformMermaidMarkdownBlocks(markdown: string): {
  markdown: string;
  containsMermaidBlock: boolean;
} {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let activeFence: {
    fence: string;
    info: string;
    body: string[];
    originalLines: string[];
  } | null = null;
  let containsMermaidBlock = false;

  for (const line of lines) {
    if (!activeFence) {
      const match = /^(\s*)(`{3,}|~{3,})([^\r\n]*)$/.exec(line);
      if (!match) {
        output.push(line);
        continue;
      }

      activeFence = {
        fence: match[2],
        info: match[3] ?? "",
        body: [],
        originalLines: [line],
      };
      continue;
    }

    activeFence.originalLines.push(line);
    if (new RegExp(`^\\s*${escapeRegExp(activeFence.fence)}\\s*$`).test(line)) {
      const source = activeFence.body.join("\n").trim();
      const isMermaid = normalizeFenceLanguage(activeFence.info) === "mermaid"
        || looksLikeFeishuDocsMermaidSource(source);

      if (isMermaid) {
        containsMermaidBlock = true;
        output.push(
          source
            ? `<whiteboard type="mermaid">\n${source}\n</whiteboard>`
            : '<whiteboard type="mermaid"></whiteboard>',
        );
      } else {
        output.push(...activeFence.originalLines);
      }

      activeFence = null;
      continue;
    }

    activeFence.body.push(line);
  }

  if (activeFence) {
    output.push(...activeFence.originalLines);
  }

  return {
    markdown: output.join("\n"),
    containsMermaidBlock,
  };
}

function shouldUseDocsAiMarkdownOverwrite(input: {
  draftMarkdown: string;
  baselineMarkdown: string;
  baseIr?: FeishuDocIR | null;
}): boolean {
  if (transformMermaidMarkdownBlocks(input.draftMarkdown).containsMermaidBlock) {
    return true;
  }

  if (transformMermaidMarkdownBlocks(input.baselineMarkdown).containsMermaidBlock) {
    return true;
  }

  const rootBlock = input.baseIr?.blocks[input.baseIr.document.rootBlockId];
  return rootBlock?.attrs?.pushStrategy === FEISHU_DOCS_AI_OVERWRITE_STRATEGY;
}

function stripMergeInfo(value: unknown): void {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      stripMergeInfo(item);
    }
    return;
  }

  if ("merge_info" in value) {
    delete (value as Record<string, unknown>).merge_info;
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    stripMergeInfo(nested);
  }
}

function sanitizeConvertedRawBlock(block: Record<string, unknown>): Record<string, unknown> {
  const next = structuredClone(block);
  stripMergeInfo(next);
  return next;
}

function createDocsAiMarkdownOverwritePlaceholderIr(input: {
  documentId: string;
  title: string;
  markdown: string;
  documentIdType: "document_id" | "wiki_node_token";
  nodeToken?: string;
}): FeishuDocIR {
  return {
    schemaVersion: 1,
    document: {
      id: input.documentId,
      title: input.title,
      revisionId: "",
      rootBlockId: input.documentId,
      pulledAt: new Date().toISOString(),
      source: {
        documentIdType: input.documentIdType,
        ...(input.documentIdType === "wiki_node_token" && input.nodeToken ? { nodeToken: input.nodeToken } : {}),
      },
    },
    blocks: {
      [input.documentId]: {
        id: input.documentId,
        type: "page",
        parentId: null,
        children: [],
        editable: false,
        text: [],
        resource: null,
        attrs: {
          pushStrategy: FEISHU_DOCS_AI_OVERWRITE_STRATEGY,
        },
        raw: {
          pushStrategy: FEISHU_DOCS_AI_OVERWRITE_STRATEGY,
        },
      },
    },
    assets: {},
    integrity: {
      contentHash: createMarkdownChecksum(input.markdown),
      rawHash: createMarkdownChecksum(`${FEISHU_DOCS_AI_OVERWRITE_STRATEGY}:${input.markdown}`),
    },
  };
}

function findUnsupportedMarkdownReplaceBlockType(ir: FeishuDocIR): string | null {
  for (const block of Object.values(ir.blocks)) {
    if (block.type === "page") {
      continue;
    }
    if (block.type === "image") {
      return "当前内容包含图片，暂不支持直接回写。已保留本地草稿。";
    }
    if (block.type === "file") {
      return "当前内容包含附件，暂不支持直接回写。已保留本地草稿。";
    }
    if (block.type === "undefined") {
      return "当前内容包含未识别结构，暂不支持直接回写。已保留本地草稿。";
    }
  }

  return null;
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

function resolvePushFallbackTitle(input: { docId: string; currentTitle?: string }): string {
  return trimText(input.currentTitle) ?? input.docId;
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
  whiteboardApi?: FeishuDocWhiteboardRemotePort;
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
  private readonly whiteboardApi: FeishuDocWhiteboardRemotePort | null;

  constructor(deps: DesktopFeishuDocRuntimeDeps) {
    if (isRuntimeBundle(deps)) {
      this.store = deps.store;
      this.loader = deps.loader;
      this.contentSource = deps.contentSource ?? null;
      this.accessToken = deps.accessToken ?? null;
      this.fetchImpl = deps.fetchImpl ?? fetch;
      this.workspaceQuery = deps.workspaceQuery ?? null;
      this.docWorkspaceRuntime = deps.docWorkspaceRuntime ?? this.createBuiltinDocWorkspaceRuntime();
      this.remoteWriter = deps.remoteWriter ?? null;
      this.whiteboardApi = deps.whiteboardApi ?? null;
      return;
    }

    if (isStorePort(deps)) {
      this.store = deps;
      this.loader = this.createStoreBackedLoader(deps);
      this.contentSource = null;
      this.accessToken = null;
      this.fetchImpl = fetch;
      this.workspaceQuery = null;
      this.docWorkspaceRuntime = this.createBuiltinDocWorkspaceRuntime();
      this.remoteWriter = null;
      this.whiteboardApi = null;
      return;
    }

    this.store = null;
    this.loader = deps;
    this.contentSource = null;
    this.accessToken = null;
    this.fetchImpl = fetch;
    this.workspaceQuery = null;
    this.docWorkspaceRuntime = this.createBuiltinDocWorkspaceRuntime();
    this.remoteWriter = null;
    this.whiteboardApi = null;
  }

  private createBuiltinDocWorkspaceRuntime(): DesktopFeishuDocWorkspaceRuntimePort | null {
    if (
      !this.accessToken
      || !this.workspaceQuery
      || (!this.contentSource?.readDocumentBundle && !this.contentSource?.readDocumentIR)
    ) {
      return null;
    }

    const patchApi = new FeishuDocRemotePatchApi({
      client: new DesktopFeishuOpenApiClient({ fetch: this.fetchImpl }),
      baseUrl: FEISHU_OPEN_API_BASE_URL,
      accessToken: this.accessToken,
    });
    const patchExecutor = new FeishuDocPatchExecutor({
      updateText: async (input) => patchApi.updateText(input),
      uploadAsset: async () => {
        throw new Error("Feishu document asset patch is not implemented");
      },
    });

    const createWorkspaceRuntime = async (workspaceId: string) => {
      const workspaceRoot = await this.resolveWorkspaceDirectoryPath(workspaceId);
      if (!workspaceRoot) {
        throw new Error("当前工作区未绑定本地目录，无法推送文档。");
      }

      return new FeishuDocWorkspaceRuntime({
        cache: new FeishuDocIRWorkspaceCache(workspaceRoot),
        remote: {
          pull: async ({ docId, workspaceId }) => {
            const remote = await this.readWorkspaceRemoteContentFromIR({ workspaceId, docId });
            if (!remote) {
              throw new Error("文档结构加载失败");
            }
            return remote.ir;
          },
        },
        assets: {
          hydrateAssets: async (ir) => ir,
        },
        push: {
          execute: async ({ base, current }) => patchExecutor.execute(planFeishuDocPatch(base, current)),
        },
      });
    };

    return {
      openDocument: async (input) => (await createWorkspaceRuntime(input.workspaceId)).openDocument(input),
      pullLatest: async (input) => (await createWorkspaceRuntime(input.workspaceId)).pullLatest(input),
      pushDocument: async (input) => (await createWorkspaceRuntime(input.workspaceId)).pushDocument(input),
    };
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
    const result = await this.loader.loadRoot(input);
    if (!input.preloadSubtree) {
      return result;
    }

    const subtree = await this.readCachedDocTreeSubtree(input.token);
    return subtree?.length
      ? {
          ...result,
          subtree,
        }
      : result;
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
  ): Promise<FeishuWorkspaceRemoteContent | null> {
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

  private async readCachedDocTreeSubtree(rootToken: string): Promise<FeishuDocTreeSnapshotNode[] | null> {
    if (!this.store) {
      return null;
    }

    const snapshot = await this.store.read();
    const normalizedRootToken = rootToken.trim();
    if (!normalizedRootToken) {
      return null;
    }

    const rootEntry = Object.values(snapshot.docTreeCache.roots).find((entry) => entry.token === normalizedRootToken);
    if (!rootEntry) {
      return null;
    }

    const relevantBranches = Object.values(snapshot.docTreeCache.branches)
      .filter((entry) => entry.rootToken === normalizedRootToken);
    if (relevantBranches.length === 0) {
      return null;
    }

    const branchByParentToken = new Map(relevantBranches.map((entry) => [entry.parentToken, entry]));
    const buildChildren = (parentToken: string, lineage: Set<string>): FeishuDocTreeSnapshotNode[] => {
      const branch = branchByParentToken.get(parentToken);
      if (!branch) {
        return [];
      }

      return branch.nodes.map((node) => {
        const normalizedNodeToken = node.token.trim();
        const nextLineage = new Set(lineage);
        if (normalizedNodeToken) {
          nextLineage.add(normalizedNodeToken);
        }
        const children = node.hasChild && normalizedNodeToken && !lineage.has(normalizedNodeToken)
          ? buildChildren(normalizedNodeToken, nextLineage)
          : [];

        return children.length > 0
          ? {
              ...node,
              children,
            }
          : {
              ...node,
            };
      });
    };

    return buildChildren(rootEntry.rootNodeId, new Set([rootEntry.rootNodeId]));
  }

  private async applyWorkspaceRemoteContent(input: {
    workspaceId: string;
    docId: string;
    remote: FeishuWorkspaceRemoteContent;
  }): Promise<FeishuDocWorkspacePullResult> {
    let [currentOriginalState, currentDraftState, currentSourceState] = await Promise.all([
      this.readWorkspaceOriginalMarkdownState(input.workspaceId, input.docId),
      this.readWorkspaceDraftState(input.workspaceId, input.docId),
      this.readWorkspaceSourceState(input.workspaceId, input.docId),
    ]);

    await this.migrateLegacyWorkspaceCache({
      workspaceRoot: input.remote.workspaceRoot,
      docId: input.docId,
      legacyDocId: input.remote.resolvedDocId,
    });

    [currentOriginalState, currentDraftState, currentSourceState] = await Promise.all([
      this.readWorkspaceOriginalMarkdownState(input.workspaceId, input.docId),
      this.readWorkspaceDraftState(input.workspaceId, input.docId),
      this.readWorkspaceSourceState(input.workspaceId, input.docId),
    ]);

    await this.persistWorkspaceIR({
      workspaceRoot: input.remote.workspaceRoot,
      docId: input.docId,
      ir: input.remote.ir,
    });
    if (input.remote.source) {
      await this.persistWorkspaceSource({
        workspaceRoot: input.remote.workspaceRoot,
        docId: input.docId,
        source: input.remote.source,
      });
    }

    await this.persistWorkspaceOriginalMarkdown({
      workspaceRoot: input.remote.workspaceRoot,
      docId: input.docId,
      markdown: input.remote.markdown,
    });

    const [nextOriginalState, nextSourceState] = await Promise.all([
      this.readWorkspaceOriginalMarkdownState(input.workspaceId, input.docId),
      this.readWorkspaceSourceState(input.workspaceId, input.docId),
    ]);
    const nextItem = currentDraftState?.document
      ? await this.writeWorkspaceDoc({
          workspaceId: input.workspaceId,
          docId: input.docId,
          title: input.remote.title,
          markdown: input.remote.markdown,
          baselineMarkdown: input.remote.markdown,
          lastPulledAt: new Date().toISOString(),
        }) ?? this.createDocContentView({
          docId: input.docId,
          resolvedDocId: input.remote.resolvedDocId,
          title: input.remote.title,
          markdown: input.remote.markdown,
        })
      : this.createDocContentView({
          docId: input.docId,
          resolvedDocId: input.remote.resolvedDocId,
          title: input.remote.title,
          markdown: input.remote.markdown,
          cache: this.buildWorkspaceCacheState({
            workspaceId: input.workspaceId,
            original: nextOriginalState?.document,
            baseOriginal: nextOriginalState?.base,
            source: nextSourceState?.document,
            baseSource: nextSourceState?.base,
            ir: input.remote.ir,
            baseIr: input.remote.ir,
            currentMarkdown: input.remote.markdown,
            baselineMarkdown: input.remote.markdown,
            lastPulledAt: new Date().toISOString(),
          }),
        });
    const remoteSourceChecksum = nextOriginalState?.document?.checksum ?? nextSourceState?.document?.checksum ?? "";
    const pullStatus = !currentDraftState?.document && !currentOriginalState?.document && !currentSourceState?.document
      ? "created"
      : remoteSourceChecksum
          && remoteSourceChecksum === (currentOriginalState?.document?.checksum ?? currentSourceState?.document?.checksum)
          && (!currentDraftState?.document || currentDraftState.document.markdown === input.remote.markdown)
        ? "noop"
        : "updated";

    return {
      item: nextItem,
      pullStatus,
    };
  }

  private createLocallyPushedIrBaseline(ir: FeishuDocIR): FeishuDocIR {
    return {
      ...ir,
      document: {
        ...ir.document,
        revisionId: "",
      },
    };
  }

  private createLocallyPushedSourceBaseline(
    source: FeishuDocSourceSnapshot | null,
    title: string,
  ): FeishuDocSourceSnapshot | null {
    if (!source) {
      return null;
    }

    return {
      ...source,
      fetchedAt: new Date().toISOString(),
      document: {
        ...source.document,
        title,
        revision_id: "",
      },
    };
  }

  private async settleWorkspaceDocAfterSuccessfulPush(input: {
    workspaceId: string;
    docId: string;
    title: string;
    markdown: string;
    existing: FeishuDocContentView;
    ir?: FeishuDocIR | null;
    source?: FeishuDocSourceSnapshot | null;
  }): Promise<FeishuDocContentView> {
    const workspaceRoot = await this.resolveWorkspaceDirectoryPath(input.workspaceId);
    const pushedAt = new Date().toISOString();

    if (workspaceRoot) {
      await this.persistWorkspaceOriginalMarkdown({
        workspaceRoot,
        docId: input.docId,
        markdown: input.markdown,
      });

      if (input.ir) {
        const pushedIr = this.createLocallyPushedIrBaseline(input.ir);
        await this.persistWorkspaceIR({
          workspaceRoot,
          docId: input.docId,
          ir: pushedIr,
        });
      }

      const pushedSource = this.createLocallyPushedSourceBaseline(input.source ?? null, input.title);
      if (pushedSource) {
        await this.persistWorkspaceSource({
          workspaceRoot,
          docId: input.docId,
          source: pushedSource,
        });
      }
    }

    return await this.writeWorkspaceDoc({
      workspaceId: input.workspaceId,
      docId: input.docId,
      title: input.title,
      markdown: input.markdown,
      existing: input.existing,
      baselineMarkdown: input.markdown,
      lastPushedAt: pushedAt,
    }) ?? this.createDocContentView({
      docId: input.docId,
      resolvedDocId: input.existing.resolvedDocId,
      title: input.title,
      markdown: input.markdown,
      existing: input.existing,
    });
  }

  private async tryPushWorkspaceDocAsMarkdown(input: {
    workspaceId: string;
    docId: string;
    pushTitle: string;
    draftMarkdown: string;
    fallbackItem: FeishuDocContentView;
    originalState: {
      document: FeishuDocMarkdownWorkspaceEntry | null;
      base: FeishuDocMarkdownWorkspaceEntry | null;
    } | null;
    sourceState: {
      document: FeishuDocSourceWorkspaceEntry | null;
      base: FeishuDocSourceWorkspaceEntry | null;
    } | null;
    baseIr: FeishuDocIR;
  }): Promise<{ item: FeishuDocContentView; pushStatus: "succeeded" | "blocked"; message?: string } | null> {
    if (!this.accessToken || containsFeishuWorkingCopyMarker(input.draftMarkdown)) {
      return null;
    }

    const baselineMarkdown = input.originalState?.base?.markdown
      ?? input.originalState?.document?.markdown
      ?? "";
    if (containsFeishuNativeMarkdownTag(input.draftMarkdown) || containsFeishuNativeMarkdownTag(baselineMarkdown)) {
      return {
        item: input.fallbackItem,
        pushStatus: "blocked",
        message: "当前文档包含飞书原生块，暂不支持按纯 Markdown 直接回写。已保留本地草稿。",
      };
    }

    if (containsMarkdownImage(input.draftMarkdown) || containsMarkdownImage(baselineMarkdown)) {
      return {
        item: input.fallbackItem,
        pushStatus: "blocked",
        message: "当前内容包含图片，暂不支持直接回写。已保留本地草稿。",
      };
    }

    const documentId = trimText(input.sourceState?.document?.snapshot.resolvedDocId)
      ?? trimText(input.sourceState?.base?.snapshot.resolvedDocId)
      ?? trimText(input.sourceState?.document?.snapshot.document.document_id)
      ?? trimText(input.sourceState?.base?.snapshot.document.document_id)
      ?? trimText(input.fallbackItem.resolvedDocId)
      ?? input.docId;
    const documentIdType = input.sourceState?.document?.snapshot.documentIdType
      ?? input.sourceState?.base?.snapshot.documentIdType
      ?? input.baseIr.document.source.documentIdType;
    const baseRevisionId = String(
      input.sourceState?.document?.snapshot.document.revision_id
      ?? input.sourceState?.base?.snapshot.document.revision_id
      ?? input.baseIr.document.revisionId
      ?? "-1",
    ).trim() || "-1";
    const rootBlockId = trimText(input.baseIr.document.rootBlockId) ?? documentId;
    const currentRootChildCount = input.baseIr.blocks[rootBlockId]?.children.length ?? 0;

    const api = new FeishuDocRemoteMarkdownApi({
      client: new DesktopFeishuOpenApiClient({ fetch: this.fetchImpl }),
      baseUrl: FEISHU_OPEN_API_BASE_URL,
      accessToken: this.accessToken,
    });

    try {
      const converted = await api.convertMarkdown({ markdown: input.draftMarkdown });
      if (converted.blocks.length > FEISHU_MARKDOWN_DESCENDANT_LIMIT || converted.firstLevelBlockIds.length > FEISHU_MARKDOWN_DESCENDANT_LIMIT) {
        return {
          item: input.fallbackItem,
          pushStatus: "blocked",
          message: `当前文档块数量过多，单次纯 Markdown 回写暂不支持超过 ${FEISHU_MARKDOWN_DESCENDANT_LIMIT} 个块。已保留本地草稿。`,
        };
      }

      const descendants = converted.blocks.map((block) => sanitizeConvertedRawBlock(block));
      const expectedIr = normalizeFeishuDocBlocksToIR({
        documentId,
        title: input.pushTitle,
        revisionId: baseRevisionId,
        pulledAt: new Date().toISOString(),
        documentIdType,
        ...(documentIdType === "wiki_node_token" ? { nodeToken: input.docId } : {}),
        blocks: [
          { block_id: documentId, block_type: 1, children: converted.firstLevelBlockIds },
          ...descendants,
        ],
      });
      const unsupportedOutputReason = findUnsupportedMarkdownReplaceBlockType(expectedIr);
      if (unsupportedOutputReason) {
        return {
          item: input.fallbackItem,
          pushStatus: "blocked",
          message: unsupportedOutputReason,
        };
      }

      const expectedRemoteMarkdown = feishuDocIRToSourceMarkdown(expectedIr).trimEnd();
      if (trimText(input.draftMarkdown) && !trimText(expectedRemoteMarkdown)) {
        return {
          item: input.fallbackItem,
          pushStatus: "blocked",
          message: "当前内容还不能稳定回写飞书，已保留本地草稿。",
        };
      }

      let revisionId = baseRevisionId;
      if (currentRootChildCount > 0) {
        const deleted = await api.deleteChildren({
          documentId,
          blockId: documentId,
          revisionId,
          startIndex: 0,
          endIndex: currentRootChildCount,
        });
        revisionId = deleted.revisionId?.trim() || revisionId;
      }

      if (descendants.length > 0) {
        const created = await api.createDescendants({
          documentId,
          blockId: documentId,
          revisionId,
          childrenId: converted.firstLevelBlockIds,
          descendants,
        });
        revisionId = created.revisionId?.trim() || revisionId;
      }

      const settled = await this.settleWorkspaceDocAfterSuccessfulPush({
        workspaceId: input.workspaceId,
        docId: input.docId,
        title: input.pushTitle,
        markdown: input.draftMarkdown,
        existing: input.fallbackItem,
        ir: expectedIr,
        source: input.sourceState?.document?.snapshot ?? input.sourceState?.base?.snapshot ?? null,
      });
      return {
        item: settled,
        pushStatus: "succeeded",
      };
    } catch (error) {
      const normalizedError = normalizeFeishuDocPermissionError(error);
      return {
        item: input.fallbackItem,
        pushStatus: "blocked",
        message: normalizedError.message,
      };
    }
  }

  private async tryPushWorkspaceDocAsDocsAiMarkdown(input: {
    workspaceId: string;
    docId: string;
    pushTitle: string;
    draftMarkdown: string;
    fallbackItem: FeishuDocContentView;
    originalState: {
      document: FeishuDocMarkdownWorkspaceEntry | null;
      base: FeishuDocMarkdownWorkspaceEntry | null;
    } | null;
    sourceState: {
      document: FeishuDocSourceWorkspaceEntry | null;
      base: FeishuDocSourceWorkspaceEntry | null;
    } | null;
    baseIr?: FeishuDocIR | null;
  }): Promise<{ item: FeishuDocContentView; pushStatus: "succeeded" | "blocked"; message?: string } | null> {
    if (!this.accessToken || containsFeishuWorkingCopyMarker(input.draftMarkdown)) {
      return null;
    }

    const baselineMarkdown = input.originalState?.base?.markdown
      ?? input.originalState?.document?.markdown
      ?? "";
    if (!shouldUseDocsAiMarkdownOverwrite({
      draftMarkdown: input.draftMarkdown,
      baselineMarkdown,
      baseIr: input.baseIr ?? null,
    })) {
      return null;
    }

    if (containsFeishuNativeMarkdownTag(input.draftMarkdown) || containsFeishuNativeMarkdownTag(baselineMarkdown)) {
      return {
        item: input.fallbackItem,
        pushStatus: "blocked",
        message: "当前文档包含飞书原生块，暂不支持直接按 Mermaid 回写。已保留本地草稿。",
      };
    }

    if (containsMarkdownImage(input.draftMarkdown) || containsMarkdownImage(baselineMarkdown)) {
      return {
        item: input.fallbackItem,
        pushStatus: "blocked",
        message: "当前内容包含图片，暂不支持直接回写。已保留本地草稿。",
      };
    }

    const transformedDraft = transformMermaidMarkdownBlocks(input.draftMarkdown).markdown;
    const documentIdType = input.sourceState?.document?.snapshot.documentIdType
      ?? input.sourceState?.base?.snapshot.documentIdType
      ?? input.baseIr?.document.source.documentIdType
      ?? "document_id";
    const resolvedDocumentId = trimText(input.sourceState?.document?.snapshot.resolvedDocId)
      ?? trimText(input.sourceState?.base?.snapshot.resolvedDocId)
      ?? trimText(input.sourceState?.document?.snapshot.document.document_id)
      ?? trimText(input.sourceState?.base?.snapshot.document.document_id)
      ?? trimText(input.fallbackItem.resolvedDocId)
      ?? input.docId;
    const documentToken = documentIdType === "wiki_node_token"
      ? input.docId
      : resolvedDocumentId;

    const api = new FeishuDocRemoteMarkdownApi({
      client: new DesktopFeishuOpenApiClient({ fetch: this.fetchImpl }),
      baseUrl: FEISHU_OPEN_API_BASE_URL,
      accessToken: this.accessToken,
    });

    try {
      const overwritten = await api.overwriteDocumentV2({
        documentToken,
        content: transformedDraft,
        format: "markdown",
        revisionId: -1,
      });
      if (overwritten.result?.trim().toLowerCase() === "failed") {
        return {
          item: input.fallbackItem,
          pushStatus: "blocked",
          message: overwritten.warnings[0] ?? "当前内容回写失败，已保留本地草稿。",
        };
      }

      const placeholderIr = createDocsAiMarkdownOverwritePlaceholderIr({
        documentId: resolvedDocumentId,
        title: input.pushTitle,
        markdown: input.draftMarkdown,
        documentIdType,
        ...(documentIdType === "wiki_node_token" ? { nodeToken: input.docId } : {}),
      });
      const settled = await this.settleWorkspaceDocAfterSuccessfulPush({
        workspaceId: input.workspaceId,
        docId: input.docId,
        title: input.pushTitle,
        markdown: input.draftMarkdown,
        existing: input.fallbackItem,
        ir: placeholderIr,
        source: input.sourceState?.document?.snapshot ?? input.sourceState?.base?.snapshot ?? null,
      });
      return {
        item: settled,
        pushStatus: "succeeded",
      };
    } catch (error) {
      const normalizedError = normalizeFeishuDocPermissionError(error);
      return {
        item: input.fallbackItem,
        pushStatus: "blocked",
        message: normalizedError.message,
      };
    }
  }

  private async pushWorkspaceDocWithReversibleMermaid(input: {
    workspaceId: string;
    docId: string;
    pushTitle: string;
    fallbackItem: FeishuDocContentView;
    sourceState: {
      document: FeishuDocSourceWorkspaceEntry | null;
      base: FeishuDocSourceWorkspaceEntry | null;
    } | null;
    baseIr: FeishuDocIR;
    plan: Extract<ReturnType<typeof buildReversibleMermaidPushPlan>, { kind: "update" }>;
  }): Promise<{ item: FeishuDocContentView; pushStatus: "succeeded" | "blocked"; message?: string }> {
    if (!this.accessToken || !this.whiteboardApi) {
      return {
        item: input.fallbackItem,
        pushStatus: "blocked",
        message: "当前白板回写不可用，已保留本地草稿。",
      };
    }

    const documentIdType = input.sourceState?.document?.snapshot.documentIdType
      ?? input.sourceState?.base?.snapshot.documentIdType
      ?? input.baseIr.document.source.documentIdType
      ?? "document_id";
    const resolvedDocumentId = trimText(input.sourceState?.document?.snapshot.resolvedDocId)
      ?? trimText(input.sourceState?.base?.snapshot.resolvedDocId)
      ?? trimText(input.sourceState?.document?.snapshot.document.document_id)
      ?? trimText(input.sourceState?.base?.snapshot.document.document_id)
      ?? trimText(input.fallbackItem.resolvedDocId)
      ?? input.docId;
    const documentToken = documentIdType === "wiki_node_token"
      ? input.docId
      : resolvedDocumentId;

    const markdownApi = new FeishuDocRemoteMarkdownApi({
      client: new DesktopFeishuOpenApiClient({ fetch: this.fetchImpl }),
      baseUrl: FEISHU_OPEN_API_BASE_URL,
      accessToken: this.accessToken,
    });

    try {
      const overwritten = await markdownApi.overwriteDocumentV2({
        documentToken,
        content: input.plan.documentMarkdown,
        format: "markdown",
        revisionId: -1,
      });
      if (overwritten.result?.trim().toLowerCase() === "failed") {
        return {
          item: input.fallbackItem,
          pushStatus: "blocked",
          message: overwritten.warnings[0] ?? "当前内容回写失败，已保留本地草稿。",
        };
      }

      for (const update of input.plan.changedWhiteboards) {
        await this.whiteboardApi.updateWhiteboard({
          whiteboardToken: update.whiteboardToken,
          inputFormat: "mermaid",
          source: update.source,
          overwrite: true,
        });
      }

      const pushedAt = new Date().toISOString();
      const settledIr = applyReversibleMermaidPushResult({
        ir: input.baseIr,
        changedWhiteboards: input.plan.changedWhiteboards,
        pushedAt,
      });
      const settled = await this.settleWorkspaceDocAfterSuccessfulPush({
        workspaceId: input.workspaceId,
        docId: input.docId,
        title: input.pushTitle,
        markdown: input.fallbackItem.markdown,
        existing: input.fallbackItem,
        ir: settledIr,
        source: input.sourceState?.document?.snapshot ?? input.sourceState?.base?.snapshot ?? null,
      });

      return {
        item: settled,
        pushStatus: "succeeded",
      };
    } catch (error) {
      const normalizedError = normalizeFeishuDocPermissionError(error);
      return {
        item: input.fallbackItem,
        pushStatus: "blocked",
        message: normalizedError.message,
      };
    }
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
      openApiPath: `/board/v1/whiteboards/${encodeURIComponent(normalizedToken)}/download_as_image`,
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
    const remoteFromIR = await this.readWorkspaceRemoteContentFromIR(input).catch(() => null);
    if (remoteFromIR) {
      return this.applyWorkspaceRemoteContent({
        workspaceId: input.workspaceId,
        docId: input.docId,
        remote: remoteFromIR,
      });
    }

    const [currentDraftState, currentSourceState] = await Promise.all([
      this.readWorkspaceDraftState(input.workspaceId, input.docId),
      this.readWorkspaceSourceState(input.workspaceId, input.docId),
    ]);
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
    title?: string;
    markdown?: string;
    force?: boolean;
  }): Promise<FeishuDocWorkspacePushResult> {
    const current = await this.getWorkspaceDocLocalDraft({
      workspaceId: input.workspaceId,
      docId: input.docId,
    });
    const pushTitle = resolvePushFallbackTitle({
      docId: input.docId,
      currentTitle: current.title,
    });
    const item = await this.saveWorkspaceDocLocalDraft({
      workspaceId: input.workspaceId,
      docId: input.docId,
      title: pushTitle,
      markdown: input.markdown,
      force: input.force,
    });
    if (item.cache?.hasBaseline && !item.cache.hasLocalChanges) {
      return {
        item,
        pushStatus: "noop",
        warnings: item.analysis.riskyBlocks,
      };
    }

    const [originalState, sourceState, irState] = await Promise.all([
      this.readWorkspaceOriginalMarkdownState(input.workspaceId, input.docId),
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

    const decoratedCache: FeishuDocCacheStateView = item.cache
      ? {
          ...item.cache,
          workspaceId: item.cache.workspaceId,
          publishModeRecommendation: assessment.publishModeRecommendation,
          hasBlockedChanges: assessment.hasBlockedChanges,
          hasRevisionConflict: assessment.hasRevisionConflict,
          unknownBlockCount: assessment.unknownBlockCount,
        }
      : {
          workspaceId: input.workspaceId,
          hasRawSourceBaseline: Boolean(sourceState?.base),
          hasStructuredBaseline: Boolean(irState?.base),
          publishModeRecommendation: assessment.publishModeRecommendation,
          hasBlockedChanges: assessment.hasBlockedChanges,
          hasRevisionConflict: assessment.hasRevisionConflict,
          unknownBlockCount: assessment.unknownBlockCount,
          hasBaseline: Boolean(sourceState?.base ?? irState?.base),
          hasLocalChanges: true,
          localChecksum: createMarkdownChecksum(item.markdown),
          status: "local_only",
        };

    const decorated = this.createDocContentView({
      docId: item.docId,
      resolvedDocId: item.resolvedDocId,
      title: item.title,
      markdown: item.markdown,
      existing: item,
      cache: decoratedCache,
    });

    const reversibleMermaidPlan = irState?.base
      ? buildReversibleMermaidPushPlan({
          draftMarkdown: item.markdown,
          baseIr: irState.base,
        })
      : { kind: "none" as const };
    if (reversibleMermaidPlan.kind === "blocked") {
      return {
        item: decorated,
        pushStatus: "blocked",
        message: reversibleMermaidPlan.message,
        warnings: assessment.blockedChanges.map((entry) => entry.reason),
      };
    }
    if (reversibleMermaidPlan.kind === "update" && irState?.base) {
      const mermaidPushed = await this.pushWorkspaceDocWithReversibleMermaid({
        workspaceId: input.workspaceId,
        docId: input.docId,
        pushTitle,
        fallbackItem: decorated,
        sourceState: sourceState
          ? {
              document: sourceState.document,
              base: sourceState.base,
            }
          : null,
        baseIr: irState.base,
        plan: reversibleMermaidPlan,
      });
      return {
        item: mermaidPushed.item,
        pushStatus: mermaidPushed.pushStatus,
        ...(mermaidPushed.message ? { message: mermaidPushed.message } : {}),
        warnings: assessment.blockedChanges.map((entry) => entry.reason),
      };
    }

    const docsAiMarkdownPushed = await this.tryPushWorkspaceDocAsDocsAiMarkdown({
      workspaceId: input.workspaceId,
      docId: input.docId,
      pushTitle,
      draftMarkdown: item.markdown,
      fallbackItem: decorated,
      originalState: originalState
        ? {
            document: originalState.document,
            base: originalState.base,
          }
        : null,
      sourceState: sourceState
        ? {
            document: sourceState.document,
            base: sourceState.base,
          }
        : null,
      baseIr: irState?.base ?? null,
    });
    if (docsAiMarkdownPushed) {
      return {
        item: docsAiMarkdownPushed.item,
        pushStatus: docsAiMarkdownPushed.pushStatus,
        ...(docsAiMarkdownPushed.message ? { message: docsAiMarkdownPushed.message } : {}),
        warnings: assessment.blockedChanges.map((entry) => entry.reason),
      };
    }

    if (assessment.status !== "ready" || !compile.current || !irState?.cache) {
      return {
        item: decorated,
        pushStatus: "blocked",
        message: assessment.status === "pull_required"
          ? "请先重新拉取远端文档基线。"
          : assessment.blockedChanges[0]?.reason
            ? `当前改动暂不支持直接推送：${assessment.blockedChanges[0].reason}`
            : "当前改动暂不支持直接推送。",
        warnings: assessment.blockedChanges.map((entry) => entry.reason),
      };
    }

    if ((item.cache?.hasLocalChanges ?? true) && (assessment.plan?.operations.length ?? 0) === 0) {
      const markdownPushed = await this.tryPushWorkspaceDocAsMarkdown({
        workspaceId: input.workspaceId,
        docId: input.docId,
        pushTitle,
        draftMarkdown: item.markdown,
        fallbackItem: decorated,
        originalState: originalState
          ? {
              document: originalState.document,
              base: originalState.base,
            }
          : null,
        sourceState: sourceState
          ? {
              document: sourceState.document,
              base: sourceState.base,
            }
          : null,
        baseIr: irState.base!,
      });
      if (markdownPushed) {
        return {
          item: markdownPushed.item,
          pushStatus: markdownPushed.pushStatus,
          ...(markdownPushed.message ? { message: markdownPushed.message } : {}),
          warnings: assessment.blockedChanges.map((entry) => entry.reason),
        };
      }

      return {
        item: decorated,
        pushStatus: "blocked",
        message: "当前本地内容还不能直接回写飞书，未生成可执行的远端改动。已保留本地草稿。",
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

    const settled = await this.settleWorkspaceDocAfterSuccessfulPush({
      workspaceId: input.workspaceId,
      docId: input.docId,
      title: pushTitle,
      markdown: item.markdown,
      existing: decorated,
      ir: compile.current,
      source: sourceState?.document?.snapshot ?? sourceState?.base?.snapshot ?? null,
    });
    return {
      item: settled,
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
    if (!this.docWorkspaceRuntime) {
      return {
        status: "failed",
        message: "文档推送运行时未配置",
      };
    }

    return this.docWorkspaceRuntime.pushDocument(input);
  }

  private requireDocWorkspaceRuntime(): DesktopFeishuDocWorkspaceRuntimePort {
    if (!this.docWorkspaceRuntime) {
      throw new Error("Feishu document IR workspace runtime is not configured");
    }
    return this.docWorkspaceRuntime;
  }
}
