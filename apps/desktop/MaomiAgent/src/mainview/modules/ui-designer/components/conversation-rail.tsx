import {
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Empty,
  Select,
} from "antd";
import { UI_DESIGNER_AGENT_ID } from "../../../../shared/conversation/managed-execution";
import type { LanguageCode } from "../../../config/titlebar";
import type { ChatCopy, ChatSelectedSessionView } from "../../chat/types";
import { ChatConversationPane } from "../../chat/components/ChatConversationPane";

import type { UiDesignerShellState } from "../hooks/use-ui-designer-shell-state";

type ConversationRailProps = Pick<
  UiDesignerShellState,
  | "attachComposerFiles"
  | "bridgeAvailable"
  | "canSwitchWorkspace"
  | "creatingSession"
  | "composerAttachments"
  | "draftMessage"
  | "loadingSessionDetail"
  | "loadingSessions"
  | "loadingWorkspaces"
  | "modelsBridgeAvailable"
  | "composerModelOptions"
  | "composerModelSelectOptions"
  | "selectedComposerModelValue"
  | "selectedSession"
  | "selectedSessionDetail"
  | "sendingMessage"
  | "selectedWorkspace"
  | "workspaceId"
  | "workspaces"
  | "createSession"
  | "selectWorkspace"
  | "canResetConversation"
  | "resettingConversation"
  | "resetConversation"
  | "removeComposerAttachment"
  | "sendMessage"
  | "setSelectedComposerModelValue"
  | "setDraftMessage"
> & {
  language: LanguageCode;
};

function createUiDesignerChatCopy(language: LanguageCode): ChatCopy {
  if (language === "en-US") {
    return {
      pageTitle: "UI Designer",
      pageDescription: "Continue refining the current design package.",
      workspaceLabel: "Workspace",
      workspacePlaceholder: "Select workspace",
      searchPlaceholder: "Search sessions",
      statusAll: "All status",
      statusIdle: "Idle",
      statusActive: "Active",
      statusFailed: "Failed",
      statusArchived: "Archived",
      createSession: "Reset conversation",
      refresh: "Reset conversation",
      archiveSession: "Hide conversation",
      archiveSessionConfirm: "Hide this conversation?",
      openWorkspace: "Open workspace",
      emptyWorkspaceTitle: "No workspace",
      emptyWorkspaceDescription: "Select a workspace before continuing UI design.",
      emptySessionTitle: "No conversation yet",
      emptySessionDescription: "Conversation is being prepared.",
      bridgeUnavailableTitle: "Conversation bridge unavailable",
      bridgeUnavailableDescription: "UI designer chat is unavailable right now.",
      composerPlaceholder: "Continue with stack, theme, components, and layouts",
      composerModelPlaceholder: "Model",
      composerAgentPlaceholder: "Agent",
      sendLabel: "Send",
      sessionStateLabel: "Status",
      sessionWorkspaceLabel: "Workspace",
      sessionCreatedAtLabel: "Created",
      sessionUpdatedAtLabel: "Updated",
      runtimeNoticeTitle: "Start design",
      runtimeNoticeDescription: "Send the first message to continue this design package.",
      sessionCount: (count) => `${count} conversations`,
      statusLabel: (status) => status === "active"
        ? "Active"
        : status === "failed"
          ? "Failed"
          : status === "archived"
            ? "Archived"
            : "Idle",
      loadWorkspacesFailed: "Failed to load workspaces",
      loadSessionsFailed: "Failed to load conversations",
      loadSessionDetailFailed: "Failed to load conversation detail",
      createSessionFailed: "Failed to create conversation",
      renameSessionFailed: "Failed to rename conversation",
      saveWorkspaceSettingsFailed: "Failed to save workspace settings",
      hideSessionFailed: "Failed to hide conversation",
      attachFilesFailed: "Failed to prepare attachment",
      sendMessageFailed: "Failed to send message",
      replyInteractionFailed: "Failed to reply interaction",
      noWorkspaceName: "Unnamed workspace",
      noDirectoryPath: "No directory",
    };
  }

  return {
      pageTitle: "UI 设计师",
      pageDescription: "在当前工作区内持续完善设计方案。",
    workspaceLabel: "工作区",
    workspacePlaceholder: "选择工作区",
    searchPlaceholder: "搜索会话",
    statusAll: "全部状态",
    statusIdle: "空闲",
    statusActive: "进行中",
    statusFailed: "失败",
    statusArchived: "已归档",
      createSession: "重置对话",
      refresh: "重置对话",
    archiveSession: "隐藏会话",
    archiveSessionConfirm: "要隐藏这个对话吗？",
    openWorkspace: "前往工作区",
    emptyWorkspaceTitle: "还没有工作区",
    emptyWorkspaceDescription: "先选择工作区，再开始 UI 设计。",
      emptySessionTitle: "还没有对话",
      emptySessionDescription: "正在准备当前对话。",
    bridgeUnavailableTitle: "对话桥接不可用",
    bridgeUnavailableDescription: "当前窗口暂时无法继续 UI 设计对话。",
    composerPlaceholder: "继续完善技术栈、主题、组件和布局",
    composerModelPlaceholder: "模型",
    composerAgentPlaceholder: "智能体",
    sendLabel: "发送",
    sessionStateLabel: "状态",
    sessionWorkspaceLabel: "工作区",
    sessionCreatedAtLabel: "创建时间",
    sessionUpdatedAtLabel: "更新时间",
    runtimeNoticeTitle: "开始设计",
    runtimeNoticeDescription: "发送第一条消息后继续推进当前设计方案。",
    sessionCount: (count) => `共 ${count} 个对话`,
    statusLabel: (status) => status === "active"
      ? "进行中"
      : status === "failed"
        ? "失败"
        : status === "archived"
          ? "已归档"
          : "空闲",
    loadWorkspacesFailed: "加载工作区失败",
    loadSessionsFailed: "加载对话失败",
    loadSessionDetailFailed: "加载对话详情失败",
    createSessionFailed: "创建对话失败",
    renameSessionFailed: "重命名对话失败",
    saveWorkspaceSettingsFailed: "保存工作区设置失败",
    hideSessionFailed: "隐藏对话失败",
    attachFilesFailed: "准备附件失败",
    sendMessageFailed: "发送消息失败",
    replyInteractionFailed: "处理交互失败",
    noWorkspaceName: "未命名工作区",
    noDirectoryPath: "未设置目录",
  };
}

