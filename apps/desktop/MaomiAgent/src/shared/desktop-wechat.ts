export const WECHAT_LOGIN_STATUS_VALUES = [
  "pending",
  "wait",
  "scanned",
  "confirmed",
  "expired",
  "failed",
] as const;

export const WECHAT_ACCOUNT_CONNECTION_STATUS_VALUES = [
  "offline",
  "connecting",
  "connected",
  "paused",
  "error",
] as const;

export const WECHAT_MESSAGE_STATUS_VALUES = [
  "pending",
  "completed",
  "failed",
  "ignored",
] as const;

export const WECHAT_MEDIA_ASSET_KIND_VALUES = [
  "image",
  "voice",
  "file",
  "video",
] as const;

export const WECHAT_CAPABILITY_STATUS_VALUES = [
  "available",
  "partial",
  "missing",
] as const;

export const WECHAT_CAPABILITY_KIND_VALUES = [
  "qr_login",
  "long_poll_updates",
  "formal_workspace_home",
  "session_progress_snapshot",
  "media_asset_index",
  "context_token_continuation",
  "message_item_text_send",
  "message_item_image_send",
  "message_item_video_send",
  "message_item_file_send",
  "inbound_media_materialization",
  "media_cdn_download",
  "media_cdn_upload",
  "quoted_message_projection",
  "quoted_media_fallback",
  "voice_transcode",
  "slash_command_handling",
  "debug_timing_trace",
  "delivery_error_notice",
  "vision_analysis",
  "multimodal_message_input",
] as const;

export const WECHAT_EXECUTION_WORKSPACE_MODE_VALUES = [
  "home",
  "default-linked",
  "auto",
] as const;

export const WECHAT_WORKSPACE_SWITCH_SCOPE_VALUES = [
  "all",
  "restricted",
] as const;

export type WechatLoginStatus = (typeof WECHAT_LOGIN_STATUS_VALUES)[number];
export type WechatAccountConnectionStatus =
  (typeof WECHAT_ACCOUNT_CONNECTION_STATUS_VALUES)[number];
export type WechatMessageStatus = (typeof WECHAT_MESSAGE_STATUS_VALUES)[number];
export type WechatMediaAssetKind = (typeof WECHAT_MEDIA_ASSET_KIND_VALUES)[number];
export type WechatCapabilityStatus = (typeof WECHAT_CAPABILITY_STATUS_VALUES)[number];
export type WechatCapabilityKind = (typeof WECHAT_CAPABILITY_KIND_VALUES)[number];
export type WechatExecutionWorkspaceMode =
  (typeof WECHAT_EXECUTION_WORKSPACE_MODE_VALUES)[number];
export type WechatWorkspaceSwitchScope =
  (typeof WECHAT_WORKSPACE_SWITCH_SCOPE_VALUES)[number];

export type WechatCapabilityDescriptorView = {
  kind: WechatCapabilityKind;
  status: WechatCapabilityStatus;
  title: string;
  description: string;
  surfaces: string[];
  notes?: string[];
};

export type WechatCapabilityCatalogView = {
  alignment: "openclaw-weixin";
  transportMode: "long-poll";
  mediaWorkspaceRelativeDir: string;
  descriptors: WechatCapabilityDescriptorView[];
};

export type WechatMediaAssetView = {
  kind: WechatMediaAssetKind;
  path: string;
  mimeType?: string;
  fileName?: string;
  sizeBytes: number;
};

export type WechatProcessedMessageView = {
  accountId: string;
  peerId: string;
  messageId: string;
  conversationKey: string;
  status: WechatMessageStatus;
  queryPreview?: string;
  responsePreview?: string;
  mediaAssets?: WechatMediaAssetView[];
  createdAt: string;
  updatedAt: string;
};

export type WechatConversationBindingView = {
  key: string;
  accountId: string;
  peerId: string;
  homeWorkspaceId?: string;
  workspaceId: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  lastMessageId?: string;
  lastInboundPreview?: string;
  lastContextToken?: string;
};

