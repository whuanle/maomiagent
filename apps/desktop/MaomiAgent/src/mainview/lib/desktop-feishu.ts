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
  FeishuSmartAssistantActionExecuteResultView,
  FeishuSmartAssistantExecuteActionInput,
  FeishuStateView,
} from "../../shared/desktop-feishu";
import { DESKTOP_WINDOW_BRIDGE_READY_EVENT } from "./desktop-window";

type DesktopFeishuBridge = {
  getDesktopFeishuState: () => Promise<FeishuStateView>;
  saveDesktopFeishuDeveloperConfig: (input: FeishuDeveloperConfigInput) => Promise<FeishuStateView>;
  beginDesktopFeishuDeveloperAuthorization: (
    input: FeishuDeveloperConfigInput,
  ) => Promise<FeishuDeveloperAuthorizeResult>;
  refreshDesktopFeishuDeveloperToken: () => Promise<FeishuStateView>;
  clearDesktopFeishuSmartAssistantConfig: () => Promise<FeishuStateView>;
  clearDesktopFeishuConfig: () => Promise<FeishuStateView>;

  getDesktopFeishuBotState: () => Promise<FeishuBotStateView>;
  saveDesktopFeishuBotConfig: (input: FeishuBotConfigInput) => Promise<FeishuBotStateView>;
  clearDesktopFeishuBotConfig: () => Promise<FeishuBotStateView>;

  getDesktopFeishuDocsCapabilities: () => Promise<FeishuDocsCapabilitiesView>;
  getDesktopFeishuDocTree: (input: FeishuDocTreeQuery) => Promise<FeishuDocTreeView>;
  getDesktopFeishuDocContent: (docId: string) => Promise<FeishuDocContentView>;
  getDesktopFeishuDocMediaPreviewUrls: (input: {
    fileTokens: string[];
  }) => Promise<FeishuDocMediaPreviewResult>;
  getDesktopFeishuDocWhiteboardPreviewUrls: (
    input: { whiteboardTokens: string[] },
  ) => Promise<FeishuDocWhiteboardPreviewResult>;
  openDesktopFeishuWorkspaceDoc: (workspaceId: string, docId: string) => Promise<FeishuDocContentView>;
  getDesktopFeishuWorkspaceDocLocalDraft: (
    workspaceId: string,
    docId: string,
  ) => Promise<FeishuDocContentView>;
  saveDesktopFeishuWorkspaceDocLocalDraft: (input: {
    workspaceId: string;
    docId: string;
    title: string;
    markdown?: string;
    force?: boolean;
  }) => Promise<FeishuDocContentView>;
  pullDesktopFeishuWorkspaceDoc: (
    workspaceId: string,
    docId: string,
  ) => Promise<FeishuDocWorkspacePullResult>;
  pushDesktopFeishuWorkspaceDoc: (input: {
    workspaceId: string;
    docId: string;
    title: string;
    markdown?: string;
    force?: boolean;
  }) => Promise<FeishuDocWorkspacePushResult>;

  executeDesktopFeishuSmartAssistantAction: (
    input: FeishuSmartAssistantExecuteActionInput,
  ) => Promise<FeishuSmartAssistantActionExecuteResultView>;
};

declare global {
  interface Window {
    maomiDesktopFeishu?: DesktopFeishuBridge;
  }
}

export const DESKTOP_FEISHU_BRIDGE_READY_EVENT = DESKTOP_WINDOW_BRIDGE_READY_EVENT;

function getDesktopFeishuBridge(): DesktopFeishuBridge {
  const bridge = window.maomiDesktopFeishu;
  if (!bridge) {
    throw new Error("Desktop feishu bridge is unavailable.");
  }

  return bridge;
}

export function hasDesktopFeishuBridge(): boolean {
  return Boolean(window.maomiDesktopFeishu);
}

export function fetchDesktopFeishuState(): Promise<FeishuStateView> {
  return getDesktopFeishuBridge().getDesktopFeishuState();
}

export function saveDesktopFeishuDeveloperConfig(input: FeishuDeveloperConfigInput): Promise<FeishuStateView> {
  return getDesktopFeishuBridge().saveDesktopFeishuDeveloperConfig(input);
}