const FIXED_UI_DESIGNER_AGENT_OPTIONS = [{
  value: UI_DESIGNER_AGENT_ID,
  label: "UI 设计师",
  description: "固定使用内置 UI 设计师会话。",
}];

const NOOP = () => undefined;

export function ConversationRail(props: ConversationRailProps) {
  const selectedSessionView: ChatSelectedSessionView | undefined = props.selectedSession
    ? {
        ...props.selectedSession,
        detail: props.selectedSessionDetail ?? undefined,
      }
    : undefined;
  const copy = createUiDesignerChatCopy(props.language);

  return (
    <section className="ui-designer-pane ui-designer-pane-left" data-testid="ui-designer-left-pane">
      <div className="ui-designer-pane-header">
        <div className="ui-designer-pane-label">对话</div>
        <h2 className="ui-designer-pane-title">工作区与对话</h2>
      </div>

      <div className="ui-designer-toolbar">
        <Select
          className="ui-designer-workspace-select"
          size="large"
          placeholder="选择工作区"
          value={props.workspaceId}
          loading={props.loadingWorkspaces}
          disabled={!props.bridgeAvailable || !props.canSwitchWorkspace}
          options={props.workspaces.map((item) => ({
            label: item.name || item.workspaceId,
            value: item.workspaceId,
          }))}
          onChange={props.selectWorkspace}
        />
        <Button
          size="large"
          type="primary"
          icon={<ReloadOutlined />}
          loading={props.creatingSession || props.resettingConversation}
          disabled={!props.workspaceId || !props.canResetConversation}
          onClick={() => void props.resetConversation()}
        >
          重置对话
        </Button>
      </div>

      <div className="ui-designer-rail-body">
        <div className="ui-designer-thread ui-designer-thread-pane">
          {selectedSessionView
            ? (
                <ChatConversationPane
                  bridgeAvailable={props.bridgeAvailable}
                  loadingSessions={props.loadingSessions}
                  loadingSessionDetail={props.loadingSessionDetail}
                  modelsBridgeAvailable={props.modelsBridgeAvailable}
                  selectedWorkspace={props.selectedWorkspace}
                  selectedSession={selectedSessionView}
                  creatingSession={props.creatingSession}
                  renamingSessionId={null}
                  draftMessage={props.draftMessage}
                  sendingMessage={props.sendingMessage}
                  stoppingMessage={false}
                  composerAgentOptions={FIXED_UI_DESIGNER_AGENT_OPTIONS}
                  composerModelOptions={props.composerModelOptions}
                  composerModelSelectOptions={props.composerModelSelectOptions}
                  composerAttachments={props.composerAttachments}
                  selectedComposerAgentId={UI_DESIGNER_AGENT_ID}
                  selectedComposerModelValue={props.selectedComposerModelValue}
                  composerMode="agent"
                  replyingInteractionId={null}
                  language={props.language}
                  copy={copy}
                  onCreateSession={() => void props.createSession()}
                  onRenameSession={NOOP}
                  onOpenWorkspace={NOOP}
                  onDraftMessageChange={props.setDraftMessage}
                  onComposerAttachFiles={props.attachComposerFiles}
                  onComposerRemoveAttachment={props.removeComposerAttachment}
                  onComposerAgentChange={NOOP}
                  onComposerModelChange={props.setSelectedComposerModelValue}
                  onComposerModeChange={NOOP}
                  onSendMessage={() => void props.sendMessage()}
                  onStopMessage={NOOP}
                  onAnswerInteraction={NOOP}
                  onApproveInteraction={NOOP}
                  onRejectInteraction={NOOP}
                  onOpenCodePreview={NOOP}
                  onOpenWorkspaceFilePreview={NOOP}
                  allowRenameSession={false}
                  composerPresentation={{
                    showAttachmentButton: true,
                    showModeSwitch: false,
                    showModelSelect: true,
                    showAgentSelect: true,
                    disableAgentSelect: true,
                  }}
                />
              )
            : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="正在准备当前对话" />}
        </div>
      </div>
    </section>
  );
}
