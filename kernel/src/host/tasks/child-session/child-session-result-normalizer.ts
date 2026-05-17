import type {
  InteractionId,
  KernelError,
  MessageRecordWithParts,
  RunBoundary,
  RunRecord,
  RunStatus,
  SessionRecord,
} from "../../../core"

export type ChildSessionResolutionMetadata = Readonly<{
  phase: "child_session_resolution"
  resolutionKind: "completed" | "blocked" | "cancelled" | "timed_out" | "failed"
  sessionId: SessionRecord["id"]
  runId?: RunRecord["id"]
  interactionId?: InteractionId
  reason?: string
  timeoutMs?: number
  error?: KernelError
  [key: string]: unknown
}>

type ChildSessionTerminalResolution = Extract<ChildSessionResolution, { kind: "cancelled" | "timed_out" }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function readKernelError(value: unknown): KernelError | undefined {
  if (!isRecord(value) || typeof value.code !== "string" || typeof value.message !== "string") {
    return undefined
  }

  return {
    code: value.code,
    message: value.message,
    ...(typeof value.retryable === "boolean" ? { retryable: value.retryable } : {}),
    ...(isRecord(value.metadata) ? { metadata: value.metadata } : {}),
  }
}

export function buildChildSessionResolutionMetadata(input: {
  resolutionKind: ChildSessionResolutionMetadata["resolutionKind"]
  sessionId: SessionRecord["id"]
  runId?: RunRecord["id"]
  interactionId?: InteractionId
  reason?: string
  timeoutMs?: number
  error?: KernelError
  metadata?: Readonly<Record<string, unknown>>
}): ChildSessionResolutionMetadata {
  return {
    ...(input.metadata ?? {}),
    phase: "child_session_resolution",
    resolutionKind: input.resolutionKind,
    sessionId: input.sessionId,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.interactionId ? { interactionId: input.interactionId } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(typeof input.timeoutMs === "number" ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.error ? { error: input.error } : {}),
  }
}

function readChildSessionResolutionMetadata(
  value: unknown,
): ChildSessionResolutionMetadata | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  if (
    value.phase !== "child_session_resolution"
    || (
      value.resolutionKind !== "completed"
      && value.resolutionKind !== "blocked"
      && value.resolutionKind !== "cancelled"
      && value.resolutionKind !== "timed_out"
      && value.resolutionKind !== "failed"
    )
    || typeof value.sessionId !== "string"
  ) {
    return undefined
  }

  return {
    ...value,
    phase: "child_session_resolution",
    resolutionKind: value.resolutionKind,
    sessionId: value.sessionId as SessionRecord["id"],
    ...(typeof value.runId === "string"
      ? { runId: value.runId as RunRecord["id"] }
      : {}),
    ...(typeof value.interactionId === "string"
      ? { interactionId: value.interactionId as InteractionId }
      : {}),
    ...(typeof value.reason === "string" ? { reason: value.reason } : {}),
    ...(typeof value.timeoutMs === "number" && Number.isFinite(value.timeoutMs)
      ? { timeoutMs: value.timeoutMs }
      : {}),
    ...(readKernelError(value.error) ? { error: readKernelError(value.error) } : {}),
  }
}

export type ChildSessionResolution =
  | {
      kind: "boundary"
      boundary: RunBoundary
    }
  | {
      kind: "cancelled"
      reason?: string
      metadata?: ChildSessionResolutionMetadata
    }
  | {
      kind: "timed_out"
      timeoutMs: number
      metadata?: ChildSessionResolutionMetadata
    }

export type ChildSessionOutcome =
  | {
      kind: "running"
      status?: RunStatus
      outputText?: string
    }
  | {
      kind: "completed"
      outputText?: string
      metadata?: ChildSessionResolutionMetadata
    }
  | {
      kind: "blocked"
      interactionId?: InteractionId
      outputText?: string
      metadata?: ChildSessionResolutionMetadata
    }
  | {
      kind: "failed"
      error?: KernelError
      outputText?: string
      metadata?: ChildSessionResolutionMetadata
    }
  | {
      kind: "cancelled"
      reason?: string
      outputText?: string
      metadata?: ChildSessionResolutionMetadata
    }
  | {
      kind: "timed_out"
      timeoutMs: number
      outputText?: string
      metadata?: ChildSessionResolutionMetadata
    }

