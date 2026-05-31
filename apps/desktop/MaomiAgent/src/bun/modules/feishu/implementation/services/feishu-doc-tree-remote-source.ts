import type {
  FeishuDocBoardSnapshot,
  FeishuDocContentView,
  FeishuDocPullDiagnosticsView,
  FeishuDocTreeNode,
  FeishuDocTreeObjectType,
} from "../../../../../shared/desktop-feishu";
import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import { feishuDocIRToSourceMarkdown } from "./feishu-doc-source-markdown-codec";
import type { FeishuDocSourceSnapshot } from "./feishu-doc-source-workspace-cache";
import { applyRecoveredMermaidWhiteboards } from "./feishu-doc-whiteboard-reversible";
import {
  createFeishuDocBoardErrorSnapshot,
  normalizeFeishuDocBoardBlockType,
  normalizeFeishuDocBoardSnapshot,
} from "./feishu-doc-board-snapshot";
import {
  classifyFeishuDocDiagnosticError,
  summarizeWhiteboardRecoveryDiagnostics,
} from "./feishu-doc-permission-diagnostics";
import {
  normalizeFeishuDocBlocksToIR,
  type FeishuRawDocBlock,
} from "./feishu-doc-ir-normalizer";

export type FeishuOpenApiReader = {
  getJson<T>(url: string, accessToken: string): Promise<T>;
};

type FeishuWhiteboardCodeReader = {
  queryWhiteboardCode(input: { whiteboardToken: string }): Promise<{ format: string; source: string } | null>;
  queryWhiteboardRawNodes?(input: { whiteboardToken: string }): Promise<unknown[]>;
};

type FeishuDocTreeRemoteSourceOptions = {
  sleep?: (ms: number) => Promise<void>;
  whiteboardRecoveryConcurrency?: number;
  whiteboardCodeRetryDelaysMs?: readonly number[];
};

export type FeishuDocTreeRecognizedRoot = {
  token: string;
  kind: "wiki_node" | "document";
  rootNodeId: string;
  title: string;
  spaceId?: string;
  docId?: string;
};

export type FeishuDocTreeRemoteChildren = {
  nodes: FeishuDocTreeNode[];
  hasMore: boolean;
  pageToken?: string;
};

type FeishuWikiNodePayload = {
  token?: string;
  node_token?: string;
  obj_token?: string;
  obj_type?: string;
  title?: string;
  has_child?: boolean;
  space_id?: string;
};

type FeishuWikiGetNodeResponse = {
  node?: FeishuWikiNodePayload;
};

type FeishuWikiListNodesResponse = {
  items?: FeishuWikiNodePayload[];
  has_more?: boolean;
  page_token?: string;
};

type FeishuDocumentResponse = {
  document?: {
    document_id?: string;
    title?: string;
    revision_id?: string | number;
  };
};

type FeishuDocumentBlocksResponse = {
  items?: FeishuRawDocBlock[];
};

type ResolvedFeishuDocxDocument = {
  content: FeishuDocContentView;
  ir: FeishuDocIR;
  source: FeishuDocSourceSnapshot;
};

const FEISHU_OPEN_API_BASE_URL = "https://open.feishu.cn/open-apis";
const FEISHU_DOC_TREE_OBJECT_TYPES = new Set<FeishuDocTreeObjectType>([
  "doc",
  "docx",
  "sheet",
  "mindnote",
  "bitable",
  "file",
  "slides",
]);
const FEISHU_MERMAID_SOURCE_MARKERS = [
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
const FEISHU_WHITEBOARD_CODE_RATE_LIMIT_CODES = new Set<number>([99991400]);
const FEISHU_WHITEBOARD_CODE_RATE_LIMIT_PATTERNS = [
  "request trigger frequency limit",
] as const;
const DEFAULT_WHITEBOARD_RECOVERY_CONCURRENCY = 1;
const DEFAULT_WHITEBOARD_CODE_RETRY_DELAYS_MS = [500, 1000, 2000] as const;

function openApiUrl(path: string, params: Record<string, string | number | boolean | undefined | null> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    search.set(key, String(value));
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const query = search.toString();
  return `${FEISHU_OPEN_API_BASE_URL}${normalizedPath}${query ? `?${query}` : ""}`;
}

function normalizeObjType(value: unknown): FeishuDocTreeObjectType | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return FEISHU_DOC_TREE_OBJECT_TYPES.has(value as FeishuDocTreeObjectType)
    ? (value as FeishuDocTreeObjectType)
    : undefined;
}

function valueOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function shouldFallbackToDocument(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("230027") ||
    message.includes("not found") ||
    message.includes("not_found") ||
    message.includes("bad request") ||
    message.includes("field validation") ||
    message.includes("wrong kind") ||
    message.includes("wrong-kind")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readRevisionId(value: unknown): string {
  if (typeof value === "number") {
    return String(value);
  }
  return typeof value === "string" ? value : "";
}

function ensureStableBlockIds(blocks: FeishuRawDocBlock[]): FeishuRawDocBlock[] {
  return blocks.map((block, index) => (
    typeof block.block_id === "string" && block.block_id.trim().length > 0
      ? block
      : { ...block, block_id: `block_${index + 1}` }
  ));
}

function ensureDocumentRootBlock(blocks: FeishuRawDocBlock[], documentId: string): FeishuRawDocBlock[] {
  if (blocks.length === 0) {
    return [];
  }

  const normalizedBlocks = ensureStableBlockIds(blocks);
  if (normalizedBlocks.some((block) => block.block_id === documentId || block.block_type === 1)) {
    return normalizedBlocks;
  }

  return [
    {
      block_id: documentId,
      block_type: 1,
      children: normalizedBlocks
        .map((block) => block.block_id ?? "")
        .filter((blockId): blockId is string => blockId.length > 0),
    },
    ...normalizedBlocks.map((block) => (
      typeof block.parent_id === "string" && block.parent_id.trim().length > 0
        ? block
        : { ...block, parent_id: documentId }
    )),
  ];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableWhiteboardCodeError(error: unknown): boolean {
  const classified = classifyFeishuDocDiagnosticError(error);
  const normalized = classified.message.toLowerCase();
  return (classified.code != null && FEISHU_WHITEBOARD_CODE_RATE_LIMIT_CODES.has(classified.code))
    || FEISHU_WHITEBOARD_CODE_RATE_LIMIT_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export class FeishuDocTreeRemoteSource {
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly whiteboardRecoveryConcurrency: number;
  private readonly whiteboardCodeRetryDelaysMs: readonly number[];

  constructor(
    private readonly reader: FeishuOpenApiReader,
    private readonly whiteboardApi?: FeishuWhiteboardCodeReader,
    options: FeishuDocTreeRemoteSourceOptions = {},
  ) {
    this.sleep = options.sleep ?? delay;
    this.whiteboardRecoveryConcurrency = Math.max(1, options.whiteboardRecoveryConcurrency ?? DEFAULT_WHITEBOARD_RECOVERY_CONCURRENCY);
    this.whiteboardCodeRetryDelaysMs = options.whiteboardCodeRetryDelaysMs ?? DEFAULT_WHITEBOARD_CODE_RETRY_DELAYS_MS;
  }

  async readDocumentBundle(accessToken: string, docId: string): Promise<ResolvedFeishuDocxDocument> {
    try {
      return await this.readDocxDocument(accessToken, docId, "document_id");
    } catch (error) {
      if (!shouldFallbackToDocument(error)) {
        throw error;
      }

      return await this.readDocxDocument(accessToken, docId, "wiki_node_token");
    }
  }

  async readDocumentContent(accessToken: string, docId: string): Promise<FeishuDocContentView> {
    return (await this.readDocumentBundle(accessToken, docId)).content;
  }

  async readDocumentIR(accessToken: string, docId: string): Promise<FeishuDocIR> {
    return (await this.readDocumentBundle(accessToken, docId)).ir;
  }

  private async readDocxDocument(
    accessToken: string,
    docId: string,
    documentIdType: "document_id" | "wiki_node_token",
  ): Promise<ResolvedFeishuDocxDocument> {
    const documentQuery = documentIdType === "wiki_node_token"
      ? { document_id_type: documentIdType }
      : {};
    const [documentResponse, blocksResponse] = await Promise.all([
      this.reader.getJson<FeishuDocumentResponse>(
        openApiUrl(`/docx/v1/documents/${encodeURIComponent(docId)}`, documentQuery),
        accessToken,
      ),
      this.reader.getJson<FeishuDocumentBlocksResponse>(
        openApiUrl(`/docx/v1/documents/${encodeURIComponent(docId)}/blocks`, {
          page_size: 500,
          ...documentQuery,
        }),
        accessToken,
      ),
    ]);

    const document = documentResponse.document ?? {};
    const resolvedDocId = valueOrFallback(document.document_id, docId);
    const title = valueOrFallback(document.title, resolvedDocId);
    const pulledAt = new Date().toISOString();
    const rawBlocks = blocksResponse.items ?? [];
    const blocks = ensureDocumentRootBlock(rawBlocks, resolvedDocId);
    const ir = normalizeFeishuDocBlocksToIR({
      documentId: resolvedDocId,
      title,
      revisionId: readRevisionId(document.revision_id),
      pulledAt,
      documentIdType,
      nodeToken: documentIdType === "wiki_node_token" ? docId : undefined,
      blocks,
    });
    const reversed = await this.reverseWhiteboardsInIR({
      ir,
      pulledAt,
    });
    const boardSnapshots = await this.buildBoardSnapshots({
      ir: reversed.ir,
      pulledAt,
    });
    const markdown = feishuDocIRToSourceMarkdown(reversed.ir).trimEnd();
    const riskyBlocks = Object.values(reversed.ir.blocks)
      .filter((block) => block.type === "undefined")
      .map((block) => block.id);

    return {
      ir: reversed.ir,
      source: {
        requestedDocId: docId,
        resolvedDocId,
        documentIdType,
        fetchedAt: pulledAt,
        sourceKind: "docx_remote_raw",
        document,
        blocks: rawBlocks,
      },
      content: {
        docId: resolvedDocId,
        title,
        markdown,
        length: markdown.length,
        totalLength: markdown.length,
        offset: 0,
        updatedAt: new Date().toISOString(),
        blocks,
        ...(Object.keys(boardSnapshots).length > 0 ? { boardSnapshots } : {}),
        ...(reversed.diagnostics ? { diagnostics: { latestPull: reversed.diagnostics } } : {}),
        analysis: {
          riskyBlocks,
          riskySync: false,
          syncMode: null,
          riskyBlockMode: riskyBlocks.length > 0 ? "preserved" : "safe",
        },
      } as FeishuDocContentView,
    };
  }

  private async reverseWhiteboardsInIR(input: {
    ir: FeishuDocIR;
    pulledAt: string;
  }): Promise<{ ir: FeishuDocIR; diagnostics?: FeishuDocPullDiagnosticsView }> {
    if (!this.whiteboardApi) {
      return { ir: input.ir };
    }

    const whiteboardTokens = [...new Set(
      Object.values(input.ir.blocks)
        .filter((block) => isWhiteboardLike(block.type) && block.resource?.token)
        .map((block) => block.resource!.token),
    )];
    if (whiteboardTokens.length === 0) {
      return { ir: input.ir };
    }

    const attempts = await this.mapWithConcurrency(whiteboardTokens, async (whiteboardToken) =>
      this.recoverWhiteboardToken({
        whiteboardToken,
        pulledAt: input.pulledAt,
      })
    );

    const recovered = attempts.flatMap((item) => item.recovered ? [item.recovered] : []);
    const entries = attempts.flatMap((item) => item.diagnostic ? [item.diagnostic] : []);
    const ir = recovered.length > 0
      ? applyRecoveredMermaidWhiteboards({
          ir: input.ir,
          recovered,
        })
      : input.ir;

    return {
      ir,
      diagnostics: entries.length > 0
        ? {
            whiteboardRecovery: summarizeWhiteboardRecoveryDiagnostics({
              recoveredCount: recovered.length,
              entries,
            }),
          }
        : undefined,
    };
  }

  private async buildBoardSnapshots(input: {
    ir: FeishuDocIR;
    pulledAt: string;
  }): Promise<Record<string, FeishuDocBoardSnapshot>> {
    if (!this.whiteboardApi?.queryWhiteboardRawNodes) {
      return {};
    }

    const targets = collectWhiteboardSnapshotTargets(input.ir);
    if (targets.length === 0) {
      return {};
    }

    const attempts = await this.mapWithConcurrency(targets, async (target) =>
      this.recoverBoardSnapshot({
        whiteboardToken: target.whiteboardToken,
        blockType: target.blockType,
        pulledAt: input.pulledAt,
      }),
    );

    return Object.fromEntries(
      attempts.map((snapshot) => [snapshot.token, snapshot]),
    );
  }

  private async recoverWhiteboardToken(input: {
    whiteboardToken: string;
    pulledAt: string;
  }): Promise<{
    recovered: {
      whiteboardToken: string;
      format: "mermaid";
      source: string;
      origin: "whiteboard_code_export";
      resolvedAt: string;
    } | null;
    diagnostic: {
      token: string;
      stage: "whiteboard_code";
      code?: number;
      message: string;
      category: "permission" | "auth" | "network" | "unknown";
      fallbackApplied: true;
    } | null;
  }> {
    try {
      const result = await this.queryWhiteboardCodeWithRetry(input.whiteboardToken);
      if (!result) {
        return {
          recovered: null,
          diagnostic: null,
        };
      }

      const format = result.format.trim().toLowerCase();
      if (format && format !== "mermaid" && format !== "unknown") {
        return {
          recovered: null,
          diagnostic: null,
        };
      }

      const source = result.source.trim();
      if (!source || (format !== "mermaid" && !looksLikeMermaidSource(source))) {
        return {
          recovered: null,
          diagnostic: null,
        };
      }

      return {
        recovered: {
          whiteboardToken: input.whiteboardToken,
          format: "mermaid",
          source,
          origin: "whiteboard_code_export",
          resolvedAt: input.pulledAt,
        },
        diagnostic: null,
      };
    } catch (error) {
      const classified = classifyFeishuDocDiagnosticError(error);
      return {
        recovered: null,
        diagnostic: {
          token: input.whiteboardToken,
          stage: "whiteboard_code",
          code: classified.code,
          message: classified.message,
          category: classified.category,
          fallbackApplied: true,
        },
      };
    }
  }

  private async queryWhiteboardCodeWithRetry(whiteboardToken: string): Promise<{ format: string; source: string } | null> {
    let retryIndex = 0;
    for (;;) {
      try {
        return await this.whiteboardApi?.queryWhiteboardCode({ whiteboardToken }) ?? null;
      } catch (error) {
        const delayMs = this.whiteboardCodeRetryDelaysMs[retryIndex];
        if (delayMs == null || !isRetryableWhiteboardCodeError(error)) {
          throw error;
        }
        retryIndex += 1;
        await this.sleep(delayMs);
      }
    }
  }

  private async recoverBoardSnapshot(input: {
    whiteboardToken: string;
    blockType: "board" | "whiteboard" | "diagram" | "mindnote";
    pulledAt: string;
  }): Promise<FeishuDocBoardSnapshot> {
    try {
      const rawNodes = await this.queryWhiteboardRawNodesWithRetry(input.whiteboardToken);
      return normalizeFeishuDocBoardSnapshot({
        whiteboardToken: input.whiteboardToken,
        blockType: input.blockType,
        rawNodes,
        pulledAt: input.pulledAt,
      });
    } catch (error) {
      const classified = classifyFeishuDocDiagnosticError(error);
      return createFeishuDocBoardErrorSnapshot({
        whiteboardToken: input.whiteboardToken,
        blockType: input.blockType,
        pulledAt: input.pulledAt,
        loadError: classified.message,
      });
    }
  }

  private async queryWhiteboardRawNodesWithRetry(whiteboardToken: string): Promise<unknown[]> {
    let retryIndex = 0;
    for (;;) {
      try {
        return await this.whiteboardApi?.queryWhiteboardRawNodes?.({ whiteboardToken }) ?? [];
      } catch (error) {
        const delayMs = this.whiteboardCodeRetryDelaysMs[retryIndex];
        if (delayMs == null || !isRetryableWhiteboardCodeError(error)) {
          throw error;
        }
        retryIndex += 1;
        await this.sleep(delayMs);
      }
    }
  }

  private async mapWithConcurrency<T, TResult>(
    items: readonly T[],
    worker: (item: T, index: number) => Promise<TResult>,
  ): Promise<TResult[]> {
    const results = new Array<TResult>(items.length);
    let nextIndex = 0;
    const runnerCount = Math.min(this.whiteboardRecoveryConcurrency, items.length);

    const run = async () => {
      for (;;) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= items.length) {
          return;
        }
        results[currentIndex] = await worker(items[currentIndex]!, currentIndex);
      }
    };

    await Promise.all(Array.from({ length: runnerCount }, () => run()));
    return results;
  }

  async recognizeRoot(accessToken: string, token: string): Promise<FeishuDocTreeRecognizedRoot> {
    try {
      const response = await this.reader.getJson<FeishuWikiGetNodeResponse>(
        openApiUrl("/wiki/v2/spaces/get_node", { token }),
        accessToken,
      );
      const node = response.node ?? {};
      const rootNodeId = valueOrFallback(node.token ?? node.node_token, token);
      const root: FeishuDocTreeRecognizedRoot = {
        token: rootNodeId,
        kind: "wiki_node",
        rootNodeId,
        title: valueOrFallback(node.title, token),
      };

      if (node.space_id) {
        root.spaceId = node.space_id;
      }
      if (node.obj_token) {
        root.docId = node.obj_token;
      }

      return root;
    } catch (wikiError) {
      if (!shouldFallbackToDocument(wikiError)) {
        throw wikiError;
      }

      const response = await this.reader.getJson<FeishuDocumentResponse>(
        openApiUrl(`/docx/v1/documents/${encodeURIComponent(token)}`),
        accessToken,
      );
      const document = response.document ?? {};
      const docId = valueOrFallback(document.document_id, token);
      return {
        token,
        kind: "document",
        rootNodeId: token,
        title: valueOrFallback(document.title, token),
        docId,
      };
    }
  }

  async listChildren(
    accessToken: string,
    root: FeishuDocTreeRecognizedRoot,
    pageToken?: string,
  ): Promise<FeishuDocTreeRemoteChildren> {
    if (root.kind === "document" || !root.spaceId) {
      return { nodes: [], hasMore: false };
    }

    const response = await this.reader.getJson<FeishuWikiListNodesResponse>(
      openApiUrl(`/wiki/v2/spaces/${encodeURIComponent(root.spaceId)}/nodes`, {
        parent_node_token: root.rootNodeId,
        page_token: pageToken,
        page_size: 50,
      }),
      accessToken,
    );

    const nodes = (response.items ?? [])
      .map((item) => this.toTreeNode(item, root.rootNodeId))
      .filter((node) => node.token.length > 0);
    const children: FeishuDocTreeRemoteChildren = {
      nodes,
      hasMore: response.has_more === true,
    };

    if (response.page_token) {
      children.pageToken = response.page_token;
    }

    return children;
  }

  private toTreeNode(item: FeishuWikiNodePayload, parentToken: string): FeishuDocTreeNode {
    const token = valueOrFallback(item.node_token ?? item.token ?? item.obj_token, "");
    const node: FeishuDocTreeNode = {
      id: token,
      token,
      kind: "wiki_node",
      title: valueOrFallback(item.title, token),
      hasChild: item.has_child === true,
      parentToken,
    };

    if (item.obj_token) {
      node.docId = item.obj_token;
    }
    const objType = normalizeObjType(item.obj_type);
    if (objType) {
      node.objType = objType;
    }

    return node;
  }
}

function isWhiteboardLike(type: string): boolean {
  return type === "whiteboard" || type === "board" || type === "diagram" || type === "mindnote";
}

function looksLikeMermaidSource(source: string): boolean {
  const normalized = source.trimStart();
  if (!normalized) {
    return false;
  }

  return FEISHU_MERMAID_SOURCE_MARKERS.some((marker) => normalized.startsWith(marker));
}

function collectWhiteboardSnapshotTargets(ir: FeishuDocIR): Array<{
  whiteboardToken: string;
  blockType: "board" | "whiteboard" | "diagram" | "mindnote";
}> {
  const targets: Array<{
    whiteboardToken: string;
    blockType: "board" | "whiteboard" | "diagram" | "mindnote";
  }> = [];
  const seen = new Set<string>();

  for (const block of Object.values(ir.blocks)) {
    if (!isWhiteboardLike(block.type) || !block.resource?.token) {
      continue;
    }
    if (ir.assets[block.resource.token]?.reversible?.format === "mermaid") {
      continue;
    }
    if (seen.has(block.resource.token)) {
      continue;
    }

    seen.add(block.resource.token);
    targets.push({
      whiteboardToken: block.resource.token,
      blockType: normalizeFeishuDocBoardBlockType(block.type),
    });
  }

  return targets;
}
