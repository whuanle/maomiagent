import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import type {
  FeishuBotStateView,
  FeishuDocBoardSnapshot,
  FeishuDocContentView,
  FeishuDocTreeBranchInput,
  FeishuDocTreeBranchResult,
  FeishuDocTreeLoadInput,
  FeishuDocTreeLoadResult,
  FeishuStateView,
} from "../../../../../shared/desktop-feishu";
import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import {
  resolveDesktopFeishuDocMediaPreviewUrl,
  resolveDesktopFeishuDocWhiteboardPreviewUrl,
} from "../../../../../shared/desktop-feishu-oauth";
import type { DesktopFeishuStoreSnapshot } from "../../abstraction/ports/desktop-feishu-store.ports";
import type { DesktopWorkspaceQueryPort } from "../../../workspace/abstraction/ports/desktop-workspace.ports";
import { DesktopFeishuDocRuntime } from "./desktop-feishu-doc-runtime";
import { feishuDocIRToMdx } from "./feishu-doc-mdx-codec";
import type { FeishuDocSourceSnapshot } from "./feishu-doc-source-workspace-cache";
import { computeReversibleSourceChecksum } from "./feishu-doc-whiteboard-reversible";

type FetchLike = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

function createState(): FeishuStateView {
  return {
    personalDocs: {
      enabled: false,
      discoveredTools: [],
      docsMcp: null,
    },
    smartAssistant: {
      enabled: true,
      appId: "cli_test_app",
      hasAppSecret: true,
      redirectUri: "http://127.0.0.1:35000/desktop/feishu/oauth/callback",
      redirectOrigin: "http://127.0.0.1:35000",
      authStatus: "authorized",
      authMethod: "oauth",
      hasRefreshToken: true,
      scopes: [],
      allowedTools: [],
      autoRefreshTask: {
        enabled: false,
      },
      docsMcp: {
        mcpId: "desktop.feishu.smart-assistant",
        name: "maomi_feishu_assistant_docs",
        endpoint: "desktop://feishu-assistant/docs",
        transport: "http-streamable",
        enabled: true,
        updatedAt: new Date(0).toISOString(),
      },
      runtimePolicy: {
        controlPlane: "ready",
        domainMounting: "lazy_by_domain",
        actionExecution: "registry_first",
      },
      connectionProfiles: [],
      domainModels: [],
      contextTemplates: [],
      policyItems: [],
      domains: [],
      actions: [],
    },
    mode: "developer",
    personal: null,
    developer: null,
    managedMcp: null,
    docs: {
      personal: "https://open.feishu.cn",
      developer: "https://open.feishu.cn",
      authorize: "https://open.feishu.cn",
      token: "https://open.feishu.cn",
      refreshToken: "https://open.feishu.cn",
    },
    catalog: {
      developerScopes: [],
      developerTenantScopes: [],
      developerAllowedTools: [],
      supportedTools: [],
    },
  };
}

async function writeFixtureFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