export function beginDesktopFeishuDeveloperAuthorization(
  input: FeishuDeveloperConfigInput,
): Promise<FeishuDeveloperAuthorizeResult> {
  return getDesktopFeishuBridge().beginDesktopFeishuDeveloperAuthorization(input);
}

export function refreshDesktopFeishuDeveloperToken(): Promise<FeishuStateView> {
  return getDesktopFeishuBridge().refreshDesktopFeishuDeveloperToken();
}

export function clearDesktopFeishuSmartAssistantConfig(): Promise<FeishuStateView> {
  return getDesktopFeishuBridge().clearDesktopFeishuSmartAssistantConfig();
}

export function clearDesktopFeishuConfig(): Promise<FeishuStateView> {
  return getDesktopFeishuBridge().clearDesktopFeishuConfig();
}

export function fetchDesktopFeishuBotState(): Promise<FeishuBotStateView> {
  return getDesktopFeishuBridge().getDesktopFeishuBotState();
}

export function saveDesktopFeishuBotConfig(input: FeishuBotConfigInput): Promise<FeishuBotStateView> {
  return getDesktopFeishuBridge().saveDesktopFeishuBotConfig(input);
}

export function clearDesktopFeishuBotConfig(): Promise<FeishuBotStateView> {
  return getDesktopFeishuBridge().clearDesktopFeishuBotConfig();
}

export function fetchDesktopFeishuDocsCapabilities(): Promise<FeishuDocsCapabilitiesView> {
  return getDesktopFeishuBridge().getDesktopFeishuDocsCapabilities();
}

export function fetchDesktopFeishuDocTree(input: FeishuDocTreeQuery): Promise<FeishuDocTreeView> {
  return getDesktopFeishuBridge().getDesktopFeishuDocTree(input);
}

export function fetchDesktopFeishuDocContent(docId: string): Promise<FeishuDocContentView> {
  return getDesktopFeishuBridge().getDesktopFeishuDocContent(docId);
}

export function fetchDesktopFeishuDocMediaPreviewUrls(
  input: { fileTokens: string[] },
): Promise<FeishuDocMediaPreviewResult> {
  return getDesktopFeishuBridge().getDesktopFeishuDocMediaPreviewUrls(input);
}

export function fetchDesktopFeishuDocWhiteboardPreviewUrls(
  input: { whiteboardTokens: string[] },
): Promise<FeishuDocWhiteboardPreviewResult> {
  return getDesktopFeishuBridge().getDesktopFeishuDocWhiteboardPreviewUrls(input);
}

export function openDesktopFeishuWorkspaceDoc(
  workspaceId: string,
  docId: string,
): Promise<FeishuDocContentView> {
  return getDesktopFeishuBridge().openDesktopFeishuWorkspaceDoc(workspaceId, docId);
}

export function fetchDesktopFeishuWorkspaceDocLocalDraft(
  workspaceId: string,
  docId: string,
): Promise<FeishuDocContentView> {
  return getDesktopFeishuBridge().getDesktopFeishuWorkspaceDocLocalDraft(workspaceId, docId);
}

export function saveDesktopFeishuWorkspaceDocLocalDraft(input: {
  workspaceId: string;
  docId: string;
  title: string;
  markdown?: string;
  force?: boolean;
}): Promise<FeishuDocContentView> {
  return getDesktopFeishuBridge().saveDesktopFeishuWorkspaceDocLocalDraft(input);
}

export function pullDesktopFeishuWorkspaceDoc(
  workspaceId: string,
  docId: string,
): Promise<FeishuDocWorkspacePullResult> {
  return getDesktopFeishuBridge().pullDesktopFeishuWorkspaceDoc(workspaceId, docId);
}

export function pushDesktopFeishuWorkspaceDoc(input: {
  workspaceId: string;
  docId: string;
  title: string;
  markdown?: string;
  force?: boolean;
}): Promise<FeishuDocWorkspacePushResult> {
  return getDesktopFeishuBridge().pushDesktopFeishuWorkspaceDoc(input);
}

export function executeDesktopFeishuSmartAssistantAction(
  input: FeishuSmartAssistantExecuteActionInput,
): Promise<FeishuSmartAssistantActionExecuteResultView> {
  return getDesktopFeishuBridge().executeDesktopFeishuSmartAssistantAction(input);
}
