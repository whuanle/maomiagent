export const FEISHU_MODE_VALUES = ["none", "personal", "developer"] as const
export const FEISHU_DEVELOPER_AUTH_STATUS_VALUES = [
  "idle",
  "pending",
  "authorized",
  "expired",
  "error",
] as const
export const FEISHU_SMART_ASSISTANT_DOMAIN_KEY_VALUES = [
  "docs",
  "calendar",
  "messenger",
  "drive",
  "base",
  "sheets",
  "tasks",
  "wiki",
  "contact",
  "mail",
  "meetings",
] as const
export const FEISHU_SMART_ASSISTANT_DOMAIN_STATUS_VALUES = [
  "ready",
  "planned",
] as const
export const FEISHU_SMART_ASSISTANT_ACTION_STATUS_VALUES = [
  "ready",
  "planned",
] as const
export const FEISHU_SMART_ASSISTANT_DOMAIN_MOUNT_STRATEGY_VALUES = [
  "always_control_plane",
  "lazy_mcp",
  "registry_only",
] as const
export const FEISHU_SMART_ASSISTANT_ACTION_TRANSPORT_VALUES = [
  "control_plane",
  "remote_mcp",
  "openapi_sdk",
  "builtin_runtime",
] as const
export const FEISHU_SMART_ASSISTANT_CREDENTIAL_KIND_VALUES = [
  "user_access_token",
  "tenant_access_token",
  "app_access_token",
  "mixed",
] as const
export const FEISHU_SMART_ASSISTANT_ACTION_RISK_LEVEL_VALUES = [
  "low",
  "medium",
  "high",
] as const
export const FEISHU_CONNECTION_PROFILE_KIND_VALUES = [
  "personal_docs_mcp",
  "developer_oauth",
] as const
export const FEISHU_DOCS_ACCESS_KIND_VALUES = [
  "personal_mcp",
  "developer_oauth",
] as const
export const FEISHU_SMART_ASSISTANT_CONTEXT_KIND_VALUES = [
  "workspace",
  "resource_anchor",
  "session_anchor",
  "query_only",
] as const
export const FEISHU_SMART_ASSISTANT_WORKBENCH_KIND_VALUES = [
  "docs_workspace",
  "calendar_board",
  "drive_explorer",
  "base_workspace",
  "sheets_workspace",
  "task_board",
  "wiki_workspace",
  "mail_inbox",
  "meeting_hub",
  "contact_search",
  "message_thread",
  "none",
] as const
export const FEISHU_SMART_ASSISTANT_CONTEXT_FIELD_VALUE_KIND_VALUES = [
  "workspace_id",
  "resource_id",
  "query",
  "datetime",
  "user_id",
  "session_id",
] as const
export const FEISHU_USER_ID_TYPE_VALUES = [
  "open_id",
  "union_id",
  "user_id",
] as const
export const FEISHU_SMART_ASSISTANT_POLICY_KEY_VALUES = [
  "control_plane",
  "domain_mounting",
  "action_execution",
  "credential_proxy",
] as const
export const FEISHU_BOT_CONNECTION_STATUS_VALUES = [
  "disconnected",
  "connecting",
  "connected",
  "processing",
  "error",
] as const
export const FEISHU_BOT_MEDIA_ASSET_KIND_VALUES = [
  "image",
  "file",
] as const
export const FEISHU_BOT_EVENT_STATUS_VALUES = [
  "received",
  "queued",
  "duplicate",
  "ignored",
  "planned",
  "processed",
  "failed",
] as const
export const FEISHU_BOT_CAPABILITY_STATUS_VALUES = [
  "available",
  "partial",
  "missing",
] as const
export const FEISHU_BOT_CAPABILITY_KIND_VALUES = [
  "persistent_connection",
  "event_receive",
  "formal_workspace_home",
  "conversation_binding",
  "session_progress_snapshot",
  "thread_routing",
  "duplicate_message_suppression",
  "text_message_projection",
  "text_reply_send",
  "app_access_token_resolution",
  "media_message_receive",
  "action_query_execute",
  "action_mutation_plan_confirm",
  "media_message_send",
  "image_message_send",
  "file_message_send",
  "rich_message_send",
] as const
export const FEISHU_BOT_EXECUTION_WORKSPACE_MODE_VALUES = [
  "home",
  "default-linked",
  "auto",
] as const
export const FEISHU_BOT_WORKSPACE_SWITCH_SCOPE_VALUES = [
  "all",
  "restricted",
] as const

