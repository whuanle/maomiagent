import { App, Button, Empty } from "antd";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  closeWorkspaceTabState,
  openWorkspaceTab,
  readWorkspaceTabsState,
  resolveVisibleWorkspaceId,
  resolveWorkspaceRefreshState,
  shouldReconcileWorkspaceTabsState,
  writeWorkspaceTabsState,
  type WorkspaceTabsState,
} from "./components/chat-workspace-shell-state";
import { resolveWorkspacePaneActivity } from "./components/workspace-pane-activity";
import { ConversationWorkspacePane } from "./components/workspace-pane";
import { useChatPageShellState } from "./hooks/use-chat-page-shell-state";
import { useChatWorkspacePaneBridge } from "./hooks/use-chat-workspace-pane-bridge";
import type {
  ChatActionErrorType,
  ChatAttachedTabRequest,
  ChatConversationOpenRequest,
  ChatCopy,
  ChatPageProps,
  ChatWorkspaceShellState,
} from "./types";
import "./chat-page.css";

function areListsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function resolveMountedChatWorkspaces(input: {
  openedWorkspaces: ChatWorkspaceShellState["openedWorkspaces"];
  visibleWorkspaceId: string;
}) {
  const visibleWorkspace = input.openedWorkspaces.find((item) => item.workspaceId === input.visibleWorkspaceId)
    ?? input.openedWorkspaces[0]
    ?? null;
  const readyItems = input.openedWorkspaces.filter((item) => item.ready);

  if (!visibleWorkspace) {
    return readyItems;
  }

  if (readyItems.some((item) => item.workspaceId === visibleWorkspace.workspaceId)) {
    return readyItems;
  }

  return [visibleWorkspace, ...readyItems];
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function createChatCopy(language: ChatPageProps["language"]): ChatCopy {
  if (language === "en-US") {
    return {
      pageTitle: "Chat",
      pageDescription: "Select a workspace and continue the current task.",
      workspaceLabel: "Workspace",
      workspacePlaceholder: "Select workspace",
      searchPlaceholder: "Search sessions",
      statusAll: "All status",
      statusIdle: "Idle",
      statusActive: "Active",
      statusFailed: "Failed",
      statusArchived: "Archived",
      createSession: "New session",
      refresh: "Refresh",
      archiveSession: "Hide session",
      archiveSessionConfirm: "Hide this session from the history list?",
      openWorkspace: "Open workspace",
      emptyWorkspaceTitle: "No workspace available",
      emptyWorkspaceDescription: "Create a workspace first, then start a desktop-native conversation session.",
      emptySessionTitle: "No session yet",
      emptySessionDescription: "Create a session, then send the first message.",
      bridgeUnavailableTitle: "Conversation bridge unavailable",
      bridgeUnavailableDescription: "Chat is unavailable in this window right now.",
      composerPlaceholder: "Send a message to MaomiAgent, or describe the task you want to complete...",
      composerModelPlaceholder: "Model",
      composerAgentPlaceholder: "Agent",
      sendLabel: "Send",
      sessionStateLabel: "Status",
      sessionWorkspaceLabel: "Workspace",
      sessionCreatedAtLabel: "Created",
      sessionUpdatedAtLabel: "Updated",
      runtimeNoticeTitle: "Start the conversation",
      runtimeNoticeDescription: "Send the first message to run the selected desktop model.",
      sessionCount: (count) => `${count} sessions`,
      statusLabel: (status) => {
        if (status === "active") {
          return "Active";
        }
        if (status === "failed") {
          return "Failed";
        }
        if (status === "archived") {
          return "Archived";
        }
        return "Idle";
      },
      loadWorkspacesFailed: "Failed to load workspaces",
      loadSessionsFailed: "Failed to load sessions",
      loadSessionDetailFailed: "Failed to load session detail",
      createSessionFailed: "Failed to create session",
      renameSessionFailed: "Failed to rename session",
      saveWorkspaceSettingsFailed: "Failed to save workspace settings",
      hideSessionFailed: "Failed to hide session",
      attachFilesFailed: "Failed to prepare attachment",
      sendMessageFailed: "Failed to send message",
      replyInteractionFailed: "Failed to respond to approval",
      noWorkspaceName: "Unnamed workspace",
      noDirectoryPath: "No directory",
    };
  }

  return {
    pageTitle: "聊天",
    pageDescription: "选择工作区并继续当前任务。",
    workspaceLabel: "工作区",
    workspacePlaceholder: "选择工作区",
    searchPlaceholder: "搜索会话",
    statusAll: "全部状态",
    statusIdle: "空闲",
    statusActive: "进行中",
    statusFailed: "失败",
    statusArchived: "已归档",
    createSession: "新建会话",
    refresh: "刷新",
    archiveSession: "隐藏会话",
    archiveSessionConfirm: "要把这个会话从历史列表里隐藏吗？",
    openWorkspace: "前往工作区",
    emptyWorkspaceTitle: "还没有工作区",
    emptyWorkspaceDescription: "先创建工作区，再开始桌面原生会话。",
    emptySessionTitle: "还没有会话",
    emptySessionDescription: "先创建会话，再发送第一条消息。",
    bridgeUnavailableTitle: "对话桥接暂不可用",
    bridgeUnavailableDescription: "当前窗口暂时无法开始对话。",
    composerPlaceholder: "给 MaomiAgent 发送消息，或直接描述你要完成的任务...",
    composerModelPlaceholder: "模型",
    composerAgentPlaceholder: "智能体",
    sendLabel: "发送",
    sessionStateLabel: "状态",
    sessionWorkspaceLabel: "工作区",
    sessionCreatedAtLabel: "创建时间",
    sessionUpdatedAtLabel: "更新时间",
    runtimeNoticeTitle: "开始对话",
    runtimeNoticeDescription: "发送第一条消息，启动当前选择的桌面模型。",
    sessionCount: (count) => `共 ${count} 个会话`,
    statusLabel: (status) => {
      if (status === "active") {
        return "进行中";
      }
      if (status === "failed") {
        return "失败";
      }
      if (status === "archived") {
        return "已归档";
      }
      return "空闲";
    },
    loadWorkspacesFailed: "加载工作区失败",
    loadSessionsFailed: "加载会话失败",
    loadSessionDetailFailed: "加载会话详情失败",
    createSessionFailed: "创建会话失败",
    renameSessionFailed: "重命名会话失败",
    saveWorkspaceSettingsFailed: "保存工作区设置失败",
    hideSessionFailed: "隐藏会话失败",
    attachFilesFailed: "准备附件失败",
    sendMessageFailed: "发送消息失败",
    replyInteractionFailed: "处理审批失败",
    noWorkspaceName: "未命名工作区",
    noDirectoryPath: "未设置目录",
  };
}

function notifyActionError(
  action: ChatActionErrorType,
  error: unknown,
  copy: ChatCopy,
  message: ReturnType<typeof App.useApp>["message"],
) {
  const prefix = action === "loadWorkspaces"
    ? copy.loadWorkspacesFailed
    : action === "attachFiles"
      ? copy.attachFilesFailed
    : action === "loadSessions"
      ? copy.loadSessionsFailed
      : action === "loadSessionDetail"
        ? copy.loadSessionDetailFailed
        : action === "createSession"
          ? copy.createSessionFailed
          : action === "renameSession"
            ? copy.renameSessionFailed
          : action === "saveWorkspaceSettings"
            ? copy.saveWorkspaceSettingsFailed
            : action === "hideSession"
              ? copy.hideSessionFailed
              : action === "sendMessage"
                ? copy.sendMessageFailed
                : copy.replyInteractionFailed;
  message.error(`${prefix}: ${getErrorMessage(error)}`);
}

export type ChatPageHandle = {
  openConversation: (input?: ChatConversationOpenRequest) => void;
  openAttachedTab: (input: ChatAttachedTabRequest) => void;
};

export const ChatPage = forwardRef<ChatPageHandle, ChatPageProps>(function ChatPage(props, ref) {
  const { message } = App.useApp();
  const copy = useMemo(() => createChatCopy(props.language), [props.language]);
  const initialWorkspaceTabsStateRef = useRef(readWorkspaceTabsState());
  const activeWorkspaceIdRef = useRef(initialWorkspaceTabsStateRef.current.activeWorkspaceId ?? "");
  const openWorkspaceIdsRef = useRef(initialWorkspaceTabsStateRef.current.openWorkspaceIds);
  const [workspaceTabsState, setWorkspaceTabsState] = useState<WorkspaceTabsState>(
    () => initialWorkspaceTabsStateRef.current,
  );

  const handleError = useCallback((
    action: ChatActionErrorType,
    error: unknown,
  ) => {
    notifyActionError(action, error, copy, message);
  }, [copy, message]);

  const shellState = useChatPageShellState({
    active: props.active,
    initialWorkspaceId: initialWorkspaceTabsStateRef.current.activeWorkspaceId,
    onError: handleError,
  });

  useEffect(() => {
    if (!shouldReconcileWorkspaceTabsState({
      workspaceListHydrated: shellState.workspaceListHydrated,
      state: workspaceTabsState,
    })) {
      return;
    }

    const nextWorkspaceTabsState = resolveWorkspaceRefreshState({
      items: shellState.workspaces,
      runtimeActiveWorkspaceId: shellState.workspaceId,
      openWorkspaceIds: workspaceTabsState.openWorkspaceIds,
      activeWorkspaceId: workspaceTabsState.activeWorkspaceId,
    });

    setWorkspaceTabsState((current) => {
      const sameOpenWorkspaceIds = areListsEqual(current.openWorkspaceIds, nextWorkspaceTabsState.openWorkspaceIds);
      if (sameOpenWorkspaceIds && current.activeWorkspaceId === nextWorkspaceTabsState.activeWorkspaceId) {
        return current;
      }

      return nextWorkspaceTabsState;
    });

    if (nextWorkspaceTabsState.activeWorkspaceId !== shellState.workspaceId) {
      shellState.setWorkspaceId(nextWorkspaceTabsState.activeWorkspaceId);
    }
  }, [
    shellState.setWorkspaceId,
    shellState.workspaceId,
    shellState.workspaceListHydrated,
    shellState.workspaces,
    workspaceTabsState,
  ]);

  useEffect(() => {
    writeWorkspaceTabsState(workspaceTabsState);
  }, [workspaceTabsState]);

  const handleOpenWorkspace = useCallback(() => {
    window.location.hash = "workspace";
  }, []);

  const handleSelectWorkspace = useCallback((workspaceId: string) => {
    const nextWorkspaceId = workspaceId.trim();
    if (!nextWorkspaceId) {
      return;
    }

    setWorkspaceTabsState((current) => ({
      openWorkspaceIds: openWorkspaceTab(current.openWorkspaceIds, nextWorkspaceId),
      activeWorkspaceId: nextWorkspaceId,
    }));
    shellState.setWorkspaceId(nextWorkspaceId);
  }, [shellState.setWorkspaceId]);

  activeWorkspaceIdRef.current = workspaceTabsState.activeWorkspaceId ?? shellState.workspaceId ?? "";
  openWorkspaceIdsRef.current = workspaceTabsState.openWorkspaceIds;

  const workspacePaneBridge = useChatWorkspacePaneBridge({
    workspaceItems: shellState.workspaces,
    activeWorkspaceIdRef,
    openWorkspaceIdsRef,
    activateWorkspaceTab: handleSelectWorkspace,
  });

  useImperativeHandle(ref, () => ({
    openConversation: workspacePaneBridge.handleOpenConversation,
    openAttachedTab: workspacePaneBridge.handleOpenAttachedTab,
  }), [workspacePaneBridge.handleOpenAttachedTab, workspacePaneBridge.handleOpenConversation]);

  const handleCloseWorkspace = useCallback((workspaceId: string) => {
    setWorkspaceTabsState((current) => {
      const nextWorkspaceTabsState = closeWorkspaceTabState({
        openWorkspaceIds: current.openWorkspaceIds,
        activeWorkspaceId: current.activeWorkspaceId,
        workspaceId,
      });

      if (workspaceId === shellState.workspaceId) {
        shellState.setWorkspaceId(nextWorkspaceTabsState.activeWorkspaceId);
      }

      workspacePaneBridge.clearWorkspacePaneState(workspaceId);

      return nextWorkspaceTabsState;
    });
  }, [shellState.setWorkspaceId, shellState.workspaceId, workspacePaneBridge]);

  const workspaceShell = useMemo<ChatWorkspaceShellState>(() => ({
    workspaceOptions: shellState.workspaces.map((item) => ({
      value: item.workspaceId,
      label: item.name || item.workspaceId,
    })),
    workspaceLoading: shellState.loadingWorkspaces,
    workspaceMutating: false,
    openedWorkspaces: workspaceTabsState.openWorkspaceIds.map((workspaceId) => {
      const item = shellState.workspaces.find((candidate) => candidate.workspaceId === workspaceId);
      return {
        workspaceId,
        label: item?.name || workspaceId,
        title: item?.directoryPath,
        active: workspaceId === (workspaceTabsState.activeWorkspaceId ?? shellState.workspaceId),
        ready: true,
        closable: workspaceTabsState.openWorkspaceIds.length > 1,
      };
    }),
    onOpenWorkspace: handleSelectWorkspace,
    onActivateWorkspace: handleSelectWorkspace,
    onCloseWorkspace: handleCloseWorkspace,
  }), [
    handleCloseWorkspace,
    handleOpenWorkspace,
    handleSelectWorkspace,
    shellState.loadingWorkspaces,
    shellState.workspaceId,
    shellState.workspaces,
    workspaceTabsState.activeWorkspaceId,
    workspaceTabsState.openWorkspaceIds,
  ]);
  const visibleWorkspaceId = resolveVisibleWorkspaceId({
    activeWorkspaceId: workspaceTabsState.activeWorkspaceId ?? shellState.workspaceId,
    openWorkspaceIds: workspaceTabsState.openWorkspaceIds,
  });
  const mountedWorkspaces = useMemo(() => resolveMountedChatWorkspaces({
    openedWorkspaces: workspaceShell.openedWorkspaces,
    visibleWorkspaceId,
  }), [visibleWorkspaceId, workspaceShell.openedWorkspaces]);

  return (
    <section className="chat-page-root">
      <div className="chat-workspace-tabs-root">
        {mountedWorkspaces.length > 0
          ? mountedWorkspaces.map((openedWorkspace) => {
            const activity = resolveWorkspacePaneActivity({
              pageActive: props.active,
              workspaceId: openedWorkspace.workspaceId,
              visibleWorkspaceId,
            });
            const selectedWorkspace = shellState.workspaces.find((item) => item.workspaceId === openedWorkspace.workspaceId);

            return (
              <div
                key={openedWorkspace.workspaceId}
                className="chat-workbench-host"
                data-active={activity.isVisible ? "true" : "false"}
              >
                <ConversationWorkspacePane
                  ref={(instance) => {
                    workspacePaneBridge.registerWorkspacePaneRef(openedWorkspace.workspaceId, instance);
                  }}
                  active={activity.viewActive}
                  conversationActive={activity.conversationActive}
                  language={props.language}
                  workspaceId={openedWorkspace.workspaceId}
                  revealTerminalToken={openedWorkspace.workspaceId === visibleWorkspaceId
                    ? props.revealTerminalToken
                    : undefined}
                  selectedWorkspace={selectedWorkspace}
                  workspaceShell={workspaceShell}
                  copy={copy}
                  bridgeAvailable={shellState.bridgeAvailable}
                  modelsBridgeAvailable={shellState.modelsBridgeAvailable}
                  agentsBridgeAvailable={shellState.agentsBridgeAvailable}
                  onError={handleError}
                  onOpenWorkspace={handleOpenWorkspace}
                />
              </div>
            );
          })
          : (
            <div className="chat-workbench-host" data-active="true">
              <section className="chat-stage">
                <div className="chat-stage-body">
                  <div className="chat-workspace-pane-empty-state">
                    <Empty description={copy.emptyWorkspaceDescription} image={Empty.PRESENTED_IMAGE_SIMPLE}>
                      <Button type="primary" onClick={handleOpenWorkspace}>{copy.openWorkspace}</Button>
                    </Empty>
                  </div>
                </div>
              </section>
            </div>
          )}
      </div>
    </section>
  );
});
