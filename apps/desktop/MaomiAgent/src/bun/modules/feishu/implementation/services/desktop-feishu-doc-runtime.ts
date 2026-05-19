import type {
  FeishuDocContentView,
  FeishuDocMediaPreviewResult,
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

export class DesktopFeishuDocRuntime implements DesktopFeishuDocRuntimePort {
  constructor(private readonly store: DesktopFeishuStorePort) {}

  async getDocsCapabilities(): Promise<FeishuDocsCapabilitiesView> {
    return {
      localDraft: true,
      mediaPreview: true,
      whiteboardPreview: true,
      smartAssistantExecution: true,
    } as unknown as FeishuDocsCapabilitiesView;
  }

  async getDocTree(input: FeishuDocTreeQuery): Promise<FeishuDocTreeView> {
    const payload = input as any;
    const store = await this.store.read();
    const items = Object.values(store.docs).map((doc: any) => ({
      docId: doc.docId,
      title: doc.title,
      type: "doc",
      hasChildren: false,
      updatedAt: doc.updatedAt,
    }));
    return {
      request: payload,
      items,
      total: items.length,
      hasMore: false,
    } as unknown as FeishuDocTreeView;
  }

  async getDocContent(docId: string): Promise<FeishuDocContentView> {
    const store = await this.store.read();
    const existing = store.docs[docId];
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
    store.docs[docId] = item as unknown as FeishuDocContentView;
    await this.store.write(store);
    return item as unknown as FeishuDocContentView;
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
    const store = await this.store.read();
    const item = {
      ...(current as any),
      docId: input.docId,
      title: input.title,
      markdown: input.markdown ?? (current as any).markdown ?? "",
      updatedAt: new Date().toISOString(),
    };
    store.docs[input.docId] = item as FeishuDocContentView;
    await this.store.write(store);
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
