import type {
  ContextCheckpointRecord,
  InteractionRecord,
  InteractionRequestPayload,
  InteractionResponsePayload,
  KernelError,
  KernelEvent,
  KernelMetadata,
  MessagePart,
  MessageRecordWithParts,
  RunBoundary,
  RunCompactionState,
  RunRecord,
  SessionRecord,
  ToolCallRecord,
} from "../../core"
import {
  RUN_COMPACTION_CONTINUATION_KIND_VALUES,
  RUN_COMPACTION_REASON_VALUES,
  RUN_COMPACTION_STATUS_VALUES,
  asInteractionRequestPayload,
  asInteractionResponsePayload,
} from "../../core"

export const CONVERSATION_TOOL_OPERATION_KIND_VALUES = [
  "tool_execution",
  "file_read",
  "file_write",
  "command_execution",
  "search",
  "custom",
] as const

export type ConversationToolOperationKind =
  (typeof CONVERSATION_TOOL_OPERATION_KIND_VALUES)[number]

export const CONVERSATION_RUNTIME_EVENT_TYPE_VALUES = [
  "session.created",
  "session.updated",
  "run.started",
  "run.completed",
  "run.blocked",
  "run.failed",
  "compaction.started",
  "compaction.completed",
  "compaction.failed",
  "message.appended",
  "message.parts.appended",
  "tool-call.updated",
  "interaction.updated",
  "context.checkpoint.created",
] as const

export type ConversationRuntimeEventType =
  (typeof CONVERSATION_RUNTIME_EVENT_TYPE_VALUES)[number]

export type ConversationUnknownPayload = {
  kind: "unknown"
  raw: unknown
}

export type ConversationInteractionRequestView =
  | InteractionRequestPayload
  | ConversationUnknownPayload

export type ConversationInteractionResponseView =
  | InteractionResponsePayload
  | ConversationUnknownPayload

export type ConversationSessionEntry = {
  sessionId: string
  title: string
  parentSessionId?: string
  status: SessionRecord["status"]
  createdAt: number
  updatedAt: number
  archivedAt?: number
  metadata?: KernelMetadata
}

export type ConversationRunRuntimeHostEntry = {
  hostId?: string
  state?: string
  reason?: string
  workspaceId?: string
  executionWorkspaceId?: string
  workspaceRoot?: string
  executionWorkspaceRoot?: string
  worktreeId?: string
  worktreeRoot?: string
  sandboxMode?: string
  runtimeProfileSignature?: string
  bindingSource?: string
  executionMode?: string
}

export type ConversationRunCompactionEntry = RunCompactionState

export type ConversationRunEntry = {
  runId: string
  sessionId: string
  status: RunRecord["status"]
  startedAt: number
  updatedAt: number
  completedAt?: number
  currentTurnId?: string
  trigger: RunRecord["trigger"]
  runtimeHost?: ConversationRunRuntimeHostEntry
  compaction?: ConversationRunCompactionEntry
  metadata?: KernelMetadata
}

export type ConversationToolSourceDescriptor = {
  sourceId?: string
  signature?: string
}

export type ConversationToolOperationDescriptor = {
  kind: ConversationToolOperationKind
  label?: string
  targetPaths?: readonly string[]
  command?: string
  cwd?: string
}

export type ConversationToolCallEntry = {
  callId: string
  sessionId: string
  runId: string
  turnId: string
  messageId: string
  toolName: string
  status: ToolCallRecord["status"]
  input: unknown
  output?: unknown
  error?: KernelError
  interactionId?: string
  startedAt: number
  updatedAt: number
  completedAt?: number
  source?: ConversationToolSourceDescriptor
  operation: ConversationToolOperationDescriptor
  metadata?: KernelMetadata
}

export type ConversationInteractionEntry = {
  interactionId: string
  sessionId: string
  runId: string
  toolCallId?: string
  kind: InteractionRecord["kind"]
  status: InteractionRecord["status"]
  request: ConversationInteractionRequestView
  response?: ConversationInteractionResponseView
  createdAt: number
  updatedAt: number
  metadata?: KernelMetadata
}

export type ConversationCheckpointEntry = {
  checkpointId: string
  sessionId: string
  kind: ContextCheckpointRecord["kind"]
  replacesThroughMessageId: string
  summaryMessageId: string
  createdAt: number
  metadata?: KernelMetadata
}

