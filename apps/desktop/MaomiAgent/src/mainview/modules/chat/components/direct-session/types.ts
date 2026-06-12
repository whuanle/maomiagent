import type {
  ConversationCheckpointEntry,
  ConversationInteractionEntry,
  ConversationMessageEntry,
} from "#maomiagent/kernel/src/host/application";

import type { DesktopWorkspaceItem } from "../../../../../shared/desktop-workspace";
import type { LanguageCode } from "../../../../config/titlebar";
import type {
  ChatComposerAttachment,
  ChatComposerAgentOption,
  ChatComposerModelOption,
  ChatSlashCommandOption,
  ChatComposerSelectOptionGroup,
  ChatCopy,
  ChatOpenCodePreviewInput,
  ChatOpenWorkspaceFilePreviewInput,
  ChatSelectedSessionView,
} from "../../types";
import type { DesktopConversationSessionItem } from "../../../../../shared/desktop-conversation";
import type { FrontEndProjectedConversationSessionPreviewWindow } from "./direct-session-session-detail-projection";

export type DirectSessionTone = "success" | "running" | "warning" | "error";

export type ConversationAvatarSettings = {
  assistantAvatarDataUrl?: string;
  userAvatarDataUrl?: string;
};

export type DirectConversationSessionPaneProps = {
  bridgeAvailable: boolean;
  loadingSessions: boolean;
  loadingSessionDetail: boolean;
  modelsBridgeAvailable: boolean;
  selectedWorkspace?: DesktopWorkspaceItem;
  workspaceAvatarSettings?: ConversationAvatarSettings;
  selectedSession?: ChatSelectedSessionView;
  sessionSummaries: DesktopConversationSessionItem[];
  creatingSession: boolean;
  renamingSessionId: string | null;
  draftMessage: string;
  sendingMessage: boolean;
  stoppingMessage: boolean;
  composerAgentOptions: ChatComposerAgentOption[];
  composerModelOptions: ChatComposerModelOption[];
  composerModelSelectOptions: ChatComposerSelectOptionGroup[];
  slashCommands?: ChatSlashCommandOption[];
  composerAttachments: ChatComposerAttachment[];
  selectedComposerAgentId?: string;
  selectedComposerModelValue?: string;
  composerMode: "agent" | "plan";
  replyingInteractionId: string | null;
  language: LanguageCode;
  copy: ChatCopy;
  onCreateSession: () => void;
  onRenameSession: (sessionId: string, title: string) => Promise<unknown> | unknown;
  onOpenWorkspace: () => void;
  onDraftMessageChange: (value: string) => void;
  onComposerAttachFiles: (files: File[]) => void;
  onComposerRemoveAttachment: (attachmentId: string) => void;
  onComposerAgentChange: (value: string | undefined) => void;
  onComposerModelChange: (value: string | undefined) => void;
  onComposerModeChange: (value: "agent" | "plan") => void;
  onSendMessage: (input?: { textOverride?: string }) => void;
  onStopMessage: () => void;
  onAnswerInteraction: (interactionId: string, response: unknown) => void;
  onApproveInteraction: (interactionId: string, decision: "approve_once" | "approve_always") => void;
  onRejectInteraction: (interactionId: string) => void;
  onOpenCodePreview: (input: ChatOpenCodePreviewInput) => void;
  onOpenWorkspaceFilePreview: (input: ChatOpenWorkspaceFilePreviewInput) => void;
  onLoadFullSessionDetail?: (sessionId: string) => void | Promise<void>;
  onCollapseFullSessionDetail?: (sessionId: string) => void | Promise<void>;
  renderStageShell?: boolean;
  allowRenameSession?: boolean;
  composerPresentation?: {
    showAttachmentButton?: boolean;
    showModeSwitch?: boolean;
    showModelSelect?: boolean;
    showAgentSelect?: boolean;
    disableAgentSelect?: boolean;
  };
};

