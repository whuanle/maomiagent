import type {
  FeishuBotConfigInput,
  FeishuBotStateView,
  FeishuDeveloperAuthorizeResult,
  FeishuDeveloperConfigInput,
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
  FeishuOAuthCallbackInput,
  FeishuOAuthCallbackResult,
  FeishuSmartAssistantActionExecuteResultView,
  FeishuSmartAssistantExecuteActionInput,
  FeishuStateView,
  FeishuWorkspaceDocInput,
} from "../../../../../shared/desktop-feishu";
import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";

export interface DesktopFeishuQueryPort {
  getState(): Promise<FeishuStateView>;
  getBotState(): Promise<FeishuBotStateView>;
  getDocsCapabilities(): Promise<FeishuDocsCapabilitiesView>;
  loadDocTreeRoot(input: FeishuDocTreeLoadInput): Promise<FeishuDocTreeLoadResult>;
  loadDocTreeBranch(input: FeishuDocTreeBranchInput): Promise<FeishuDocTreeBranchResult>;
  getDocTree(input: FeishuDocTreeQuery): Promise<FeishuDocTreeView>;
  getDocContent(docId: string): Promise<FeishuDocContentView>;
  getDocMediaPreviewUrls(input: { fileTokens: string[] }): Promise<FeishuDocMediaPreviewResult>;
  getDocWhiteboardPreviewUrls(input: {
    whiteboardTokens: string[];
  }): Promise<FeishuDocWhiteboardPreviewResult>;
  getWorkspaceDocLocalDraft(input: FeishuWorkspaceDocInput): Promise<FeishuDocContentView>;
  openDocIR(input: FeishuWorkspaceDocInput): Promise<{ source: "cache" | "remote"; ir: FeishuDocIR }>;
}

export interface DesktopFeishuCommandPort {
  saveDeveloperConfig(input: FeishuDeveloperConfigInput): Promise<FeishuStateView>;
  beginDeveloperAuthorization(
    input: FeishuDeveloperConfigInput,
  ): Promise<FeishuDeveloperAuthorizeResult>;
  handleOAuthCallback(input: FeishuOAuthCallbackInput): Promise<FeishuOAuthCallbackResult>;
  refreshDeveloperToken(): Promise<FeishuStateView>;
  clearSmartAssistantConfig(): Promise<FeishuStateView>;
  clearConfig(): Promise<FeishuStateView>;

  saveBotConfig(input: FeishuBotConfigInput): Promise<FeishuBotStateView>;
  clearBotConfig(): Promise<FeishuBotStateView>;

  openWorkspaceDoc(input: FeishuWorkspaceDocInput): Promise<FeishuDocContentView>;
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
    title?: string;
    markdown?: string;
    force?: boolean;
  }): Promise<FeishuDocWorkspacePushResult>;
  pullDocIR(input: FeishuWorkspaceDocInput & { overwrite: boolean }): Promise<{ ir: FeishuDocIR; backupPath?: string }>;
  pushDocIR(input: FeishuWorkspaceDocInput): Promise<{ status: "succeeded" | "blocked" | "failed"; message?: string }>;

  executeSmartAssistantAction(
    input: FeishuSmartAssistantExecuteActionInput,
  ): Promise<FeishuSmartAssistantActionExecuteResultView>;
}

export type DesktopFeishuPort = DesktopFeishuQueryPort & DesktopFeishuCommandPort;