export type FeishuMode = (typeof FEISHU_MODE_VALUES)[number]
export type FeishuDeveloperAuthStatus = (typeof FEISHU_DEVELOPER_AUTH_STATUS_VALUES)[number]
export type FeishuSmartAssistantDomainKey =
  (typeof FEISHU_SMART_ASSISTANT_DOMAIN_KEY_VALUES)[number]
export type FeishuSmartAssistantDomainStatus =
  (typeof FEISHU_SMART_ASSISTANT_DOMAIN_STATUS_VALUES)[number]
export type FeishuSmartAssistantActionStatus =
  (typeof FEISHU_SMART_ASSISTANT_ACTION_STATUS_VALUES)[number]
export type FeishuSmartAssistantDomainMountStrategy =
  (typeof FEISHU_SMART_ASSISTANT_DOMAIN_MOUNT_STRATEGY_VALUES)[number]
export type FeishuSmartAssistantActionTransport =
  (typeof FEISHU_SMART_ASSISTANT_ACTION_TRANSPORT_VALUES)[number]
export type FeishuSmartAssistantCredentialKind =
  (typeof FEISHU_SMART_ASSISTANT_CREDENTIAL_KIND_VALUES)[number]
export type FeishuSmartAssistantActionRiskLevel =
  (typeof FEISHU_SMART_ASSISTANT_ACTION_RISK_LEVEL_VALUES)[number]
export type FeishuSmartAssistantExecutionProfile =
  | "smart_assistant_personal"
  | "feishu_bot_tenant"
export type FeishuConnectionProfileKind =
  (typeof FEISHU_CONNECTION_PROFILE_KIND_VALUES)[number]
export type FeishuDocsAccessKind = (typeof FEISHU_DOCS_ACCESS_KIND_VALUES)[number]
export type FeishuSmartAssistantContextKind =
  (typeof FEISHU_SMART_ASSISTANT_CONTEXT_KIND_VALUES)[number]
export type FeishuSmartAssistantWorkbenchKind =
  (typeof FEISHU_SMART_ASSISTANT_WORKBENCH_KIND_VALUES)[number]
export type FeishuSmartAssistantContextFieldValueKind =
  (typeof FEISHU_SMART_ASSISTANT_CONTEXT_FIELD_VALUE_KIND_VALUES)[number]
export type FeishuUserIdType = (typeof FEISHU_USER_ID_TYPE_VALUES)[number]
export type FeishuSmartAssistantPolicyKey =
  (typeof FEISHU_SMART_ASSISTANT_POLICY_KEY_VALUES)[number]
export type FeishuBotConnectionStatus = (typeof FEISHU_BOT_CONNECTION_STATUS_VALUES)[number]
export type FeishuBotMediaAssetKind = (typeof FEISHU_BOT_MEDIA_ASSET_KIND_VALUES)[number]
export type FeishuBotEventStatus = (typeof FEISHU_BOT_EVENT_STATUS_VALUES)[number]
export type FeishuBotCapabilityStatus = (typeof FEISHU_BOT_CAPABILITY_STATUS_VALUES)[number]
export type FeishuBotCapabilityKind = (typeof FEISHU_BOT_CAPABILITY_KIND_VALUES)[number]
export type FeishuBotExecutionWorkspaceMode =
  (typeof FEISHU_BOT_EXECUTION_WORKSPACE_MODE_VALUES)[number]
export type FeishuBotWorkspaceSwitchScope =
  (typeof FEISHU_BOT_WORKSPACE_SWITCH_SCOPE_VALUES)[number]

export type FeishuBotCapabilityDescriptorView = {
  kind: FeishuBotCapabilityKind
  status: FeishuBotCapabilityStatus
  title: string
  description: string
  surfaces: string[]
  notes?: string[]
}

export type FeishuBotCapabilityCatalogView = {
  transportMode: "websocket"
  descriptors: FeishuBotCapabilityDescriptorView[]
}

export type FeishuBotTenantCapabilityDomainStatus = "ready" | "planned"

export type FeishuBotTenantCapabilityDomainView = {
  key: Extract<FeishuSmartAssistantDomainKey, "calendar" | "tasks" | "docs" | "meetings">
  title: string
  status: FeishuBotTenantCapabilityDomainStatus
  credentialKind: "tenant_access_token"
  requiredScopes: string[]
  notes?: string[]
}

