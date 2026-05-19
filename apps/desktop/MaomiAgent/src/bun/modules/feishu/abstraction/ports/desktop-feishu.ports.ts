import type {
  FeishuBotConfigInput,
  FeishuBotStateView,
  FeishuDeveloperAuthorizeResult,
  FeishuDeveloperConfigInput,
  FeishuDocContentView,
  FeishuDocMediaPreviewResult,
  FeishuDocTreeQuery,
  FeishuDocTreeView,
  FeishuDocWhiteboardPreviewResult,
  FeishuDocWorkspacePullResult,
  FeishuDocWorkspacePushResult,
  FeishuDocsCapabilitiesView,
  FeishuPersonalConfigInput,
  FeishuSmartAssistantActionExecuteResultView,
  FeishuSmartAssistantExecuteActionInput,
  FeishuStateView,
  FeishuWorkspaceDocInput,
} from "../../../../../shared/desktop-feishu";

export interface DesktopFeishuQueryPort {
  getState(): Promise<FeishuStateView>;
  getBotState(): Promise<FeishuBotStateView>;
  getDocsCapabilities(): Promise<FeishuDocsCapabilitiesView>;
  getDocTree(input: FeishuDocTreeQuery): Promise<FeishuDocTreeView>;
  getDocContent(docId: string): Promise<FeishuDocContentView>;
  getDocMediaPreviewUrls(input: { fileTokens: string[] }): Promise<FeishuDocMediaPreviewResult>;
  getDocWhiteboardPreviewUrls(input: {
    whiteboardTokens: string[];
  }): Promise<FeishuDocWhiteboardPreviewResult>;
  getWorkspaceDocLocalDraft(input: FeishuWorkspaceDocInput): Promise<FeishuDocContentView>;
}

export interface DesktopFeishuCommandPort {
  savePersonalConfig(input: FeishuPersonalConfigInput): Promise<FeishuStateView>;
  clearPersonalConfig(): Promise<FeishuStateView>;
  saveDeveloperConfig(input: FeishuDeveloperConfigInput): Promise<FeishuStateView>;
  beginDeveloperAuthorization(
    input: FeishuDeveloperConfigInput,
  ): Promise<FeishuDeveloperAuthorizeResult>;
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
    title: string;
    markdown?: string;
    force?: boolean;
  }): Promise<FeishuDocWorkspacePushResult>;

  executeSmartAssistantAction(
    input: FeishuSmartAssistantExecuteActionInput,
  ): Promise<FeishuSmartAssistantActionExecuteResultView>;
}

export type DesktopFeishuPort = DesktopFeishuQueryPort & DesktopFeishuCommandPort;
