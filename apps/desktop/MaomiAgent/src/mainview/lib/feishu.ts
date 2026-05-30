import type {
  FeishuBotConfigInput,
  FeishuBotStateView,
  FeishuDeveloperAuthorizeResult,
  FeishuDeveloperConfigInput,
  FeishuDocContentView,
  FeishuDocTreeBranchInput,
  FeishuDocTreeBranchResult,
  FeishuDocTreeLoadInput,
  FeishuDocTreeLoadResult,
  FeishuDocMediaPreviewResult,
  FeishuDocPermissionInspectView,
  FeishuDocTreeQuery,
  FeishuDocTreeView,
  FeishuDocWhiteboardPreviewResult,
  FeishuDocsCapabilitiesView,
  FeishuPersonalConfigInput,
  FeishuSmartAssistantActionExecuteResultView,
  FeishuSmartAssistantExecuteActionInput,
  FeishuStateView,
} from "../../shared/desktop-feishu";
import {
  beginDesktopFeishuDeveloperAuthorization,
  clearDesktopFeishuBotConfig,
  clearDesktopFeishuConfig,
  clearDesktopFeishuPersonalConfig,
  clearDesktopFeishuSmartAssistantConfig,
  executeDesktopFeishuSmartAssistantAction,
  fetchDesktopFeishuBotState,
  fetchDesktopFeishuDocContent,
  fetchDesktopFeishuDocMediaPreviewUrls,
  fetchDesktopFeishuDocsCapabilities,
  fetchDesktopFeishuDocTree,
  fetchDesktopFeishuDocWhiteboardPreviewUrls,
  inspectDesktopFeishuWorkspaceDocPermissions,
  fetchDesktopFeishuState,
  fetchDesktopFeishuWorkspaceDocLocalDraft,
  loadDesktopFeishuDocTreeBranch,
  loadDesktopFeishuDocTreeRoot,
  openDesktopFeishuDocIR,
  openDesktopFeishuWorkspaceDoc,
  pullDesktopFeishuDocIR,
  pullDesktopFeishuWorkspaceDoc,
  pushDesktopFeishuDocIR,
  pushDesktopFeishuWorkspaceDoc,
  refreshDesktopFeishuDeveloperToken,
  saveDesktopFeishuBotConfig,
  saveDesktopFeishuDeveloperConfig,
  saveDesktopFeishuPersonalConfig,
  saveDesktopFeishuWorkspaceDocLocalDraft,
} from "./desktop-feishu";
import type { FeishuDocIR } from "../../shared/desktop-feishu-doc-ir";

const DESKTOP_FEISHU_MUTATION_EVENT = "maomi:desktop-feishu-mutation";

function notifyMutation(): void {
  window.dispatchEvent(new CustomEvent(DESKTOP_FEISHU_MUTATION_EVENT));
}

export async function fetchFeishuState(_baseUrl: string): Promise<FeishuStateView> {
  return fetchDesktopFeishuState();
}

export async function saveFeishuPersonalConfig(
  _baseUrl: string,
  input: FeishuPersonalConfigInput,
): Promise<FeishuStateView> {
  const result = await saveDesktopFeishuPersonalConfig(input);
  notifyMutation();
  return result;
}

export async function clearFeishuPersonalConfig(_baseUrl: string): Promise<FeishuStateView> {
  const result = await clearDesktopFeishuPersonalConfig();
  notifyMutation();
  return result;
}

export async function saveFeishuDeveloperConfig(
  _baseUrl: string,
  input: FeishuDeveloperConfigInput,
): Promise<FeishuStateView> {
  const result = await saveDesktopFeishuDeveloperConfig(input);
  notifyMutation();
  return result;
}

export async function clearFeishuSmartAssistantConfig(_baseUrl: string): Promise<FeishuStateView> {
  const result = await clearDesktopFeishuSmartAssistantConfig();
  notifyMutation();
  return result;
}

export async function beginFeishuDeveloperAuthorization(
  _baseUrl: string,
  input: FeishuDeveloperConfigInput,
): Promise<FeishuDeveloperAuthorizeResult> {
  const result = await beginDesktopFeishuDeveloperAuthorization(input);
  notifyMutation();
  return result;
}

export async function refreshFeishuDeveloperToken(_baseUrl: string): Promise<FeishuStateView> {
  const result = await refreshDesktopFeishuDeveloperToken();
  notifyMutation();
  return result;
}

export async function clearFeishuConfig(_baseUrl: string): Promise<FeishuStateView> {
  const result = await clearDesktopFeishuConfig();
  notifyMutation();
  return result;
}

export async function fetchFeishuBotState(_baseUrl: string): Promise<FeishuBotStateView> {
  return fetchDesktopFeishuBotState();
}

export async function saveFeishuBotConfig(
  _baseUrl: string,
  input: FeishuBotConfigInput,
): Promise<FeishuBotStateView> {
  const result = await saveDesktopFeishuBotConfig(input);
  notifyMutation();
  return result;
}

export async function clearFeishuBotConfig(_baseUrl: string): Promise<FeishuBotStateView> {
  const result = await clearDesktopFeishuBotConfig();
  notifyMutation();
  return result;
}

export async function fetchFeishuDocsCapabilities(_baseUrl: string): Promise<FeishuDocsCapabilitiesView> {
  return fetchDesktopFeishuDocsCapabilities();
}

export async function fetchFeishuDocTree(
  _baseUrl: string,
  input: FeishuDocTreeQuery,
): Promise<FeishuDocTreeView> {
  return fetchDesktopFeishuDocTree(input);
}