export type ConversationMessageTextPart = {
  type: "text" | "reasoning"
  partId: string
  text: string
}

export type ConversationMessageAttachmentPart = {
  type: "attachment"
  partId: string
  attachmentId: string
  mimeType: string
  name?: string
  kind?: "image" | "audio" | "video" | "file"
  path?: string
  assetId?: string
  assetMonth?: string
  fileName?: string
  sizeBytes?: number
}

export type ConversationMessageToolPart = {
  type: "tool_call" | "tool_result"
  partId: string
  toolCallId: string
  toolName: string
  input?: unknown
  toolCall?: ConversationToolCallEntry
}

export type ConversationMessageErrorPart = {
  type: "error"
  partId: string
  error: KernelError
}

export type ConversationMessageMetaPart = {
  type: "meta"
  partId: string
  data: KernelMetadata
}

export type ConversationMessagePartView =
  | ConversationMessageTextPart
  | ConversationMessageAttachmentPart
  | ConversationMessageToolPart
  | ConversationMessageErrorPart
  | ConversationMessageMetaPart

export type ConversationMessageEntry = {
  messageId: string
  sessionId: string
  runId?: string
  turnId?: string
  role: MessageRecordWithParts["message"]["role"]
  createdAt: number
  metadata?: KernelMetadata
  parts: readonly ConversationMessagePartView[]
}

export type ConversationTimelineEntry =
  | {
      type: "message"
      at: number
      message: ConversationMessageEntry
    }
  | {
      type: "tool_call"
      at: number
      toolCall: ConversationToolCallEntry
    }
  | {
      type: "interaction"
      at: number
      interaction: ConversationInteractionEntry
    }
  | {
      type: "checkpoint"
      at: number
      checkpoint: ConversationCheckpointEntry
    }

export type ConversationRunSnapshot = {
  session: ConversationSessionEntry
  run: ConversationRunEntry
  boundary: RunBoundary
  messages: readonly ConversationMessageEntry[]
  toolCalls: readonly ConversationToolCallEntry[]
  interactions: readonly ConversationInteractionEntry[]
  pendingInteractions: readonly ConversationInteractionEntry[]
  checkpoints: readonly ConversationCheckpointEntry[]
  timeline: readonly ConversationTimelineEntry[]
}

export type ConversationTurnOutputSnapshotInput = {
  session: SessionRecord
  run: RunRecord
  boundary: RunBoundary
  messages: readonly MessageRecordWithParts[]
  toolCalls: readonly ToolCallRecord[]
  interactions: readonly InteractionRecord[]
  checkpoints?: readonly ContextCheckpointRecord[]
}

type ConversationRuntimeEventBase<TType extends ConversationRuntimeEventType> = {
  type: TType
  eventId: string
  occurredAt: number
  sessionId: string
  runId?: string
}

export type ConversationRuntimeEvent =
  | (ConversationRuntimeEventBase<"session.created"> & {
      session: ConversationSessionEntry
    })
  | (ConversationRuntimeEventBase<"session.updated"> & {
      session: ConversationSessionEntry
    })
  | (ConversationRuntimeEventBase<"run.started"> & {
      run: ConversationRunEntry
    })
  | (ConversationRuntimeEventBase<"run.completed"> & {
      run: ConversationRunEntry
      boundary: Extract<RunBoundary, { kind: "completed" }>
    })
  | (ConversationRuntimeEventBase<"run.blocked"> & {
      run: ConversationRunEntry
      boundary: Extract<RunBoundary, { kind: "blocked" }>
    })
  | (ConversationRuntimeEventBase<"run.failed"> & {
      run: ConversationRunEntry
      boundary: Extract<RunBoundary, { kind: "failed" }>
    })
  | (ConversationRuntimeEventBase<"compaction.started"> & {
      run: ConversationRunEntry
      compaction: ConversationRunCompactionEntry
    })
  | (ConversationRuntimeEventBase<"compaction.completed"> & {
      run: ConversationRunEntry
      compaction: ConversationRunCompactionEntry
    })
  | (ConversationRuntimeEventBase<"compaction.failed"> & {
      run: ConversationRunEntry
      compaction: ConversationRunCompactionEntry
    })
  | (ConversationRuntimeEventBase<"message.appended"> & {
      message: ConversationMessageEntry
    })
  | (ConversationRuntimeEventBase<"message.parts.appended"> & {
      message: ConversationMessageEntry
    })
  | (ConversationRuntimeEventBase<"tool-call.updated"> & {
      toolCall: ConversationToolCallEntry
    })
  | (ConversationRuntimeEventBase<"interaction.updated"> & {
      interaction: ConversationInteractionEntry
    })
  | (ConversationRuntimeEventBase<"context.checkpoint.created"> & {
      checkpoint: ConversationCheckpointEntry
    })

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined
}