export type FeishuBotTenantCapabilityActionView = {
  actionId: string
  domain: FeishuSmartAssistantDomainKey
  title: string
  status: "ready" | "blocked"
  requiresConfirmation: boolean
}

export type FeishuBotTenantCapabilityCatalogView = {
  profile: "feishu_bot_tenant"
  credentialKind: "tenant_access_token"
  allowUserAccessToken: false
  identitySource: "bot_app"
  allowedUserIdTypes: Array<Extract<FeishuUserIdType, "open_id" | "union_id">>
  tenantScopes: string[]
  domains: FeishuBotTenantCapabilityDomainView[]
  actions: FeishuBotTenantCapabilityActionView[]
  blockedActionIds: string[]
}

export type FeishuResolvedTool = {
  name: string
  description?: string
}

export type FeishuSupportedTool = {
  name: string
  description: string
  permissions: string[]
  supportedModes: Array<Extract<FeishuMode, "personal" | "developer">>
}

export type FeishuManagedMcpView = {
  mcpId: string
  name: string
  endpoint: string
  transport: "http-streamable" | "sse" | "stdio"
  enabled: boolean
  updatedAt: string
  health?: {
    status: "healthy" | "warning" | "down"
    checkedAt: string
    reasonCode?: string
    message?: string
    latencyMs?: number
  }
}

export type FeishuSmartAssistantMountTargetView = {
  name: string
  endpoint: string
  transport: "http-streamable" | "sse" | "stdio"
  bindingStatus: "bound" | "planned"
  mcpId?: string
  enabled?: boolean
  updatedAt?: string
  health?: FeishuManagedMcpView["health"]
}

export type FeishuPersonalDocsView = {
  enabled: boolean
  serverUrl?: string
  savedAt?: string
  estimatedExpiresAt?: string
  discoveredTools: FeishuResolvedTool[]
  docsMcp: FeishuManagedMcpView | null
}

export type FeishuSmartAssistantDomainView = {
  key: FeishuSmartAssistantDomainKey
  title: string
  summary: string
  status: FeishuSmartAssistantDomainStatus
  mountStrategy: FeishuSmartAssistantDomainMountStrategy
  transport: "remote_mcp" | "openapi_sdk"
  credentialKind: FeishuSmartAssistantCredentialKind
  readyActionCount: number
  totalActionCount: number
}

export type FeishuSmartAssistantActionView = {
  actionId: string
  domain: FeishuSmartAssistantDomainKey
  title: string
  summary: string
  status: FeishuSmartAssistantActionStatus
  transport: FeishuSmartAssistantActionTransport
  mountStrategy: FeishuSmartAssistantDomainMountStrategy
  credentialKind: FeishuSmartAssistantCredentialKind
  riskLevel: FeishuSmartAssistantActionRiskLevel
}

export type FeishuSmartAssistantRuntimePolicyView = {
  key: FeishuSmartAssistantPolicyKey
  title: string
  decision: string
  summary: string
  status: "ready" | "planned"
}

export type FeishuSmartAssistantConnectionProfileView = {
  kind: FeishuConnectionProfileKind
  title: string
  summary: string
  status: "ready" | "planned"
  authMode: "url_only" | "oauth"
  configured: boolean
  supportedDomains: FeishuSmartAssistantDomainKey[]
  notes: string[]
}

export type FeishuSmartAssistantDomainModelView = {
  domain: FeishuSmartAssistantDomainKey
  title: string
  primaryConnectionKind: FeishuConnectionProfileKind
  supportedConnectionKinds: FeishuConnectionProfileKind[]
  contextKind: FeishuSmartAssistantContextKind
  associationLabel: string
  workbenchKind: FeishuSmartAssistantWorkbenchKind
  workbenchLabel: string
}

export type FeishuSmartAssistantContextTemplateFieldView = {
  key: string
  label: string
  valueKind: FeishuSmartAssistantContextFieldValueKind
  required: boolean
  description: string
  placeholder?: string
}

export type FeishuSmartAssistantContextTemplateView = {
  domain: FeishuSmartAssistantDomainKey
  title: string
  contextKind: FeishuSmartAssistantContextKind
  summary: string
  fields: FeishuSmartAssistantContextTemplateFieldView[]
  recommendedActionIds: string[]
  notes: string[]
}

