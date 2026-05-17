export type ExternalApiErrorBody = {
  ok: false
  code: string
  message: string
  data?: Record<string, unknown>
}

export type ExternalRequestOptions = {
  signal?: AbortSignal
  headers?: HeadersInit
}

export type ExternalApiClientOptions = {
  baseUrl: string
  apiKey?: string
  fetch?: typeof fetch
  headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>)
}

export type ExternalModelItem = {
  providerType: string
  providerDisplayName?: string
  channelId: string
  channelName: string
  modelId: string
  modelName: string
  family?: string
  contextWindow?: number
  maxOutputTokens?: number
  supportsReasoning?: boolean
  supportsFunctionCall?: boolean
  supportsStructuredOutput?: boolean
  supportsAttachments?: boolean
}

export type ExternalModelsListResponse = {
  items: ExternalModelItem[]
  meta: {
    total: number
  }
}

export type ExternalWorkspaceItem = {
  workspaceId: string
  name: string
  directoryPath?: string
  note?: string
  isPinned: boolean
  tags: string[]
  status: "active" | "available" | "unavailable"
  health: "healthy" | "warning" | "error" | "unknown"
  unavailableReason?: string
  createdAt: string
  updatedAt: string
  lastOpenedAt?: string
  lastHealthCheckAt?: string
  temporary?: boolean
}

export type ExternalWorkspaceListQuery = {
  q?: string
  includeUnavailable?: boolean
  limit?: number
  offset?: number
}

export type ExternalWorkspaceCreateInput = {
  workspaceId?: string
  name?: string
  directoryPath?: string
  note?: string
  tags?: string[]
  isPinned?: boolean
  activate?: boolean
  activatedBy?: string
  temporary?: boolean
}

