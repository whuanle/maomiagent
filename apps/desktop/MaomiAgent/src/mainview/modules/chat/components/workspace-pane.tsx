import {
  forwardRef,
  useImperativeHandle,
  useMemo,
} from "react";

import type { DesktopWorkspaceItem } from "../../../../shared/desktop-workspace";
import type { LanguageCode } from "../../../config/titlebar";
import { useChatWorkspacePaneState } from "../hooks/use-chat-workspace-pane-state";
import { useChatWorkbenchState } from "../hooks/use-chat-workbench-state";
import type {
  ChatActionErrorType,
  ChatAttachedTabRequest,
  ChatCopy,
  ChatConversationOpenRequest,
  ChatPendingDraft,
  ChatWorkspaceShellState,
} from "../types";
import { ConversationWorkspacePaneSurface } from "./conversation-workspace-pane-surface";
import { ConversationWorkspaceStage } from "./conversation-workspace-stage";
import { useConversationSessionRailItems } from "./use-conversation-session-rail-items";
import { ConversationWorkspaceWorkbench } from "./conversation-workspace-workbench";

type Props = {
  active: boolean;
  conversationActive?: boolean;
  language: LanguageCode;
  workspaceId: string;
  revealTerminalToken?: number;
  selectedWorkspace?: DesktopWorkspaceItem;
  workspaceShell: ChatWorkspaceShellState;
  copy: ChatCopy;
  bridgeAvailable: boolean;
  modelsBridgeAvailable: boolean;
  agentsBridgeAvailable: boolean;
  onError: (action: ChatActionErrorType, error: unknown) => void;
  onOpenWorkspace: () => void;
};

export type ConversationWorkspacePaneHandle = {
  openConversation: (input?: ChatConversationOpenRequest) => Promise<void>;
  activateSession: (sessionId: string) => void;
  applyDraftPrefill: (input: ChatPendingDraft) => void;
  openAttachedTab: (input: ChatAttachedTabRequest) => void;
};

