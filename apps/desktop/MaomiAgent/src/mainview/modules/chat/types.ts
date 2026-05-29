import type {
  DesktopConversationAttachmentKind,
  DesktopConversationSessionDetail,
  DesktopConversationSessionItem,
  DesktopConversationSessionStatus,
} from "../../../shared/desktop-conversation";
import type { ReactNode } from "react";
import type { DesktopWorkspaceItem } from "../../../shared/desktop-workspace";
import type { LanguageCode } from "../../config/titlebar";

export type ChatPageProps = {
  active: boolean;
  language: LanguageCode;
  revealTerminalToken?: number;
};

export type ChatSessionFilter = DesktopConversationSessionStatus | "all";

export type ChatActionErrorType =
  | "attachFiles"
  | "loadWorkspaces"
  | "loadSessions"
  | "loadSessionDetail"
  | "createSession"
  | "saveWorkspaceSettings"
  | "hideSession"
  | "sendMessage"
  | "replyInteraction";

export type ChatComposerModelOption = {
  value: string;
  label: string;
  channelId: string;
  modelId: string;
  providerType: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  disabled?: boolean;
  searchText: string;
};

export type ChatComposerSelectOptionGroup = {
  label: string;
  options: Array<{
    value: string;
    label: string;
    disabled?: boolean;
    searchText: string;
  }>;
};

export type ChatComposerAgentOption = {
  value: string;
  label: string;
  description?: string;
};

export type ChatComposerAttachment = {
  id: string;
  kind: DesktopConversationAttachmentKind;
  name: string;
  sizeBytes?: number;
  mimeType?: string;
  previewUrl?: string;
  dataBase64: string;
};

export type ChatWorkbenchDockKey =
  | "terminal"
  | "sidebar"
  | "secondary"
  | "settings"
  | "files"
  | "changes"
  | "git";

export type ChatWorkbenchPanelKey = "settings" | "files" | "changes" | "git";

export type ChatPreviewSource =
  | {
    kind: "message-code-block";
    tabId: string;
    language: LanguageCode;
    code: string;
    infoString?: string;
  }
  | {
    kind: "workspace-file";
    path: string;
    targetWorkspaceId?: string;
    requestId?: string;
  }
  | {
    kind: "feishu-doc";
    docId: string;
    path: string;
    fallbackPath?: string;
    targetWorkspaceId?: string;
    requestId?: string;
  };

export type ChatAttachedTabRequest = {
  kind: "preview";
  title: string;
  workspaceId?: string;
  source: ChatPreviewSource;
};

export type ChatAttachedTabState = ChatAttachedTabRequest & {
  key: string;
};

export type ChatPendingDraft = {
  id: string;
  text: string;
};

export type ChatConversationOpenRequest = {
  workspaceId?: string;
  sessionId?: string;
  createSession?: boolean;
  draftText?: string;
  attachedTabs?: ChatAttachedTabRequest[];
};

export type ChatConversationRailItem = {
  key: string;
  label: ReactNode;
  title?: string;
  taskLinked?: boolean;
  disabled?: boolean;
};

export type ChatWorkspaceShellState = {
  workspaceOptions: Array<{
    value: string;
    label: string;
    disabled?: boolean;
  }>;
  workspaceLoading: boolean;
  workspaceMutating: boolean;
  openedWorkspaces: Array<{
    workspaceId: string;
    label: string;
    title?: string;
    active: boolean;
    ready?: boolean;
    closable?: boolean;
  }>;
  onOpenWorkspace: (workspaceId: string) => void | Promise<void>;
  onActivateWorkspace: (workspaceId: string) => void | Promise<void>;
  onCloseWorkspace: (workspaceId: string) => void | Promise<void>;
  onCreateWorkspace: () => void | Promise<void>;
};

export type ChatOpenCodePreviewInput = {
  title: string;
  messageId?: string;
  code: string;
  infoString?: string;
};

export type ChatOpenWorkspaceFilePreviewInput = {
  workspaceId: string;
  path: string;
  targetWorkspaceId?: string;
  title?: string;
  requestId?: string;
};

export type ChatCopy = {
  pageTitle: string;
  pageDescription: string;
  workspaceLabel: string;
  workspacePlaceholder: string;
  searchPlaceholder: string;
  statusAll: string;
  statusIdle: string;
  statusActive: string;
  statusFailed: string;
  statusArchived: string;
  createSession: string;
  refresh: string;
  archiveSession: string;
  archiveSessionConfirm: string;
  openWorkspace: string;
  emptyWorkspaceTitle: string;
  emptyWorkspaceDescription: string;
  emptySessionTitle: string;
  emptySessionDescription: string;
  bridgeUnavailableTitle: string;
  bridgeUnavailableDescription: string;
  composerPlaceholder: string;
  composerModelPlaceholder: string;
  composerAgentPlaceholder: string;
  sendLabel: string;
  sessionStateLabel: string;
  sessionWorkspaceLabel: string;
  sessionCreatedAtLabel: string;
  sessionUpdatedAtLabel: string;
  runtimeNoticeTitle: string;
  runtimeNoticeDescription: string;
  sessionCount: (count: number) => string;
  statusLabel: (status: DesktopConversationSessionStatus) => string;
  loadWorkspacesFailed: string;
  loadSessionsFailed: string;
  loadSessionDetailFailed: string;
  createSessionFailed: string;
  saveWorkspaceSettingsFailed: string;
  hideSessionFailed: string;
  attachFilesFailed: string;
  sendMessageFailed: string;
  replyInteractionFailed: string;
  noWorkspaceName: string;
  noDirectoryPath: string;
};

export type ChatSessionRailItem = {
  item: DesktopConversationSessionItem;
  workspace?: DesktopWorkspaceItem;
};

export type ChatSelectedSessionView = Pick<DesktopConversationSessionItem, "sessionId" | "title" | "status" | "createdAt" | "updatedAt" | "metadata"> & {
  detail?: DesktopConversationSessionDetail;
};