function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? [...value]
    : undefined
}

function readKernelError(value: unknown): KernelError | undefined {
  const error = isRecord(value) ? value : undefined
  const code = readString(error?.code)
  const message = readString(error?.message)

  if (!code || !message) {
    return undefined
  }

  const retryable = typeof error?.retryable === "boolean"
    ? error.retryable
    : undefined
  const metadata = isRecord(error?.metadata)
    ? error.metadata as KernelMetadata
    : undefined

  return {
    code,
    message,
    ...(retryable !== undefined ? { retryable } : {}),
    ...(metadata ? { metadata } : {}),
  }
}

function readInputRecord(input: unknown): Record<string, unknown> | undefined {
  return isRecord(input) ? input : undefined
}

function asUnknownPayload(raw: unknown): ConversationUnknownPayload {
  return {
    kind: "unknown",
    raw,
  }
}

function projectSession(session: SessionRecord): ConversationSessionEntry {
  return {
    sessionId: session.id,
    title: session.title,
    parentSessionId: session.parentSessionId,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    archivedAt: session.archivedAt,
    metadata: session.metadata,
  }
}

function cloneRunCompactionEntry(
  compaction: ConversationRunCompactionEntry,
): ConversationRunCompactionEntry {
  switch (compaction.status) {
    case "running":
      return {
        ...compaction,
      }
    case "completed":
      return {
        ...compaction,
        ...(compaction.replayMessageId
          ? { replayMessageId: compaction.replayMessageId }
          : {}),
        protectedToolNames: [...compaction.protectedToolNames],
      }
    case "failed":
      return {
        ...compaction,
        error: {
          ...compaction.error,
          ...(compaction.error.metadata
            ? { metadata: compaction.error.metadata }
            : {}),
        },
      }
  }
}

function projectRunCompactionRecord(
  compaction: Record<string, unknown> | undefined,
): ConversationRunCompactionEntry | undefined {
  const status = readString(compaction?.status)
  const attempt = readNumber(compaction?.attempt)
  const reason = readString(compaction?.reason)
  const startedAt = readNumber(compaction?.startedAt)

  if (
    !status
    || !(RUN_COMPACTION_STATUS_VALUES as readonly string[]).includes(status)
    || attempt === undefined
    || !reason
    || !(RUN_COMPACTION_REASON_VALUES as readonly string[]).includes(reason)
    || startedAt === undefined
  ) {
    return undefined
  }

  const normalizedReason = reason as ConversationRunCompactionEntry["reason"]

  switch (status) {
    case "running":
      return {
        status: "running",
        attempt,
        reason: normalizedReason,
        startedAt,
      }
    case "completed": {
      const completedAt = readNumber(compaction?.completedAt)
      const summaryMessageId = readString(compaction?.summaryMessageId)
      const checkpointId = readString(compaction?.checkpointId)
      const replayMessageId = readString(compaction?.replayMessageId)
      const continuationKind = readString(compaction?.continuationKind)
      const prunedMessageCount = readNumber(compaction?.prunedMessageCount)
      const protectedMessageCount = readNumber(compaction?.protectedMessageCount)
      const protectedToolNames = readStringArray(compaction?.protectedToolNames)

      if (
        completedAt === undefined
        || !summaryMessageId
        || !checkpointId
        || !continuationKind
        || !(RUN_COMPACTION_CONTINUATION_KIND_VALUES as readonly string[]).includes(continuationKind)
        || prunedMessageCount === undefined
        || protectedMessageCount === undefined
        || !protectedToolNames
      ) {
        return undefined
      }

      const normalizedContinuationKind = continuationKind as Extract<
        ConversationRunCompactionEntry,
        { status: "completed" }
      >["continuationKind"]

      return {
        status: "completed",
        attempt,
        reason: normalizedReason,
        startedAt,
        completedAt,
        summaryMessageId,
        checkpointId,
        ...(replayMessageId ? { replayMessageId } : {}),
        continuationKind: normalizedContinuationKind,
        prunedMessageCount,
        protectedMessageCount,
        protectedToolNames,
      }
    }
    case "failed": {
      const failedAt = readNumber(compaction?.failedAt)
      const error = readKernelError(compaction?.error)

      if (failedAt === undefined || !error) {
        return undefined
      }

      return {
        status: "failed",
        attempt,
        reason: normalizedReason,
        startedAt,
        failedAt,
        error,
      }
    }
  }
}