export async function loadFeishuDocTreeRoot(
  _baseUrl: string,
  input: FeishuDocTreeLoadInput,
): Promise<FeishuDocTreeLoadResult> {
  return loadDesktopFeishuDocTreeRoot(input);
}

export async function loadFeishuDocTreeBranch(
  _baseUrl: string,
  input: FeishuDocTreeBranchInput,
): Promise<FeishuDocTreeBranchResult> {
  return loadDesktopFeishuDocTreeBranch(input);
}

export async function fetchFeishuDocContent(
  _baseUrl: string,
  docId: string,
): Promise<FeishuDocContentView> {
  return fetchDesktopFeishuDocContent(docId);
}

export async function fetchFeishuDocMediaPreviewUrls(
  _baseUrl: string,
  input: { fileTokens: string[] },
): Promise<FeishuDocMediaPreviewResult> {
  return fetchDesktopFeishuDocMediaPreviewUrls(input);
}

export async function fetchFeishuDocWhiteboardPreviewUrls(
  _baseUrl: string,
  input: { whiteboardTokens: string[] },
): Promise<FeishuDocWhiteboardPreviewResult> {
  return fetchDesktopFeishuDocWhiteboardPreviewUrls(input);
}

export async function openFeishuWorkspaceDoc(
  _baseUrl: string,
  workspaceId: string,
  docId: string,
): Promise<FeishuDocContentView> {
  const result = await openDesktopFeishuWorkspaceDoc(workspaceId, docId);
  notifyMutation();
  return result;
}

export async function openFeishuDocIR(
  _baseUrl: string,
  input: { workspaceId: string; docId: string },
): Promise<{ source: "cache" | "remote"; ir: FeishuDocIR }> {
  const result = await openDesktopFeishuDocIR(input);
  notifyMutation();
  return result;
}

export async function pullFeishuDocIR(
  _baseUrl: string,
  input: { workspaceId: string; docId: string; overwrite?: boolean },
): Promise<{ ir: FeishuDocIR; backupPath?: string }> {
  const result = await pullDesktopFeishuDocIR({
    workspaceId: input.workspaceId,
    docId: input.docId,
    overwrite: input.overwrite ?? true,
  });
  notifyMutation();
  return result;
}

export async function pushFeishuDocIR(
  _baseUrl: string,
  input: { workspaceId: string; docId: string },
): Promise<{ status: "succeeded" | "blocked" | "failed"; message?: string }> {
  const result = await pushDesktopFeishuDocIR(input);
  notifyMutation();
  return result;
}

export async function fetchFeishuWorkspaceDocLocalDraft(
  _baseUrl: string,
  workspaceId: string,
  docId: string,
): Promise<FeishuDocContentView> {
  return fetchDesktopFeishuWorkspaceDocLocalDraft(workspaceId, docId);
}

export async function inspectFeishuWorkspaceDocPermissions(
  _baseUrl: string,
  workspaceId: string,
  docId: string,
): Promise<FeishuDocPermissionInspectView> {
  return inspectDesktopFeishuWorkspaceDocPermissions(workspaceId, docId);
}

export async function saveFeishuWorkspaceDocLocalDraft(
  _baseUrl: string,
  workspaceId: string,
  docId: string,
  input: { title: string; markdown?: string; force?: boolean },
): Promise<FeishuDocContentView> {
  const result = await saveDesktopFeishuWorkspaceDocLocalDraft({
    workspaceId,
    docId,
    title: input.title,
    markdown: input.markdown,
    force: input.force,
  });
  notifyMutation();
  return result;
}

export async function pullFeishuWorkspaceDoc(
  _baseUrl: string,
  workspaceId: string,
  docId: string,
) {
  const result = await pullDesktopFeishuWorkspaceDoc(workspaceId, docId);
  notifyMutation();
  return result;
}

export async function pushFeishuWorkspaceDoc(
  _baseUrl: string,
  workspaceId: string,
  docId: string,
  input: { title?: string; markdown?: string; force?: boolean },
) {
  const result = await pushDesktopFeishuWorkspaceDoc({
    workspaceId,
    docId,
    ...(input.title ? { title: input.title } : {}),
    markdown: input.markdown,
    force: input.force,
  });
  notifyMutation();
  return result;
}

export async function executeFeishuSmartAssistantAction(
  _baseUrl: string,
  input: FeishuSmartAssistantExecuteActionInput,
): Promise<FeishuSmartAssistantActionExecuteResultView> {
  return executeDesktopFeishuSmartAssistantAction(input);
}

export function subscribeFeishuMutations(_baseUrl: string, listener: () => void): () => void {
  const onMutation = () => listener();
  window.addEventListener(DESKTOP_FEISHU_MUTATION_EVENT, onMutation);

  const timer = window.setInterval(() => {
    listener();
  }, 5_000);

  return () => {
    window.removeEventListener(DESKTOP_FEISHU_MUTATION_EVENT, onMutation);
    window.clearInterval(timer);
  };
}

export function subscribeFeishuDocMutations(
  _baseUrl: string,
  listener: (event?: unknown) => void,
): () => void {
  const onMutation = (event: Event) => listener(event);
  window.addEventListener(DESKTOP_FEISHU_MUTATION_EVENT, onMutation);

  const timer = window.setInterval(() => {
    listener(undefined);
  }, 6_000);

  return () => {
    window.removeEventListener(DESKTOP_FEISHU_MUTATION_EVENT, onMutation);
    window.clearInterval(timer);
  };
}