function createBotState(): FeishuBotStateView {
  return {
    enabled: false,
    appId: "",
    hasAppSecret: false,
    hasVerificationToken: false,
    hasEncryptKey: false,
    transportMode: "websocket",
    catalog: {
      transportMode: "websocket",
      descriptors: [],
    },
    connectionStatus: "disconnected",
    sessionMappingCount: 0,
    processedMessageCount: 0,
    queuedConversationCount: 0,
    recentProcessedMessages: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function createSnapshot(docs: Record<string, FeishuDocContentView> = {}): DesktopFeishuStoreSnapshot {
  return {
    state: createState(),
    bot: createBotState(),
    botRuntime: {
      version: "1.0",
      bindings: [],
      processedMessages: [],
      pendingActions: [],
    },
    docs,
    developerCredential: { appSecret: "" },
    developerToken: { accessToken: "access", refreshToken: "", accessTokenExpiresAt: "", refreshTokenExpiresAt: "" },
    docTreeCache: { lastRootToken: "", lastRootUpdatedAt: "", roots: {}, branches: {}, contents: {} },
  };
}

function createContentView(
  docId: string,
  title: string,
  markdown: string,
  diagnostics?: FeishuDocContentView["diagnostics"],
): FeishuDocContentView {
  return {
    docId,
    title,
    markdown,
    length: markdown.length,
    totalLength: markdown.length,
    offset: 0,
    analysis: {
      riskyBlocks: [],
      riskySync: false,
      syncMode: null,
      riskyBlockMode: "safe",
    },
    ...(diagnostics ? { diagnostics } : {}),
  };
}

function createBoardSnapshot(token: string): FeishuDocBoardSnapshot {
  return {
    token,
    blockType: "board",
    nodes: [],
    viewport: {
      width: 800,
      height: 600,
      minX: 0,
      minY: 0,
    },
    supportedNodeCount: 0,
    unsupportedNodeCount: 0,
    pulledAt: "2026-05-30T00:00:00.000Z",
  };
}

function createStore(snapshot: DesktopFeishuStoreSnapshot) {
  return {
    read: async () => snapshot,
    write: async (next: DesktopFeishuStoreSnapshot) => {
      snapshot.state = next.state;
      snapshot.bot = next.bot;
      snapshot.botRuntime = next.botRuntime;
      snapshot.docs = next.docs;
      snapshot.developerCredential = next.developerCredential;
      snapshot.developerToken = next.developerToken;
      snapshot.docTreeCache = next.docTreeCache;
    },
  };
}

function createRuntime(snapshot: DesktopFeishuStoreSnapshot) {
  return new DesktopFeishuDocRuntime(createStore(snapshot));
}

function createRuntimeWithContentSource(
  snapshot: DesktopFeishuStoreSnapshot,
  contentSource: {
    readDocumentContent(accessToken: string, docId: string): Promise<FeishuDocContentView>;
    readDocumentBundle?(accessToken: string, docId: string): Promise<{
      content: FeishuDocContentView;
      ir: FeishuDocIR;
      source: FeishuDocSourceSnapshot;
    }>;
    readDocumentIR?(accessToken: string, docId: string): Promise<FeishuDocIR>;
  },
  workspaceQuery?: DesktopWorkspaceQueryPort,
  fetchImpl?: FetchLike,
  extraDeps?: {
    docWorkspaceRuntime?: {
      openDocument(input: { workspaceId: string; docId: string }): Promise<{ source: "cache" | "remote"; ir: FeishuDocIR }>;
      pullLatest(input: { workspaceId: string; docId: string; overwrite: boolean }): Promise<{ ir: FeishuDocIR; backupPath?: string }>;
      pushDocument(input: { workspaceId: string; docId: string }): Promise<{ status: "succeeded" | "blocked" | "failed"; message?: string }>;
    };
    remoteWriter?: {
      createDocument(input: { accessToken: string; title: string }): Promise<{ documentId: string; title: string }>;
    };
    accessToken?: (input?: { forceRefresh?: boolean }) => Promise<string>;
    whiteboardApi?: {
      updateWhiteboard(input: {
        whiteboardToken: string;
        inputFormat: "mermaid";
        source: string;
        overwrite: boolean;
      }): Promise<{ result: string }>;
    };
  },
) {
  return new DesktopFeishuDocRuntime({
    store: createStore(snapshot),
    loader: {
      loadRoot: async () => { throw new Error("not used"); },
      loadBranch: async () => { throw new Error("not used"); },
    },
    contentSource,
    accessToken: extraDeps?.accessToken ?? (async () => "access"),
    workspaceQuery,
    ...(extraDeps?.docWorkspaceRuntime ? { docWorkspaceRuntime: extraDeps.docWorkspaceRuntime } : {}),
    ...(extraDeps?.remoteWriter ? { remoteWriter: extraDeps.remoteWriter } : {}),
    ...(extraDeps?.whiteboardApi ? { whiteboardApi: extraDeps.whiteboardApi } : {}),
    ...(fetchImpl ? { fetchImpl: fetchImpl as typeof fetch } : {}),
  });
}

function createDocumentIRWithText(docId: string, title: string, markdown: string, revisionId = "1"): FeishuDocIR {
  return {
    schemaVersion: 1,
    document: {
      id: docId,
      title,
      revisionId,
      rootBlockId: docId,
      pulledAt: "2026-05-25T00:00:00.000Z",
      source: { documentIdType: "document_id" },
    },
    blocks: {
      [docId]: {
        id: docId,
        type: "page",
        parentId: null,
        children: ["text_1"],
        editable: false,
        text: [],
        resource: null,
        attrs: {},
        raw: {},
      },
      text_1: {
        id: "text_1",
        type: "text",
        parentId: docId,
        children: [],
        editable: true,
        text: [{ kind: "text", text: markdown, attrs: {}, raw: {} }],
        resource: null,
        attrs: {},
        raw: {},
      },
    },
    assets: {},
    integrity: {
      contentHash: "sha256:content",
      rawHash: "sha256:raw",
    },
  };
}

function createSourceSnapshot(
  requestedDocId: string,
  title: string,
  resolvedDocId = requestedDocId,
  documentIdType: "document_id" | "wiki_node_token" = requestedDocId === resolvedDocId ? "document_id" : "wiki_node_token",
) {
  return {
    requestedDocId,
    resolvedDocId,
    documentIdType,
    fetchedAt: "2026-05-25T00:00:00.000Z",
    sourceKind: "docx_remote_raw" as const,
    document: {
      document_id: resolvedDocId,
      title,
      revision_id: "1",
    },
    blocks: [{ block_id: resolvedDocId, block_type: 1, children: [] }],
  };
}

function createDocumentIRWithImage(docId: string, title: string): FeishuDocIR {
  return {
    schemaVersion: 1,
    document: {
      id: docId,
      title,
      revisionId: "1",
      rootBlockId: docId,
      pulledAt: "2026-05-25T00:00:00.000Z",
      source: { documentIdType: "document_id" },
    },
    blocks: {
      [docId]: {
        id: docId,
        type: "page",
        parentId: null,
        children: ["img"],
        editable: false,
        text: [],
        resource: null,
        attrs: {},
        raw: {},
      },
      img: {
        id: "img",
        type: "image",
        parentId: docId,
        children: [],
        editable: true,
        text: [],
        resource: { token: "img_token", kind: "image" },
        attrs: { width: 320, height: 180 },
        raw: {},
      },
    },
    assets: {
      img_token: {
        token: "img_token",
        kind: "image",
        mime: "image/png",
        cacheKey: "",
        status: "missing",
        localPath: "",
        checksum: "",
        width: 320,
        height: 180,
      },
    },
    integrity: {
      contentHash: "sha256:content",
      rawHash: "sha256:raw",
    },
  };
}

function createDocumentIRWithReversibleMermaid(input: {
  resolvedDocId: string;
  whiteboardToken: string;
  source: string;
}): FeishuDocIR {
  return {
    schemaVersion: 1,
    document: {
      id: input.resolvedDocId,
      title: "Mermaid Doc",
      revisionId: "7",
      rootBlockId: input.resolvedDocId,
      pulledAt: "2026-05-29T00:00:00.000Z",
      source: {
        documentIdType: "wiki_node_token",
        nodeToken: "wiki_node_1",
      },
    },
    blocks: {
      [input.resolvedDocId]: {
        id: input.resolvedDocId,
        type: "page",
        parentId: null,
        children: ["whiteboard_1"],
        editable: false,
        text: [],
        resource: null,
        attrs: {},
        raw: {},
      },
      whiteboard_1: {
        id: "whiteboard_1",
        type: "whiteboard",
        parentId: input.resolvedDocId,
        children: [],
        editable: true,
        text: [],
        resource: { token: input.whiteboardToken, kind: "whiteboard" },
        attrs: {},
        raw: {},
      },
    },
    assets: {
      [input.whiteboardToken]: {
        token: input.whiteboardToken,
        kind: "whiteboard",
        mime: "",
        cacheKey: "",
        status: "missing",
        localPath: "",
        checksum: "",
        reversible: {
          format: "mermaid",
          source: input.source,
          sourceChecksum: computeReversibleSourceChecksum(input.source),
          ordinal: 0,
          origin: "whiteboard_code_export",
          state: "mermaid",
          lastResolvedAt: "2026-05-29T00:00:00.000Z",
        },
      },
    },
    integrity: {
      contentHash: "sha256:content",
      rawHash: "sha256:raw",
    },
  };
}

function createDocumentIRWithBoardToken(input: {
  resolvedDocId: string;
  whiteboardToken: string;
}): FeishuDocIR {
  return {
    schemaVersion: 1,
    document: {
      id: input.resolvedDocId,
      title: "Mermaid Doc",
      revisionId: "8",
      rootBlockId: input.resolvedDocId,
      pulledAt: "2026-05-30T00:00:00.000Z",
      source: {
        documentIdType: "wiki_node_token",
        nodeToken: "wiki_node_1",
      },
    },
    blocks: {
      [input.resolvedDocId]: {
        id: input.resolvedDocId,
        type: "page",
        parentId: null,
        children: ["board_1"],
        editable: false,
        text: [],
        resource: null,
        attrs: {},
        raw: {},
      },
      board_1: {
        id: "board_1",
        type: "board",
        parentId: input.resolvedDocId,
        children: [],
        editable: true,
        text: [],
        resource: { token: input.whiteboardToken, kind: "whiteboard" },
        attrs: {},
        raw: {},
      },
    },
    assets: {
      [input.whiteboardToken]: {
        token: input.whiteboardToken,
        kind: "whiteboard",
        mime: "",
        cacheKey: "",
        status: "missing",
        localPath: "",
        checksum: "",
      },
    },
    integrity: {
      contentHash: "sha256:content",
      rawHash: "sha256:raw",
    },
  };
}

function createDocumentIRWithTwoReversibleMermaidBoards(): FeishuDocIR {
  const first = createDocumentIRWithReversibleMermaid({
    resolvedDocId: "doc_1",
    whiteboardToken: "wb_1",
    source: "flowchart TD\nA-->B",
  });

  return {
    ...first,
    blocks: {
      ...first.blocks,
      doc_1: {
        ...first.blocks.doc_1!,
        children: ["whiteboard_1", "whiteboard_2"],
      },
      whiteboard_2: {
        id: "whiteboard_2",
        type: "whiteboard",
        parentId: "doc_1",
        children: [],
        editable: true,
        text: [],
        resource: { token: "wb_2", kind: "whiteboard" },
        attrs: {},
        raw: {},
      },
    },
    assets: {
      ...first.assets,
      wb_2: {
        token: "wb_2",
        kind: "whiteboard",
        mime: "",
        cacheKey: "",
        status: "missing",
        localPath: "",
        checksum: "",
        reversible: {
          format: "mermaid",
          source: "flowchart TD\nC-->D",
          sourceChecksum: computeReversibleSourceChecksum("flowchart TD\nC-->D"),
          ordinal: 1,
          origin: "whiteboard_code_export",
          state: "mermaid",
          lastResolvedAt: "2026-05-29T00:00:00.000Z",
        },
      },
    },
  };
}

function createRuntimeWithLoader(
  snapshot: DesktopFeishuStoreSnapshot,
  loader: {
    loadRoot(input: FeishuDocTreeLoadInput): Promise<FeishuDocTreeLoadResult>;
    loadBranch(input: FeishuDocTreeBranchInput): Promise<FeishuDocTreeBranchResult>;
  },
) {
  return new DesktopFeishuDocRuntime({
    store: createStore(snapshot),
    loader,
  });
}

function createWorkspaceQuery(workspaceId: string, directoryPath: string): DesktopWorkspaceQueryPort {
  return {
    list: async () => ({
      items: [{
        workspaceId,
        name: "Test Workspace",
        directoryPath,
        isPinned: false,
        tags: [],
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      }],
      meta: {
        total: 1,
        limit: 1,
        offset: 0,
        hasMore: false,
      },
    }),
    get: async (candidateWorkspaceId) => candidateWorkspaceId === workspaceId
      ? {
          workspaceId,
          name: "Test Workspace",
          directoryPath,
          isPinned: false,
          tags: [],
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        }
      : null,
    getFileTree: async () => {
      throw new Error("not used");
    },
    getFileContent: async () => {
      throw new Error("not used");
    },
  };
}

describe("DesktopFeishuDocRuntime", () => {
  test("loadDocTreeRoot delegates to the cache-aware loader", async () => {
    const runtime = new DesktopFeishuDocRuntime({
      getDocsCapabilities: async () => ({
        mode: "developer",
        accessKind: "developer_oauth",
        accessLabel: "智能助手 OAuth",
        managedMcpId: "desktop.feishu.smart-assistant",
        endpoint: "desktop://feishu-assistant/docs",
        availableTools: [],
        toolDetails: [],
        canSearchDocs: true,
        canListDocs: true,
        canFetchDocs: true,
        canUpdateDocs: true,
        canBrowseTree: true,
        canReadDocs: true,
        canWriteDocs: true,
      }),
      loadRoot: async () => ({
        rootToken: "root",
        rootKind: "wiki_node",
        nodes: [{ id: "child", token: "child", kind: "document", title: "Child", hasChild: false }],
        hasMore: false,
        source: "remote",
        refreshing: false,
        stale: false,
        loadedAt: "2026-05-21T00:00:00.000Z",
      }),
      loadBranch: async () => ({
        rootToken: "root",
        parentToken: "child",
        nodes: [],
        hasMore: false,
        source: "remote",
        refreshing: false,
        stale: false,
      }),
      getDocContent: async () => { throw new Error("not used"); },
    } as never);

    await expect(runtime.loadDocTreeRoot({ token: "root" })).resolves.toMatchObject({
      rootToken: "root",
      nodes: [expect.objectContaining({ title: "Child" })],
    });
  });

  test("persists the requested tree root token before remote loading", async () => {
      const snapshot = createSnapshot();
      const runtime = createRuntimeWithLoader(snapshot, {
        loadRoot: async () => {
          throw new Error("remote unavailable");
        },
        loadBranch: async () => ({
          rootToken: "root",
          parentToken: "parent",
          nodes: [],
          hasMore: false,
          source: "remote",
          refreshing: false,
          stale: false,
        }),
      });

      await expect(runtime.loadDocTreeRoot({ token: "  GkfewPcB0ibJMMkXGZucdgR8nhh  " })).rejects.toThrow(
        "remote unavailable",
      );

      expect(snapshot.docTreeCache.lastRootToken).toBe("GkfewPcB0ibJMMkXGZucdgR8nhh");
      expect(snapshot.docTreeCache.lastRootUpdatedAt).not.toBe("");
  });

  test("loadDocTreeRoot attaches the cached subtree when preloadSubtree is requested", async () => {
    const snapshot = createSnapshot();
    snapshot.docTreeCache.roots = {
      root: {
        token: "root",
        kind: "wiki_node",
        rootNodeId: "root",
        title: "Root",
        loadedAt: "2026-05-21T00:00:00.000Z",
      },
    };
    snapshot.docTreeCache.branches = {
      root: {
        rootToken: "root",
        parentToken: "root",
        nodes: [{ id: "child", token: "child", kind: "wiki_node", title: "Child", hasChild: true }],
        loadedAt: "2026-05-21T00:00:00.000Z",
        complete: true,
      },
      child: {
        rootToken: "root",
        parentToken: "child",
        nodes: [{ id: "grandchild", token: "grandchild", kind: "document", title: "Grandchild", hasChild: false }],
        loadedAt: "2026-05-21T00:00:01.000Z",
        complete: true,
      },
    } as typeof snapshot.docTreeCache.branches;

    const runtime = new DesktopFeishuDocRuntime({
      store: createStore(snapshot),
      loader: {
        loadRoot: async () => ({
          rootToken: "root",
          rootKind: "wiki_node",
          nodes: [{ id: "child", token: "child", kind: "wiki_node", title: "Child", hasChild: true }],
          hasMore: false,
          source: "remote",
          refreshing: false,
          stale: false,
          loadedAt: "2026-05-21T00:00:00.000Z",
        }),
        loadBranch: async () => {
          throw new Error("not used");
        },
      },
    });

    const result = await runtime.loadDocTreeRoot({ token: "root", preloadSubtree: true });

    expect(result.subtree).toEqual([{
      id: "child",
      token: "child",
      kind: "wiki_node",
      title: "Child",
      hasChild: true,
      children: [{
        id: "grandchild",
        token: "grandchild",
        kind: "document",
        title: "Grandchild",
        hasChild: false,
      }],
    }]);
  });

  test("loadDocTreeBranch delegates to the cache-aware loader", async () => {
    const runtime = new DesktopFeishuDocRuntime({
      getDocsCapabilities: async () => { throw new Error("not used"); },
      loadRoot: async () => { throw new Error("not used"); },
      loadBranch: async (input: FeishuDocTreeBranchInput) => ({
        rootToken: input.rootToken,
        parentToken: input.parentToken,
        nodes: [{ id: "grandchild", token: "grandchild", kind: "document", title: "Grandchild", hasChild: false }],
        hasMore: false,
        source: "remote",
        refreshing: false,
        stale: false,
        loadedAt: "2026-05-21T00:00:00.000Z",
      }),
      getDocContent: async () => { throw new Error("not used"); },
    } as never);

    await expect(runtime.loadDocTreeBranch({ rootToken: "root", parentToken: "child" })).resolves.toMatchObject({
      rootToken: "root",
      parentToken: "child",
      nodes: [expect.objectContaining({ title: "Grandchild" })],
    });
  });

  test("exposes document tree capabilities expected by the workbench", async () => {
    const runtime = createRuntime(createSnapshot());

    const capabilities = await runtime.getDocsCapabilities();

    expect(capabilities.canBrowseTree).toBe(true);
    expect(capabilities.canReadDocs).toBe(true);
    expect(capabilities.canWriteDocs).toBe(true);
    expect(capabilities.availableTools).toContain("docs.list_nodes");
  });

  test("returns loopback preview urls for document media and whiteboards", async () => {
    const runtime = createRuntime(createSnapshot());

    await expect(runtime.getDocMediaPreviewUrls({ fileTokens: ["img_token"] })).resolves.toEqual({
      items: [{
        fileToken: "img_token",
        tmpDownloadUrl: resolveDesktopFeishuDocMediaPreviewUrl("img_token"),
      }],
      errors: [],
    });
    await expect(runtime.getDocWhiteboardPreviewUrls({ whiteboardTokens: ["board_token"] })).resolves.toEqual({
      items: [{
        whiteboardToken: "board_token",
        tmpDownloadUrl: resolveDesktopFeishuDocWhiteboardPreviewUrl("board_token"),
      }],
      errors: [],
    });
  });

  test("downloads document image preview bytes through the drive media endpoint", async () => {
    const requests: Array<{ url: string; authorization: string }> = [];
    const runtime = new DesktopFeishuDocRuntime({
      store: createStore(createSnapshot()),
      loader: {
        loadRoot: async () => { throw new Error("not used"); },
        loadBranch: async () => { throw new Error("not used"); },
      },
      accessToken: async () => "access_token_1",
      fetchImpl: (async (input, init) => {
        const headers = init?.headers as Record<string, string> | undefined;
        requests.push({
          url: String(input),
          authorization: String(headers?.authorization ?? ""),
        });
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: {
            "content-type": "image/png",
          },
        });
      }) as typeof fetch,
    });

    const preview = await runtime.readDocMediaPreview("img_token");

    expect(requests).toEqual([{
      url: "https://open.feishu.cn/open-apis/drive/v1/medias/img_token/download",
      authorization: "Bearer access_token_1",
    }]);
    expect(preview.contentType).toBe("image/png");
    expect([...preview.bytes]).toEqual([137, 80, 78, 71]);
  });

  test("downloads whiteboard preview bytes through the board image endpoint", async () => {
    const requests: Array<{ url: string; authorization: string }> = [];
    const runtime = new DesktopFeishuDocRuntime({
      store: createStore(createSnapshot()),
      loader: {
        loadRoot: async () => { throw new Error("not used"); },
        loadBranch: async () => { throw new Error("not used"); },
      },
      accessToken: async () => "access_token_1",
      fetchImpl: (async (input, init) => {
        const headers = init?.headers as Record<string, string> | undefined;
        requests.push({
          url: String(input),
          authorization: String(headers?.authorization ?? ""),
        });
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: {
            "content-type": "image/png",
          },
        });
      }) as typeof fetch,
    });

    const preview = await runtime.readDocWhiteboardPreview("board_token");

    expect(requests).toEqual([{
      url: "https://open.feishu.cn/open-apis/board/v1/whiteboards/board_token/download_as_image",
      authorization: "Bearer access_token_1",
    }]);
    expect(preview.contentType).toBe("image/png");
    expect([...preview.bytes]).toEqual([137, 80, 78, 71]);
  });

  test("retries document image preview download after refreshing an expired access token", async () => {
    const requests: Array<{ url: string; authorization: string }> = [];
    let currentToken = "access_token_1";
    const runtime = new DesktopFeishuDocRuntime({
      store: createStore(createSnapshot()),
      loader: {
        loadRoot: async () => { throw new Error("not used"); },
        loadBranch: async () => { throw new Error("not used"); },
      },
      accessToken: async (input?: { forceRefresh?: boolean }) => {
        if (input?.forceRefresh) {
          currentToken = "access_token_2";
        }
        return currentToken;
      },
      fetchImpl: (async (input, init) => {
        const headers = init?.headers as Record<string, string> | undefined;
        requests.push({
          url: String(input),
          authorization: String(headers?.authorization ?? ""),
        });
        if (requests.length === 1) {
          return new Response(JSON.stringify({ code: 20006, msg: "access token expired" }), {
            status: 400,
            headers: {
              "content-type": "application/json; charset=utf-8",
            },
          });
        }
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: {
            "content-type": "image/png",
          },
        });
      }) as typeof fetch,
    });

    const preview = await runtime.readDocMediaPreview("img_token");

    expect(requests).toEqual([
      {
        url: "https://open.feishu.cn/open-apis/drive/v1/medias/img_token/download",
        authorization: "Bearer access_token_1",
      },
      {
        url: "https://open.feishu.cn/open-apis/drive/v1/medias/img_token/download",
        authorization: "Bearer access_token_2",
      },
    ]);
    expect(preview.contentType).toBe("image/png");
    expect([...preview.bytes]).toEqual([137, 80, 78, 71]);
  });

  test("returns FeishuDocTreeView nodes for the requested root document", async () => {
    const runtime = createRuntime(createSnapshot());

    const tree = await runtime.getDocTree({
      root: "document",
      docId: "doc_1",
    });

    expect(tree.root).toBe("document");
    expect(tree.parentDocId).toBe("doc_1");
    expect(tree.hasMore).toBe(false);
    expect(tree.nodes).toEqual([]);
  });

  test("returns an empty legacy tree when no concrete token is provided", async () => {
    const runtime = createRuntime(createSnapshot());

    await expect(runtime.getDocTree({ root: "document" })).resolves.toMatchObject({
      root: "document",
      nodes: [],
      hasMore: false,
    });
  });

  test("getDocContent fails instead of generating content when remote and cache are unavailable", async () => {
    const runtime = createRuntime(createSnapshot());

    await expect(runtime.getDocContent("doc_1")).rejects.toThrow("文档内容加载失败");
  });

  test("getDocContent returns cached content when remote fails", async () => {
    const cached = createContentView("doc_1", "Cached Doc", "Cached markdown");
    const runtime = createRuntimeWithContentSource(createSnapshot({ doc_1: cached }), {
      readDocumentContent: async () => { throw new Error("remote unavailable"); },
    });

    await expect(runtime.getDocContent("doc_1")).resolves.toBe(cached);
  });

  test("getDocContent reads remote content and caches it", async () => {
    const snapshot = createSnapshot();
    const remote = createContentView("doc_1", "Remote Doc", "Remote markdown");
    const runtime = createRuntimeWithContentSource(snapshot, {
      readDocumentContent: async (accessToken, docId) => {
        expect(accessToken).toBe("access");
        expect(docId).toBe("doc_1");
        return remote;
      },
    });

    await expect(runtime.getDocContent("doc_1")).resolves.toBe(remote);
    expect(snapshot.docs.doc_1).toBe(remote);
  });

  test("openWorkspaceDoc preserves pulled source and creates a local markdown draft on first open", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_1";
    const resolvedDocId = "doc_1";
    const remote = createContentView(resolvedDocId, "Remote Doc", "# Remote Doc\n\nRemote markdown");
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-runtime-"));

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const runtime = createRuntimeWithContentSource(snapshot, {
        readDocumentContent: async (_accessToken, docId) => {
          expect(docId).toBe(nodeToken);
          return remote;
        },
        readDocumentBundle: async (_accessToken, docId) => {
          expect(docId).toBe(nodeToken);
          return {
            content: remote,
            ir: createDocumentIRWithText(resolvedDocId, "Remote Doc", remote.markdown),
            source: createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
          };
        },
      }, workspaceQuery);

      const opened = await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });
      const originalFile = join(workspaceRoot, ".maomi", "feishu-docs", `${nodeToken}.md`);
      const sourceFile = join(workspaceRoot, ".maomi", "feishu-docs", nodeToken, "document.source.json");
      const baseSourceFile = join(workspaceRoot, ".maomi", "feishu-docs", nodeToken, "base.source.json");
      const draftFile = join(workspaceRoot, ".maomi", "feishu-docs", "drafts", `${nodeToken}.draft.md`);

      expect(await readFile(originalFile, "utf8")).toBe(remote.markdown);
      expect(await readFile(sourceFile, "utf8")).toContain('"requestedDocId": "node_1"');
      expect(await readFile(sourceFile, "utf8")).toContain('"document_id": "doc_1"');
      expect(await readFile(baseSourceFile, "utf8")).toContain('"document_id": "doc_1"');
      expect(await readFile(draftFile, "utf8")).toBe(remote.markdown);
      expect(opened.docId).toBe(nodeToken);
      expect(opened.resolvedDocId).toBe(resolvedDocId);
      expect(opened.markdown).toBe(remote.markdown);
      expect(opened.cache).toMatchObject({
        workspaceId: "ws_1",
        requestedDocId: nodeToken,
        resolvedDocId,
        documentIdType: "wiki_node_token",
        hasRawSourceBaseline: true,
        hasStructuredBaseline: true,
        publishModeRecommendation: "update_existing",
        originalRelativePath: ".maomi/feishu-docs/node_1.md",
        originalBaseRelativePath: ".maomi/feishu-docs/baselines/node_1.base.md",
        draftRelativePath: ".maomi/feishu-docs/drafts/node_1.draft.md",
        sourceRelativePath: ".maomi/feishu-docs/node_1/document.source.json",
        sourceBaseRelativePath: ".maomi/feishu-docs/node_1/base.source.json",
        hasBaseline: true,
        hasLocalChanges: false,
        status: "cached",
      });
      expect(opened.cache?.cacheRelativePath).toBe(".maomi/feishu-docs/drafts/node_1.draft.md");
      expect(snapshot.docs[nodeToken]).toBeUndefined();

      await runtime.saveWorkspaceDocLocalDraft({
        workspaceId: "ws_1",
        docId: nodeToken,
        title: remote.title,
        markdown: "# Remote Doc\n\nLocal draft",
      });

      expect(await readFile(draftFile, "utf8")).toBe("# Remote Doc\n\nLocal draft");

      const reopened = await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

      expect(reopened.docId).toBe(nodeToken);
      expect(reopened.resolvedDocId).toBe(resolvedDocId);
      expect(reopened.markdown).toBe("# Remote Doc\n\nLocal draft");
      expect(reopened.cache?.originalRelativePath).toBe(".maomi/feishu-docs/node_1.md");
      expect(reopened.cache?.draftRelativePath).toBe(".maomi/feishu-docs/drafts/node_1.draft.md");
      expect(reopened.cache?.hasBaseline).toBe(true);
      expect(reopened.cache?.hasLocalChanges).toBe(true);
      expect(snapshot.docs[nodeToken]).toBeUndefined();
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("openWorkspaceDoc materializes an empty markdown-only document as a workspace original", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_empty";
    const resolvedDocId = "doc_empty";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-empty-"));

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const runtime = createRuntimeWithContentSource(snapshot, {
        readDocumentContent: async (_accessToken, docId) => {
          expect(docId).toBe(nodeToken);
          return createContentView(resolvedDocId, "空文档", "");
        },
        readDocumentBundle: async () => {
          throw new Error("structured reader unavailable");
        },
      }, workspaceQuery);

      const opened = await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });
      const originalFile = join(workspaceRoot, ".maomi", "feishu-docs", `${nodeToken}.md`);
      const baselineFile = join(workspaceRoot, ".maomi", "feishu-docs", "baselines", `${nodeToken}.base.md`);
      const draftFile = join(workspaceRoot, ".maomi", "feishu-docs", "drafts", `${nodeToken}.draft.md`);

      expect(opened.docId).toBe(nodeToken);
      expect(opened.resolvedDocId).toBe(resolvedDocId);
      expect(opened.markdown).toBe("");
      expect(opened.cache).toMatchObject({
        workspaceId: "ws_1",
        originalRelativePath: ".maomi/feishu-docs/node_empty.md",
        originalBaseRelativePath: ".maomi/feishu-docs/baselines/node_empty.base.md",
        hasBaseline: true,
        hasLocalChanges: false,
        status: "cached",
      });
      expect(await readFile(originalFile, "utf8")).toBe("");
      expect(await readFile(baselineFile, "utf8")).toBe("");
      expect(await readFile(draftFile, "utf8")).toBe("");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("openWorkspaceDoc migrates legacy document-id workspace cache to node-token paths", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_1";
    const resolvedDocId = "doc_1";
    const remoteMarkdown = "# Remote Doc\n\nRemote markdown";
    const legacyDraftMarkdown = "# Remote Doc\n\nLegacy draft";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-runtime-migrate-"));

    try {
      await writeFixtureFile(join(workspaceRoot, ".maomi", "feishu-docs", `${resolvedDocId}.md`), remoteMarkdown);
      await writeFixtureFile(join(workspaceRoot, ".maomi", "feishu-docs", "baselines", `${resolvedDocId}.base.md`), remoteMarkdown);
      await writeFixtureFile(join(workspaceRoot, ".maomi", "feishu-docs", "drafts", `${resolvedDocId}.draft.md`), legacyDraftMarkdown);
      await writeFixtureFile(
        join(workspaceRoot, ".maomi", "feishu-docs", resolvedDocId, "document.source.json"),
        `${JSON.stringify(createSourceSnapshot(resolvedDocId, "Remote Doc"), null, 2)}\n`,
      );
      await writeFixtureFile(
        join(workspaceRoot, ".maomi", "feishu-docs", resolvedDocId, "base.source.json"),
        `${JSON.stringify(createSourceSnapshot(resolvedDocId, "Remote Doc"), null, 2)}\n`,
      );

      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const runtime = createRuntimeWithContentSource(snapshot, {
        readDocumentContent: async (_accessToken, docId) => {
          expect(docId).toBe(nodeToken);
          return createContentView(resolvedDocId, "Remote Doc", remoteMarkdown);
        },
        readDocumentBundle: async (_accessToken, docId) => {
          expect(docId).toBe(nodeToken);
          return {
            content: createContentView(resolvedDocId, "Remote Doc", remoteMarkdown),
            ir: createDocumentIRWithText(resolvedDocId, "Remote Doc", remoteMarkdown),
            source: createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
          };
        },
      }, workspaceQuery);

      const opened = await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

      expect(opened.docId).toBe(nodeToken);
      expect(opened.resolvedDocId).toBe(resolvedDocId);
      expect(opened.markdown).toBe(legacyDraftMarkdown);
      expect(await readFile(join(workspaceRoot, ".maomi", "feishu-docs", `${nodeToken}.md`), "utf8"))
        .toBe(remoteMarkdown);
      expect(await readFile(join(workspaceRoot, ".maomi", "feishu-docs", "drafts", `${nodeToken}.draft.md`), "utf8"))
        .toBe(legacyDraftMarkdown);
      expect(await readFile(join(workspaceRoot, ".maomi", "feishu-docs", nodeToken, "document.source.json"), "utf8"))
        .toContain('"requestedDocId": "node_1"');
      await expect(readFile(join(workspaceRoot, ".maomi", "feishu-docs", `${resolvedDocId}.md`), "utf8"))
        .rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(join(workspaceRoot, ".maomi", "feishu-docs", "drafts", `${resolvedDocId}.draft.md`), "utf8"))
        .rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("pullWorkspaceDoc refreshes source cache and creates a local markdown draft", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_1";
    const resolvedDocId = "doc_1";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-pull-"));

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      let markdown = "# Remote Doc\n\nVersion 1";
      const runtime = createRuntimeWithContentSource(snapshot, {
        readDocumentContent: async (_accessToken, docId) => {
          expect(docId).toBe(nodeToken);
          return createContentView(resolvedDocId, "Remote Doc", markdown);
        },
        readDocumentBundle: async (_accessToken, docId) => {
          expect(docId).toBe(nodeToken);
          return {
          content: createContentView(resolvedDocId, "Remote Doc", markdown),
          ir: createDocumentIRWithText(resolvedDocId, "Remote Doc", markdown),
          source: {
            ...createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
            document: {
              document_id: resolvedDocId,
              title: "Remote Doc",
              revision_id: markdown.includes("Version 2") ? "2" : "1",
            },
            blocks: [{ block_id: resolvedDocId, block_type: 1, version: markdown }],
          },
        };
        },
      }, workspaceQuery);

      const firstPull = await runtime.pullWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });
      expect(firstPull.pullStatus).toBe("created");
      expect(firstPull.item.docId).toBe(nodeToken);
      expect(firstPull.item.resolvedDocId).toBe(resolvedDocId);
      expect(await readFile(join(workspaceRoot, ".maomi", "feishu-docs", `${nodeToken}.md`), "utf8"))
        .toBe(markdown);
      expect(await readFile(join(workspaceRoot, ".maomi", "feishu-docs", "drafts", `${nodeToken}.draft.md`), "utf8"))
        .toBe(markdown);

      markdown = "# Remote Doc\n\nVersion 2";
      const secondPull = await runtime.pullWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

      expect(secondPull.pullStatus).toBe("updated");
      expect(secondPull.item.docId).toBe(nodeToken);
      expect(secondPull.item.resolvedDocId).toBe(resolvedDocId);
      expect(secondPull.item.markdown).toBe(markdown);
      expect(await readFile(join(workspaceRoot, ".maomi", "feishu-docs", nodeToken, "document.source.json"), "utf8"))
        .toContain('"document_id": "doc_1"');
      expect(await readFile(join(workspaceRoot, ".maomi", "feishu-docs", `${nodeToken}.md`), "utf8"))
        .toBe(markdown);
      expect(await readFile(join(workspaceRoot, ".maomi", "feishu-docs", "drafts", `${nodeToken}.draft.md`), "utf8"))
        .toBe(markdown);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("pullWorkspaceDoc returns and persists latest pull diagnostics", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_1";
    const resolvedDocId = "doc_1";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-pull-diagnostics-"));
    const diagnostics = {
      latestPull: {
        whiteboardRecovery: {
          status: "partial" as const,
          recoveredCount: 1,
          fallbackCount: 1,
          permissionDeniedCount: 1,
          documentPermissionDenied: false,
          entries: [{
            token: "board_1",
            stage: "whiteboard_code" as const,
            code: 2890005,
            message: "forbidden",
            category: "permission" as const,
            fallbackApplied: true,
          }],
        },
      },
    };

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const runtime = createRuntimeWithContentSource(snapshot, {
        readDocumentContent: async (_accessToken, docId) => {
          expect(docId).toBe(nodeToken);
          return createContentView(resolvedDocId, "Remote Doc", "# Remote Doc", diagnostics);
        },
        readDocumentBundle: async (_accessToken, docId) => {
          expect(docId).toBe(nodeToken);
          return {
            content: createContentView(resolvedDocId, "Remote Doc", "# Remote Doc", diagnostics),
            ir: createDocumentIRWithText(resolvedDocId, "Remote Doc", "# Remote Doc"),
            source: createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
          };
        },
      }, workspaceQuery);

      const result = await runtime.pullWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });
      const cached = await runtime.getWorkspaceDocLocalDraft({ workspaceId: "ws_1", docId: nodeToken });

      expect(result.diagnostics?.whiteboardRecovery?.permissionDeniedCount).toBe(1);
      expect(result.item.diagnostics?.latestPull?.whiteboardRecovery?.entries[0]?.code).toBe(2890005);
      expect(cached.diagnostics?.latestPull?.whiteboardRecovery?.entries[0]?.code).toBe(2890005);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("openWorkspaceDoc keeps original image markdown while caching preview assets separately", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_1";
    const resolvedDocId = "doc_1";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-ir-open-"));

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const runtime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async (_accessToken, docId) => {
            expect(docId).toBe(nodeToken);
            return createContentView(resolvedDocId, "Remote Doc", '<image token="img_token" width="320" height="180" />');
          },
          readDocumentBundle: async (accessToken, docId) => {
            expect(accessToken).toBe("access");
            expect(docId).toBe(nodeToken);
            return {
              content: createContentView(resolvedDocId, "Remote Doc", '<image token="img_token" width="320" height="180" />'),
              ir: createDocumentIRWithImage(resolvedDocId, "Remote Doc"),
              source: createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
            };
          },
        },
        workspaceQuery,
        async () => new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: {
            "content-type": "image/png",
          },
        }),
      );

      const opened = await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });
      const irCacheRaw = await readFile(join(workspaceRoot, ".maomi", "feishu-docs", nodeToken, "document.ir.json"), "utf8");
      const parsedIR = JSON.parse(irCacheRaw) as FeishuDocIR;
      const cachedImagePath = parsedIR.assets.img_token.absolutePath;

      expect(cachedImagePath).toBeTruthy();
      expect(String(cachedImagePath)).toContain(join(workspaceRoot, ".maomi", "feishu-docs", "_assets"));
      expect(opened.docId).toBe(nodeToken);
      expect(opened.resolvedDocId).toBe(resolvedDocId);
      expect(opened.markdown).toBe('<image token="img_token" width="320" height="180" />');
      expect(await readFile(join(workspaceRoot, ".maomi", "feishu-docs", `${nodeToken}.md`), "utf8"))
        .toBe('<image token="img_token" width="320" height="180" />');
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("openWorkspaceDoc keeps local drafts untouched while source and IR stay as the original pulled cache", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_1";
    const resolvedDocId = "doc_1";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-local-draft-image-"));

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const runtime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async (_accessToken, docId) => {
            expect(docId).toBe(nodeToken);
            return createContentView(resolvedDocId, "Remote Doc", '<image token="img_token" width="320" height="180" />');
          },
          readDocumentBundle: async () => ({
            content: createContentView(resolvedDocId, "Remote Doc", '<image token="img_token" width="320" height="180" />'),
            ir: createDocumentIRWithImage(resolvedDocId, "Remote Doc"),
            source: createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
          }),
        },
        workspaceQuery,
        async () => new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: {
            "content-type": "image/png",
          },
        }),
      );

      await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });
      await runtime.saveWorkspaceDocLocalDraft({
        workspaceId: "ws_1",
        docId: nodeToken,
        title: "Remote Doc",
        markdown: '# Remote Doc\n\n<FeishuImage token="img_token" />\n\nlocal edit\n',
      });

      const opened = await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });
      const irCacheRaw = await readFile(join(workspaceRoot, ".maomi", "feishu-docs", nodeToken, "document.ir.json"), "utf8");
      const parsedIR = JSON.parse(irCacheRaw) as FeishuDocIR;

      expect(opened.docId).toBe(nodeToken);
      expect(opened.resolvedDocId).toBe(resolvedDocId);
      expect(opened.cache?.hasLocalChanges).toBe(true);
      expect(opened.markdown).toContain("local edit");
      expect(await readFile(join(workspaceRoot, ".maomi", "feishu-docs", "drafts", `${nodeToken}.draft.md`), "utf8"))
        .toContain('<FeishuImage token="img_token" />');
      expect(await readFile(join(workspaceRoot, ".maomi", "feishu-docs", `${nodeToken}.md`), "utf8"))
        .toContain('<image token="img_token" width="320" height="180" />');
      expect(String(parsedIR.assets.img_token.absolutePath)).toContain(join(workspaceRoot, ".maomi", "feishu-docs", "_assets"));
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("pushWorkspaceDoc blocks when the pulled raw baseline revision is stale", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_1";
    const resolvedDocId = "doc_1";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-push-conflict-"));

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const baseIR = createDocumentIRWithText(resolvedDocId, "Remote Doc", "# Remote Doc");
      const runtime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async () => createContentView(resolvedDocId, "Remote Doc", "# Remote Doc"),
          readDocumentBundle: async () => ({
            content: createContentView(resolvedDocId, "Remote Doc", "# Remote Doc"),
            ir: baseIR,
            source: {
              ...createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
              document: {
                document_id: resolvedDocId,
                title: "Remote Doc",
                revision_id: "2",
              },
            },
          }),
        },
        workspaceQuery,
        undefined,
        {
          docWorkspaceRuntime: {
            openDocument: async () => ({ source: "cache", ir: baseIR }),
            pullLatest: async () => ({ ir: baseIR }),
            pushDocument: async () => ({ status: "succeeded" }),
          },
        },
      );

      await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });
      await writeFixtureFile(
        join(workspaceRoot, ".maomi", "feishu-docs", nodeToken, "document.source.json"),
        `${JSON.stringify({
          ...createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
          document: {
            document_id: resolvedDocId,
            title: "Remote Doc",
            revision_id: "2",
          },
        }, null, 2)}\n`,
      );

      const pushed = await runtime.pushWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
        title: "Remote Doc",
        markdown: feishuDocIRToMdx(baseIR).replace("# Remote Doc", "# Edited Remote Doc"),
        force: true,
      });

      expect(pushed.pushStatus).toBe("blocked");
      expect(pushed.message).toContain("重新拉取");
      expect(pushed.item.cache?.publishModeRecommendation).toBe("pull_required");
      expect(pushed.item.cache?.hasRevisionConflict).toBe(true);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("pushWorkspaceDoc routes safe anchored text changes through the IR push pipeline", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_1";
    const resolvedDocId = "doc_1";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-push-safe-"));
    let pushCalls = 0;
    let remoteMarkdown = "# Remote Doc";

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const baseIR = createDocumentIRWithText(resolvedDocId, "Remote Doc", "# Remote Doc");
      const runtime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async (_accessToken, docId) => createContentView(docId, "Remote Doc", remoteMarkdown),
          readDocumentBundle: async (_accessToken, docId) => ({
            content: createContentView(docId, "Remote Doc", remoteMarkdown),
            ir: createDocumentIRWithText(resolvedDocId, "Remote Doc", remoteMarkdown),
            source: createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
          }),
        },
        workspaceQuery,
        undefined,
        {
          docWorkspaceRuntime: {
            openDocument: async () => ({ source: "cache", ir: baseIR }),
            pullLatest: async () => ({ ir: baseIR }),
            pushDocument: async () => {
              pushCalls += 1;
              remoteMarkdown = "# Edited Remote Doc";
              return { status: "succeeded" };
            },
          },
        },
      );

      await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

      const pushed = await runtime.pushWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
        title: "Remote Doc",
        markdown: feishuDocIRToMdx(baseIR).replace("# Remote Doc", "# Edited Remote Doc"),
        force: true,
      });

      expect(pushCalls).toBe(1);
      expect(pushed.pushStatus).toBe("succeeded");
      expect(pushed.item.cache?.publishModeRecommendation).toBe("update_existing");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("pushWorkspaceDoc keeps plain markdown after a successful overwrite push", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_1";
    const resolvedDocId = "doc_1";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-push-no-patch-"));
    let remoteMarkdown = "# Remote Doc";
    let remoteRevisionId = "1";
    let convertCalls = 0;
    let deleteCalls = 0;
    let createCalls = 0;
    let bundleReads = 0;

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const runtime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async (_accessToken, docId) => createContentView(docId, "Remote Doc", remoteMarkdown),
          readDocumentBundle: async (_accessToken, docId) => {
            bundleReads += 1;
            if (bundleReads === 1) {
              return {
                content: createContentView(resolvedDocId, "Remote Doc", remoteMarkdown),
                ir: createDocumentIRWithText(resolvedDocId, "Remote Doc", remoteMarkdown, remoteRevisionId),
                source: {
                  ...createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
                  document: {
                    document_id: resolvedDocId,
                    title: "Remote Doc",
                    revision_id: remoteRevisionId,
                  },
                },
              };
            }

            throw new Error("push should not re-read remote content after a successful markdown overwrite");
          },
        },
        workspaceQuery,
        async (url, init) => {
          const target = new URL(String(url));
          if (target.pathname === "/open-apis/docx/v1/documents/blocks/convert") {
            convertCalls += 1;
            expect(init?.method).toBe("POST");
            expect(JSON.parse(String(init?.body))).toEqual({
              content_type: "markdown",
              content: "# Edited Remote Doc\n\n- item",
            });

            return new Response(JSON.stringify({
              code: 0,
              data: {
                first_level_block_ids: ["tmp_h1", "tmp_b1"],
                blocks: [
                  {
                    block_id: "tmp_h1",
                    block_type: 3,
                    heading1: {
                      elements: [{
                        text_run: {
                          content: "Edited Remote Doc",
                        },
                      }],
                    },
                  },
                  {
                    block_id: "tmp_b1",
                    block_type: 12,
                    bullet: {
                      elements: [{
                        text_run: {
                          content: "item",
                        },
                      }],
                    },
                  },
                ],
              },
            }), { status: 200, headers: { "content-type": "application/json" } });
          }

          if (target.pathname === `/open-apis/docx/v1/documents/${resolvedDocId}/blocks/${resolvedDocId}/children/batch_delete`) {
            deleteCalls += 1;
            expect(init?.method).toBe("DELETE");
            expect(target.searchParams.get("document_revision_id")).toBe("1");
            expect(JSON.parse(String(init?.body))).toEqual({
              start_index: 0,
              end_index: 1,
            });

            return new Response(JSON.stringify({
              code: 0,
              data: {
                document_revision_id: 2,
              },
            }), { status: 200, headers: { "content-type": "application/json" } });
          }

          if (target.pathname === `/open-apis/docx/v1/documents/${resolvedDocId}/blocks/${resolvedDocId}/descendant`) {
            createCalls += 1;
            expect(init?.method).toBe("POST");
            expect(target.searchParams.get("document_revision_id")).toBe("2");
            expect(JSON.parse(String(init?.body))).toEqual({
              children_id: ["tmp_h1", "tmp_b1"],
              descendants: [
                {
                  block_id: "tmp_h1",
                  block_type: 3,
                  heading1: {
                    elements: [{
                      text_run: {
                        content: "Edited Remote Doc",
                      },
                    }],
                  },
                },
                {
                  block_id: "tmp_b1",
                  block_type: 12,
                  bullet: {
                    elements: [{
                      text_run: {
                        content: "item",
                      },
                    }],
                  },
                },
              ],
            });
            remoteMarkdown = "# Edited Remote Doc\n\n- item";
            remoteRevisionId = "3";

            return new Response(JSON.stringify({
              code: 0,
              data: {
                document_revision_id: 3,
              },
            }), { status: 200, headers: { "content-type": "application/json" } });
          }

          throw new Error(`unexpected fetch url: ${String(url)}`);
        },
      );

      await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

      const pushed = await runtime.pushWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
        title: "Remote Doc",
        markdown: "# Edited Remote Doc\n\n- item",
        force: true,
      });

      expect(convertCalls).toBe(1);
      expect(deleteCalls).toBe(1);
      expect(createCalls).toBe(1);
      expect(bundleReads).toBe(1);
      expect(pushed.pushStatus).toBe("succeeded");
      expect(pushed.item.markdown).toBe("# Edited Remote Doc\n\n- item");
      expect(pushed.item.cache?.hasLocalChanges).toBe(false);

      const cached = await runtime.getWorkspaceDocLocalDraft({ workspaceId: "ws_1", docId: nodeToken });
      expect(cached.markdown).toBe("# Edited Remote Doc\n\n- item");
      expect(cached.cache?.hasLocalChanges).toBe(false);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("pushWorkspaceDoc still blocks pure-markdown replacement when the baseline contains Feishu native blocks", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_1";
    const resolvedDocId = "doc_1";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-push-native-baseline-"));
    let networkCalls = 0;

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const runtime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async () => createContentView(resolvedDocId, "Remote Doc", '<image token="img_token" width="320" height="180" />'),
          readDocumentBundle: async () => ({
            content: createContentView(resolvedDocId, "Remote Doc", '<image token="img_token" width="320" height="180" />'),
            ir: createDocumentIRWithImage(resolvedDocId, "Remote Doc"),
            source: createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
          }),
        },
        workspaceQuery,
        async () => {
          networkCalls += 1;
          throw new Error("unexpected network call");
        },
      );

      await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });
      networkCalls = 0;

      const pushed = await runtime.pushWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
        markdown: "# Edited Remote Doc",
        force: true,
      });

      expect(networkCalls).toBe(0);
      expect(pushed.pushStatus).toBe("blocked");
      expect(pushed.message).toContain("飞书原生块");
      expect(pushed.item.markdown).toBe("# Edited Remote Doc");
      expect(pushed.item.cache?.hasLocalChanges).toBe(true);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("pushWorkspaceDoc keeps anchored markdown after a successful patch push", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_1";
    const resolvedDocId = "doc_1";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-push-direct-runtime-"));
    let remoteMarkdown = "# Remote Doc";
    let remoteRevisionId = "1";
    let patchCalls = 0;
    let bundleReads = 0;

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const runtime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async (_accessToken, docId) => createContentView(docId, "Remote Doc", remoteMarkdown),
          readDocumentBundle: async (_accessToken, docId) => {
            bundleReads += 1;
            if (bundleReads === 1) {
              return {
                content: createContentView(docId, "Remote Doc", remoteMarkdown),
                ir: createDocumentIRWithText(resolvedDocId, "Remote Doc", remoteMarkdown, remoteRevisionId),
                source: {
                  ...createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
                  document: {
                    document_id: resolvedDocId,
                    title: "Remote Doc",
                    revision_id: remoteRevisionId,
                  },
                },
              };
            }

            throw new Error("push should not re-read remote content after a successful patch write");
          },
        },
        workspaceQuery,
        async (url, init) => {
          const target = new URL(String(url));
          if (target.pathname === `/open-apis/docx/v1/documents/${resolvedDocId}/blocks/text_1`) {
            patchCalls += 1;
            expect(init?.method).toBe("PATCH");
            remoteMarkdown = String(JSON.parse(String(init?.body)).update_text_elements.elements[0].text_run.content);
            remoteRevisionId = "2";

            return new Response(JSON.stringify({
              code: 0,
              data: {},
            }), { status: 200, headers: { "content-type": "application/json" } });
          }

          throw new Error(`unexpected fetch url: ${String(url)}`);
        },
      );

      await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

      const pushed = await runtime.pushWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
        markdown: "<!--feishu:block:text_1-->\n# Edited Remote Doc\n<!--/feishu:block:text_1-->\n",
        force: true,
      });

      expect(patchCalls).toBe(1);
      expect(bundleReads).toBe(1);
      expect(pushed.pushStatus).toBe("succeeded");
      expect(pushed.item.markdown).toBe("<!--feishu:block:text_1-->\n# Edited Remote Doc\n<!--/feishu:block:text_1-->\n");
      expect(pushed.item.cache?.hasLocalChanges).toBe(false);

      const cached = await runtime.getWorkspaceDocLocalDraft({ workspaceId: "ws_1", docId: nodeToken });
      expect(cached.markdown).toBe("<!--feishu:block:text_1-->\n# Edited Remote Doc\n<!--/feishu:block:text_1-->\n");
      expect(cached.cache?.hasLocalChanges).toBe(false);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("pushWorkspaceDoc can overwrite the same markdown doc twice without an explicit pull", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_1";
    const resolvedDocId = "doc_1";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-push-repeat-"));
    let remoteMarkdown = "# Remote Doc";
    let remoteRevisionId = "1";
    let bundleReads = 0;
    const deleteRevisionIds: string[] = [];

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const runtime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async () => createContentView(resolvedDocId, "Remote Doc", remoteMarkdown),
          readDocumentBundle: async (_accessToken, docId) => {
            bundleReads += 1;
            if (bundleReads === 1) {
              return {
                content: createContentView(resolvedDocId, "Remote Doc", remoteMarkdown),
                ir: createDocumentIRWithText(resolvedDocId, "Remote Doc", remoteMarkdown, remoteRevisionId),
                source: {
                  ...createSourceSnapshot(docId, "Remote Doc", resolvedDocId),
                  document: {
                    document_id: resolvedDocId,
                    title: "Remote Doc",
                    revision_id: remoteRevisionId,
                  },
                },
              };
            }

            throw new Error("push should not pull remote content after the initial open");
          },
        },
        workspaceQuery,
        async (url, init) => {
          const target = new URL(String(url));
          if (target.pathname === "/open-apis/docx/v1/documents/blocks/convert") {
            const content = String(JSON.parse(String(init?.body)).content);
            const heading = content.includes("Second Push") ? "Second Push" : "First Push";

            return new Response(JSON.stringify({
              code: 0,
              data: {
                first_level_block_ids: ["tmp_h1"],
                blocks: [{
                  block_id: "tmp_h1",
                  block_type: 3,
                  heading1: {
                    elements: [{
                      text_run: {
                        content: heading,
                      },
                    }],
                  },
                }],
              },
            }), { status: 200, headers: { "content-type": "application/json" } });
          }

          if (target.pathname === `/open-apis/docx/v1/documents/${resolvedDocId}/blocks/${resolvedDocId}/children/batch_delete`) {
            deleteRevisionIds.push(target.searchParams.get("document_revision_id") ?? "");
            remoteRevisionId = String(Number(remoteRevisionId) + 1);

            return new Response(JSON.stringify({
              code: 0,
              data: {
                document_revision_id: Number(remoteRevisionId),
              },
            }), { status: 200, headers: { "content-type": "application/json" } });
          }

          if (target.pathname === `/open-apis/docx/v1/documents/${resolvedDocId}/blocks/${resolvedDocId}/descendant`) {
            const heading = JSON.parse(String(init?.body)).descendants[0].heading1.elements[0].text_run.content;
            remoteMarkdown = `# ${heading}`;
            remoteRevisionId = String(Number(remoteRevisionId) + 1);

            return new Response(JSON.stringify({
              code: 0,
              data: {
                document_revision_id: Number(remoteRevisionId),
              },
            }), { status: 200, headers: { "content-type": "application/json" } });
          }

          throw new Error(`unexpected fetch url: ${String(url)}`);
        },
      );

      await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

      const first = await runtime.pushWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
        title: "Remote Doc",
        markdown: "# First Push",
        force: true,
      });

      const second = await runtime.pushWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
        title: "Remote Doc",
        markdown: "# Second Push",
        force: true,
      });

      expect(first.pushStatus).toBe("succeeded");
      expect(second.pushStatus).toBe("succeeded");
      expect(bundleReads).toBe(1);
      expect(deleteRevisionIds).toEqual(["1", "-1"]);
      expect(second.item.markdown).toBe("# Second Push");
      expect(second.item.cache?.hasLocalChanges).toBe(false);

      const cached = await runtime.getWorkspaceDocLocalDraft({ workspaceId: "ws_1", docId: nodeToken });
      expect(cached.markdown).toBe("# Second Push");
      expect(cached.cache?.hasLocalChanges).toBe(false);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("pushWorkspaceDoc updates a pulled reversible Mermaid whiteboard through its original token", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "wiki_node_1";
    const resolvedDocId = "doc_1";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-reversible-mermaid-push-"));
    let docsAiWrites = 0;
    const whiteboardUpdates: Array<{
      whiteboardToken: string;
      inputFormat: "mermaid";
      source: string;
      overwrite: boolean;
    }> = [];

    try {
      const runtime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async () => createContentView(nodeToken, "Mermaid Doc", "```mermaid\nflowchart TD\nA-->B\n```"),
          readDocumentBundle: async () => ({
            content: createContentView(nodeToken, "Mermaid Doc", "```mermaid\nflowchart TD\nA-->B\n```"),
            ir: createDocumentIRWithReversibleMermaid({
              resolvedDocId,
              whiteboardToken: "wb_1",
              source: "flowchart TD\nA-->B",
            }),
            source: createSourceSnapshot(nodeToken, "Mermaid Doc", resolvedDocId),
          }),
        },
        createWorkspaceQuery("ws_1", workspaceRoot),
        async (url, init) => {
          const target = new URL(String(url));
          if (target.pathname === `/open-apis/docs_ai/v1/documents/${nodeToken}`) {
            docsAiWrites += 1;
            expect(init?.method).toBe("PUT");
            expect(JSON.parse(String(init?.body))).toEqual({
              command: "overwrite",
              content: '<whiteboard token="wb_1" />\n',
              format: "markdown",
              revision_id: -1,
            });

            return new Response(JSON.stringify({
              code: 0,
              data: {
                document: {
                  revision_id: 9,
                },
                result: "success",
                warnings: [],
              },
            }), { status: 200, headers: { "content-type": "application/json" } });
          }

          throw new Error(`unexpected fetch url: ${String(url)}`);
        },
        {
          whiteboardApi: {
            updateWhiteboard: async (input) => {
              whiteboardUpdates.push(input);
              return { result: "success" };
            },
          },
        },
      );

      await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

      const pushed = await runtime.pushWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
        markdown: "```mermaid\nflowchart TD\nA-->C\n```\n",
        force: true,
      });

      expect(docsAiWrites).toBe(1);
      expect(whiteboardUpdates).toEqual([{
        whiteboardToken: "wb_1",
        inputFormat: "mermaid",
        source: "flowchart TD\nA-->C",
        overwrite: true,
      }]);
      expect(pushed.pushStatus).toBe("succeeded");
      expect(pushed.item.markdown).toContain("```mermaid\nflowchart TD\nA-->C\n```");
      expect(pushed.item.cache?.hasLocalChanges).toBe(false);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("pushWorkspaceDoc blocks when reversible Mermaid whiteboards are reordered", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "wiki_node_1";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-reversible-mermaid-blocked-"));
    let remoteWrites = 0;

    try {
      const runtime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async () => createContentView(
            nodeToken,
            "Mermaid Doc",
            "```mermaid\nflowchart TD\nA-->B\n```\n\n```mermaid\nflowchart TD\nC-->D\n```",
          ),
          readDocumentBundle: async () => ({
            content: createContentView(
              nodeToken,
              "Mermaid Doc",
              "```mermaid\nflowchart TD\nA-->B\n```\n\n```mermaid\nflowchart TD\nC-->D\n```",
            ),
            ir: createDocumentIRWithTwoReversibleMermaidBoards(),
            source: createSourceSnapshot(nodeToken, "Mermaid Doc", "doc_1"),
          }),
        },
        createWorkspaceQuery("ws_1", workspaceRoot),
        async () => {
          remoteWrites += 1;
          throw new Error("remote write should not happen");
        },
        {
          whiteboardApi: {
            updateWhiteboard: async () => {
              remoteWrites += 1;
              return { result: "success" };
            },
          },
        },
      );

      await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

      const pushed = await runtime.pushWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
        markdown: "```mermaid\nflowchart TD\nC-->D\n```\n\n```mermaid\nflowchart TD\nA-->B\n```",
        force: true,
      });

      expect(remoteWrites).toBe(0);
      expect(pushed.pushStatus).toBe("blocked");
      expect(pushed.message).toContain("Mermaid 白板顺序已变化");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("pushWorkspaceDoc rewrites Mermaid blocks through docs v2 overwrite and keeps using that path until the next pull", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_1";
    const resolvedDocId = "doc_1";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-push-mermaid-"));
    let bundleReads = 0;
    const docsAiBodies: Array<Record<string, unknown>> = [];

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const runtime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async () => createContentView(resolvedDocId, "Remote Doc", "# Remote Doc"),
          readDocumentBundle: async () => {
            bundleReads += 1;
            if (bundleReads > 1) {
              throw new Error("push should not re-read remote content after docs v2 overwrite");
            }

            return {
              content: createContentView(resolvedDocId, "Remote Doc", "# Remote Doc"),
              ir: createDocumentIRWithText(resolvedDocId, "Remote Doc", "# Remote Doc"),
              source: createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
            };
          },
        },
        workspaceQuery,
        async (url, init) => {
          const target = new URL(String(url));
          if (target.pathname === `/open-apis/docs_ai/v1/documents/${nodeToken}`) {
            expect(init?.method).toBe("PUT");
            const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
            docsAiBodies.push(body);

            return new Response(JSON.stringify({
              code: 0,
              data: {
                document: {
                  revision_id: docsAiBodies.length + 1,
                  new_blocks: docsAiBodies.length === 1
                    ? [{
                        block_id: "blk_board_1",
                        block_type: "whiteboard",
                        block_token: "wb_1",
                      }]
                    : [],
                },
                result: "success",
                warnings: [],
              },
            }), { status: 200, headers: { "content-type": "application/json" } });
          }

          throw new Error(`unexpected fetch url: ${String(url)}`);
        },
      );

      await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

      const first = await runtime.pushWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
        title: "Remote Doc",
        markdown: "# Edited Remote Doc\n\n```\nflowchart TD\nA --> B\n```",
        force: true,
      });

      const second = await runtime.pushWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
        title: "Remote Doc",
        markdown: "# Plain Remote Doc",
        force: true,
      });

      expect(first.pushStatus).toBe("succeeded");
      expect(second.pushStatus).toBe("succeeded");
      expect(bundleReads).toBe(1);
      expect(docsAiBodies).toEqual([
        {
          command: "overwrite",
          content: "# Edited Remote Doc\n\n<whiteboard type=\"mermaid\">\nflowchart TD\nA --> B\n</whiteboard>",
          format: "markdown",
          revision_id: -1,
        },
        {
          command: "overwrite",
          content: "# Plain Remote Doc",
          format: "markdown",
          revision_id: -1,
        },
      ]);
      expect(second.item.markdown).toBe("# Plain Remote Doc");
      expect(second.item.cache?.hasLocalChanges).toBe(false);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("pullWorkspaceDoc restores previously pushed Mermaid source when remote whiteboards fall back to board tokens", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_1";
    const resolvedDocId = "doc_1";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-pull-restores-mermaid-"));
    let bundleMode: "initial" | "pulled" = "initial";

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const runtime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async () => createContentView(resolvedDocId, "Remote Doc", "# Remote Doc"),
          readDocumentBundle: async () => {
            if (bundleMode === "initial") {
              return {
                content: createContentView(resolvedDocId, "Remote Doc", "# Remote Doc"),
                ir: createDocumentIRWithText(resolvedDocId, "Remote Doc", "# Remote Doc"),
                source: createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
              };
            }

            return {
              content: createContentView(
                resolvedDocId,
                "Remote Doc",
                '<board blockId="board_1" token="wb_1" />',
                {
                  latestPull: {
                    whiteboardRecovery: {
                      status: "blocked",
                      recoveredCount: 0,
                      fallbackCount: 1,
                      permissionDeniedCount: 0,
                      documentPermissionDenied: false,
                      entries: [{
                        token: "wb_1",
                        stage: "whiteboard_code",
                        code: 99991400,
                        message: "request trigger frequency limit",
                        category: "unknown",
                        fallbackApplied: true,
                      }],
                    },
                  },
                },
              ),
              ir: createDocumentIRWithBoardToken({
                resolvedDocId,
                whiteboardToken: "wb_1",
              }),
              source: createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
            };
          },
        },
        workspaceQuery,
        async (url, init) => {
          const target = new URL(String(url));
          if (target.pathname === `/open-apis/docs_ai/v1/documents/${nodeToken}`) {
            expect(init?.method).toBe("PUT");
            expect(JSON.parse(String(init?.body))).toEqual({
              command: "overwrite",
              content: '# Remote Doc\n\n<whiteboard type="mermaid">\nflowchart TD\nA --> B\n</whiteboard>',
              format: "markdown",
              revision_id: -1,
            });

            return new Response(JSON.stringify({
              code: 0,
              data: {
                document: {
                  revision_id: 2,
                  new_blocks: [{
                    block_id: "board_1",
                    block_type: "whiteboard",
                    block_token: "wb_1",
                  }],
                },
                result: "success",
                warnings: [],
              },
            }), { status: 200, headers: { "content-type": "application/json" } });
          }

          throw new Error(`unexpected fetch url: ${String(url)}`);
        },
      );

      await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

      const pushed = await runtime.pushWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
        title: "Remote Doc",
        markdown: "# Remote Doc\n\n```mermaid\nflowchart TD\nA --> B\n```",
        force: true,
      });
      expect(pushed.pushStatus).toBe("succeeded");

      bundleMode = "pulled";

      const pulled = await runtime.pullWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
      });

      expect(pulled.pullStatus).toBe("updated");
      expect(pulled.item.markdown).toContain("```mermaid\nflowchart TD\nA --> B\n```");
      expect(pulled.item.markdown).not.toContain("<board blockId=\"board_1\" token=\"wb_1\" />");
      expect(pulled.item.diagnostics?.latestPull?.whiteboardRecovery?.fallbackCount).toBe(0);
      expect(pulled.item.diagnostics?.latestPull?.whiteboardRecovery?.status).toBe("ok");

      const cached = await runtime.getWorkspaceDocLocalDraft({ workspaceId: "ws_1", docId: nodeToken });
      expect(cached.markdown).toContain("```mermaid\nflowchart TD\nA --> B\n```");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("pullWorkspaceDoc restores Mermaid source from stored doc when legacy workspace caches lost reversible metadata", async () => {
    const nodeToken = "node_legacy";
    const resolvedDocId = "doc_legacy";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-pull-restores-from-store-"));
    const snapshot = createSnapshot({
      [nodeToken]: {
        ...createContentView(
          nodeToken,
          "Remote Doc",
          "# Remote Doc\n\n```mermaid\nflowchart TD\nA --> B\n```",
        ),
        resolvedDocId,
        cache: {
          workspaceId: "ws_1",
          hasBaseline: true,
          hasLocalChanges: false,
          localChecksum: "sha256:stored",
          status: "cached",
        },
      },
    });

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const runtime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async () => createContentView(
            resolvedDocId,
            "Remote Doc",
            '<board blockId="board_1" token="wb_1" />',
          ),
          readDocumentBundle: async () => ({
            content: createContentView(
              resolvedDocId,
              "Remote Doc",
              '<board blockId="board_1" token="wb_1" />',
              {
                latestPull: {
                  whiteboardRecovery: {
                    status: "blocked",
                    recoveredCount: 0,
                    fallbackCount: 1,
                    permissionDeniedCount: 0,
                    documentPermissionDenied: false,
                    entries: [{
                      token: "wb_1",
                      stage: "whiteboard_code",
                      code: 99991400,
                      message: "request trigger frequency limit",
                      category: "unknown",
                      fallbackApplied: true,
                    }],
                  },
                },
              },
            ),
            ir: createDocumentIRWithBoardToken({
              resolvedDocId,
              whiteboardToken: "wb_1",
            }),
            source: createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
          }),
        },
        workspaceQuery,
      );

      const pulled = await runtime.pullWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
      });

      expect(pulled.pullStatus).toBe("created");
      expect(pulled.item.markdown).toContain("```mermaid\nflowchart TD\nA --> B\n```");
      expect(pulled.item.markdown).not.toContain("<board blockId=\"board_1\" token=\"wb_1\" />");
      expect(pulled.item.diagnostics?.latestPull?.whiteboardRecovery?.fallbackCount).toBe(0);
      expect(pulled.item.diagnostics?.latestPull?.whiteboardRecovery?.status).toBe("ok");

      const cached = await runtime.getWorkspaceDocLocalDraft({ workspaceId: "ws_1", docId: nodeToken });
      expect(cached.markdown).toContain("```mermaid\nflowchart TD\nA --> B\n```");
      expect(snapshot.docs[nodeToken]?.markdown).toContain("```mermaid\nflowchart TD\nA --> B\n```");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("openWorkspaceDoc refreshes native board snapshots when cached markdown outlives store metadata", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_board";
    const resolvedDocId = "doc_board";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-open-restores-board-snapshots-"));
    const boardMarkdown = '<board blockId="board_1" token="wb_1" />';
    const boardSnapshots = {
      wb_1: createBoardSnapshot("wb_1"),
    };

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const seedRuntime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async () => ({
            ...createContentView(resolvedDocId, "Board Doc", boardMarkdown),
            boardSnapshots,
          }),
          readDocumentBundle: async () => ({
            content: {
              ...createContentView(resolvedDocId, "Board Doc", boardMarkdown),
              boardSnapshots,
            },
            ir: createDocumentIRWithBoardToken({
              resolvedDocId,
              whiteboardToken: "wb_1",
            }),
            source: createSourceSnapshot(nodeToken, "Board Doc", resolvedDocId),
          }),
        },
        workspaceQuery,
      );

      const seeded = await seedRuntime.pullWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
      });
      expect(seeded.item.boardSnapshots?.wb_1?.token).toBe("wb_1");

      delete snapshot.docs[nodeToken];

      let bundleReads = 0;
      const reopenRuntime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async () => createContentView(resolvedDocId, "Board Doc", boardMarkdown),
          readDocumentBundle: async () => {
            bundleReads += 1;
            return {
              content: {
                ...createContentView(resolvedDocId, "Board Doc", boardMarkdown),
                boardSnapshots,
              },
              ir: createDocumentIRWithBoardToken({
                resolvedDocId,
                whiteboardToken: "wb_1",
              }),
              source: createSourceSnapshot(nodeToken, "Board Doc", resolvedDocId),
            };
          },
        },
        workspaceQuery,
      );

      const reopened = await reopenRuntime.openWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
      });

      expect(bundleReads).toBe(1);
      expect(reopened.markdown).toBe(boardMarkdown);
      expect(reopened.boardSnapshots?.wb_1?.token).toBe("wb_1");
      expect(snapshot.docs[nodeToken]?.boardSnapshots?.wb_1?.token).toBe("wb_1");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("openWorkspaceDoc creates a local draft file for empty remote docs", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_empty";
    const resolvedDocId = "doc_empty";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-open-empty-draft-"));

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const runtime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async () => createContentView(resolvedDocId, "Empty Doc", ""),
          readDocumentBundle: async () => ({
            content: createContentView(resolvedDocId, "Empty Doc", ""),
            ir: createDocumentIRWithText(resolvedDocId, "Empty Doc", ""),
            source: createSourceSnapshot(nodeToken, "Empty Doc", resolvedDocId),
          }),
        },
        workspaceQuery,
      );

      const opened = await runtime.openWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
      });

      const draftPath = join(workspaceRoot, ".maomi", "feishu-docs", "drafts", `${nodeToken}.draft.md`);
      const draftContent = await readFile(draftPath, "utf8");

      expect(opened.markdown).toBe("");
      expect(opened.cache?.draftAbsolutePath).toBe(draftPath);
      expect(draftContent).toBe("");
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("openWorkspaceDoc refreshes likely-stale sequence board snapshots that have life lines but no connector labels", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_board_sequence";
    const resolvedDocId = "doc_board_sequence";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-open-refreshes-stale-sequence-board-"));
    const boardMarkdown = '<board blockId="board_1" token="wb_1" />';
    const staleBoardSnapshots = {
      wb_1: {
        ...createBoardSnapshot("wb_1"),
        nodes: [
          {
            id: "r2:1",
            kind: "unsupported",
            rawType: "life_line",
            supported: false,
            bounds: { x: 0, y: 20, width: 120, height: 60 },
            zIndex: 1,
            style: {},
            text: { content: "用户" },
            unsupportedReason: "unsupported node: life_line",
          },
          {
            id: "c2:1",
            kind: "connector",
            rawType: "connector",
            supported: true,
            bounds: { x: 60, y: 175, width: 356, height: 0 },
            zIndex: 2,
            style: {},
            routing: {
              shape: "straight",
              points: [],
              startAttachment: { position: { x: 60, y: 175 } },
              endAttachment: { position: { x: 416, y: 175 } },
            },
          },
        ],
        supportedNodeCount: 1,
        unsupportedNodeCount: 1,
      },
    };
    const freshBoardSnapshots = {
      wb_1: {
        ...staleBoardSnapshots.wb_1,
        nodes: staleBoardSnapshots.wb_1.nodes.map((node) => (
          node.id === "c2:1"
            ? {
              ...node,
              text: {
                content: "帮我查一下北京今天天气",
              },
            }
            : node
        )),
      },
    };

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const seedRuntime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async () => ({
            ...createContentView(resolvedDocId, "Board Doc", boardMarkdown),
            boardSnapshots: staleBoardSnapshots,
          }),
          readDocumentBundle: async () => ({
            content: {
              ...createContentView(resolvedDocId, "Board Doc", boardMarkdown),
              boardSnapshots: staleBoardSnapshots,
            },
            ir: createDocumentIRWithBoardToken({
              resolvedDocId,
              whiteboardToken: "wb_1",
            }),
            source: createSourceSnapshot(nodeToken, "Board Doc", resolvedDocId),
          }),
        },
        workspaceQuery,
      );

      await seedRuntime.pullWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
      });
      delete snapshot.docs[nodeToken];

      let bundleReads = 0;
      const reopenRuntime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async () => createContentView(resolvedDocId, "Board Doc", boardMarkdown),
          readDocumentBundle: async () => {
            bundleReads += 1;
            return {
              content: {
                ...createContentView(resolvedDocId, "Board Doc", boardMarkdown),
                boardSnapshots: freshBoardSnapshots,
              },
              ir: createDocumentIRWithBoardToken({
                resolvedDocId,
                whiteboardToken: "wb_1",
              }),
              source: createSourceSnapshot(nodeToken, "Board Doc", resolvedDocId),
            };
          },
        },
        workspaceQuery,
      );

      const reopened = await reopenRuntime.openWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
      });

      expect(bundleReads).toBe(1);
      expect(reopened.boardSnapshots?.wb_1?.nodes.find((node) => node.id === "c2:1")).toEqual(
        expect.objectContaining({
          text: expect.objectContaining({
            content: "帮我查一下北京今天天气",
          }),
        }),
      );
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("openWorkspaceDoc attaches reusable Mermaid source onto board snapshots when IR already restored it", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_mermaid_1";
    const resolvedDocId = "doc_mermaid_1";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-open-mermaid-board-"));
    const boardMarkdown = '# Mermaid Board\n\n<board blockId="board_1" token="wb_1" align="1" />';
    const mermaidSource = [
      "sequenceDiagram",
      "participant U as User",
      "participant A as Agent",
      "U->>A: hi",
    ].join("\n");
    const boardSnapshots = {
      wb_1: {
        token: "wb_1",
        blockType: "board" as const,
        pulledAt: "2026-05-31T00:00:00.000Z",
        viewport: { width: 800, height: 600 },
        supportedNodeCount: 1,
        unsupportedNodeCount: 0,
        nodes: [
          {
            id: "c2:1",
            kind: "connector" as const,
            rawType: "connector",
            supported: true,
            bounds: { x: 60, y: 175, width: 356, height: 0 },
            zIndex: 2,
            style: {},
            routing: {
              shape: "straight" as const,
              points: [],
              startAttachment: { position: { x: 60, y: 175 } },
              endAttachment: { position: { x: 416, y: 175 } },
            },
          },
        ],
      },
    };

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const runtime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async () => createContentView(resolvedDocId, "Mermaid Board", boardMarkdown),
          readDocumentBundle: async () => ({
            content: {
              ...createContentView(resolvedDocId, "Mermaid Board", boardMarkdown),
              boardSnapshots,
            },
            ir: createDocumentIRWithReversibleMermaid({
              resolvedDocId,
              whiteboardToken: "wb_1",
              source: mermaidSource,
            }),
            source: createSourceSnapshot(nodeToken, "Mermaid Board", resolvedDocId),
          }),
        },
        workspaceQuery,
      );

      const reopened = await runtime.openWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
      });

      expect(reopened.boardSnapshots?.wb_1?.mermaidSource).toBe(mermaidSource);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("pushWorkspaceDoc keeps pulled native board source docs as noop when content is unchanged", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_1";
    const resolvedDocId = "doc_1";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-push-native-noop-"));
    let remoteWrites = 0;

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const runtime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async () => createContentView(
            resolvedDocId,
            "Remote Doc",
            '# Remote Doc\n\n<board blockId="board_1" token="wb_1" />\n\n<table blockId="table_1"></table>',
          ),
          readDocumentBundle: async () => ({
            content: createContentView(
              resolvedDocId,
              "Remote Doc",
              '# Remote Doc\n\n<board blockId="board_1" token="wb_1" />\n\n<table blockId="table_1"></table>',
            ),
            ir: createDocumentIRWithText(resolvedDocId, "Remote Doc", "# Remote Doc"),
            source: createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
          }),
        },
        workspaceQuery,
        async () => {
          remoteWrites += 1;
          throw new Error("remote write should not happen for unchanged native source docs");
        },
      );

      await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

      const pushed = await runtime.pushWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
        title: "Remote Doc",
        markdown: '# Remote Doc\n\n<board blockId="board_1" token="wb_1" />\n\n<table blockId="table_1"></table>',
        force: true,
      });

      expect(remoteWrites).toBe(0);
      expect(pushed.pushStatus).toBe("noop");
      expect(pushed.item.markdown).toBe('# Remote Doc\n\n<board blockId="board_1" token="wb_1" />\n\n<table blockId="table_1"></table>');
      expect(pushed.item.cache?.hasLocalChanges).toBe(false);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("pushWorkspaceDoc normalizes native board placeholders before docs v2 overwrite", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_1";
    const resolvedDocId = "doc_1";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-push-native-source-"));
    const docsAiBodies: Array<Record<string, unknown>> = [];
    let bundleReads = 0;

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const runtime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async () => createContentView(
            resolvedDocId,
            "Remote Doc",
            '# Remote Doc\n\n<board blockId="board_1" token="wb_1" />\n\n<table blockId="table_1"></table>',
          ),
          readDocumentBundle: async () => {
            bundleReads += 1;
            if (bundleReads > 1) {
              throw new Error("push should not re-read remote content after docs v2 overwrite");
            }

            return {
              content: {
                ...createContentView(
                  resolvedDocId,
                  "Remote Doc",
                  '# Remote Doc\n\n<board blockId="board_1" token="wb_1" />\n\n<table blockId="table_1"></table>',
                ),
                boardSnapshots: {
                  wb_1: createBoardSnapshot("wb_1"),
                },
              },
              ir: createDocumentIRWithBoardToken({
                resolvedDocId,
                whiteboardToken: "wb_1",
              }),
              source: createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
            };
          },
        },
        workspaceQuery,
        async (url, init) => {
          const target = new URL(String(url));
          if (target.pathname === `/open-apis/docs_ai/v1/documents/${nodeToken}`) {
            expect(init?.method).toBe("PUT");
            docsAiBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
            return new Response(JSON.stringify({
              code: 0,
              data: {
                document: {
                  revision_id: 2,
                  new_blocks: [{
                    block_id: "blk_board_1",
                    block_type: "board",
                    block_token: "wb_1",
                  }],
                },
                result: "success",
                warnings: [],
              },
            }), { status: 200, headers: { "content-type": "application/json" } });
          }

          throw new Error(`unexpected fetch url: ${String(url)}`);
        },
      );

      await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

      const pushed = await runtime.pushWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
        title: "Remote Doc",
        markdown: '# Remote Doc\n1\n\n<board blockId="board_1" token="wb_1" />\n\n<table blockId="table_1"></table>',
        force: true,
      });

      expect(pushed.pushStatus).toBe("succeeded");
      expect(bundleReads).toBe(1);
      expect(docsAiBodies).toEqual([{
        command: "overwrite",
        content: '# Remote Doc\n1\n\n<whiteboard token="wb_1" />\n\n<table blockId="table_1"></table>',
        format: "markdown",
        revision_id: -1,
      }]);
      expect(pushed.item.markdown).toBe('# Remote Doc\n1\n\n<board blockId="board_1" token="wb_1" />\n\n<table blockId="table_1"></table>');
      expect(pushed.item.cache?.hasLocalChanges).toBe(false);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test("pushWorkspaceDoc blocks unsupported draft mutations instead of publishing a new document", async () => {
    const snapshot = createSnapshot();
    const nodeToken = "node_1";
    const resolvedDocId = "doc_1";
    const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-push-new-"));

    try {
      const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
      const baseIR = createDocumentIRWithText(resolvedDocId, "Remote Doc", "# Remote Doc");
      baseIR.blocks.undefined_1 = {
        id: "undefined_1",
        type: "undefined",
        parentId: resolvedDocId,
        children: [],
        editable: false,
        text: [],
        resource: null,
        attrs: {},
        raw: {},
      };
      baseIR.blocks[resolvedDocId]!.children.push("undefined_1");

      const runtime = createRuntimeWithContentSource(
        snapshot,
        {
          readDocumentContent: async (_accessToken, docId) => createContentView(docId, "Remote Doc", "# Rewritten from scratch"),
          readDocumentBundle: async (_accessToken, docId) => ({
            content: createContentView(docId, "Remote Doc", "# Rewritten from scratch"),
            ir: baseIR,
            source: createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
          }),
        },
        workspaceQuery,
      );

      await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

      const pushed = await runtime.pushWorkspaceDoc({
        workspaceId: "ws_1",
        docId: nodeToken,
        markdown: "<!--feishu:block:resolved-missing-->\n# Rewritten from scratch\n<!--/feishu:block:resolved-missing-->\n",
        force: true,
      });

      expect(pushed.pushStatus).toBe("blocked");
      expect(pushed.message).toContain("unsupported or unknown block removed from draft");
      expect(pushed.item.cache?.publishModeRecommendation).toBe("update_existing");
      expect(pushed.item.cache?.hasBlockedChanges).toBe(true);
    } finally {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