export type ChildSessionResult = {
  session: SessionRecord
  run?: RunRecord
  messages: readonly MessageRecordWithParts[]
  assistantMessages: readonly MessageRecordWithParts[]
  lastAssistantText?: string
  outcome: ChildSessionOutcome
}

export type ChildSessionNormalizationInput = {
  session: SessionRecord
  run?: RunRecord
  messages: readonly MessageRecordWithParts[]
  resolution?: ChildSessionResolution
}

export interface ChildSessionResultNormalizerPort {
  normalize(input: ChildSessionNormalizationInput): ChildSessionResult
}

function buildLastAssistantText(messages: readonly MessageRecordWithParts[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message || message.message.role !== "assistant") {
      continue
    }

    const text = message.parts
      .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim()

    if (text) {
      return text
    }
  }

  return undefined
}

function resolveRunningOutcome(run: RunRecord | undefined, outputText?: string): ChildSessionOutcome {
  return {
    kind: "running",
    status: run?.status,
    outputText,
  }
}

function buildResolutionOutcome(input: {
  session: SessionRecord
  run?: RunRecord
  resolution: ChildSessionTerminalResolution
  outputText?: string
}): ChildSessionOutcome {
  if (input.resolution.kind === "cancelled") {
    return {
      kind: "cancelled",
      reason: input.resolution.reason,
      outputText: input.outputText,
      metadata: buildChildSessionResolutionMetadata({
        resolutionKind: "cancelled",
        sessionId: input.session.id,
        runId: input.run?.id,
        reason: input.resolution.reason,
        metadata: input.resolution.metadata,
      }),
    }
  }

  return {
    kind: "timed_out",
    timeoutMs: input.resolution.timeoutMs,
    outputText: input.outputText,
    metadata: buildChildSessionResolutionMetadata({
      resolutionKind: "timed_out",
      sessionId: input.session.id,
      runId: input.run?.id,
      timeoutMs: input.resolution.timeoutMs,
      metadata: input.resolution.metadata,
    }),
  }
}

function buildCompletedOutcome(input: {
  session: SessionRecord
  run?: RunRecord
  outputText?: string
  metadata?: ChildSessionResolutionMetadata
}): ChildSessionOutcome {
  return {
    kind: "completed",
    outputText: input.outputText,
    metadata: buildChildSessionResolutionMetadata({
      resolutionKind: "completed",
      sessionId: input.session.id,
      runId: input.run?.id,
      metadata: input.metadata,
    }),
  }
}

function buildBlockedOutcome(input: {
  session: SessionRecord
  run?: RunRecord
  interactionId?: InteractionId
  outputText?: string
  metadata?: ChildSessionResolutionMetadata
}): ChildSessionOutcome {
  return {
    kind: "blocked",
    interactionId: input.interactionId,
    outputText: input.outputText,
    metadata: buildChildSessionResolutionMetadata({
      resolutionKind: "blocked",
      sessionId: input.session.id,
      runId: input.run?.id,
      interactionId: input.interactionId,
      metadata: input.metadata,
    }),
  }
}

function buildFailedOutcome(input: {
  session: SessionRecord
  run?: RunRecord
  error?: KernelError
  outputText?: string
  metadata?: ChildSessionResolutionMetadata
}): ChildSessionOutcome {
  const error = input.error ?? input.metadata?.error

  return {
    kind: "failed",
    error,
    outputText: input.outputText,
    metadata: buildChildSessionResolutionMetadata({
      resolutionKind: "failed",
      sessionId: input.session.id,
      runId: input.run?.id,
      error,
      metadata: input.metadata,
    }),
  }
}

