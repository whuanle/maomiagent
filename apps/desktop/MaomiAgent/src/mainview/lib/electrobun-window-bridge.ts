import type { DesktopRendererRPC, DesktopWindowAction } from "../../shared/desktop-rpc";
import type {
  FeishuDocTreeBranchInput,
  FeishuDocTreeBranchResult,
  FeishuDocTreeLoadInput,
  FeishuDocTreeLoadResult,
} from "../../shared/desktop-feishu";
import {
  emitDesktopConversationRuntimeEventsUpdated,
  emitDesktopConversationSessionDetailUpdated,
} from "./desktop-conversation";
import type { DesktopAppUpdateInstallInput } from "../../shared/desktop-updater";
import { notifyDesktopWindowBridgeReady } from "./desktop-window";

type ElectrobunGlobal = {
  __electrobun?: unknown;
};

type DesktopFeishuDocTreeRuntimeRequests = {
  loadDesktopFeishuDocTreeRoot: (input: FeishuDocTreeLoadInput) => Promise<FeishuDocTreeLoadResult>;
  loadDesktopFeishuDocTreeBranch: (input: FeishuDocTreeBranchInput) => Promise<FeishuDocTreeBranchResult>;
};

let initialized = false;

export function installElectrobunWindowBridge() {
  if (initialized || typeof window === "undefined") {
    return;
  }

  const electrobunWindow = window as Window & ElectrobunGlobal;
  if (!electrobunWindow.__electrobun) {
    return;
  }

  initialized = true;
  void import("electrobun/view").then(({ Electroview }) => {
    const rpc = Electroview.defineRPC<DesktopRendererRPC>({
      maxRequestTime: Infinity,
      handlers: {
        requests: {},
        messages: {
          desktopConversationSessionDetailUpdated: (detail) => {
            emitDesktopConversationSessionDetailUpdated(detail);
          },
          desktopConversationRuntimeEventsUpdated: (detail) => {
            emitDesktopConversationRuntimeEventsUpdated(detail);
          },
        },
      },
    });
    new Electroview({ rpc });
    const desktopFeishuDocTreeRuntimeRequest = rpc.request as typeof rpc.request & DesktopFeishuDocTreeRuntimeRequests;

    window.maomiDesktopWindow = {
      getWindowState: () => rpc.request.getWindowState(),
      windowControl: (action: DesktopWindowAction, dragPointer, resizePointer) => rpc.request.windowControl({
        action,
        ...(dragPointer ? { dragPointer } : {}),
        ...(resizePointer ? { resizePointer } : {}),
      }),
      refreshMainView: () => rpc.request.refreshMainView(),
      chooseDirectory: (options) => rpc.request.chooseDirectory(options),
      saveTextFileWithDialog: (input) => rpc.request.saveTextFileWithDialog(input),
      openPathInFileManager: (path) => rpc.request.openPathInFileManager({ path }),
      openExternalUrl: (url) => rpc.request.openExternalUrl({ url }),
    };
    window.maomiDesktopBrowser = {
      createTab: () => rpc.request["browser.createTab"](),
      activateTab: (tabId) => rpc.request["browser.activateTab"]({ tabId }),
      closeTab: (tabId) => rpc.request["browser.closeTab"]({ tabId }),
      getSnapshot: () => rpc.request["browser.getSnapshot"](),
      navigate: (tabId, url) => rpc.request["browser.navigate"]({ tabId, url }),
      goBack: (tabId) => rpc.request["browser.goBack"]({ tabId }),
      goForward: (tabId) => rpc.request["browser.goForward"]({ tabId }),
      refresh: (tabId) => rpc.request["browser.refresh"]({ tabId }),
      extract: (tabId) => rpc.request["browser.extract"]({ tabId }),
      screenshot: (tabId) => rpc.request["browser.screenshot"]({ tabId }),
      interact: (tabId, request) => rpc.request["browser.interact"]({ tabId, request }),
    };
    window.maomiDesktopAppUpdate = {
      checkDesktopAppUpdate: () => rpc.request.checkDesktopAppUpdate(),
      installDesktopAppUpdate: (input: DesktopAppUpdateInstallInput) => rpc.request.installDesktopAppUpdate(input),
    };
    window.maomiDesktopConversation = {
      listDesktopConversationSessions: (query) => rpc.request.listDesktopConversationSessions(query),
      getDesktopConversationSession: (sessionId) =>
        rpc.request.getDesktopConversationSession({ sessionId }),
      getDesktopConversationSessionDetail: (sessionId) =>
        rpc.request.getDesktopConversationSessionDetail({ sessionId }),
      listDesktopConversationCapabilities: (query) =>
        rpc.request.listDesktopConversationCapabilities(query),
      getDesktopConversationWorkspaceSettings: (input) =>
        rpc.request.getDesktopConversationWorkspaceSettings(input),
      createDesktopConversationSession: (input) =>
        rpc.request.createDesktopConversationSession(input),
      renameDesktopConversationSession: (input) =>
        rpc.request.renameDesktopConversationSession(input),
      hideDesktopConversationSession: (sessionId) =>
        rpc.request.hideDesktopConversationSession({ sessionId }),
      saveDesktopConversationWorkspaceSettings: (input) =>
        rpc.request.saveDesktopConversationWorkspaceSettings(input),
      sendDesktopConversationMessage: (input) =>
        rpc.request.sendDesktopConversationMessage(input),
      stopDesktopConversationMessage: (input) =>
        rpc.request.stopDesktopConversationMessage(input),
      answerDesktopConversationInteraction: (input) =>
        rpc.request.answerDesktopConversationInteraction(input),
      rejectDesktopConversationInteraction: (input) =>
        rpc.request.rejectDesktopConversationInteraction(input),
    };
    window.maomiDesktopAi = {
      executeDesktopAiOneShot: (input) => rpc.request.executeDesktopAiOneShot(input),
    };
    window.maomiDesktopLogs = {
      getRuntimeLogs: (query) => rpc.request.getRuntimeLogs(query),
      getRuntimeLogsSummary: (query) => rpc.request.getRuntimeLogsSummary(query),
      writeRuntimeLog: (input) => rpc.request.writeRuntimeLog(input),
      clearRuntimeLogs: () => rpc.request.clearRuntimeLogs(),
      clearRuntimeLogsBefore: (query) => rpc.request.clearRuntimeLogsBefore(query),
    };
    window.maomiDesktopWechat = {
      getDesktopWechatState: () => rpc.request.getDesktopWechatState(),
      saveDesktopWechatConfig: (input) => rpc.request.saveDesktopWechatConfig(input),
      startDesktopWechatQrLogin: (input) => rpc.request.startDesktopWechatQrLogin(input),
      pollDesktopWechatQrLogin: (input) => rpc.request.pollDesktopWechatQrLogin(input),
      setDesktopWechatAccountStatus: (accountId, input) =>
        rpc.request.setDesktopWechatAccountStatus({ accountId, input }),
      clearDesktopWechatAccountConversations: (accountId) =>
        rpc.request.clearDesktopWechatAccountConversations({ accountId }),
      removeDesktopWechatAccount: (accountId) =>
        rpc.request.removeDesktopWechatAccount({ accountId }),
    };
    window.maomiDesktopFeishu = {
      getDesktopFeishuState: () => rpc.request.getDesktopFeishuState(),
      saveDesktopFeishuPersonalConfig: (input) => rpc.request.saveDesktopFeishuPersonalConfig(input),
      clearDesktopFeishuPersonalConfig: () => rpc.request.clearDesktopFeishuPersonalConfig(),
      saveDesktopFeishuDeveloperConfig: (input) => rpc.request.saveDesktopFeishuDeveloperConfig(input),
      beginDesktopFeishuDeveloperAuthorization: (input) =>
        rpc.request.beginDesktopFeishuDeveloperAuthorization(input),
      refreshDesktopFeishuDeveloperToken: () => rpc.request.refreshDesktopFeishuDeveloperToken(),
      clearDesktopFeishuSmartAssistantConfig: () =>
        rpc.request.clearDesktopFeishuSmartAssistantConfig(),
      clearDesktopFeishuConfig: () => rpc.request.clearDesktopFeishuConfig(),
      getDesktopFeishuBotState: () => rpc.request.getDesktopFeishuBotState(),
      saveDesktopFeishuBotConfig: (input) => rpc.request.saveDesktopFeishuBotConfig(input),
      clearDesktopFeishuBotConfig: () => rpc.request.clearDesktopFeishuBotConfig(),
      getDesktopFeishuDocsCapabilities: () => rpc.request.getDesktopFeishuDocsCapabilities(),
      getDesktopFeishuDocTree: (input) => rpc.request.getDesktopFeishuDocTree(input),
      loadDesktopFeishuDocTreeRoot: (input) =>
        desktopFeishuDocTreeRuntimeRequest.loadDesktopFeishuDocTreeRoot(input),
      loadDesktopFeishuDocTreeBranch: (input) =>
        desktopFeishuDocTreeRuntimeRequest.loadDesktopFeishuDocTreeBranch(input),
      getDesktopFeishuDocContent: (docId) => rpc.request.getDesktopFeishuDocContent({ docId }),
      getDesktopFeishuDocMediaPreviewUrls: (input) =>
        rpc.request.getDesktopFeishuDocMediaPreviewUrls(input),
      getDesktopFeishuDocWhiteboardPreviewUrls: (input) =>
        rpc.request.getDesktopFeishuDocWhiteboardPreviewUrls(input),
      openDesktopFeishuWorkspaceDoc: (workspaceId, docId) =>
        rpc.request.openDesktopFeishuWorkspaceDoc({ workspaceId, docId }),
      openDesktopFeishuDocIR: (input) => rpc.request.openDesktopFeishuDocIR(input),
      pullDesktopFeishuDocIR: (input) => rpc.request.pullDesktopFeishuDocIR(input),
      pushDesktopFeishuDocIR: (input) => rpc.request.pushDesktopFeishuDocIR(input),
      getDesktopFeishuWorkspaceDocLocalDraft: (workspaceId, docId) =>
        rpc.request.getDesktopFeishuWorkspaceDocLocalDraft({ workspaceId, docId }),
      inspectDesktopFeishuWorkspaceDocPermissions: (workspaceId, docId) =>
        rpc.request.inspectDesktopFeishuWorkspaceDocPermissions({ workspaceId, docId }),
      saveDesktopFeishuWorkspaceDocLocalDraft: (input) =>
        rpc.request.saveDesktopFeishuWorkspaceDocLocalDraft(input),
      pullDesktopFeishuWorkspaceDoc: (workspaceId, docId) =>
        rpc.request.pullDesktopFeishuWorkspaceDoc({ workspaceId, docId }),
      pushDesktopFeishuWorkspaceDoc: (input) => rpc.request.pushDesktopFeishuWorkspaceDoc(input),
      executeDesktopFeishuSmartAssistantAction: (input) =>
        rpc.request.executeDesktopFeishuSmartAssistantAction(input),
    };
    window.maomiDesktopWorkspace = {
      listDesktopWorkspaces: (query) => rpc.request.listDesktopWorkspaces(query),
      getDesktopWorkspace: (workspaceId) => rpc.request.getDesktopWorkspace({ workspaceId }),
      getDesktopWorkspaceFileTree: (workspaceId, path) => rpc.request.getDesktopWorkspaceFileTree({
        workspaceId,
        path,
      }),
      getDesktopWorkspaceFileContent: (workspaceId, path) => rpc.request.getDesktopWorkspaceFileContent({
        workspaceId,
        path,
      }),
      writeDesktopWorkspaceTextFile: (workspaceId, path, content) => rpc.request.writeDesktopWorkspaceTextFile({
        workspaceId,
        path,
        content,
      }),
      createDesktopWorkspace: (input) => rpc.request.createDesktopWorkspace(input),
      updateDesktopWorkspace: (workspaceId, input) => rpc.request.updateDesktopWorkspace({
        workspaceId,
        input,
      }),
      removeDesktopWorkspace: (workspaceId) => rpc.request.removeDesktopWorkspace({ workspaceId }),
    };
    window.maomiDesktopUiDesigner = {
      getDesktopUiDesignerState: (query) => rpc.request.getDesktopUiDesignerState(query),
      saveDesktopUiDesignerDesignPackage: (input) => rpc.request.saveDesktopUiDesignerDesignPackage(input),
    };
    window.maomiDesktopGit = {
      getDesktopGitIgnore: (workspaceId) => rpc.request.getDesktopGitIgnore({ workspaceId }),
      getDesktopGitSettings: (workspaceId) => rpc.request.getDesktopGitSettings({ workspaceId }),
      getDesktopGitChanges: (workspaceId) => rpc.request.getDesktopGitChanges({ workspaceId }),
      getDesktopGitReview: (workspaceId) => rpc.request.getDesktopGitReview({ workspaceId }),
      getDesktopGitReviewDetail: (workspaceId, query) =>
        rpc.request.getDesktopGitReviewDetail({ workspaceId, query }),
      compareDesktopGitRefs: (workspaceId, query) =>
        rpc.request.compareDesktopGitRefs({ workspaceId, query }),
      getDesktopGitBranches: (workspaceId) => rpc.request.getDesktopGitBranches({ workspaceId }),
      getDesktopGitStashes: (workspaceId) => rpc.request.getDesktopGitStashes({ workspaceId }),
      getDesktopGitWorktrees: (workspaceId) => rpc.request.getDesktopGitWorktrees({ workspaceId }),
      getDesktopGitHistory: (workspaceId, query) =>
        rpc.request.getDesktopGitHistory({ workspaceId, query }),
      getDesktopGitHistoryDetail: (workspaceId, hash) =>
        rpc.request.getDesktopGitHistoryDetail({ workspaceId, hash }),
      getDesktopGitModuleSnapshot: (workspaceId, query) =>
        rpc.request.getDesktopGitModuleSnapshot({ workspaceId, query }),
      getDesktopGitHunks: (workspaceId, query) =>
        rpc.request.getDesktopGitHunks({ workspaceId, query }),
      saveDesktopGitIgnore: (workspaceId, input) =>
        rpc.request.saveDesktopGitIgnore({ workspaceId, input }),
      saveDesktopGitSettings: (workspaceId, input) =>
        rpc.request.saveDesktopGitSettings({ workspaceId, input }),
      initDesktopGitRepository: (workspaceId) =>
        rpc.request.initDesktopGitRepository({ workspaceId }),
      stageDesktopGitChanges: (workspaceId, input) =>
        rpc.request.stageDesktopGitChanges({ workspaceId, input }),
      unstageDesktopGitChanges: (workspaceId, input) =>
        rpc.request.unstageDesktopGitChanges({ workspaceId, input }),
      discardDesktopGitChanges: (workspaceId, input) =>
        rpc.request.discardDesktopGitChanges({ workspaceId, input }),
      commitDesktopGitChanges: (workspaceId, input) =>
        rpc.request.commitDesktopGitChanges({ workspaceId, input }),
      generateDesktopGitCommitMessage: (workspaceId, query) =>
        rpc.request.generateDesktopGitCommitMessage({ workspaceId, query }),
      createDesktopGitStash: (workspaceId, input) =>
        rpc.request.createDesktopGitStash({ workspaceId, input }),
      applyDesktopGitStash: (workspaceId, input) =>
        rpc.request.applyDesktopGitStash({ workspaceId, input }),
      popDesktopGitStash: (workspaceId, input) =>
        rpc.request.popDesktopGitStash({ workspaceId, input }),
      dropDesktopGitStash: (workspaceId, input) =>
        rpc.request.dropDesktopGitStash({ workspaceId, input }),
      createDesktopGitBranch: (workspaceId, input) =>
        rpc.request.createDesktopGitBranch({ workspaceId, input }),
      createDesktopGitTag: (workspaceId, input) =>
        rpc.request.createDesktopGitTag({ workspaceId, input }),
      createDesktopGitWorktree: (workspaceId, input) =>
        rpc.request.createDesktopGitWorktree({ workspaceId, input }),
      removeDesktopGitWorktree: (workspaceId, input) =>
        rpc.request.removeDesktopGitWorktree({ workspaceId, input }),
      pruneDesktopGitWorktrees: (workspaceId) =>
        rpc.request.pruneDesktopGitWorktrees({ workspaceId }),
      checkoutDesktopGitBranch: (workspaceId, input) =>
        rpc.request.checkoutDesktopGitBranch({ workspaceId, input }),
      mergeDesktopGitBranchIntoCurrent: (workspaceId, input) =>
        rpc.request.mergeDesktopGitBranchIntoCurrent({ workspaceId, input }),
      rebaseDesktopGitBranchIntoCurrent: (workspaceId, input) =>
        rpc.request.rebaseDesktopGitBranchIntoCurrent({ workspaceId, input }),
      renameDesktopGitBranch: (workspaceId, input) =>
        rpc.request.renameDesktopGitBranch({ workspaceId, input }),
      deleteDesktopGitBranch: (workspaceId, input) =>
        rpc.request.deleteDesktopGitBranch({ workspaceId, input }),
      fetchDesktopGitRemote: (workspaceId) =>
        rpc.request.fetchDesktopGitRemote({ workspaceId }),
      pullDesktopGitRemote: (workspaceId) =>
        rpc.request.pullDesktopGitRemote({ workspaceId }),
      pushDesktopGitRemote: (workspaceId, input) =>
        rpc.request.pushDesktopGitRemote({ workspaceId, input }),
      revertDesktopGitCommit: (workspaceId, input) =>
        rpc.request.revertDesktopGitCommit({ workspaceId, input }),
      cherryPickDesktopGitCommit: (workspaceId, input) =>
        rpc.request.cherryPickDesktopGitCommit({ workspaceId, input }),
      resetDesktopGitCommit: (workspaceId, input) =>
        rpc.request.resetDesktopGitCommit({ workspaceId, input }),
      stageDesktopGitHunks: (workspaceId, input) =>
        rpc.request.stageDesktopGitHunks({ workspaceId, input }),
      unstageDesktopGitHunks: (workspaceId, input) =>
        rpc.request.unstageDesktopGitHunks({ workspaceId, input }),
      discardDesktopGitHunks: (workspaceId, input) =>
        rpc.request.discardDesktopGitHunks({ workspaceId, input }),
    };
    window.maomiDesktopTasks = {
      listDesktopTaskWorkspaces: () => rpc.request.listDesktopTaskWorkspaces(),
      listDesktopTaskCenter: (query) => rpc.request.listDesktopTaskCenter(query),
      listDesktopTasks: (query) => rpc.request.listDesktopTasks(query),
      getDesktopTask: (workspaceId, taskId) => rpc.request.getDesktopTask({
        workspaceId,
        taskId,
      }),
      getDesktopTaskDetail: (query) => rpc.request.getDesktopTaskDetail(query),
      listDesktopTaskRuns: (query) => rpc.request.listDesktopTaskRuns(query),
      runDesktopTaskNow: (workspaceId, taskId) => rpc.request.runDesktopTaskNow({
        workspaceId,
        taskId,
      }),
      cancelDesktopTask: (workspaceId, taskId) => rpc.request.cancelDesktopTask({
        workspaceId,
        taskId,
      }),
      retryDesktopTask: (workspaceId, taskId) => rpc.request.retryDesktopTask({
        workspaceId,
        taskId,
      }),
      pauseDesktopTaskSchedule: (workspaceId, taskId) => rpc.request.pauseDesktopTaskSchedule({
        workspaceId,
        taskId,
      }),
      resumeDesktopTaskSchedule: (workspaceId, taskId) => rpc.request.resumeDesktopTaskSchedule({
        workspaceId,
        taskId,
      }),
    };
    window.maomiDesktopTerminals = {
      listDesktopTerminalSessions: (query) => rpc.request.listDesktopTerminalSessions(query),
      getDesktopTerminalDetail: (query) => rpc.request.getDesktopTerminalDetail(query),
      createDesktopTerminalSession: (input) => rpc.request.createDesktopTerminalSession(input),
      executeDesktopTerminalInput: (sessionId, input) => rpc.request.executeDesktopTerminalInput({
        sessionId,
        input,
      }),
      resizeDesktopTerminalSession: (sessionId, input) => rpc.request.resizeDesktopTerminalSession({
        sessionId,
        input,
      }),
      closeDesktopTerminalSession: (sessionId) => rpc.request.closeDesktopTerminalSession({
        sessionId,
      }),
    };
    window.maomiDesktopMemory = {
      listDesktopMemoryUnits: (params) => rpc.request.listDesktopMemoryUnits(params),
      getDesktopMemoryProjection: (params) => rpc.request.getDesktopMemoryProjection(params),
      appendDesktopMemory: (params) => rpc.request.appendDesktopMemory(params),
      patchDesktopMemoryUnit: (params) => rpc.request.patchDesktopMemoryUnit(params),
      removeDesktopMemoryUnit: (params) => rpc.request.removeDesktopMemoryUnit(params),
      searchDesktopMemory: (params) => rpc.request.searchDesktopMemory(params),
      listDesktopMemoryTraces: (params) => rpc.request.listDesktopMemoryTraces(params),
      getDesktopMemoryRuntimeContext: (params) => rpc.request.getDesktopMemoryRuntimeContext(params),
      previewDesktopMemoryMaintenance: (params) => rpc.request.previewDesktopMemoryMaintenance(params),
      applyDesktopMemoryMaintenance: (params) => rpc.request.applyDesktopMemoryMaintenance(params),
      pullDesktopMemoryWorkingSet: (params) => rpc.request.pullDesktopMemoryWorkingSet(params),
      pushDesktopMemoryWorkingSet: (params) => rpc.request.pushDesktopMemoryWorkingSet(params),
    };
    window.maomiDesktopAgents = {
      listDesktopAgents: (query) => rpc.request.listDesktopAgents(query),
      getDesktopAgent: (agentId) => rpc.request.getDesktopAgent({ agentId }),
      getDesktopAgentBundle: (agentId) => rpc.request.getDesktopAgentBundle({ agentId }),
      createDesktopAgent: (input) => rpc.request.createDesktopAgent(input),
      updateDesktopAgent: (agentId, input) => rpc.request.updateDesktopAgent({ agentId, input }),
      saveDesktopAgentBundle: (input) => rpc.request.saveDesktopAgentBundle(input),
      setDesktopAgentEnabled: (agentId, enabled) =>
        rpc.request.setDesktopAgentEnabled({ agentId, enabled }),
      removeDesktopAgent: (agentId) => rpc.request.removeDesktopAgent({ agentId }),
      previewDesktopAgentImport: (input) => rpc.request.previewDesktopAgentImport(input),
      importDesktopAgents: (input) => rpc.request.importDesktopAgents(input),
    };
    window.maomiDesktopModels = {
      listDesktopModelProviders: () => rpc.request.listDesktopModelProviders(),
      listDesktopModelChannels: (query) => rpc.request.listDesktopModelChannels(query),
      getDesktopModelsSnapshot: () => rpc.request.getDesktopModelsSnapshot(),
      getDesktopModelRuntimeSelectionSnapshot: (query) =>
        rpc.request.getDesktopModelRuntimeSelectionSnapshot(query),
      listDesktopChannelModels: (providerType, channelId) =>
        rpc.request.listDesktopChannelModels({ providerType, channelId }),
      createDesktopModelChannel: (providerType, input) =>
        rpc.request.createDesktopModelChannel({ providerType, input }),
      updateDesktopModelChannel: (providerType, channelId, input) =>
        rpc.request.updateDesktopModelChannel({
          providerType,
          channelId,
          input,
        }),
      setDesktopModelChannelEnabled: (providerType, channelId, enabled) =>
        rpc.request.setDesktopModelChannelEnabled({
          providerType,
          channelId,
          enabled,
        }),
      removeDesktopModelChannel: (providerType, channelId) =>
        rpc.request.removeDesktopModelChannel({ providerType, channelId }),
      setDesktopChannelModelEnabled: (providerType, channelId, modelId, enabled) =>
        rpc.request.setDesktopChannelModelEnabled({
          providerType,
          channelId,
          modelId,
          enabled,
        }),
      batchSetDesktopChannelModelsEnabled: (providerType, channelId, updates) =>
        rpc.request.batchSetDesktopChannelModelsEnabled({
          providerType,
          channelId,
          updates,
        }),
      discoverDesktopChannelModels: (providerType, channelId) =>
        rpc.request.discoverDesktopChannelModels({ providerType, channelId }),
    };
    window.maomiDesktopSkills = {
      listDesktopSkills: (query) => rpc.request.listDesktopSkills(query),
      getDesktopSkill: (skillId) => rpc.request.getDesktopSkill({ skillId }),
      discoverDesktopSkills: (query) => rpc.request.discoverDesktopSkills(query),
      getDesktopSkillsEffective: (query) => rpc.request.getDesktopSkillsEffective(query),
      listDesktopSkillsMarketProviders: () => rpc.request.listDesktopSkillsMarketProviders(),
      searchDesktopSkillsMarket: (query) => rpc.request.searchDesktopSkillsMarket(query),
      installDesktopSkillMarket: (input) => rpc.request.installDesktopSkillMarket(input),
      adoptDesktopSkill: (input) => rpc.request.adoptDesktopSkill(input),
      patchDesktopSkill: (skillId, input) => rpc.request.patchDesktopSkill({ skillId, input }),
      setDesktopSkillEnabled: (skillId, enabled) =>
        rpc.request.setDesktopSkillEnabled({ skillId, enabled }),
      removeDesktopSkill: (skillId) => rpc.request.removeDesktopSkill({ skillId }),
    };
    window.maomiDesktopMcp = {
      listDesktopMcp: (query) => rpc.request.listDesktopMcp(query),
      getDesktopMcpEffective: (params) => rpc.request.getDesktopMcpEffective(params),
      listDesktopMcpRecommended: () => rpc.request.listDesktopMcpRecommended(),
      createDesktopMcp: (input) => rpc.request.createDesktopMcp(input),
      patchDesktopMcp: (mcpId, input) => rpc.request.patchDesktopMcp({ mcpId, input }),
      deleteDesktopMcp: (mcpId) => rpc.request.deleteDesktopMcp({ mcpId }),
      testDesktopMcpConnection: (mcpId) => rpc.request.testDesktopMcpConnection({ mcpId }),
      healthCheckDesktopMcp: (mcpId) => rpc.request.healthCheckDesktopMcp({ mcpId }),
      fetchDesktopMcpCapabilities: (mcpId) => rpc.request.fetchDesktopMcpCapabilities({ mcpId }),
      listDesktopMcpHealthHistory: (params) => rpc.request.listDesktopMcpHealthHistory(params),
      getDesktopMcpRuntimeConfig: (params) => rpc.request.getDesktopMcpRuntimeConfig(params),
      installDesktopMcpRecommended: (id, input) => rpc.request.installDesktopMcpRecommended({ id, input }),
      listDesktopMcpMarketProviders: () => rpc.request.listDesktopMcpMarketProviders(),
      searchDesktopMcpMarket: (input) => rpc.request.searchDesktopMcpMarket(input),
      searchDesktopMcpMarketByRequirement: (input) => rpc.request.searchDesktopMcpMarketByRequirement(input),
      installDesktopMcpMarket: (input) => rpc.request.installDesktopMcpMarket(input),
      autoInstallDesktopMcpMarketByRequirement: (input) =>
        rpc.request.autoInstallDesktopMcpMarketByRequirement(input),
    };
    notifyDesktopWindowBridgeReady();
  }).catch((error) => {
    initialized = false;
    console.error("Failed to initialize desktop window bridge", error);
  });
}