export type FeishuSmartAssistantSummaryView = {
  enabled: boolean
  workspaceId?: string
  authStatus: FeishuDeveloperAuthStatus
  controlPlaneMcpName: string
  readyDomainCount: number
  totalDomainCount: number
  readyActionCount: number
  totalActionCount: number
  mountedDocsMcp: boolean
  nextRecommendedStep: string
  notes: string[]
}

export type FeishuSmartAssistantActionQuery = {
  domain?: FeishuSmartAssistantDomainKey
  status?: FeishuSmartAssistantActionStatus
  riskLevel?: FeishuSmartAssistantActionRiskLevel
  q?: string
  limit?: number
}

export type FeishuSmartAssistantActionPlanInput = {
  workspaceId?: string
  query: string
  limit?: number
}

export type FeishuSmartAssistantActionCandidateView = {
  actionId: string
  domain: FeishuSmartAssistantDomainKey
  title: string
  status: FeishuSmartAssistantActionStatus
  riskLevel: FeishuSmartAssistantActionRiskLevel
  score: number
  reason: string
  canExecuteDirectly: boolean
  requiresConfirmation: boolean
  missingInputs: string[]
}

export type FeishuSmartAssistantDomainAdviceView = {
  domain: FeishuSmartAssistantDomainKey
  title: string
  shouldInjectNextRound: boolean
  reason: string
  nextStep: string
  mountMode:
    | "control_plane_only"
    | "managed_remote_mcp"
    | "runtime_action_registry"
    | "registry_only"
    | "planned"
}

export type FeishuSmartAssistantActionPlanView = {
  workspaceId?: string
  query: string
  matchedDomains: FeishuSmartAssistantDomainKey[]
  candidates: FeishuSmartAssistantActionCandidateView[]
  domainAdvice: FeishuSmartAssistantDomainAdviceView[]
  nextStep: string
  notes: string[]
}

export type FeishuSmartAssistantExecuteActionInput = {
  actionId: string
  executionProfile?: FeishuSmartAssistantExecutionProfile
  workspaceId?: string
  confirm?: boolean
  query?: string
  docId?: string
  userId?: string
  userIdType?: FeishuUserIdType
  chatId?: string
  messageId?: string
  threadId?: string
  text?: string
  replyInThread?: boolean
  attendeeIds?: string[]
  durationMinutes?: number
  timezone?: string
  calendarId?: string
  startAt?: string
  endAt?: string
  baseToken?: string
  tableId?: string
  viewId?: string
  recordId?: string
  fields?: Record<string, unknown>
  offset?: number
  title?: string
  markdown?: string
  createMeeting?: boolean
  root?: FeishuDocTreeRoot
  pageToken?: string
  pageSize?: number
  limit?: number
  fileTokens?: string[]
  folderToken?: string
  fileToken?: string
  localPath?: string
  outputPath?: string
  spreadsheetToken?: string
  sheetId?: string
  range?: string
  values?: unknown[][]
  fileExtension?: "xlsx" | "csv"
  taskId?: string
  tasklistId?: string
  dueAt?: string
  wikiNodeToken?: string
  wikiNodeAction?: "create" | "move" | "rename"
  wikiNodeType?: "origin" | "shortcut"
  wikiObjType?: "doc" | "docx" | "sheet" | "mindnote" | "bitable" | "file" | "slides"
  originWikiNodeToken?: string
  wikiSpaceId?: string
  targetWikiNodeToken?: string
  targetWikiSpaceId?: string
  mailbox?: string
  to?: string[]
  cc?: string[]
  bcc?: string[]
  subject?: string
  eventId?: string
  meetingId?: string
  minuteToken?: string
}

export type FeishuSmartAssistantActionConfirmationView = {
  required: boolean
  confirmed: boolean
  confirmField: "confirm"
  reason: string
  preview: string
}

export type FeishuSmartAssistantMountedDomainsView = {
  workspaceId?: string
  mountedDomains: FeishuSmartAssistantDomainKey[]
}

export type FeishuSmartAssistantDomainMountPlanInput = {
  domain: FeishuSmartAssistantDomainKey
  workspaceId?: string
}