function inferResolutionFromCancelledRun(input: {
  session: SessionRecord
  run?: RunRecord
}): ChildSessionTerminalResolution | undefined {
  if (input.run?.status !== "cancelled") {
    return undefined
  }

  const runMetadata = isRecord(input.run.metadata) ? input.run.metadata : undefined
  const resolutionMetadata = readChildSessionResolutionMetadata(runMetadata?.childSessionResolution)

  if (resolutionMetadata?.resolutionKind === "timed_out" && typeof resolutionMetadata.timeoutMs === "number") {
    return {
      kind: "timed_out",
      timeoutMs: resolutionMetadata.timeoutMs,
      metadata: buildChildSessionResolutionMetadata({
        resolutionKind: "timed_out",
        sessionId: input.session.id,
        runId: input.run.id,
        timeoutMs: resolutionMetadata.timeoutMs,
        metadata: resolutionMetadata,
      }),
    }
  }

  const reason = resolutionMetadata?.reason ?? readString(runMetadata?.cancelReason)

  return {
    kind: "cancelled",
    ...(reason ? { reason } : {}),
    metadata: buildChildSessionResolutionMetadata({
      resolutionKind: "cancelled",
      sessionId: input.session.id,
      runId: input.run.id,
      ...(reason ? { reason } : {}),
      metadata: resolutionMetadata,
    }),
  }
}

function readStoredResolutionMetadata(run: RunRecord | undefined): ChildSessionResolutionMetadata | undefined {
  const runMetadata = isRecord(run?.metadata) ? run.metadata : undefined
  return readChildSessionResolutionMetadata(runMetadata?.childSessionResolution)
}

function resolveOutcome(input: {
  session: SessionRecord
  run?: RunRecord
  resolution?: ChildSessionResolution
  outputText?: string
}): ChildSessionOutcome {
  if (input.resolution?.kind === "cancelled") {
    return buildResolutionOutcome({
      session: input.session,
      run: input.run,
      resolution: input.resolution,
      outputText: input.outputText,
    })
  }

  if (input.resolution?.kind === "timed_out") {
    return buildResolutionOutcome({
      session: input.session,
      run: input.run,
      resolution: input.resolution,
      outputText: input.outputText,
    })
  }

  if (input.resolution?.kind === "boundary") {
    switch (input.resolution.boundary.kind) {
      case "completed":
        return buildCompletedOutcome({
          session: input.session,
          run: input.run,
          outputText: input.outputText,
        })
      case "blocked":
        return buildBlockedOutcome({
          session: input.session,
          run: input.run,
          interactionId: input.resolution.boundary.interactionId,
          outputText: input.outputText,
        })
      case "failed":
        return buildFailedOutcome({
          session: input.session,
          run: input.run,
          error: input.resolution.boundary.error,
          outputText: input.outputText,
        })
      case "awaiting_compaction":
        return resolveRunningOutcome(input.run, input.outputText)
    }
  }

  switch (input.run?.status) {
    case "completed":
      return buildCompletedOutcome({
        session: input.session,
        run: input.run,
        outputText: input.outputText,
        metadata: readStoredResolutionMetadata(input.run),
      })
    case "blocked":
      return buildBlockedOutcome({
        session: input.session,
        run: input.run,
        interactionId: readStoredResolutionMetadata(input.run)?.interactionId,
        outputText: input.outputText,
        metadata: readStoredResolutionMetadata(input.run),
      })
    case "failed":
      return buildFailedOutcome({
        session: input.session,
        run: input.run,
        error: readStoredResolutionMetadata(input.run)?.error,
        outputText: input.outputText,
        metadata: readStoredResolutionMetadata(input.run),
      })
    case "cancelled":
      return buildResolutionOutcome({
        session: input.session,
        run: input.run,
        resolution: inferResolutionFromCancelledRun({
          session: input.session,
          run: input.run,
        }) ?? {
          kind: "cancelled",
        },
        outputText: input.outputText,
      })
    case "created":
    case "planning":
    case "streaming":
    case "executing_tools":
    case "awaiting_compaction":
      return resolveRunningOutcome(input.run, input.outputText)
    default:
      return resolveRunningOutcome(input.run, input.outputText)
  }
}

export class DefaultChildSessionResultNormalizer implements ChildSessionResultNormalizerPort {
  normalize(input: ChildSessionNormalizationInput): ChildSessionResult {
    const assistantMessages = input.messages.filter((message) => message.message.role === "assistant")
    const lastAssistantText = buildLastAssistantText(input.messages)

    return {
      session: input.session,
      run: input.run,
      messages: [...input.messages],
      assistantMessages,
      lastAssistantText,
      outcome: resolveOutcome({
        session: input.session,
        run: input.run,
        resolution: input.resolution,
        outputText: lastAssistantText,
      }),
    }
  }
}
