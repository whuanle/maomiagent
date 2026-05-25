export type DesktopWindowAction = "minimize" | "toggleMaximize" | "restoreForDrag" | "exitFullScreen" | "close";

export type DesktopWindowDragPointer = {
  offsetX: number;
  offsetY: number;
  windowWidth: number;
};

export type DesktopMainViewRefreshResult = {
  url: string;
  usedDevServer: boolean;
  rebuilt: boolean;
};

import type {
  DesktopConversationApplyWorkspaceSettingsInput,
  DesktopConversationApplyWorkspaceSettingsResponse,
  DesktopConversationAnswerInteractionInput,
  DesktopConversationCapabilityListQuery,
  DesktopConversationCapabilityListResponse,
  DesktopConversationCreateSessionInput,
  DesktopConversationCreateSessionResponse,
  DesktopConversationHideSessionResponse,
  DesktopConversationInteractionReplyResponse,
  DesktopConversationRejectInteractionInput,
  DesktopConversationRuntimeEventsUpdateEvent,
  DesktopConversationSendMessageInput,
  DesktopConversationSendMessageResponse,
  DesktopConversationStopMessageInput,
  DesktopConversationStopMessageResponse,
  DesktopConversationSessionDetail,
  DesktopConversationSessionDetailUpdateEvent,
  DesktopConversationSessionItem,
  DesktopConversationSessionListQuery,
  DesktopConversationSessionListResponse,
} from "./desktop-conversation";
import type {
  DesktopAiOneShotRequest,
  DesktopAiOneShotResponse,
} from "./desktop-ai";
import type {
  DesktopMcpCapabilityProbeResult,
  DesktopMcpCreateResponse,
  DesktopMcpDeleteResponse,
  DesktopMcpDraftInput,
  DesktopMcpEffectiveResponse,
  DesktopMcpHealthHistoryResponse,
  DesktopMcpListParams,
  DesktopMcpListResponse,
  DesktopMcpMarketAutoInstallInput,
  DesktopMcpMarketAutoInstallResponse,
  DesktopMcpMarketInstallInput,
  DesktopMcpMarketInstallResponse,
  DesktopMcpMarketProvidersResponse,
  DesktopMcpMarketRequirementQuery,
  DesktopMcpMarketSearchByRequirementResponse,
  DesktopMcpMarketSearchQuery,
  DesktopMcpMarketSearchResponse,
  DesktopMcpRecommendedItem,
  DesktopMcpRuntimeConfig,
  DesktopMcpTestConnectionResult,
  DesktopMcpView,
} from "./desktop-mcp";
import type {
  DesktopMemoryAppendInput,
  DesktopMemoryDeleteResponse,
  DesktopMemoryListQuery,
  DesktopMemoryListResponse,
  DesktopMemoryMaintenanceApply,
  DesktopMemoryMaintenanceRequest,
  DesktopMemoryMaintenancePreview,
  DesktopMemoryPatchInput,
  DesktopMemoryProjection,
  DesktopMemoryProjectionQuery,
  DesktopMemoryRuntimeContext,
  DesktopMemorySearchQuery,
  DesktopMemorySearchResponse,
  DesktopMemoryTrace,
  DesktopMemoryTraceListQuery,
  DesktopMemoryUnit,
  DesktopMemoryWorkingSetPullQuery,
  DesktopMemoryWorkingSetPullResult,
  DesktopMemoryWorkingSetPushInput,
  DesktopMemoryWorkingSetPushResult,
} from "./desktop-memory";
import type {
  AgentItem,
  AgentsListQuery,
  AgentsListResponse,
  DesktopAgentBundleSaveInput,
  DesktopAgentBundleSaveResponse,
  DesktopAgentBundleView,
  DesktopAgentCreateResponse,
  DesktopAgentDeleteResponse,
  OpencodeAgentImportInput,
  OpencodeAgentImportPreview,
  OpencodeAgentImportResult,
} from "./desktop-agents";
import type {
  DesktopModelBatchToggleInput,
  DesktopModelChannelItem,
  DesktopModelChannelListQuery,
  DesktopModelChannelListResponse,
  DesktopModelChannelModelsResponse,
  DesktopModelChannelStateItem,
  DesktopModelCreateChannelInput,
  DesktopModelCreateChannelResponse,
  DesktopModelDeleteChannelResponse,
  DesktopModelDiscoveryResponse,
  DesktopModelProviderListResponse,
  DesktopModelRuntimeSelectionQuery,
  DesktopModelRuntimeSelectionResponse,
  DesktopModelsSnapshot,
  DesktopModelUpdateChannelInput,
} from "./desktop-models";
import type {
  DesktopSkillItem,
  DesktopSkillsAdoptInput,
  DesktopSkillsAdoptResponse,
  DesktopSkillsDeleteResponse,
  DesktopSkillsDiscoveryResponse,
  DesktopSkillsListQuery,
  DesktopSkillsListResponse,
  DesktopSkillsMarketInstallInput,
  DesktopSkillsMarketInstallResponse,
  DesktopSkillsMarketProviderListResponse,
  DesktopSkillsMarketSearchQuery,
  DesktopSkillsMarketSearchResponse,
  DesktopSkillsPatchInput,
  DesktopSkillsRuntimeEffectiveResult,
} from "./desktop-skills";
import type {
  DesktopTaskActionInput,
  DesktopTaskDetailQuery,
  DesktopTaskDetailResponse,
  DesktopTaskListQuery,
  DesktopTaskListResponse,
  DesktopTaskRecord,
  DesktopTaskRunsListQuery,
  DesktopTaskRunsResponse,
  DesktopTaskWorkspacesResponse,
} from "./desktop-tasks";
import type {
  DesktopTaskCenterListQuery,
  DesktopTaskCenterListResponse,
} from "./desktop-task-center";
import type {
  DesktopAppUpdateCheckResult,
  DesktopAppUpdateInstallInput,
  DesktopAppUpdateInstallResult,
} from "./desktop-updater";
import type {
  DesktopTerminalCloseResponse,
  DesktopTerminalCreateInput,
  DesktopTerminalDetailQuery,
  DesktopTerminalExecuteInput,
  DesktopTerminalListQuery,
  DesktopTerminalResizeInput,
  DesktopTerminalSessionDetail,
  DesktopTerminalSessionListResponse,
  DesktopTerminalSessionRecord,
} from "./desktop-terminals";
import type {
  DesktopWorkspaceCreateInput,
  DesktopWorkspaceCreateResponse,
  DesktopWorkspaceFileContentResult,
  DesktopWorkspaceFileTreeResult,
  DesktopWorkspaceItem,
  DesktopWorkspaceListQuery,
  DesktopWorkspaceListResponse,
  DesktopWorkspaceRemoveResponse,
  DesktopWorkspaceUpdateInput,
} from "./desktop-workspace";
import type {
  WechatAccountStatusInput,
  WechatConfigInput,
  WechatQrLoginPollInput,
  WechatQrLoginPollResult,
  WechatQrLoginStartInput,
  WechatQrLoginStartResult,
  WechatStateView,
} from "./desktop-wechat";
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
} from "./desktop-feishu";
import type { FeishuDocIR } from "./desktop-feishu-doc-ir";
import type {
  DesktopGitBranchNameInput,
  DesktopGitBranchesResult,
  DesktopGitChangeItem,
  DesktopGitCheckoutBranchInput,
  DesktopGitCommitChangesInput,
  DesktopGitCommitHashInput,
  DesktopGitCommitMessageSuggestionsQuery,
  DesktopGitCommitMessageSuggestionsResult,
  DesktopGitCompareQuery,
  DesktopGitCompareResult,
  DesktopGitCreateBranchInput,
  DesktopGitCreateTagInput,
  DesktopGitCreateStashInput,
  DesktopGitDeleteBranchInput,
  DesktopGitDiscardChangesInput,
  DesktopGitHistoryDetailResult,
  DesktopGitHistoryQuery,
  DesktopGitHistoryResult,
  DesktopGitHunkMutationInput,
  DesktopGitHunksQuery,
  DesktopGitHunksResult,
  DesktopGitIgnoreResult,
  DesktopGitModuleSnapshotQuery,
  DesktopGitModuleSnapshotResult,
  DesktopGitOperationResult,
  DesktopGitPushRemoteInput,
  DesktopGitRenameBranchInput,
  DesktopGitResetCommitInput,
  DesktopGitReviewDetailQuery,
  DesktopGitReviewDetailResult,
  DesktopGitReviewResult,
  DesktopGitSaveIgnoreInput,
  DesktopGitStageChangesInput,
  DesktopGitStashRefInput,
  DesktopGitStashesResult,
  DesktopGitUnstageChangesInput,
  DesktopGitChangesResult,
} from "./desktop-git";
import type {
  RuntimeLogRecord,
  RuntimeLogsDeleteResponse,
  RuntimeLogsListResponse,
  RuntimeLogsQuery,
  RuntimeLogsSummary,
  RuntimeLogWriteInput,
} from "./runtime-logs";