export type FeishuSmartAssistantDomainMountPlanView = {
  workspaceId?: string
  domain: FeishuSmartAssistantDomainKey
  title: string
  status: FeishuSmartAssistantDomainStatus
  mountStrategy: FeishuSmartAssistantDomainMountStrategy
  transport: FeishuSmartAssistantDomainView["transport"]
  credentialKind: FeishuSmartAssistantCredentialKind
  authStatus: FeishuDeveloperAuthStatus
  canMountNow: boolean
  mounted: boolean
  mountMode:
    | "control_plane_only"
    | "managed_remote_mcp"
    | "runtime_action_registry"
    | "registry_only"
    | "planned"
  targetMcp: FeishuSmartAssistantMountTargetView | null
  availableActionIds: string[]
  nextStep: string
  notes: string[]
}

export type FeishuSmartAssistantDomainMountResultView =
  FeishuSmartAssistantDomainMountPlanView & {
    mountedDomains: FeishuSmartAssistantDomainKey[]
  }

export type FeishuSmartAssistantDomainUnmountResultView = {
  workspaceId?: string
  domain: FeishuSmartAssistantDomainKey
  mounted: false
  mountedDomains: FeishuSmartAssistantDomainKey[]
  nextStep: string
  notes: string[]
}

export type FeishuSmartAssistantActionExecuteResultView = {
  workspaceId?: string
  actionId: string
  domain: FeishuSmartAssistantDomainKey
  executionMode: "builtin_runtime"
  executed: boolean
  confirmationRequired: boolean
  confirmation?: FeishuSmartAssistantActionConfirmationView
  summary: {
    headline: string
    details: string[]
    nextSuggestedActionIds: string[]
  }
  result: Record<string, unknown>
  notes: string[]
}

export type FeishuSmartAssistantView = {
  enabled: boolean
  appId?: string
  hasAppSecret: boolean
  redirectUri: string
  redirectOrigin: string
  authStatus: FeishuDeveloperAuthStatus
  authMethod: "oauth"
  hasRefreshToken: boolean
  scopes: string[]
  allowedTools: string[]
  accessTokenExpiresAt?: string
  refreshTokenExpiresAt?: string
  lastAuthorizedAt?: string
  lastRefreshedAt?: string
  lastError?: string
  statusNotice?: string
  autoRefreshTask: {
    taskId?: string
    status?: "queued" | "running" | "success" | "failed" | "cancelled"
    enabled: boolean
    nextRunAt?: string
  }
  docsMcp: FeishuManagedMcpView | null
  runtimePolicy: {
    controlPlane: "ready" | "planned"
    domainMounting: "lazy_by_domain"
    actionExecution: "registry_first"
  }
  connectionProfiles: FeishuSmartAssistantConnectionProfileView[]
  domainModels: FeishuSmartAssistantDomainModelView[]
  contextTemplates: FeishuSmartAssistantContextTemplateView[]
  policyItems: FeishuSmartAssistantRuntimePolicyView[]
  domains: FeishuSmartAssistantDomainView[]
  actions: FeishuSmartAssistantActionView[]
}

export type FeishuStateView = {
  personalDocs: FeishuPersonalDocsView
  smartAssistant: FeishuSmartAssistantView
  docsWorkspace?: {
    lastRootToken?: string
    lastRootTitle?: string
    lastRootLoadedAt?: string
  }
  // Legacy compatibility view. New code should prefer personalDocs/smartAssistant.
  mode: FeishuMode
  personal: {
    serverUrl: string
    savedAt: string
    estimatedExpiresAt?: string
    discoveredTools: FeishuResolvedTool[]
  } | null
  developer: {
    appId: string
    hasAppSecret: boolean
    redirectUri: string
    redirectOrigin: string
    authStatus: FeishuDeveloperAuthStatus
    authMethod: "oauth"
    hasRefreshToken: boolean
    scopes: string[]
    allowedTools: string[]
    accessTokenExpiresAt?: string
    refreshTokenExpiresAt?: string
    lastAuthorizedAt?: string
    lastRefreshedAt?: string
    lastError?: string
    statusNotice?: string
    autoRefreshTask: {
      taskId?: string
      status?: "queued" | "running" | "success" | "failed" | "cancelled"
      enabled: boolean
      nextRunAt?: string
    }
  } | null
  managedMcp: FeishuManagedMcpView | null
  docs: {
    personal: string
    developer: string
    authorize: string
    token: string
    refreshToken: string
  }
  catalog: {
    developerScopes: string[]
    developerTenantScopes: string[]
    developerAllowedTools: string[]
    supportedTools: FeishuSupportedTool[]
  }
}

