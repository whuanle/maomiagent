import type {
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
import type { DesktopFeishuDocRuntimePort } from "../../abstraction/ports/desktop-feishu-doc-runtime.ports";
import type { DesktopFeishuStorePort } from "../../abstraction/ports/desktop-feishu-store.ports";

type DesktopFeishuDocTreeLoaderPort = {
  loadRoot(input: FeishuDocTreeLoadInput): Promise<FeishuDocTreeLoadResult>;
  loadBranch(input: FeishuDocTreeBranchInput): Promise<FeishuDocTreeBranchResult>;
};

type DesktopFeishuDocRuntimeDeps =
  | DesktopFeishuStorePort
  | DesktopFeishuDocTreeLoaderPort
  | {
      store: DesktopFeishuStorePort;
      loader: DesktopFeishuDocTreeLoaderPort;
    };

function isStorePort(value: DesktopFeishuDocRuntimeDeps): value is DesktopFeishuStorePort {
  return "read" in value && "write" in value;
}

function isRuntimeBundle(
  value: DesktopFeishuDocRuntimeDeps,
): value is { store: DesktopFeishuStorePort; loader: DesktopFeishuDocTreeLoaderPort } {
  return "store" in value && "loader" in value;
}

export class DesktopFeishuDocRuntime implements DesktopFeishuDocRuntimePort {
  private readonly store: DesktopFeishuStorePort | null;
  private readonly loader: DesktopFeishuDocTreeLoaderPort;

  constructor(deps: DesktopFeishuDocRuntimeDeps) {
    if (isRuntimeBundle(deps)) {
      this.store = deps.store;
      this.loader = deps.loader;
      return;
    }

    if (isStorePort(deps)) {
      this.store = deps;
      this.loader = this.createStoreBackedLoader(deps);
      return;
    }

    this.store = null;
    this.loader = deps;
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
    return this.loader.loadRoot(input);
  }

  async loadDocTreeBranch(input: FeishuDocTreeBranchInput): Promise<FeishuDocTreeBranchResult> {
    return this.loader.loadBranch(input);
  }

  async getDocTree(input: FeishuDocTreeQuery): Promise<FeishuDocTreeView> {
    const token = input.docId ?? input.root;
    const result = await this.loadDocTreeRoot({
      token,
      forceRefresh: input.forceRefresh,
    });

    return {
      root: input.root,
      ...(input.docId ? { parentDocId: input.docId } : {}),
      nodes: result.nodes,
      hasMore: false,
    };
  }

  async getDocContent(docId: string): Promise<FeishuDocContentView> {
    const store = this.requireStore();
    const snapshot = await store.read();
    const existing = snapshot.docs[docId];
    if (existing) {
      return existing as FeishuDocContentView;
    }

    const now = new Date().toISOString();
    const item = {
      docId,
      title: `文档 ${docId}`,
      markdown: `# ${docId}\n\nDesktop Feishu module placeholder content.`,
      length: 0,
      totalLength: 0,
      offset: 0,
      updatedAt: now,
      blocks: [],
      analysis: {
        riskyBlocks: [],
        riskySync: false,
        syncMode: null,
        riskyBlockMode: "safe" as const,
      },
    };
    snapshot.docs[docId] = item as unknown as FeishuDocContentView;
    await store.write(snapshot);
    return item as unknown as FeishuDocContentView;
  }

  private requireStore(): DesktopFeishuStorePort {
    if (!this.store) {
      throw new Error("Desktop Feishu doc store is not configured");
    }
    return this.store;
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
        tmpDownloadUrl: `desktop://feishu/media/${encodeURIComponent(fileToken)}`,
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
        tmpDownloadUrl: `desktop://feishu/whiteboard/${encodeURIComponent(whiteboardToken)}`,
      })),
      errors: [],
    } as unknown as FeishuDocWhiteboardPreviewResult;
  }

  async openWorkspaceDoc(input: FeishuWorkspaceDocInput): Promise<FeishuDocContentView> {
    return this.getDocContent(input.docId);
  }

  async getWorkspaceDocLocalDraft(input: FeishuWorkspaceDocInput): Promise<FeishuDocContentView> {
    return this.getDocContent(input.docId);
  }

  async saveWorkspaceDocLocalDraft(input: {
    workspaceId: string;
    docId: string;
    title: string;
    markdown?: string;
    force?: boolean;
  }): Promise<FeishuDocContentView> {
    const current = await this.getDocContent(input.docId);
    const store = this.requireStore();
    const snapshot = await store.read();
    const item = {
      ...(current as any),
      docId: input.docId,
      title: input.title,
      markdown: input.markdown ?? (current as any).markdown ?? "",
      updatedAt: new Date().toISOString(),
    };
    snapshot.docs[input.docId] = item as FeishuDocContentView;
    await store.write(snapshot);
    return item as FeishuDocContentView;
  }

  async pullWorkspaceDoc(input: FeishuWorkspaceDocInput): Promise<FeishuDocWorkspacePullResult> {
    return {
      item: await this.getDocContent(input.docId),
      pulled: true,
    } as unknown as FeishuDocWorkspacePullResult;
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
      pushed: true,
    } as unknown as FeishuDocWorkspacePushResult;
  }
}