export type DesktopWindowState = {
  maximized: boolean;
};

export type DesktopDirectoryDialogOptions = {
  startingFolder?: string;
};

export type DesktopOpenPathInFileManagerInput = {
  path: string;
};

export type DesktopOpenPathInFileManagerResult = {
  opened: boolean;
};

export type DesktopOpenExternalUrlInput = {
  url: string;
};

export type DesktopOpenExternalUrlResult = {
  opened: boolean;
};

export type DesktopRendererRPC = {
  bun: {
    requests: {
      getWindowState: {
        params: undefined;
        response: DesktopWindowState;
      };
      windowControl: {
        params: {
          action: DesktopWindowAction;
          dragPointer?: DesktopWindowDragPointer;
        };
        response: DesktopWindowState;
      };
      refreshMainView: {
        params: undefined;
        response: DesktopMainViewRefreshResult;
      };
      chooseDirectory: {
        params: DesktopDirectoryDialogOptions | undefined;
        response: string | null;
      };
      openPathInFileManager: {
        params: DesktopOpenPathInFileManagerInput;
        response: DesktopOpenPathInFileManagerResult;
      };
      openExternalUrl: {
        params: DesktopOpenExternalUrlInput;
        response: DesktopOpenExternalUrlResult;
      };
      checkDesktopAppUpdate: {
        params: undefined;
        response: DesktopAppUpdateCheckResult;
      };
      installDesktopAppUpdate: {
        params: DesktopAppUpdateInstallInput;
        response: DesktopAppUpdateInstallResult;
      };
      listDesktopConversationSessions: {
        params: DesktopConversationSessionListQuery | undefined;
        response: DesktopConversationSessionListResponse;
      };
      getDesktopConversationSession: {
        params: {
          sessionId: string;
        };
        response: DesktopConversationSessionItem | null;
      };
      getDesktopConversationSessionDetail: {
        params: {
          sessionId: string;
        };
        response: DesktopConversationSessionDetail | null;
      };
      listDesktopConversationCapabilities: {
        params: DesktopConversationCapabilityListQuery;
        response: DesktopConversationCapabilityListResponse;
      };
      createDesktopConversationSession: {
        params: DesktopConversationCreateSessionInput;
        response: DesktopConversationCreateSessionResponse;
      };
      hideDesktopConversationSession: {
        params: {
          sessionId: string;
        };
        response: DesktopConversationHideSessionResponse;
      };
      applyDesktopConversationWorkspaceSettings: {
        params: DesktopConversationApplyWorkspaceSettingsInput;
        response: DesktopConversationApplyWorkspaceSettingsResponse;
      };
      sendDesktopConversationMessage: {
        params: DesktopConversationSendMessageInput;
        response: DesktopConversationSendMessageResponse;
      };
      stopDesktopConversationMessage: {
        params: DesktopConversationStopMessageInput;
        response: DesktopConversationStopMessageResponse;
      };
      answerDesktopConversationInteraction: {
        params: DesktopConversationAnswerInteractionInput;
        response: DesktopConversationInteractionReplyResponse;
      };
      rejectDesktopConversationInteraction: {
        params: DesktopConversationRejectInteractionInput;
        response: DesktopConversationInteractionReplyResponse;
      };
      executeDesktopAiOneShot: {
        params: DesktopAiOneShotRequest;
        response: DesktopAiOneShotResponse;
      };
      getRuntimeLogs: {
        params: RuntimeLogsQuery | undefined;
        response: RuntimeLogsListResponse;
      };
      getRuntimeLogsSummary: {
        params: RuntimeLogsQuery | undefined;
        response: RuntimeLogsSummary;
      };
      writeRuntimeLog: {
        params: RuntimeLogWriteInput;
        response: RuntimeLogRecord;
      };
      clearRuntimeLogs: {
        params: undefined;
        response: RuntimeLogsDeleteResponse;
      };
      clearRuntimeLogsBefore: {
        params: Pick<RuntimeLogsQuery, "from" | "to">;
        response: RuntimeLogsDeleteResponse;
      };
      getDesktopWechatState: {
        params: undefined;
        response: WechatStateView;
      };
      saveDesktopWechatConfig: {
        params: WechatConfigInput;
        response: WechatStateView;
      };
      startDesktopWechatQrLogin: {
        params: WechatQrLoginStartInput | undefined;
        response: WechatQrLoginStartResult;
      };
      pollDesktopWechatQrLogin: {
        params: WechatQrLoginPollInput;
        response: WechatQrLoginPollResult;
      };
      setDesktopWechatAccountStatus: {
        params: {
          accountId: string;
          input: WechatAccountStatusInput;
        };
        response: WechatStateView;
      };
      clearDesktopWechatAccountConversations: {
        params: {
          accountId: string;
        };
        response: WechatStateView;
      };
      removeDesktopWechatAccount: {
        params: {
          accountId: string;
        };
        response: WechatStateView;
      };
      getDesktopFeishuState: {
        params: undefined;
        response: FeishuStateView;
      };
      saveDesktopFeishuPersonalConfig: {
        params: FeishuPersonalConfigInput;
        response: FeishuStateView;
      };
      clearDesktopFeishuPersonalConfig: {
        params: undefined;
        response: FeishuStateView;
      };
      saveDesktopFeishuDeveloperConfig: {
        params: FeishuDeveloperConfigInput;
        response: FeishuStateView;
      };
      beginDesktopFeishuDeveloperAuthorization: {
        params: FeishuDeveloperConfigInput;
        response: FeishuDeveloperAuthorizeResult;
      };
      refreshDesktopFeishuDeveloperToken: {
        params: undefined;
        response: FeishuStateView;
      };
      clearDesktopFeishuSmartAssistantConfig: {
        params: undefined;
        response: FeishuStateView;
      };
      clearDesktopFeishuConfig: {
        params: undefined;
        response: FeishuStateView;
      };
      getDesktopFeishuBotState: {
        params: undefined;
        response: FeishuBotStateView;
      };
      saveDesktopFeishuBotConfig: {
        params: FeishuBotConfigInput;
        response: FeishuBotStateView;
      };
      clearDesktopFeishuBotConfig: {
        params: undefined;
        response: FeishuBotStateView;
      };
      getDesktopFeishuDocsCapabilities: {
        params: undefined;
        response: FeishuDocsCapabilitiesView;
      };
      getDesktopFeishuDocTree: {
        params: FeishuDocTreeQuery;
        response: FeishuDocTreeView;
      };
      getDesktopFeishuDocContent: {
        params: {
          docId: string;
        };
        response: FeishuDocContentView;
      };
      getDesktopFeishuDocMediaPreviewUrls: {
        params: {
          fileTokens: string[];
        };
        response: FeishuDocMediaPreviewResult;
      };
      getDesktopFeishuDocWhiteboardPreviewUrls: {
        params: {
          whiteboardTokens: string[];
        };
        response: FeishuDocWhiteboardPreviewResult;
      };
      openDesktopFeishuWorkspaceDoc: {
        params: {
          workspaceId: string;
          docId: string;
        };
        response: FeishuDocContentView;
      };
      openDesktopFeishuDocIR: {
        params: {
          workspaceId: string;
          docId: string;
        };
        response: { source: "cache" | "remote"; ir: FeishuDocIR };
      };
      pullDesktopFeishuDocIR: {
        params: {
          workspaceId: string;
          docId: string;
          overwrite: boolean;
        };
        response: { ir: FeishuDocIR; backupPath?: string };
      };
      pushDesktopFeishuDocIR: {
        params: {
          workspaceId: string;
          docId: string;
        };
        response: { status: "succeeded" | "blocked" | "failed"; message?: string };
      };
      getDesktopFeishuWorkspaceDocLocalDraft: {
        params: {
          workspaceId: string;
          docId: string;
        };
        response: FeishuDocContentView;
      };
      saveDesktopFeishuWorkspaceDocLocalDraft: {
        params: {
          workspaceId: string;
          docId: string;
          title: string;
          markdown?: string;
          force?: boolean;
        };
        response: FeishuDocContentView;
      };
      pullDesktopFeishuWorkspaceDoc: {
        params: {
          workspaceId: string;
          docId: string;
        };
        response: FeishuDocWorkspacePullResult;
      };
      pushDesktopFeishuWorkspaceDoc: {
        params: {
          workspaceId: string;
          docId: string;
          title: string;
          markdown?: string;
          force?: boolean;
        };
        response: FeishuDocWorkspacePushResult;
      };
      executeDesktopFeishuSmartAssistantAction: {
        params: FeishuSmartAssistantExecuteActionInput;
        response: FeishuSmartAssistantActionExecuteResultView;
      };
      getDesktopWorkspaceFileTree: {
        params: {
          workspaceId: string;
          path?: string;
        };
        response: DesktopWorkspaceFileTreeResult;
      };
      getDesktopWorkspaceFileContent: {
        params: {
          workspaceId: string;
          path: string;
        };
        response: DesktopWorkspaceFileContentResult;
      };
      getDesktopGitIgnore: {
        params: {
          workspaceId: string;
        };
        response: DesktopGitIgnoreResult;
      };
      getDesktopGitChanges: {
        params: {
          workspaceId: string;
        };
        response: DesktopGitChangesResult;
      };
      getDesktopGitReview: {
        params: {
          workspaceId: string;
        };
        response: DesktopGitReviewResult;
      };
      getDesktopGitReviewDetail: {
        params: {
          workspaceId: string;
          query: DesktopGitReviewDetailQuery;
        };
        response: DesktopGitReviewDetailResult;
      };
      compareDesktopGitRefs: {
        params: {
          workspaceId: string;
          query: DesktopGitCompareQuery;
        };
        response: DesktopGitCompareResult;
      };
      getDesktopGitBranches: {
        params: {
          workspaceId: string;
        };
        response: DesktopGitBranchesResult;
      };
      getDesktopGitStashes: {
        params: {
          workspaceId: string;
        };
        response: DesktopGitStashesResult;
      };
      getDesktopGitHistory: {
        params: {
          workspaceId: string;
          query?: DesktopGitHistoryQuery;
        };
        response: DesktopGitHistoryResult;
      };
      getDesktopGitHistoryDetail: {
        params: {
          workspaceId: string;
          hash: string;
        };
        response: DesktopGitHistoryDetailResult;
      };
      getDesktopGitModuleSnapshot: {
        params: {
          workspaceId: string;
          query?: DesktopGitModuleSnapshotQuery;
        };
        response: DesktopGitModuleSnapshotResult;
      };
      getDesktopGitHunks: {
        params: {
          workspaceId: string;
          query: DesktopGitHunksQuery;
        };
        response: DesktopGitHunksResult;
      };
      saveDesktopGitIgnore: {
        params: {
          workspaceId: string;
          input: DesktopGitSaveIgnoreInput;
        };
        response: DesktopGitOperationResult;
      };
      initDesktopGitRepository: {
        params: {
          workspaceId: string;
        };
        response: DesktopGitOperationResult;
      };
      stageDesktopGitChanges: {
        params: {
          workspaceId: string;
          input: DesktopGitStageChangesInput;
        };
        response: DesktopGitOperationResult;
      };
      unstageDesktopGitChanges: {
        params: {
          workspaceId: string;
          input: DesktopGitUnstageChangesInput;
        };
        response: DesktopGitOperationResult;
      };
      discardDesktopGitChanges: {
        params: {
          workspaceId: string;
          input: DesktopGitDiscardChangesInput;
        };
        response: DesktopGitOperationResult;
      };
      commitDesktopGitChanges: {
        params: {
          workspaceId: string;
          input: DesktopGitCommitChangesInput;
        };
        response: DesktopGitOperationResult;
      };
      generateDesktopGitCommitMessage: {
        params: {
          workspaceId: string;
          query?: DesktopGitCommitMessageSuggestionsQuery;
        };
        response: DesktopGitCommitMessageSuggestionsResult;
      };
      createDesktopGitStash: {
        params: {
          workspaceId: string;
          input?: DesktopGitCreateStashInput;
        };
        response: DesktopGitOperationResult;
      };
      applyDesktopGitStash: {
        params: {
          workspaceId: string;
          input: DesktopGitStashRefInput;
        };
        response: DesktopGitOperationResult;
      };
      popDesktopGitStash: {
        params: {
          workspaceId: string;
          input: DesktopGitStashRefInput;
        };
        response: DesktopGitOperationResult;
      };
      dropDesktopGitStash: {
        params: {
          workspaceId: string;
          input: DesktopGitStashRefInput;
        };
        response: DesktopGitOperationResult;
      };
      createDesktopGitBranch: {
        params: {
          workspaceId: string;
          input: DesktopGitCreateBranchInput;
        };
        response: DesktopGitOperationResult;
      };
      createDesktopGitTag: {
        params: {
          workspaceId: string;
          input: DesktopGitCreateTagInput;
        };
        response: DesktopGitOperationResult;
      };
      checkoutDesktopGitBranch: {
        params: {
          workspaceId: string;
          input: DesktopGitCheckoutBranchInput;
        };
        response: DesktopGitOperationResult;
      };
      mergeDesktopGitBranchIntoCurrent: {
        params: {
          workspaceId: string;
          input: DesktopGitBranchNameInput;
        };
        response: DesktopGitOperationResult;
      };
      rebaseDesktopGitBranchIntoCurrent: {
        params: {
          workspaceId: string;
          input: DesktopGitBranchNameInput;
        };
        response: DesktopGitOperationResult;
      };
      renameDesktopGitBranch: {
        params: {
          workspaceId: string;
          input: DesktopGitRenameBranchInput;
        };
        response: DesktopGitOperationResult;
      };
      deleteDesktopGitBranch: {
        params: {
          workspaceId: string;
          input: DesktopGitDeleteBranchInput;
        };
        response: DesktopGitOperationResult;
      };
      fetchDesktopGitRemote: {
        params: {
          workspaceId: string;
        };
        response: DesktopGitOperationResult;
      };
      pullDesktopGitRemote: {
        params: {
          workspaceId: string;
        };
        response: DesktopGitOperationResult;
      };
      pushDesktopGitRemote: {
        params: {
          workspaceId: string;
          input?: DesktopGitPushRemoteInput;
        };
        response: DesktopGitOperationResult;
      };
      revertDesktopGitCommit: {
        params: {
          workspaceId: string;
          input: DesktopGitCommitHashInput;
        };
        response: DesktopGitOperationResult;
      };
      cherryPickDesktopGitCommit: {
        params: {
          workspaceId: string;
          input: DesktopGitCommitHashInput;
        };
        response: DesktopGitOperationResult;
      };
      resetDesktopGitCommit: {
        params: {
          workspaceId: string;
          input: DesktopGitResetCommitInput;
        };
        response: DesktopGitOperationResult;
      };
      stageDesktopGitHunks: {
        params: {
          workspaceId: string;
          input: DesktopGitHunkMutationInput;
        };
        response: DesktopGitOperationResult;
      };
      unstageDesktopGitHunks: {
        params: {
          workspaceId: string;
          input: DesktopGitHunkMutationInput;
        };
        response: DesktopGitOperationResult;
      };
      discardDesktopGitHunks: {
        params: {
          workspaceId: string;
          input: DesktopGitHunkMutationInput;
        };
        response: DesktopGitOperationResult;
      };
      listDesktopWorkspaces: {
        params: DesktopWorkspaceListQuery | undefined;
        response: DesktopWorkspaceListResponse;
      };
      listDesktopTaskWorkspaces: {
        params: undefined;
        response: DesktopTaskWorkspacesResponse;
      };
      listDesktopTaskCenter: {
        params: DesktopTaskCenterListQuery | undefined;
        response: DesktopTaskCenterListResponse;
      };
      listDesktopTasks: {
        params: DesktopTaskListQuery | undefined;
        response: DesktopTaskListResponse;
      };
      listDesktopTerminalSessions: {
        params: DesktopTerminalListQuery | undefined;
        response: DesktopTerminalSessionListResponse;
      };
      listDesktopMemoryUnits: {
        params: {
          workspaceId?: string;
          query?: DesktopMemoryListQuery;
        } | undefined;
        response: DesktopMemoryListResponse;
      };
      getDesktopMemoryProjection: {
        params: {
          workspaceId?: string;
          query?: DesktopMemoryProjectionQuery;
        } | undefined;
        response: DesktopMemoryProjection;
      };
      appendDesktopMemory: {
        params: {
          workspaceId?: string;
          input: DesktopMemoryAppendInput;
        };
        response: DesktopMemoryUnit;
      };
      patchDesktopMemoryUnit: {
        params: {
          workspaceId?: string;
          unitId: string;
          input: DesktopMemoryPatchInput;
        };
        response: DesktopMemoryUnit;
      };
      removeDesktopMemoryUnit: {
        params: {
          workspaceId?: string;
          unitId: string;
        };
        response: DesktopMemoryDeleteResponse;
      };
      searchDesktopMemory: {
        params: {
          workspaceId?: string;
          query: DesktopMemorySearchQuery;
        };
        response: DesktopMemorySearchResponse;
      };
      listDesktopMemoryTraces: {
        params: {
          workspaceId?: string;
          query?: DesktopMemoryTraceListQuery;
        } | undefined;
        response: {
          items: DesktopMemoryTrace[];
        };
      };
      getDesktopMemoryRuntimeContext: {
        params: {
          workspaceId?: string;
          query?: string;
        } | undefined;
        response: DesktopMemoryRuntimeContext;
      };
      previewDesktopMemoryMaintenance: {
        params: {
          workspaceId?: string;
          input?: DesktopMemoryMaintenanceRequest;
        } | undefined;
        response: DesktopMemoryMaintenancePreview;
      };
      applyDesktopMemoryMaintenance: {
        params: {
          workspaceId?: string;
          runId: string;
        };
        response: DesktopMemoryMaintenanceApply;
      };
      pullDesktopMemoryWorkingSet: {
        params: {
          workspaceId: string;
          query: DesktopMemoryWorkingSetPullQuery;
        };
        response: DesktopMemoryWorkingSetPullResult;
      };
      pushDesktopMemoryWorkingSet: {
        params: {
          workspaceId: string;
          input: DesktopMemoryWorkingSetPushInput;
        };
        response: DesktopMemoryWorkingSetPushResult;
      };
      getDesktopTask: {
        params: {
          workspaceId: string;
          taskId: string;
        };
        response: DesktopTaskRecord | null;
      };
      getDesktopTaskDetail: {
        params: DesktopTaskDetailQuery;
        response: DesktopTaskDetailResponse | null;
      };
      listDesktopTaskRuns: {
        params: DesktopTaskRunsListQuery;
        response: DesktopTaskRunsResponse | null;
      };
      runDesktopTaskNow: {
        params: DesktopTaskActionInput;
        response: DesktopTaskRecord | null;
      };
      cancelDesktopTask: {
        params: DesktopTaskActionInput;
        response: DesktopTaskRecord | null;
      };
      retryDesktopTask: {
        params: DesktopTaskActionInput;
        response: DesktopTaskRecord | null;
      };
      pauseDesktopTaskSchedule: {
        params: DesktopTaskActionInput;
        response: DesktopTaskRecord | null;
      };
      resumeDesktopTaskSchedule: {
        params: DesktopTaskActionInput;
        response: DesktopTaskRecord | null;
      };
      getDesktopTerminalDetail: {
        params: DesktopTerminalDetailQuery;
        response: DesktopTerminalSessionDetail | null;
      };
      createDesktopTerminalSession: {
        params: DesktopTerminalCreateInput;
        response: DesktopTerminalSessionRecord;
      };
      executeDesktopTerminalInput: {
        params: {
          sessionId: string;
          input: DesktopTerminalExecuteInput;
        };
        response: DesktopTerminalSessionRecord | null;
      };
      resizeDesktopTerminalSession: {
        params: {
          sessionId: string;
          input: DesktopTerminalResizeInput;
        };
        response: DesktopTerminalSessionRecord | null;
      };
      closeDesktopTerminalSession: {
        params: {
          sessionId: string;
        };
        response: DesktopTerminalCloseResponse;
      };
      getDesktopWorkspace: {
        params: {
          workspaceId: string;
        };
        response: DesktopWorkspaceItem | null;
      };
      createDesktopWorkspace: {
        params: DesktopWorkspaceCreateInput;
        response: DesktopWorkspaceCreateResponse;
      };
      updateDesktopWorkspace: {
        params: {
          workspaceId: string;
          input: DesktopWorkspaceUpdateInput;
        };
        response: DesktopWorkspaceItem | null;
      };
      removeDesktopWorkspace: {
        params: {
          workspaceId: string;
        };
        response: DesktopWorkspaceRemoveResponse;
      };
      listDesktopAgents: {
        params: AgentsListQuery | undefined;
        response: AgentsListResponse;
      };
      getDesktopAgent: {
        params: {
          agentId: string;
        };
        response: AgentItem | null;
      };
      getDesktopAgentBundle: {
        params: {
          agentId: string;
        };
        response: DesktopAgentBundleView;
      };
      createDesktopAgent: {
        params: import("./desktop-agents").AgentCreateInput;
        response: DesktopAgentCreateResponse;
      };
      updateDesktopAgent: {
        params: {
          agentId: string;
          input: import("./desktop-agents").AgentPatchInput;
        };
        response: AgentItem | null;
      };
      saveDesktopAgentBundle: {
        params: DesktopAgentBundleSaveInput;
        response: DesktopAgentBundleSaveResponse;
      };
      setDesktopAgentEnabled: {
        params: {
          agentId: string;
          enabled: boolean;
        };
        response: AgentItem | null;
      };
      removeDesktopAgent: {
        params: {
          agentId: string;
        };
        response: DesktopAgentDeleteResponse;
      };
      previewDesktopAgentImport: {
        params: OpencodeAgentImportInput;
        response: OpencodeAgentImportPreview;
      };
      importDesktopAgents: {
        params: OpencodeAgentImportInput;
        response: OpencodeAgentImportResult;
      };
      listDesktopModelProviders: {
        params: undefined;
        response: DesktopModelProviderListResponse;
      };
      listDesktopModelChannels: {
        params: DesktopModelChannelListQuery | undefined;
        response: DesktopModelChannelListResponse;
      };
      getDesktopModelsSnapshot: {
        params: undefined;
        response: DesktopModelsSnapshot;
      };
      getDesktopModelRuntimeSelectionSnapshot: {
        params: DesktopModelRuntimeSelectionQuery | undefined;
        response: DesktopModelRuntimeSelectionResponse;
      };
      listDesktopSkills: {
        params: DesktopSkillsListQuery | undefined;
        response: DesktopSkillsListResponse;
      };
      getDesktopSkill: {
        params: {
          skillId: string;
        };
        response: DesktopSkillItem | null;
      };
      discoverDesktopSkills: {
        params: {
          q?: string;
        } | undefined;
        response: DesktopSkillsDiscoveryResponse;
      };
      getDesktopSkillsEffective: {
        params: {
          workspaceId?: string;
          q?: string;
        };
        response: DesktopSkillsRuntimeEffectiveResult;
      };
      listDesktopSkillsMarketProviders: {
        params: undefined;
        response: DesktopSkillsMarketProviderListResponse;
      };
      searchDesktopSkillsMarket: {
        params: DesktopSkillsMarketSearchQuery | undefined;
        response: DesktopSkillsMarketSearchResponse;
      };
      installDesktopSkillMarket: {
        params: DesktopSkillsMarketInstallInput;
        response: DesktopSkillsMarketInstallResponse;
      };
      adoptDesktopSkill: {
        params: DesktopSkillsAdoptInput;
        response: DesktopSkillsAdoptResponse;
      };
      patchDesktopSkill: {
        params: {
          skillId: string;
          input: DesktopSkillsPatchInput;
        };
        response: DesktopSkillItem | null;
      };
      setDesktopSkillEnabled: {
        params: {
          skillId: string;
          enabled: boolean;
        };
        response: DesktopSkillItem | null;
      };
      removeDesktopSkill: {
        params: {
          skillId: string;
        };
        response: DesktopSkillsDeleteResponse;
      };
      listDesktopChannelModels: {
        params: {
          providerType: string;
          channelId: string;
        };
        response: DesktopModelChannelModelsResponse;
      };
      createDesktopModelChannel: {
        params: {
          providerType: string;
          input: DesktopModelCreateChannelInput;
        };
        response: DesktopModelCreateChannelResponse;
      };
      updateDesktopModelChannel: {
        params: {
          providerType: string;
          channelId: string;
          input: DesktopModelUpdateChannelInput;
        };
        response: DesktopModelChannelItem | null;
      };
      setDesktopModelChannelEnabled: {
        params: {
          providerType: string;
          channelId: string;
          enabled: boolean;
        };
        response: DesktopModelChannelItem | null;
      };
      removeDesktopModelChannel: {
        params: {
          providerType: string;
          channelId: string;
        };
        response: DesktopModelDeleteChannelResponse;
      };
      setDesktopChannelModelEnabled: {
        params: {
          providerType: string;
          channelId: string;
          modelId: string;
          enabled: boolean;
        };
        response: DesktopModelChannelStateItem | null;
      };
      batchSetDesktopChannelModelsEnabled: {
        params: {
          providerType: string;
          channelId: string;
          updates: DesktopModelBatchToggleInput[];
        };
        response: DesktopModelChannelModelsResponse;
      };
      discoverDesktopChannelModels: {
        params: {
          providerType: string;
          channelId: string;
        };
        response: DesktopModelDiscoveryResponse;
      };
      listDesktopMcp: {
        params: DesktopMcpListParams | undefined;
        response: DesktopMcpListResponse;
      };
      getDesktopMcpEffective: {
        params: {
          workspaceId: string;
          q?: string;
          status?: string;
        };
        response: DesktopMcpEffectiveResponse;
      };
      listDesktopMcpRecommended: {
        params: undefined;
        response: DesktopMcpRecommendedItem[];
      };
      createDesktopMcp: {
        params: DesktopMcpDraftInput;
        response: DesktopMcpCreateResponse;
      };
      patchDesktopMcp: {
        params: {
          mcpId: string;
          input: DesktopMcpDraftInput;
        };
        response: DesktopMcpView;
      };
      deleteDesktopMcp: {
        params: {
          mcpId: string;
        };
        response: DesktopMcpDeleteResponse;
      };
      testDesktopMcpConnection: {
        params: {
          mcpId: string;
        };
        response: DesktopMcpTestConnectionResult;
      };
      healthCheckDesktopMcp: {
        params: {
          mcpId: string;
        };
        response: DesktopMcpTestConnectionResult;
      };
      fetchDesktopMcpCapabilities: {
        params: {
          mcpId: string;
        };
        response: DesktopMcpCapabilityProbeResult;
      };
      listDesktopMcpHealthHistory: {
        params: {
          mcpId: string;
          limit?: number;
          offset?: number;
        };
        response: DesktopMcpHealthHistoryResponse;
      };
      getDesktopMcpRuntimeConfig: {
        params: {
          workspaceId?: string;
        } | undefined;
        response: DesktopMcpRuntimeConfig;
      };
      installDesktopMcpRecommended: {
        params: {
          id: string;
          input?: {
            scope?: string;
            workspaceId?: string;
          };
        };
        response: DesktopMcpCreateResponse;
      };
      listDesktopMcpMarketProviders: {
        params: undefined;
        response: DesktopMcpMarketProvidersResponse;
      };
      searchDesktopMcpMarket: {
        params: DesktopMcpMarketSearchQuery | undefined;
        response: DesktopMcpMarketSearchResponse;
      };
      searchDesktopMcpMarketByRequirement: {
        params: DesktopMcpMarketRequirementQuery | undefined;
        response: DesktopMcpMarketSearchByRequirementResponse;
      };
      installDesktopMcpMarket: {
        params: DesktopMcpMarketInstallInput;
        response: DesktopMcpMarketInstallResponse;
      };
      autoInstallDesktopMcpMarketByRequirement: {
        params: DesktopMcpMarketAutoInstallInput;
        response: DesktopMcpMarketAutoInstallResponse;
      };
    };
    messages: Record<never, never>;
  };
  webview: {
    requests: Record<never, never>;
    messages: {
      desktopConversationSessionDetailUpdated: DesktopConversationSessionDetailUpdateEvent;
      desktopConversationRuntimeEventsUpdated: DesktopConversationRuntimeEventsUpdateEvent;
    };
  };
};