export type FeishuPersonalConfigInput = {
  serverUrl: string
}

export type FeishuDeveloperConfigInput = {
  appId: string
  appSecret?: string
  redirectUri?: string
}

export type FeishuDeveloperAuthorizeResult = {
  item: FeishuStateView
  authUrl: string
}

export type FeishuOAuthCallbackInput = {
  code?: string
  state?: string
  error?: string
  errorDescription?: string
}

export type FeishuOAuthCallbackResult = {
  success: boolean
  html: string
}

export type FeishuBotMediaAssetView = {
  kind: FeishuBotMediaAssetKind
  path: string
  fileKey: string
  fileName?: string
  mimeType?: string
  sizeBytes: number
}

export type FeishuBotProcessedMessage = {
  messageId: string
  eventId?: string
  conversationKey: string
  workspaceId?: string
  sessionId?: string
  status: "pending" | "completed" | "failed"
  queryPreview?: string
  responsePreview?: string
  mediaAssets?: FeishuBotMediaAssetView[]
  createdAt: string
  updatedAt: string
}

export type FeishuBotEventInfo = {
  status: FeishuBotEventStatus
  receivedAt: string
  eventType?: string
  eventId?: string
  messageId?: string
  chatId?: string
  detail?: string
}

export type FeishuBotPendingActionView = {
  pendingId: string
  chatId: string
  threadId?: string
  messageId: string
  domain: FeishuSmartAssistantDomainKey
  actionId: string
  workspaceId?: string
  summary: string
  details: string[]
  createdAt: string
  expiresAt: string
}

export type FeishuBotStateView = {
  enabled: boolean
  appId: string
  appSecret?: string
  hasAppSecret: boolean
  verificationToken?: string
  hasVerificationToken: boolean
  encryptKey?: string
  hasEncryptKey: boolean
  transportMode: "websocket"
  catalog: FeishuBotCapabilityCatalogView
  tenantCapabilities?: FeishuBotTenantCapabilityCatalogView
  connectionStatus: FeishuBotConnectionStatus
  connectionDetail?: string
  connectionUpdatedAt?: string
  // Legacy alias for defaultExecutionWorkspaceId. Keep for backward compatibility only.
  selectedWorkspaceId?: string
  executionWorkspaceMode?: FeishuBotExecutionWorkspaceMode
  defaultExecutionWorkspaceId?: string
  allowWorkspaceSwitch?: boolean
  workspaceSwitchScope?: FeishuBotWorkspaceSwitchScope
  allowedExecutionWorkspaceIds?: string[]
  selectedChannelId?: string
  selectedModelId?: string
  sessionMappingCount: number
  processedMessageCount: number
  queuedConversationCount: number
  savedAt?: string
  updatedAt: string
  lastError?: string
  latestEvent?: FeishuBotEventInfo
  latestProcessedMessage?: FeishuBotProcessedMessage
  recentProcessedMessages: FeishuBotProcessedMessage[]
  pendingActionCount?: number
  latestPendingAction?: FeishuBotPendingActionView
}

export type FeishuBotConfigInput = {
  appId: string
  appSecret?: string
  verificationToken?: string
  encryptKey?: string
  // Legacy alias for defaultExecutionWorkspaceId. Keep for backward compatibility only.
  selectedWorkspaceId?: string
  executionWorkspaceMode?: FeishuBotExecutionWorkspaceMode
  defaultExecutionWorkspaceId?: string
  allowWorkspaceSwitch?: boolean
  workspaceSwitchScope?: FeishuBotWorkspaceSwitchScope
  allowedExecutionWorkspaceIds?: string[]
  selectedChannelId?: string
  selectedModelId?: string
}

export type FeishuBotEventHandleResult = {
  status: number
  body: Record<string, unknown>
}

export type FeishuBotWorkspaceSessionView = {
  sessionId: string
  title: string
  status: "idle" | "running" | "error"
  hiddenFromChatSidebar?: boolean
  lastMessageAt?: string
  updatedAt: string
}

export type FeishuBotWorkspaceHomeView = {
  strategy: "formal-chat-home"
  workspaceId: string
  sessionCount: number
  activeSessionId?: string
  latestSessionId?: string
  runningSessionIds: string[]
  memoryEnabledByDefault: true
  sessions: FeishuBotWorkspaceSessionView[]
}