function projectRunCompaction(metadata?: KernelMetadata): ConversationRunCompactionEntry | undefined {
  return projectRunCompactionRecord(isRecord(metadata?.compaction)
    ? metadata.compaction
    : undefined)
}

function projectRunRuntimeHost(metadata?: KernelMetadata): ConversationRunRuntimeHostEntry | undefined {
  const runtimeHost = isRecord(metadata?.workspaceRuntime)
    ? metadata.workspaceRuntime
    : undefined

  if (!runtimeHost) {
    return undefined
  }

  const hostId = readString(runtimeHost.hostId)
  const state = readString(runtimeHost.state)
  const reason = readString(runtimeHost.reason)
  const workspaceId = readString(runtimeHost.workspaceId)
  const executionWorkspaceId = readString(runtimeHost.executionWorkspaceId)
  const workspaceRoot = readString(runtimeHost.workspaceRoot)
  const executionWorkspaceRoot = readString(runtimeHost.executionWorkspaceRoot)
  const worktreeId = readString(runtimeHost.worktreeId)
  const worktreeRoot = readString(runtimeHost.worktreeRoot)
  const sandboxMode = readString(runtimeHost.sandboxMode)
  const runtimeProfileSignature = readString(runtimeHost.runtimeProfileSignature)
  const bindingSource = readString(runtimeHost.bindingSource)
  const executionMode = readString(runtimeHost.executionMode)

  if (
    !hostId
    && !state
    && !reason
    && !workspaceId
    && !executionWorkspaceId
    && !workspaceRoot
    && !executionWorkspaceRoot
    && !worktreeId
    && !worktreeRoot
    && !sandboxMode
    && !runtimeProfileSignature
    && !bindingSource
    && !executionMode
  ) {
    return undefined
  }

  return {
    ...(hostId ? { hostId } : {}),
    ...(state ? { state } : {}),
    ...(reason ? { reason } : {}),
    ...(workspaceId ? { workspaceId } : {}),
    ...(executionWorkspaceId ? { executionWorkspaceId } : {}),
    ...(workspaceRoot ? { workspaceRoot } : {}),
    ...(executionWorkspaceRoot ? { executionWorkspaceRoot } : {}),
    ...(worktreeId ? { worktreeId } : {}),
    ...(worktreeRoot ? { worktreeRoot } : {}),
    ...(sandboxMode ? { sandboxMode } : {}),
    ...(runtimeProfileSignature ? { runtimeProfileSignature } : {}),
    ...(bindingSource ? { bindingSource } : {}),
    ...(executionMode ? { executionMode } : {}),
  }
}

function projectRun(run: RunRecord): ConversationRunEntry {
  return {
    runId: run.id,
    sessionId: run.sessionId,
    status: run.status,
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
    currentTurnId: run.currentTurnId,
    trigger: run.trigger,
    runtimeHost: projectRunRuntimeHost(run.metadata),
    compaction: projectRunCompaction(run.metadata),
    metadata: run.metadata,
  }
}

function projectToolSource(metadata?: KernelMetadata): ConversationToolSourceDescriptor | undefined {
  const sourceId = readString(metadata?.toolSourceId) ?? readString(metadata?.toolSourceKind)
  const signature = readString(metadata?.toolSourceSignature)

  if (!sourceId && !signature) {
    return undefined
  }

  return {
    ...(sourceId ? { sourceId } : {}),
    ...(signature ? { signature } : {}),
  }
}