export const ConversationWorkspacePane = forwardRef<ConversationWorkspacePaneHandle, Props>(function ConversationWorkspacePane(props, ref) {
  const state = useChatWorkspacePaneState({
    active: props.conversationActive ?? props.active,
    workspaceId: props.workspaceId,
    bridgeAvailable: props.bridgeAvailable,
    modelsBridgeAvailable: props.modelsBridgeAvailable,
    agentsBridgeAvailable: props.agentsBridgeAvailable,
    onError: props.onError,
  });
  const workbench = useChatWorkbenchState({
    language: props.language,
    workspaceId: props.workspaceId,
    revealTerminalToken: props.revealTerminalToken,
  });
  const selectedSession = useMemo(() => {
    if (!state.selectedSession) {
      return undefined;
    }

    return {
      ...state.selectedSession,
      detail: state.selectedSessionDetail,
    };
  }, [
    state.selectedSession,
    state.selectedSessionDetail,
  ]);
  const railItems = useConversationSessionRailItems({
    sessions: state.sessions,
    executionOverlays: state.executionOverlays,
    language: props.language,
    copy: props.copy,
    archivingSessionId: state.archivingSessionId,
    onHideSession: state.hideSession,
  });

  useImperativeHandle(ref, () => ({
    openConversation: async (input) => {
      const sessionId = input?.sessionId?.trim();
      if (sessionId) {
        state.activateSession(sessionId);
      } else if (input?.createSession) {
        const createdSession = await state.createSession({
          selectedAgentId: input.selectedAgentId,
        });
        if (!createdSession) {
          return;
        }

        state.setDraftMessage(input.draftText ?? "");
      }

      if (!input?.createSession && input?.draftText?.trim()) {
        state.setDraftMessage(input.draftText);
      }

      if (input?.attachedTabs?.length) {
        window.setTimeout(() => {
          for (const attachedTab of input.attachedTabs ?? []) {
            try {
              workbench.onOpenAttachedTab(attachedTab);
            } catch {
              // Keep session creation and draft prefill resilient even if an auxiliary preview request is malformed.
            }
          }
        }, 0);
      }
    },
    activateSession: state.activateSession,
    applyDraftPrefill: (input) => {
      state.setDraftMessage(input.text);
    },
    openAttachedTab: workbench.onOpenAttachedTab,
  }), [state.activateSession, state.createSession, state.setDraftMessage, workbench.onOpenAttachedTab]);

  return (
    <ConversationWorkspaceWorkbench
      active={props.active}
      language={props.language}
      workspaceId={props.workspaceId}
      selectedWorkspace={props.selectedWorkspace}
      selectedSession={selectedSession}
      activePanelKey={workbench.activePanelKey}
      rightPaneVisible={workbench.rightPaneVisible}
      mainPanelVisible={workbench.mainPanelVisible}
      secondaryPanelVisible={workbench.secondaryPanelVisible}
      terminalVisible={workbench.terminalVisible}
      activeAttachedTabKey={workbench.activeAttachedTabKey}
      paneSizes={workbench.paneSizes}
      extraTabs={workbench.attachedTabs}
      onMainSplitterResize={workbench.onMainSplitterResize}
      onTerminalSplitterResize={workbench.onTerminalSplitterResize}
      onMainPanelSelect={workbench.onSelectBuiltinPanel}
      onSecondaryPanelSelect={workbench.onSelectAttachedTab}
      onCloseMainPanel={workbench.onCloseMainPanel}
      onCloseSecondaryPanel={workbench.onCloseSecondaryPanel}
      onCloseAttachedTab={workbench.onCloseAttachedTab}
      onCloseAllAttachedTabs={workbench.onCloseAllAttachedTabs}
      onOpenWorkspaceFilePreview={workbench.onOpenWorkspaceFilePreview}
    >
      <ConversationWorkspacePaneSurface
        bridgeAvailable={props.bridgeAvailable}
        language={props.language}
        copy={props.copy}
        workspaceShell={props.workspaceShell}
        sessionsLoading={state.loadingSessions}
        conversations={railItems}
        activeSessionId={state.selectedSessionId}
        historySidebarVisible={workbench.historySidebarVisible}
        rightPaneVisible={workbench.rightPaneVisible}
        mainPanelVisible={workbench.mainPanelVisible}
        terminalVisible={workbench.terminalVisible}
        activePanelKey={workbench.activePanelKey}
        onDockAction={workbench.onDockAction}
        onToggleHistorySidebar={workbench.onToggleHistorySidebar}
        onCreateSession={() => {
          void state.createSession();
        }}
        onSelectSession={(sessionId) => {
          state.setSelectedSessionId(sessionId);
        }}
      >
        <ConversationWorkspaceStage
          active={props.active}
          bridgeAvailable={props.bridgeAvailable}
          loadingSessions={state.loadingSessions}
          loadingSessionDetail={state.loadingSessionDetail}
          modelsBridgeAvailable={props.modelsBridgeAvailable}
          activeSessionId={state.selectedSessionId}
          sessionSummaries={state.sessions}
          sessionDetailsById={state.sessionDetailsById}
          selectedWorkspace={props.selectedWorkspace}
          workspaceAvatarSettings={state.workspaceSettings}
          creatingSession={state.creatingSession}
          renamingSessionId={state.renamingSessionId}
          draftMessage={state.draftMessage}
          sendingMessage={state.sendingMessage}
          stoppingMessage={state.stoppingMessage}
          composerAgentOptions={state.composerAgentOptions}
          composerModelOptions={state.composerModelOptions}
          composerModelSelectOptions={state.composerModelSelectOptions}
          composerAttachments={state.composerAttachments}
          selectedComposerAgentId={state.selectedComposerAgentId}
          selectedComposerModelValue={state.selectedComposerModelValue}
          composerMode={state.composerMode}
          replyingInteractionId={state.replyingInteractionId}
          language={props.language}
          copy={props.copy}
          onCreateSession={() => {
            void state.createSession();
          }}
          onRenameSession={(sessionId, title) => state.renameSession(sessionId, title)}
          onOpenWorkspace={props.onOpenWorkspace}
          onDraftMessageChange={state.setDraftMessage}
          onComposerAttachFiles={state.attachComposerFiles}
          onComposerRemoveAttachment={state.removeComposerAttachment}
          onComposerAgentChange={state.setSelectedComposerAgentId}
          onComposerModelChange={state.setSelectedComposerModelValue}
          onComposerModeChange={state.setComposerMode}
          onSendMessage={() => {
            void state.sendMessage();
          }}
          onStopMessage={() => {
            void state.stopMessage();
          }}
          onAnswerInteraction={(interactionId, response) => {
            void state.answerInteraction(interactionId, response);
          }}
          onApproveInteraction={(interactionId, decision) => {
            void state.answerInteraction(interactionId, {
              kind: "permission",
              decision,
            });
          }}
          onRejectInteraction={(interactionId) => {
            void state.rejectInteraction(interactionId);
          }}
          onOpenCodePreview={workbench.onOpenCodePreview}
          onOpenWorkspaceFilePreview={workbench.onOpenWorkspaceFilePreview}
          onLoadFullSessionDetail={state.loadFullSessionDetail}
          onCollapseFullSessionDetail={state.collapseFullSessionDetail}
        />
      </ConversationWorkspacePaneSurface>
    </ConversationWorkspaceWorkbench>
  );
});

export default ConversationWorkspacePane;