export type FeishuBotDeliveryStateView = {
  isProcessing: boolean
  queuedMessageCount: number
}

export type FeishuBotConversationMcpContextView = {
  workspaceId: string
  homeWorkspaceId: string
  sessionId: string
  tenantKey?: string
  chatId: string
  threadId?: string
  conversationKey: string
  connectionStatus: FeishuBotConnectionStatus
  workspace: FeishuBotWorkspaceHomeView
  delivery: FeishuBotDeliveryStateView
  capabilities: FeishuBotCapabilityCatalogView
  selectedChannelId?: string
  selectedModelId?: string
  lastMessageId?: string
  latestProcessedMessage?: FeishuBotProcessedMessage
  recentMessages: FeishuBotProcessedMessage[]
}

export type FeishuBotSendTextResult = {
  delivered: true
  workspaceId: string
  sessionId: string
  chatId: string
  deliveredAt: string
}

export type FeishuBotSendImageInput = {
  filePath?: string
  fileUrl?: string
}

export type FeishuBotSendImageResult = {
  delivered: true
  workspaceId: string
  sessionId: string
  chatId: string
  deliveredAt: string
  imageKey: string
}

export type FeishuBotSendFileInput = {
  filePath?: string
  fileUrl?: string
}

export type FeishuBotSendFileResult = {
  delivered: true
  workspaceId: string
  sessionId: string
  chatId: string
  deliveredAt: string
  fileKey: string
  fileName: string
}

export type FeishuBotSendCardInput = {
  card: Record<string, unknown>
}

export type FeishuBotSendCardResult = {
  delivered: true
  workspaceId: string
  sessionId: string
  chatId: string
  deliveredAt: string
}

export type FeishuDocsCapabilitiesView = {
  mode: Extract<FeishuMode, "personal" | "developer">
  accessKind: FeishuDocsAccessKind
  accessLabel: string
  managedMcpId: string
  endpoint: string
  availableTools: string[]
  toolDetails: FeishuResolvedTool[]
  canSearchDocs: boolean
  canListDocs: boolean
  canFetchDocs: boolean
  canUpdateDocs: boolean
  canBrowseTree: boolean
  canReadDocs: boolean
  canWriteDocs: boolean
}

export type FeishuDocSearchQuery = {
  query: string
  limit?: number
}

export type FeishuDocSearchResult = {
  query: string
  items: FeishuDocSummary[]
  total: number
}

export type FeishuDocTreeNodeKind = "wiki_node" | "document"

export type FeishuDocTreeSource = "remote" | "cache"

export type FeishuDocTreeObjectType = "doc" | "docx" | "sheet" | "mindnote" | "bitable" | "file" | "slides"

export type FeishuDocSummary = {
  id: string
  token?: string
  kind?: FeishuDocTreeNodeKind
  docId?: string
  resolvedDocId?: string
  title: string
  url?: string
  ownerName?: string
  docType?: string
  objType?: FeishuDocTreeObjectType
  parentToken?: string
  createTime?: string
  updateTime?: string
  updatedAt?: string
  lastOpenTime?: string
  hasChild?: boolean
}

export type FeishuDocTreeNode = FeishuDocSummary & {
  id: string
  token: string
  kind: FeishuDocTreeNodeKind
  title: string
  hasChild: boolean
}

export type FeishuDocTreeSnapshotNode = FeishuDocTreeNode & {
  children?: FeishuDocTreeSnapshotNode[]
}

export type FeishuDocTreeRoot = "my_library" | "document"

export type FeishuDocTreeQuery = {
  root: FeishuDocTreeRoot
  docId?: string
  pageToken?: string
  pageSize?: number
  forceRefresh?: boolean
}

export type FeishuDocTreeView = {
  root: FeishuDocTreeRoot
  parentDocId?: string
  nodes: FeishuDocTreeNode[]
  hasMore: boolean
  pageToken?: string
}

export type FeishuDocTreeLoadInput = {
  token: string
  forceRefresh?: boolean
  preloadSubtree?: boolean
}

export type FeishuDocTreeBranchInput = {
  rootToken: string
  parentToken: string
  forceRefresh?: boolean
}