export type WechatConversationRuntimeContextView = {
  sessionId: string;
  workspaceId: string;
  accountId: string;
  peerId: string;
  bindingKey: string;
  homeWorkspaceId?: string;
  lastContextToken?: string;
  pendingMessageCount: number;
  recentMessages: WechatProcessedMessageView[];
};

export type WechatConversationTextSendInput = {
  sessionId: string;
  text: string;
  contextToken?: string;
};

export type WechatConversationTextSendResult = {
  clientId?: string;
  contextToken?: string;
};

export type WechatConversationMediaSendInput = {
  sessionId: string;
  filePath: string;
  caption?: string;
  contextToken?: string;
};

export type WechatConversationMediaSendResult = {
  clientId: string;
  kind: WechatMediaAssetKind;
  fileName: string;
  mimeType: string;
  contextToken?: string;
};

export type WechatModuleConfigView = {
  baseUrl: string;
  cdnBaseUrl: string;
  routeTag?: string;
  selectedWorkspaceId?: string;
  executionWorkspaceMode?: WechatExecutionWorkspaceMode;
  defaultExecutionWorkspaceId?: string;
  allowWorkspaceSwitch?: boolean;
  workspaceSwitchScope?: WechatWorkspaceSwitchScope;
  allowedExecutionWorkspaceIds?: string[];
  selectedChannelId?: string;
  selectedModelId?: string;
  debugAccountIds?: string[];
};

export type WechatAccountView = {
  accountId: string;
  userId?: string;
  enabled: boolean;
  configured: boolean;
  running: boolean;
  connectionStatus: WechatAccountConnectionStatus;
  transportMode: "long-poll";
  baseUrl: string;
  cdnBaseUrl: string;
  savedAt?: string;
  updatedAt: string;
  lastInboundAt?: string;
  lastOutboundAt?: string;
  lastError?: string;
  pausedUntil?: string;
  bindingCount: number;
  processedMessageCount: number;
};

export type WechatLoginSessionView = {
  sessionKey: string;
  accountId?: string;
  status: WechatLoginStatus;
  qrcodeUrl?: string;
  message: string;
  startedAt: string;
  expiresAt: string;
  updatedAt: string;
};

export type WechatStateView = {
  transportMode: "long-poll";
  config: WechatModuleConfigView;
  catalog: WechatCapabilityCatalogView;
  accounts: WechatAccountView[];
  bindings: WechatConversationBindingView[];
  processedMessages: WechatProcessedMessageView[];
  loginSessions: WechatLoginSessionView[];
  stats: {
    accountCount: number;
    activeAccountCount: number;
    bindingCount: number;
    processedMessageCount: number;
  };
  updatedAt: string;
};

export type WechatConfigInput = {
  baseUrl?: string;
  cdnBaseUrl?: string;
  routeTag?: string;
  selectedWorkspaceId?: string;
  executionWorkspaceMode?: WechatExecutionWorkspaceMode;
  defaultExecutionWorkspaceId?: string;
  allowWorkspaceSwitch?: boolean;
  workspaceSwitchScope?: WechatWorkspaceSwitchScope;
  allowedExecutionWorkspaceIds?: string[];
  selectedChannelId?: string;
  selectedModelId?: string;
  debugAccountIds?: string[];
};

export type WechatQrLoginStartInput = {
  accountId?: string;
  force?: boolean;
};

export type WechatQrLoginStartResult = {
  sessionKey: string;
  message: string;
  item: WechatLoginSessionView;
};

export type WechatQrLoginPollInput = {
  sessionKey: string;
};

export type WechatQrLoginPollResult = {
  connected: boolean;
  message: string;
  accountId?: string;
  item: WechatLoginSessionView;
  state: WechatStateView;
};

export type WechatAccountStatusInput = {
  enabled: boolean;
};
