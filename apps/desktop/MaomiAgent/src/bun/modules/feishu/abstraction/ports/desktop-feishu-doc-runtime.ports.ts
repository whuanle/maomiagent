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

export interface DesktopFeishuDocRuntimePort {
  getDocsCapabilities(): Promise<FeishuDocsCapabilitiesView>;
  loadDocTreeRoot(input: FeishuDocTreeLoadInput): Promise<FeishuDocTreeLoadResult>;
  loadDocTreeBranch(input: FeishuDocTreeBranchInput): Promise<FeishuDocTreeBranchResult>;
  getDocTree(input: FeishuDocTreeQuery): Promise<FeishuDocTreeView>;
  getDocContent(docId: string): Promise<FeishuDocContentView>;
  getDocMediaPreviewUrls(input: { fileTokens: string[] }): Promise<FeishuDocMediaPreviewResult>;
  getDocWhiteboardPreviewUrls(input: {
    whiteboardTokens: string[];
  }): Promise<FeishuDocWhiteboardPreviewResult>;
  openWorkspaceDoc(input: FeishuWorkspaceDocInput): Promise<FeishuDocContentView>;
  getWorkspaceDocLocalDraft(input: FeishuWorkspaceDocInput): Promise<FeishuDocContentView>;
  saveWorkspaceDocLocalDraft(input: {
    workspaceId: string;
    docId: string;
    title: string;
    markdown?: string;
    force?: boolean;
  }): Promise<FeishuDocContentView>;
  pullWorkspaceDoc(input: FeishuWorkspaceDocInput): Promise<FeishuDocWorkspacePullResult>;
  pushWorkspaceDoc(input: {
    workspaceId: string;
    docId: string;
    title: string;
    markdown?: string;
    force?: boolean;
  }): Promise<FeishuDocWorkspacePushResult>;
}