export type FeishuDocTreeLoadResult = {
  rootToken: string
  rootKind: FeishuDocTreeNodeKind
  nodes: FeishuDocTreeNode[]
  subtree?: FeishuDocTreeSnapshotNode[]
  hasMore: boolean
  pageToken?: string
  source: FeishuDocTreeSource
  refreshing: boolean
  stale: boolean
  loadedAt?: string
  error?: string
}

export type FeishuDocTreeBranchResult = {
  rootToken: string
  parentToken: string
  nodes: FeishuDocTreeNode[]
  hasMore: boolean
  pageToken?: string
  source: FeishuDocTreeSource
  refreshing: boolean
  stale: boolean
  loadedAt?: string
  error?: string
}

export type FeishuDocTreeMutationEvent =
  | { type: "root-refreshed"; payload: FeishuDocTreeLoadResult }
  | { type: "branch-refreshed"; payload: FeishuDocTreeBranchResult }
  | { type: "branch-failed"; rootToken: string; parentToken: string; message: string }

export type FeishuDocMediaPreviewItem = {
  fileToken: string
  tmpDownloadUrl: string
}

export type FeishuDocMediaPreviewErrorItem = {
  fileToken: string
  code: string
  message: string
}

export type FeishuDocMediaPreviewResult = {
  items: FeishuDocMediaPreviewItem[]
  errors: FeishuDocMediaPreviewErrorItem[]
}

export type FeishuDocWhiteboardPreviewItem = {
  whiteboardToken: string
  tmpDownloadUrl: string
  focusRect?: {
    left: number
    top: number
    width: number
    height: number
  }
}

export type FeishuDocWhiteboardPreviewErrorItem = {
  whiteboardToken: string
  code: string
  message: string
}

export type FeishuDocWhiteboardPreviewResult = {
  items: FeishuDocWhiteboardPreviewItem[]
  errors: FeishuDocWhiteboardPreviewErrorItem[]
}

export type FeishuDocContentAnalysis = {
  riskyBlocks: string[]
  riskySync: boolean
  syncMode: "overwrite" | null
  forceSyncMode?: "overwrite" | null
  riskyBlockMode: "safe" | "preserved" | "changed" | "untracked"
}

export type FeishuDocCacheStateView = {
  workspaceId: string
  requestedDocId?: string
  resolvedDocId?: string
  documentIdType?: "document_id" | "wiki_node_token"
  hasRawSourceBaseline?: boolean
  hasStructuredBaseline?: boolean
  publishModeRecommendation?: "update_existing" | "publish_new" | "pull_required"
  hasBlockedChanges?: boolean
  hasRevisionConflict?: boolean
  unknownBlockCount?: number
  cacheRelativePath?: string
  cacheAbsolutePath?: string
  baseRelativePath?: string
  baseAbsolutePath?: string
  originalRelativePath?: string
  originalAbsolutePath?: string
  originalBaseRelativePath?: string
  originalBaseAbsolutePath?: string
  draftRelativePath?: string
  draftAbsolutePath?: string
  sourceRelativePath?: string
  sourceAbsolutePath?: string
  sourceBaseRelativePath?: string
  sourceBaseAbsolutePath?: string
  hasBaseline: boolean
  hasLocalChanges: boolean
  localChecksum: string
  baseRemoteChecksum?: string
  lastPulledAt?: string
  lastPushedAt?: string
  status: "cached" | "local_only"
}

export type FeishuDocContentView = {
  docId: string
  resolvedDocId?: string
  title: string
  markdown: string
  length: number
  totalLength: number
  offset: number
  message?: string
  analysis: FeishuDocContentAnalysis
  cache?: FeishuDocCacheStateView
}

export type FeishuWorkspaceDocInput = {
  workspaceId: string
  docId: string
}

export type FeishuWorkspaceDocDraftInput = FeishuWorkspaceDocInput & {
  title?: string
  markdown: string
}

export type FeishuWorkspaceDocPushInput = FeishuWorkspaceDocInput & {
  title?: string
  force?: boolean
}

export type FeishuDocWorkspacePullResult = {
  item: FeishuDocContentView
  pullStatus: "created" | "updated" | "noop"
  message?: string
}

export type FeishuDocWorkspacePushResult = {
  item: FeishuDocContentView
  pushStatus: "succeeded" | "accepted" | "noop" | "blocked" | "published_new"
  message?: string
  taskId?: string
  warnings: string[]
}