function inferToolOperation(call: ToolCallRecord): ConversationToolOperationDescriptor {
  const input = readInputRecord(call.input)
  const output = readInputRecord(call.output)
  const metadataKind = readString(call.metadata?.operationKind)
  const targetPaths = readStringArray(call.metadata?.targetPaths)
    ?? (() => {
      const singlePath = readString(input?.path)
      if (singlePath) {
        return [singlePath]
      }

      return readStringArray(input?.paths)
    })()
  const command = readString(call.metadata?.command) ?? readString(input?.command)
  const cwd = readString(call.metadata?.cwd)
    ?? readString(input?.cwd)
    ?? readString(output?.cwd)
  const label = readString(call.metadata?.operationLabel)
  const normalizedToolName = call.toolName.toLowerCase()

  let kind: ConversationToolOperationKind
  if (
    metadataKind
    && (CONVERSATION_TOOL_OPERATION_KIND_VALUES as readonly string[]).includes(metadataKind)
  ) {
    kind = metadataKind as ConversationToolOperationKind
  } else if (command) {
    kind = "command_execution"
  } else if (targetPaths && /(read|view|cat)/.test(normalizedToolName)) {
    kind = "file_read"
  } else if (targetPaths && /(write|edit|patch|create|delete)/.test(normalizedToolName)) {
    kind = "file_write"
  } else if (/(search|grep|glob|find)/.test(normalizedToolName)) {
    kind = "search"
  } else {
    kind = "tool_execution"
  }

  return {
    kind,
    ...(label ? { label } : {}),
    ...(targetPaths ? { targetPaths } : {}),
    ...(command ? { command } : {}),
    ...(cwd ? { cwd } : {}),
  }
}

export function projectConversationToolCall(call: ToolCallRecord): ConversationToolCallEntry {
  return {
    callId: call.id,
    sessionId: call.sessionId,
    runId: call.runId,
    turnId: call.turnId,
    messageId: call.messageId,
    toolName: call.toolName,
    status: call.status,
    input: call.input,
    output: call.output,
    error: call.error,
    interactionId: call.interactionId,
    startedAt: call.startedAt,
    updatedAt: call.updatedAt,
    completedAt: call.completedAt,
    source: projectToolSource(call.metadata),
    operation: inferToolOperation(call),
    metadata: call.metadata,
  }
}

function projectInteractionRequest(interaction: InteractionRecord): ConversationInteractionRequestView {
  return asInteractionRequestPayload({
    kind: interaction.kind,
    value: interaction.request,
  }) ?? asUnknownPayload(interaction.request)
}

function projectInteractionResponse(interaction: InteractionRecord): ConversationInteractionResponseView | undefined {
  if (interaction.response === undefined) {
    return undefined
  }

  return asInteractionResponsePayload({
    kind: interaction.kind,
    status: interaction.status,
    value: interaction.response,
  }) ?? asUnknownPayload(interaction.response)
}

export function projectConversationInteraction(
  interaction: InteractionRecord,
): ConversationInteractionEntry {
  return {
    interactionId: interaction.id,
    sessionId: interaction.sessionId,
    runId: interaction.runId,
    toolCallId: interaction.toolCallId,
    kind: interaction.kind,
    status: interaction.status,
    request: projectInteractionRequest(interaction),
    response: projectInteractionResponse(interaction),
    createdAt: interaction.createdAt,
    updatedAt: interaction.updatedAt,
    metadata: interaction.metadata,
  }
}

export function projectConversationCheckpoint(
  checkpoint: ContextCheckpointRecord,
): ConversationCheckpointEntry {
  return {
    checkpointId: checkpoint.id,
    sessionId: checkpoint.sessionId,
    kind: checkpoint.kind,
    replacesThroughMessageId: checkpoint.replacesThroughMessageId,
    summaryMessageId: checkpoint.summaryMessageId,
    createdAt: checkpoint.createdAt,
    metadata: checkpoint.metadata,
  }
}