export type ExternalWorkspaceListResponse = {
  items: ExternalWorkspaceItem[]
  active?: ExternalWorkspaceItem
  meta: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

export type ExternalWorkspaceGetResponse = {
  item: ExternalWorkspaceItem
}

export type ExternalWorkspaceCreateResponse = {
  created: boolean
  item: ExternalWorkspaceItem
}

export type ExternalWorkspaceDeleteResponse = {
  deleted: true
  workspaceId: string
}

export type ExternalConversationSandboxMode =
  | "workspace-write"
  | "danger-full-access"

export type ExternalConversationApprovalMode =
  | "manual"
  | "auto"

export type ExternalSessionSeed = {
  title?: string
  memoryEnabled?: boolean
  selectedAgentId?: string
  selectedChannelId?: string
  selectedModelId?: string
  sandboxMode?: ExternalConversationSandboxMode
  approvalMode?: ExternalConversationApprovalMode
  draft?: string
  useDefaultAgent?: boolean
}

export type ExternalAiMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type ExternalAiCompletionPayload = {
  messages: ExternalAiMessage[]
  selectedChannelId?: string
  selectedModelId?: string
}

export type ExternalAiCapabilitiesQuery = {
  selectedChannelId?: string
  selectedModelId?: string
}

export type ExternalAiRecipeSelection = {
  selectedChannelId?: string
  selectedModelId?: string
}

export type ExternalAiPromptOptimizeInput = ExternalAiRecipeSelection & {
  prompt: string
  userRequirement?: string
}

export type ExternalAiTextSummarizeInput = ExternalAiRecipeSelection & {
  text: string
  instruction?: string
  length?: "short" | "medium" | "long"
  format?: "paragraph" | "bullets" | "outline"
}

export type ExternalAiReportAnalyzeInput = ExternalAiRecipeSelection & {
  report: string
  instruction?: string
  focus?: string
  outputFormat?: "bullets" | "sections"
}

export type ExternalConversationTextPart = {
  type: "text"
  partId?: string
  text: string
}

export type ExternalConversationReasoningPart = {
  type: "reasoning"
  partId?: string
  text: string
}

export type ExternalConversationAttachmentPart = {
  type: "attachment"
  partId?: string
  kind: "image" | "audio" | "video" | "file"
  path: string
  fileName?: string
  mimeType?: string
  sizeBytes?: number
}

export type ExternalConversationToolPart = {
  type: "tool"
  partId?: string
  tool: string
  status: string
  title?: string
  summary?: string
  path?: string
  paths?: string[]
  command?: string
  output?: string
  startedAt?: string
  endedAt?: string
  toolKind?: "builtin" | "task" | "mcp" | "unknown"
  mcpServer?: string
  mcpTool?: string
  subagentType?: string
  childSessionId?: string
}

export type ExternalConversationPart =
  | ExternalConversationTextPart
  | ExternalConversationReasoningPart
  | ExternalConversationAttachmentPart
  | ExternalConversationToolPart

export type ExternalAiCompletionResult = {
  content: string
  usedUpstream: boolean
  failureReason?: string
  reasoning?: string[]
  parts?: ExternalConversationPart[]
  resolvedProviderType?: string
  resolvedChannelId?: string
  resolvedModelId?: string
}

export type ExternalAiCompletionResponse = {
  item: ExternalAiCompletionResult
}

export type ExternalAiCapabilityMode = {
  modeId: "simple_completion" | "conversation_execute"
  label: string
  description: string
  requiresSession: boolean
  supportsStreaming: boolean
  supportsFollowUp: boolean
  supportsAgentExecution: boolean
  recommended: boolean
}

export type ExternalAiCapabilitiesResponse = {
  item: {
    workspaceId: string
    available: boolean
    defaultModeId: "simple_completion" | "conversation_execute"
    resolvedProviderType?: string
    resolvedChannelId?: string
    resolvedModelId?: string
    failureReason?: string
    modes: ExternalAiCapabilityMode[]
  }
}

export type ExternalConversationMessage = {
  messageId: string
  sessionId: string
  role: "system" | "user" | "assistant"
  status: "pending" | "streaming" | "complete" | "error" | "aborted"
  content: string
  reasoning?: string[]
  parts?: ExternalConversationPart[]
  runId?: string
  createdAt: string
  updatedAt: string
  errorMessage?: string
}

export type ExternalConversationSessionSummary = {
  sessionId: string
  workspaceId: string
  title: string
  draft?: string
  hiddenFromChatSidebar?: boolean
  opencodeSessionId?: string
  memoryEnabled: boolean
  feishuSmartAssistantEnabled?: boolean
  selectedAgentId?: string
  selectedChannelId?: string
  selectedModelId?: string
  sandboxMode?: ExternalConversationSandboxMode
  approvalMode?: ExternalConversationApprovalMode
  messageCount: number
  status: "idle" | "running" | "error"
  createdAt: string
  updatedAt: string
  lastMessageAt?: string
}

export type ExternalConversationSessionDetail = ExternalConversationSessionSummary & {
  messages: ExternalConversationMessage[]
}

export type ExternalSessionsListQuery = {
  q?: string
  limit?: number
  offset?: number
  includeHidden?: boolean
}

export type ExternalSessionsListResponse = {
  items: ExternalConversationSessionSummary[]
  activeSessionId?: string
  meta: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

export type ExternalSessionResponse = {
  item: ExternalConversationSessionDetail
}

export type ExternalSessionCreateResponse = {
  item: ExternalConversationSessionDetail
}

export type ExternalSessionDeleteResponse = {
  deleted: true
  workspaceId: string
  sessionId: string
}

export type ExternalSessionMessagesResponse = {
  workspaceId: string
  sessionId: string
  items: ExternalConversationMessage[]
}

export type ExternalExecutePayload = ExternalSessionSeed & {
  sessionId?: string
  content: string
}

export type ExternalExecuteResponse = {
  workspaceId: string
  sessionId: string
  sessionCreated: boolean
  session: ExternalConversationSessionDetail
  userMessageId: string
  assistantMessageId: string
  message?: ExternalConversationMessage
  text: string
  usedUpstream: boolean
  failureReason?: string
}

export type ExternalConversationDeltaPart =
  | {
      type: "text" | "reasoning"
      partId?: string
      delta: string
      text: string
      replace?: boolean
    }
  | ExternalConversationAttachmentPart
  | ExternalConversationToolPart

export type ExternalStreamBase = {
  workspaceId: string
  sessionId: string
  eventId?: string
  at?: string
}

export type ExternalSessionReadyEventData = ExternalStreamBase & {
  sessionCreated: boolean
  session: ExternalConversationSessionDetail
}

export type ExternalMessageUserEventData = ExternalStreamBase & {
  message: ExternalConversationMessage
  text: string
}

export type ExternalMessageDeltaEventData = ExternalStreamBase & {
  messageId: string
  part: ExternalConversationDeltaPart
}

export type ExternalMessageCompletedEventData = ExternalStreamBase & {
  message: ExternalConversationMessage
  text: string
}

export type ExternalMessageFailedEventData = ExternalMessageCompletedEventData
export type ExternalMessageAbortedEventData = ExternalMessageCompletedEventData

export type ExternalStreamErrorEventData = ExternalStreamBase & ExternalApiErrorBody

export type ExternalDoneEventData = {
  workspaceId: string
  sessionId: string
  ok: boolean
  failureReason: string | null
}

export type ExternalAiCompletionDeltaPart = ExternalConversationDeltaPart

export type ExternalAiStreamBase = {
  workspaceId: string
  eventId?: string
  at?: string
}

export type ExternalAiResponseDeltaEventData = ExternalAiStreamBase & {
  part: ExternalAiCompletionDeltaPart
}

export type ExternalAiResponseCompletedEventData = ExternalAiStreamBase & {
  item: ExternalAiCompletionResult
}

export type ExternalAiDoneEventData = {
  workspaceId: string
  ok: boolean
  failureReason: string | null
}

export declare function buildPromptOptimizePayload(
  input: ExternalAiPromptOptimizeInput,
): ExternalAiCompletionPayload

export declare function buildTextSummarizePayload(
  input: ExternalAiTextSummarizeInput,
): ExternalAiCompletionPayload

export declare function buildReportAnalyzePayload(
  input: ExternalAiReportAnalyzeInput,
): ExternalAiCompletionPayload

export type ExternalAiStreamErrorEventData = ExternalAiStreamBase & ExternalApiErrorBody

export type ExternalStreamEventMap = {
  "session.ready": ExternalSessionReadyEventData
  "message.user": ExternalMessageUserEventData
  "message.delta": ExternalMessageDeltaEventData
  "message.completed": ExternalMessageCompletedEventData
  "message.failed": ExternalMessageFailedEventData
  "message.aborted": ExternalMessageAbortedEventData
  result: ExternalExecuteResponse
  error: ExternalStreamErrorEventData
  done: ExternalDoneEventData
}

export type ExternalStreamEvent = {
  [K in keyof ExternalStreamEventMap]: {
    event: K
    data: ExternalStreamEventMap[K]
  }
}[keyof ExternalStreamEventMap]

export type ExternalAiStreamEventMap = {
  "response.delta": ExternalAiResponseDeltaEventData
  "response.completed": ExternalAiResponseCompletedEventData
  error: ExternalAiStreamErrorEventData
  done: ExternalAiDoneEventData
}

export type ExternalAiStreamEvent = {
  [K in keyof ExternalAiStreamEventMap]: {
    event: K
    data: ExternalAiStreamEventMap[K]
  }
}[keyof ExternalAiStreamEventMap]

export type ExternalExecuteStreamConsumer = {
  onEvent?: (event: ExternalStreamEvent) => void
  onSessionReady?: (
    data: ExternalSessionReadyEventData,
    event: Extract<ExternalStreamEvent, { event: "session.ready" }>,
  ) => void
  onMessageUser?: (
    data: ExternalMessageUserEventData,
    event: Extract<ExternalStreamEvent, { event: "message.user" }>,
  ) => void
  onMessageDelta?: (
    data: ExternalMessageDeltaEventData,
    event: Extract<ExternalStreamEvent, { event: "message.delta" }>,
  ) => void
  onMessageCompleted?: (
    data: ExternalMessageCompletedEventData,
    event: Extract<ExternalStreamEvent, { event: "message.completed" }>,
  ) => void
  onMessageFailed?: (
    data: ExternalMessageFailedEventData,
    event: Extract<ExternalStreamEvent, { event: "message.failed" }>,
  ) => void
  onMessageAborted?: (
    data: ExternalMessageAbortedEventData,
    event: Extract<ExternalStreamEvent, { event: "message.aborted" }>,
  ) => void
  onResult?: (
    data: ExternalExecuteResponse,
    event: Extract<ExternalStreamEvent, { event: "result" }>,
  ) => void
  onError?: (
    data: ExternalStreamErrorEventData,
    event: Extract<ExternalStreamEvent, { event: "error" }>,
  ) => void
  onDone?: (
    data: ExternalDoneEventData,
    event: Extract<ExternalStreamEvent, { event: "done" }>,
  ) => void
}

export type ExternalAiCompleteStreamConsumer = {
  onEvent?: (event: ExternalAiStreamEvent) => void
  onResponseDelta?: (
    data: ExternalAiResponseDeltaEventData,
    event: Extract<ExternalAiStreamEvent, { event: "response.delta" }>,
  ) => void
  onResponseCompleted?: (
    data: ExternalAiResponseCompletedEventData,
    event: Extract<ExternalAiStreamEvent, { event: "response.completed" }>,
  ) => void
  onError?: (
    data: ExternalAiStreamErrorEventData,
    event: Extract<ExternalAiStreamEvent, { event: "error" }>,
  ) => void
  onDone?: (
    data: ExternalAiDoneEventData,
    event: Extract<ExternalAiStreamEvent, { event: "done" }>,
  ) => void
}

export declare class MaomiExternalApiError extends Error {
  status: number
  code: string
  data?: Record<string, unknown>
  requestId?: string
  constructor(input: {
    status: number
    code: string
    message: string
    data?: Record<string, unknown>
    requestId?: string
  })
}

export declare class MaomiExternalClient {
  constructor(options: ExternalApiClientOptions)
  readonly baseUrl: string
  readonly apiKey?: string
  readonly models: {
    list: (
      requestOptions?: ExternalRequestOptions,
    ) => Promise<ExternalModelsListResponse>
  }
  readonly workspaces: {
    list: (
      query?: ExternalWorkspaceListQuery,
      requestOptions?: ExternalRequestOptions,
    ) => Promise<ExternalWorkspaceListResponse>
    create: (
      input?: ExternalWorkspaceCreateInput,
      requestOptions?: ExternalRequestOptions,
    ) => Promise<ExternalWorkspaceCreateResponse>
    ensure: (
      workspaceId: string,
      input?: Omit<ExternalWorkspaceCreateInput, "workspaceId">,
      requestOptions?: ExternalRequestOptions,
    ) => Promise<ExternalWorkspaceCreateResponse>
    get: (
      workspaceId: string,
      requestOptions?: ExternalRequestOptions,
    ) => Promise<ExternalWorkspaceGetResponse>
    remove: (
      workspaceId: string,
      requestOptions?: ExternalRequestOptions,
    ) => Promise<ExternalWorkspaceDeleteResponse>
  }
  readonly sessions: {
    list: (
      workspaceId: string,
      query?: ExternalSessionsListQuery,
      requestOptions?: ExternalRequestOptions,
    ) => Promise<ExternalSessionsListResponse>
    create: (
      workspaceId: string,
      input?: ExternalSessionSeed,
      requestOptions?: ExternalRequestOptions,
    ) => Promise<ExternalSessionCreateResponse>
    get: (
      workspaceId: string,
      sessionId: string,
      requestOptions?: ExternalRequestOptions,
    ) => Promise<ExternalSessionResponse>
    remove: (
      workspaceId: string,
      sessionId: string,
      requestOptions?: ExternalRequestOptions,
    ) => Promise<ExternalSessionDeleteResponse>
    messages: {
      list: (
        workspaceId: string,
        sessionId: string,
        requestOptions?: ExternalRequestOptions,
      ) => Promise<ExternalSessionMessagesResponse>
    }
  }
  readonly ai: {
    capabilities: (
      workspaceId: string,
      query?: ExternalAiCapabilitiesQuery,
      requestOptions?: ExternalRequestOptions,
    ) => Promise<ExternalAiCapabilitiesResponse>
    recipes: {
      buildPromptOptimizePayload: typeof buildPromptOptimizePayload
      buildTextSummarizePayload: typeof buildTextSummarizePayload
      buildReportAnalyzePayload: typeof buildReportAnalyzePayload
      promptOptimize: (
        workspaceId: string,
        input: ExternalAiPromptOptimizeInput,
        requestOptions?: ExternalRequestOptions,
      ) => Promise<ExternalAiCompletionResponse>
      summarizeText: (
        workspaceId: string,
        input: ExternalAiTextSummarizeInput,
        requestOptions?: ExternalRequestOptions,
      ) => Promise<ExternalAiCompletionResponse>
      analyzeReport: (
        workspaceId: string,
        input: ExternalAiReportAnalyzeInput,
        requestOptions?: ExternalRequestOptions,
      ) => Promise<ExternalAiCompletionResponse>
    }
    complete: (
      workspaceId: string,
      payload: ExternalAiCompletionPayload,
      requestOptions?: ExternalRequestOptions,
    ) => Promise<ExternalAiCompletionResponse>
    completeStream: (
      workspaceId: string,
      payload: ExternalAiCompletionPayload,
      requestOptions?: ExternalRequestOptions,
    ) => AsyncIterable<ExternalAiStreamEvent>
    consumeCompleteStream: (
      workspaceId: string,
      payload: ExternalAiCompletionPayload,
      consumer?: ExternalAiCompleteStreamConsumer,
      requestOptions?: ExternalRequestOptions,
    ) => Promise<{
      result?: ExternalAiResponseCompletedEventData
      done?: ExternalAiDoneEventData
    }>
  }
  health(requestOptions?: ExternalRequestOptions): Promise<{
    ok: true
    service: string
    version: string
  }>
  listModels(requestOptions?: ExternalRequestOptions): Promise<ExternalModelsListResponse>
  listWorkspaces(
    query?: ExternalWorkspaceListQuery,
    requestOptions?: ExternalRequestOptions,
  ): Promise<ExternalWorkspaceListResponse>
  createWorkspace(
    input?: ExternalWorkspaceCreateInput,
    requestOptions?: ExternalRequestOptions,
  ): Promise<ExternalWorkspaceCreateResponse>
  ensureWorkspace(
    workspaceId: string,
    input?: Omit<ExternalWorkspaceCreateInput, "workspaceId">,
    requestOptions?: ExternalRequestOptions,
  ): Promise<ExternalWorkspaceCreateResponse>
  getWorkspace(
    workspaceId: string,
    requestOptions?: ExternalRequestOptions,
  ): Promise<ExternalWorkspaceGetResponse>
  removeWorkspace(
    workspaceId: string,
    requestOptions?: ExternalRequestOptions,
  ): Promise<ExternalWorkspaceDeleteResponse>
  listSessions(
    workspaceId: string,
    query?: ExternalSessionsListQuery,
    requestOptions?: ExternalRequestOptions,
  ): Promise<ExternalSessionsListResponse>
  createSession(
    workspaceId: string,
    input?: ExternalSessionSeed,
    requestOptions?: ExternalRequestOptions,
  ): Promise<ExternalSessionCreateResponse>
  getSession(
    workspaceId: string,
    sessionId: string,
    requestOptions?: ExternalRequestOptions,
  ): Promise<ExternalSessionResponse>
  removeSession(
    workspaceId: string,
    sessionId: string,
    requestOptions?: ExternalRequestOptions,
  ): Promise<ExternalSessionDeleteResponse>
  listSessionMessages(
    workspaceId: string,
    sessionId: string,
    requestOptions?: ExternalRequestOptions,
  ): Promise<ExternalSessionMessagesResponse>
  getAiCapabilities(
    workspaceId: string,
    query?: ExternalAiCapabilitiesQuery,
    requestOptions?: ExternalRequestOptions,
  ): Promise<ExternalAiCapabilitiesResponse>
  completeAi(
    workspaceId: string,
    payload: ExternalAiCompletionPayload,
    requestOptions?: ExternalRequestOptions,
  ): Promise<ExternalAiCompletionResponse>
  completeAiStream(
    workspaceId: string,
    payload: ExternalAiCompletionPayload,
    requestOptions?: ExternalRequestOptions,
  ): AsyncIterable<ExternalAiStreamEvent>
  consumeAiCompleteStream(
    workspaceId: string,
    payload: ExternalAiCompletionPayload,
    consumer?: ExternalAiCompleteStreamConsumer,
    requestOptions?: ExternalRequestOptions,
  ): Promise<{
    result?: ExternalAiResponseCompletedEventData
    done?: ExternalAiDoneEventData
  }>
  execute(
    workspaceId: string,
    payload: ExternalExecutePayload,
    requestOptions?: ExternalRequestOptions,
  ): Promise<ExternalExecuteResponse>
  executeStream(
    workspaceId: string,
    payload: ExternalExecutePayload,
    requestOptions?: ExternalRequestOptions,
  ): AsyncIterable<ExternalStreamEvent>
  consumeExecuteStream(
    workspaceId: string,
    payload: ExternalExecutePayload,
    consumer?: ExternalExecuteStreamConsumer,
    requestOptions?: ExternalRequestOptions,
  ): Promise<{
    result?: ExternalExecuteResponse
    done?: ExternalDoneEventData
  }>
}

export declare function createMaomiExternalClient(
  options: ExternalApiClientOptions,
): MaomiExternalClient