export type DirectSessionHeaderViewModel = {
  ariaLabel: string;
  title: string;
  titleHint: string;
  editable: boolean;
  savingTitle: boolean;
  renamePlaceholder: string;
  renameActionLabel: string;
  onRename?: (title: string) => Promise<unknown> | unknown;
  statusLabel: string;
  statusTone: DirectSessionTone;
};

export type DirectSessionThreadViewModel = {
  sessionId?: string;
  paneWorkspaceId?: string;
  hasDetail: boolean;
  loading: boolean;
  loadingLabel: string;
  messages: ConversationMessageEntry[];
  checkpoints: ConversationCheckpointEntry[];
  previewWindow?: FrontEndProjectedConversationSessionPreviewWindow;
  latestMessageId?: string;
  sending: boolean;
  language: LanguageCode;
  workspaceAvatarSettings?: ConversationAvatarSettings;
  detailLoading?: boolean;
  onOpenCodePreview: (input: ChatOpenCodePreviewInput) => void;
  onOpenWorkspaceFilePreview?: (input: ChatOpenWorkspaceFilePreviewInput) => void;
  resolveMessageWorkspaceId?: (message: ConversationMessageEntry) => string | undefined;
  onDiscardWorkspaceChanges?: (paths: string[]) => Promise<void>;
  onLoadFullSessionDetail?: (sessionId: string) => void | Promise<void>;
  onCollapseFullSessionDetail?: (sessionId: string) => void | Promise<void>;
};

export type DirectSessionInteractionDockViewModel = {
  language: LanguageCode;
  workspaceId?: string;
  title: string;
  interactions: ConversationInteractionEntry[];
  replyingInteractionId: string | null;
  onAnswerInteraction: (interactionId: string, response: unknown) => void;
  onApproveInteraction: (interactionId: string, decision: "approve_once" | "approve_always") => void;
  onRejectInteraction: (interactionId: string) => void;
};

export type DirectSessionComposerViewModel = {
  language: LanguageCode;
  disabled: boolean;
  sending: boolean;
  stopping: boolean;
  sendDisabled: boolean;
  draft: string;
  placeholder: string;
  attachLabel: string;
  modelPlaceholder: string;
  agentPlaceholder: string;
  sendLabel: string;
  selectedModelValue?: string;
  selectedAgentId?: string;
  composerMode: "agent" | "plan";
  showAttachmentButton?: boolean;
  showModeSwitch?: boolean;
  showModelSelect?: boolean;
  showAgentSelect?: boolean;
  disableAgentSelect?: boolean;
  tokenBudgetUsage?: {
    percent: number;
    thresholdUsagePercent?: number;
    usedTokens: number;
    limitTokens: number;
    status: "normal" | "warning" | "critical";
    label: string;
    ariaLabel: string;
    thresholdPercent?: number;
    thresholdLabel?: string;
    detailLabel?: string;
  };
  contextCompressionStatus?: {
    tone: "info" | "warning" | "success" | "error";
    label: string;
    title: string;
  };
  modelOptions: ChatComposerModelOption[];
  modelSelectOptions: ChatComposerSelectOptionGroup[];
  agentOptions: ChatComposerAgentOption[];
  slashCommands?: ChatSlashCommandOption[];
  attachments: ChatComposerAttachment[];
  onDraftChange: (value: string) => void;
  onAttachFiles: (files: File[]) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onModelChange: (value: string | undefined) => void;
  onAgentChange: (value: string | undefined) => void;
  onModeChange: (value: "agent" | "plan") => void;
  onSubmit: (input?: { textOverride?: string }) => void;
  onStop: () => void;
};

export type DirectSessionPaneController = {
  session?: ChatSelectedSessionView;
  header: DirectSessionHeaderViewModel;
  thread: DirectSessionThreadViewModel;
  interactionDock: DirectSessionInteractionDockViewModel;
  composer: DirectSessionComposerViewModel;
};