function projectMessagePart(input: {
  part: MessagePart
  toolCallsById: ReadonlyMap<ToolCallRecord["id"], ConversationToolCallEntry>
}): ConversationMessagePartView {
  switch (input.part.type) {
    case "text":
    case "reasoning":
      return {
        type: input.part.type,
        partId: input.part.id,
        text: input.part.text,
      }
    case "attachment":
      return {
        type: "attachment",
        partId: input.part.id,
        attachmentId: input.part.attachmentId,
        mimeType: input.part.mimeType,
        name: input.part.name,
        kind: input.part.kind,
        path: input.part.path,
        assetId: input.part.assetId,
        assetMonth: input.part.assetMonth,
        fileName: input.part.fileName,
        sizeBytes: input.part.sizeBytes,
      }
    case "tool_call_ref":
      return {
        type: "tool_call",
        partId: input.part.id,
        toolCallId: input.part.toolCallId,
        toolName: input.part.toolName,
        input: input.part.input,
        toolCall: input.toolCallsById.get(input.part.toolCallId),
      }
    case "tool_result_ref":
      return {
        type: "tool_result",
        partId: input.part.id,
        toolCallId: input.part.toolCallId,
        toolName: input.part.toolName,
        toolCall: input.toolCallsById.get(input.part.toolCallId),
      }
    case "error":
      return {
        type: "error",
        partId: input.part.id,
        error: input.part.error,
      }
    case "meta":
      return {
        type: "meta",
        partId: input.part.id,
        data: input.part.data,
      }
  }
}

export function projectConversationMessage(input: {
  message: MessageRecordWithParts
  toolCallsById: ReadonlyMap<ToolCallRecord["id"], ConversationToolCallEntry>
}): ConversationMessageEntry {
  return {
    messageId: input.message.message.id,
    sessionId: input.message.message.sessionId,
    runId: input.message.message.runId,
    turnId: input.message.message.turnId,
    role: input.message.message.role,
    createdAt: input.message.message.createdAt,
    metadata: input.message.message.metadata,
    parts: input.message.parts.map((part) => projectMessagePart({
      part,
      toolCallsById: input.toolCallsById,
    })),
  }
}

export function buildConversationRunSnapshot(
  input: ConversationTurnOutputSnapshotInput,
): ConversationRunSnapshot {
  const toolCalls = input.toolCalls.map((call) => projectConversationToolCall(call))
  const toolCallsById = new Map<ToolCallRecord["id"], ConversationToolCallEntry>(
    toolCalls.map((call) => [call.callId as ToolCallRecord["id"], call]),
  )
  const messages = input.messages.map((message) => projectConversationMessage({
    message,
    toolCallsById,
  }))
  const interactions = input.interactions.map((interaction) => projectConversationInteraction(interaction))
  const checkpoints = (input.checkpoints ?? []).map((checkpoint) =>
    projectConversationCheckpoint(checkpoint))
  const pendingInteractions = interactions.filter((interaction) => interaction.status === "pending")
  const timeline: ConversationTimelineEntry[] = [
    ...messages.map((message) => ({
      type: "message" as const,
      at: message.createdAt,
      message,
    })),
    ...toolCalls.map((toolCall) => ({
      type: "tool_call" as const,
      at: toolCall.startedAt,
      toolCall,
    })),
    ...interactions.map((interaction) => ({
      type: "interaction" as const,
      at: interaction.createdAt,
      interaction,
    })),
    ...checkpoints.map((checkpoint) => ({
      type: "checkpoint" as const,
      at: checkpoint.createdAt,
      checkpoint,
    })),
  ].sort((left, right) => left.at - right.at)

  return {
    session: projectSession(input.session),
    run: projectRun(input.run),
    boundary: input.boundary,
    messages,
    toolCalls,
    interactions,
    pendingInteractions,
    checkpoints,
    timeline,
  }
}

