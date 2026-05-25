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
import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import type { DesktopFeishuDocRuntimePort } from "../../abstraction/ports/desktop-feishu-doc-runtime.ports";
import type { DesktopFeishuStorePort } from "../../abstraction/ports/desktop-feishu-store.ports";

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
};

type DesktopFeishuDocRuntimeDeps =
  | DesktopFeishuStorePort
  | DesktopFeishuDocTreeLoaderPort
  | {
      store: DesktopFeishuStorePort;
      loader: DesktopFeishuDocTreeLoaderPort;
      contentSource?: DesktopFeishuDocContentSourcePort;
      accessToken?: () => Promise<string>;
      docWorkspaceRuntime?: DesktopFeishuDocWorkspaceRuntimePort;
    };

function isStorePort(value: DesktopFeishuDocRuntimeDeps): value is DesktopFeishuStorePort {
  return "read" in value && "write" in value;
}

function isRuntimeBundle(
  value: DesktopFeishuDocRuntimeDeps,
): value is {
  store: DesktopFeishuStorePort;
  loader: DesktopFeishuDocTreeLoaderPort;
  contentSource?: DesktopFeishuDocContentSourcePort;
  accessToken?: () => Promise<string>;
  docWorkspaceRuntime?: DesktopFeishuDocWorkspaceRuntimePort;
} {
  return "store" in value && "loader" in value;
}

export class DesktopFeishuDocRuntime implements DesktopFeishuDocRuntimePort {
  private readonly store: DesktopFeishuStorePort | null;
  private readonly loader: DesktopFeishuDocTreeLoaderPort;
  private readonly contentSource: DesktopFeishuDocContentSourcePort | null;
  private readonly accessToken: (() => Promise<string>) | null;
  private readonly docWorkspaceRuntime: DesktopFeishuDocWorkspaceRuntimePort | null;

  constructor(deps: DesktopFeishuDocRuntimeDeps) {
    if (isRuntimeBundle(deps)) {
      this.store = deps.store;
      this.loader = deps.loader;
      this.contentSource = deps.contentSource ?? null;
      this.accessToken = deps.accessToken ?? null;
      this.docWorkspaceRuntime = deps.docWorkspaceRuntime ?? null;
      return;
    }

    if (isStorePort(deps)) {
      this.store = deps;
      this.loader = this.createStoreBackedLoader(deps);
      this.contentSource = null;
      this.accessToken = null;
      this.docWorkspaceRuntime = null;
      return;
    }

    this.store = null;
    this.loader = deps;
    this.contentSource = null;
    this.accessToken = null;
    this.docWorkspaceRuntime = null;
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

    const snapshot = await this.store.read();
    await this.store.write({
      ...snapshot,
      docTreeCache: {
        ...snapshot.docTreeCache,
        lastRootToken: normalizedToken,
        lastRootUpdatedAt: new Date().toISOString(),
      },
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
    const snapshot = this.store ? await this.store.read() : null;
    const existing = snapshot?.docs[docId] as FeishuDocContentView | undefined;

    if (this.contentSource && this.accessToken) {
      try {
        const item = await this.contentSource.readDocumentContent(await this.accessToken(), docId);
        if (snapshot && this.store) {
          const nextSnapshot = {
            ...snapshot,
            docs: {
              ...snapshot.docs,
              [docId]: item,
            },
          };
          await this.store.write(nextSnapshot);
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