export function projectKernelEventToConversationRuntimeEvent(
  event: KernelEvent,
): ConversationRuntimeEvent | null {
  const base = {
    eventId: event.id,
    occurredAt: event.occurredAt,
  }

  switch (event.type) {
    case "session.created": {
      const typedEvent = event as KernelEvent<"session.created">
      const session = projectSession(typedEvent.payload.session)
      return {
        ...base,
        type: "session.created",
        sessionId: session.sessionId,
        session,
      }
    }
    case "session.updated": {
      const typedEvent = event as KernelEvent<"session.updated">
      const session = projectSession(typedEvent.payload.session)
      return {
        ...base,
        type: "session.updated",
        sessionId: session.sessionId,
        session,
      }
    }
    case "run.started": {
      const typedEvent = event as KernelEvent<"run.started">
      const run = projectRun(typedEvent.payload.run)
      return {
        ...base,
        type: "run.started",
        sessionId: run.sessionId,
        runId: run.runId,
        run,
      }
    }
    case "run.completed": {
      const typedEvent = event as KernelEvent<"run.completed">
      const run = projectRun(typedEvent.payload.run)
      return {
        ...base,
        type: "run.completed",
        sessionId: run.sessionId,
        runId: run.runId,
        run,
        boundary: typedEvent.payload.boundary,
      }
    }
    case "run.blocked": {
      const typedEvent = event as KernelEvent<"run.blocked">
      const run = projectRun(typedEvent.payload.run)
      return {
        ...base,
        type: "run.blocked",
        sessionId: run.sessionId,
        runId: run.runId,
        run,
        boundary: typedEvent.payload.boundary,
      }
    }
    case "run.failed": {
      const typedEvent = event as KernelEvent<"run.failed">
      const run = projectRun(typedEvent.payload.run)
      return {
        ...base,
        type: "run.failed",
        sessionId: run.sessionId,
        runId: run.runId,
        run,
        boundary: typedEvent.payload.boundary,
      }
    }
    case "compaction.started": {
      const typedEvent = event as KernelEvent<"compaction.started">
      const run = projectRun(typedEvent.payload.run)
      return {
        ...base,
        type: "compaction.started",
        sessionId: run.sessionId,
        runId: run.runId,
        run,
        compaction: cloneRunCompactionEntry(typedEvent.payload.compaction),
      }
    }
    case "compaction.completed": {
      const typedEvent = event as KernelEvent<"compaction.completed">
      const run = projectRun(typedEvent.payload.run)
      return {
        ...base,
        type: "compaction.completed",
        sessionId: run.sessionId,
        runId: run.runId,
        run,
        compaction: cloneRunCompactionEntry(typedEvent.payload.compaction),
      }
    }
    case "compaction.failed": {
      const typedEvent = event as KernelEvent<"compaction.failed">
      const run = projectRun(typedEvent.payload.run)
      return {
        ...base,
        type: "compaction.failed",
        sessionId: run.sessionId,
        runId: run.runId,
        run,
        compaction: cloneRunCompactionEntry(typedEvent.payload.compaction),
      }
    }
    case "message.appended": {
      const typedEvent = event as KernelEvent<"message.appended">
      const message = projectConversationMessage({
        message: typedEvent.payload.message,
        toolCallsById: new Map(),
      })
      return {
        ...base,
        type: "message.appended",
        sessionId: message.sessionId,
        runId: message.runId,
        message,
      }
    }
    case "message.parts.appended": {
      const typedEvent = event as KernelEvent<"message.parts.appended">
      const message = projectConversationMessage({
        message: {
          message: typedEvent.payload.message,
          parts: typedEvent.payload.parts,
        },
        toolCallsById: new Map(),
      })
      return {
        ...base,
        type: "message.parts.appended",
        sessionId: message.sessionId,
        runId: message.runId,
        message,
      }
    }
    case "tool-call.updated": {
      const typedEvent = event as KernelEvent<"tool-call.updated">
      const toolCall = projectConversationToolCall(typedEvent.payload.toolCall)
      return {
        ...base,
        type: "tool-call.updated",
        sessionId: toolCall.sessionId,
        runId: toolCall.runId,
        toolCall,
      }
    }
    case "interaction.updated": {
      const typedEvent = event as KernelEvent<"interaction.updated">
      const interaction = projectConversationInteraction(typedEvent.payload.interaction)
      return {
        ...base,
        type: "interaction.updated",
        sessionId: interaction.sessionId,
        runId: interaction.runId,
        interaction,
      }
    }
    case "context.checkpoint.created": {
      const typedEvent = event as KernelEvent<"context.checkpoint.created">
      const checkpoint = projectConversationCheckpoint(typedEvent.payload.checkpoint)
      return {
        ...base,
        type: "context.checkpoint.created",
        sessionId: checkpoint.sessionId,
        checkpoint,
      }
    }
    default:
      return null
  }
}