import {
  asMessageId,
  asMessagePartId,
  asSessionId,
  type ClockPort,
  createKernelFailure,
  type IdGeneratorPort,
  type KernelError,
  type MessagePart,
  type MessageRecord,
  type MessageRecordWithParts,
  type MessageRole,
  type MessageStorePort,
  type RunBoundary,
  type RunRecord,
  type RunStorePort,
  type RunTrigger,
  type SessionRecord,
  type SessionStorePort,
  type UnitOfWorkPort,
} from "../../../core"
import {
  buildChildSessionResolutionMetadata,
  type ChildSessionNormalizationInput,
  type ChildSessionResolution,
  type ChildSessionResult,
  type ChildSessionResultNormalizerPort,
  DefaultChildSessionResultNormalizer,
} from "./child-session-result-normalizer"

type DraftMessagePartWithoutId<TPart> = TPart extends { id: unknown }
  ? Omit<TPart, "id">
  : never

export type ChildSessionDraftMessagePart = DraftMessagePartWithoutId<MessagePart>

export type ChildSessionDraftMessage = {
  role: MessageRole
  parts: readonly ChildSessionDraftMessagePart[]
  metadata?: MessageRecord["metadata"]
  createdAt?: number
}

export type ChildSessionRunStarter = {
  start(input: {
    sessionId: SessionRecord["id"]
    trigger: RunTrigger
    metadata?: RunRecord["metadata"]
  }): Promise<{
    run: RunRecord
    boundary: RunBoundary
  }>
}

export interface ChildSessionRunnerPort {
  run(input: RunChildSessionInput): Promise<ChildSessionResult>
  join(input: JoinChildSessionInput): Promise<ChildSessionResult>
  cancel(input: CancelChildSessionInput): Promise<ChildSessionResult>
}

export type RunChildSessionInput = {
  parentSessionId: SessionRecord["id"]
  title: string
  sessionId?: SessionRecord["id"]
  sessionMetadata?: SessionRecord["metadata"]
  runMetadata?: RunRecord["metadata"]
  initialMessages: readonly ChildSessionDraftMessage[]
  trigger?: RunTrigger
  timeoutMs?: number
  signal?: AbortSignal
}

export type JoinChildSessionInput = {
  sessionId: SessionRecord["id"]
  runId?: RunRecord["id"]
  resolution?: ChildSessionResolution
}

export type CancelChildSessionInput = {
  sessionId: SessionRecord["id"]
  runId?: RunRecord["id"]
  reason?: string
  resolution?: Extract<ChildSessionResolution, { kind: "cancelled" | "timed_out" }>
}

type ChildSessionRunnerOptions = {
  sessionStore: SessionStorePort
  runStore: RunStorePort
  messageStore: MessageStorePort
  runStarter: ChildSessionRunStarter
  resultNormalizer?: ChildSessionResultNormalizerPort
  unitOfWork: UnitOfWorkPort
  clock: ClockPort
  idGenerator: IdGeneratorPort
}

class ChildSessionTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Child session timed out after ${timeoutMs}ms`)
  }
}

class ChildSessionCancelledError extends Error {
  constructor(readonly reason?: string) {
    super(reason ? `Child session cancelled: ${reason}` : "Child session cancelled")
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function buildChildSessionProtocolFailure(input: {
  code: string
  message: string
  phase: string
  metadata?: Record<string, unknown>
}): KernelError {
  return createKernelFailure({
    code: input.code,
    message: input.message,
    retryable: false,
    phase: input.phase,
    failureKind: "protocol",
    metadata: input.metadata,
  })
}

function mergeFailureMetadata(input: {
  error: KernelError
  metadata?: Record<string, unknown>
}): KernelError {
  if (!input.metadata || Object.keys(input.metadata).length === 0) {
    return input.error
  }

  const nextMetadata = isRecord(input.error.metadata)
    ? { ...input.error.metadata }
    : {}

  for (const [key, value] of Object.entries(input.metadata)) {
    if (nextMetadata[key] === undefined) {
      nextMetadata[key] = value
    }
  }

  return {
    ...input.error,
    metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined,
  }
}

function normalizeKernelError(input: {
  error: unknown
  metadata?: Record<string, unknown>
}): KernelError {
  const error = input.error
  if (
    error
    && typeof error === "object"
    && typeof (error as Record<string, unknown>).code === "string"
    && typeof (error as Record<string, unknown>).message === "string"
  ) {
    return mergeFailureMetadata({
      error: {
      code: (error as Record<string, unknown>).code as string,
      message: (error as Record<string, unknown>).message as string,
      retryable:
        typeof (error as Record<string, unknown>).retryable === "boolean"
          ? (error as Record<string, unknown>).retryable as boolean
          : undefined,
      metadata:
        (error as Record<string, unknown>).metadata
        && typeof (error as Record<string, unknown>).metadata === "object"
        && !Array.isArray((error as Record<string, unknown>).metadata)
          ? (error as Record<string, unknown>).metadata as Record<string, unknown>
          : undefined,
      },
      metadata: input.metadata,
    })
  }

  if (error instanceof Error) {
    return createKernelFailure({
      code: "child_session_failed",
      message: error.message,
      phase: "child_session_execution",
      failureKind: "child_session_runtime",
      metadata: input.metadata,
    })
  }

  return createKernelFailure({
    code: "child_session_failed",
    message: "Unknown child session failure",
    phase: "child_session_execution",
    failureKind: "child_session_runtime",
    metadata: input.metadata,
  })
}

function buildDraftMessagePart(
  draft: ChildSessionDraftMessagePart,
  idGenerator: IdGeneratorPort,
): MessagePart {
  return {
    ...draft,
    id: asMessagePartId(idGenerator.next("part")),
  } as MessagePart
}

function buildDraftMessages(input: {
  sessionId: SessionRecord["id"]
  idGenerator: IdGeneratorPort
  clock: ClockPort
  drafts: readonly ChildSessionDraftMessage[]
}): MessageRecordWithParts[] {
  return input.drafts.map((draft) => ({
    message: {
      id: asMessageId(input.idGenerator.next("message")),
      sessionId: input.sessionId,
      role: draft.role,
      createdAt: draft.createdAt ?? input.clock.now(),
      metadata: draft.metadata ? { ...draft.metadata } : undefined,
    },
    parts: draft.parts.map((part) => buildDraftMessagePart(part, input.idGenerator)),
  }))
}

function buildDefaultTrigger(messages: readonly MessageRecordWithParts[]): RunTrigger {
  const firstMessage = messages[0]
  if (!firstMessage) {
    return {
      kind: "system_continue",
    }
  }

  return {
    kind: firstMessage.message.role === "user" ? "user_message" : "system_continue",
    refId: firstMessage.message.id,
  }
}

function extractAbortReason(signal: AbortSignal): string | undefined {
  if (typeof signal.reason === "string") {
    return signal.reason
  }

  return undefined
}

function mergeMetadata(
  existing: RunRecord["metadata"] | SessionRecord["metadata"],
  extra?: Record<string, unknown>,
): RunRecord["metadata"] | SessionRecord["metadata"] {
  if (!existing && !extra) {
    return undefined
  }

  return {
    ...(existing ? { ...existing } : {}),
    ...(extra ? { ...extra } : {}),
  }
}

function buildTerminalBoundaryMetadata(input: {
  sessionId: SessionRecord["id"]
  runId: RunRecord["id"]
  boundary: Extract<RunBoundary, { kind: "completed" | "blocked" | "failed" }>
}): ChildSessionNormalizationInput["resolution"] extends never ? never : ReturnType<typeof buildChildSessionResolutionMetadata> {
  return buildChildSessionResolutionMetadata({
    resolutionKind: input.boundary.kind,
    sessionId: input.sessionId,
    runId: input.runId,
    ...(input.boundary.kind === "blocked"
      ? { interactionId: input.boundary.interactionId }
      : {}),
    ...(input.boundary.kind === "failed"
      ? { error: input.boundary.error }
      : {}),
  })
}

async function waitForChildRunResult<T>(input: {
  promise: Promise<T>
  timeoutMs?: number
  signal?: AbortSignal
}): Promise<T> {
  if (!input.timeoutMs && !input.signal) {
    return input.promise
  }

  return await new Promise<T>((resolve, reject) => {
    let settled = false
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }

      if (input.signal) {
        input.signal.removeEventListener("abort", onAbort)
      }
    }

    const settle = (fn: () => void) => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      fn()
    }

    const onAbort = () => {
      settle(() => reject(new ChildSessionCancelledError(input.signal ? extractAbortReason(input.signal) : undefined)))
    }

    if (input.signal?.aborted) {
      onAbort()
      return
    }

    if (typeof input.timeoutMs === "number") {
      timeoutHandle = setTimeout(() => {
        settle(() => reject(new ChildSessionTimeoutError(input.timeoutMs!)))
      }, input.timeoutMs)
    }

    if (input.signal) {
      input.signal.addEventListener("abort", onAbort, { once: true })
    }

    input.promise.then(
      (value) => {
        settle(() => resolve(value))
      },
      (error) => {
        settle(() => reject(error))
      },
    )
  })
}

export class ChildSessionRunner implements ChildSessionRunnerPort {
  private readonly resultNormalizer: ChildSessionResultNormalizerPort

  constructor(private readonly options: ChildSessionRunnerOptions) {
    this.resultNormalizer = options.resultNormalizer ?? new DefaultChildSessionResultNormalizer()
  }

  async run(input: RunChildSessionInput): Promise<ChildSessionResult> {
    if (input.initialMessages.length === 0) {
      throw buildChildSessionProtocolFailure({
        code: "child_session_initial_messages_required",
        message: "Child session runner requires at least one initial message",
        phase: "child_session_input_validation",
        metadata: {
          parentSessionId: input.parentSessionId,
          title: input.title,
        },
      })
    }

    await this.options.sessionStore.get(input.parentSessionId)
    const childSession = await this.createChildSession(input)
    const trigger = input.trigger ?? buildDefaultTrigger(childSession.messages)

    try {
      const started = await waitForChildRunResult({
        promise: this.options.runStarter.start({
          sessionId: childSession.session.id,
          trigger,
          metadata: input.runMetadata,
        }),
        timeoutMs: input.timeoutMs,
        signal: input.signal,
      })

      if (
        started.boundary.kind === "completed"
        || started.boundary.kind === "blocked"
        || started.boundary.kind === "failed"
      ) {
        await this.options.runStore.save({
          ...started.run,
          metadata: mergeMetadata(started.run.metadata, {
            childSessionResolution: buildTerminalBoundaryMetadata({
              sessionId: childSession.session.id,
              runId: started.run.id,
              boundary: started.boundary,
            }),
          }),
        })
      }

      return this.join({
        sessionId: childSession.session.id,
        runId: started.run.id,
        resolution: {
          kind: "boundary",
          boundary: started.boundary,
        },
      })
    } catch (error) {
      if (error instanceof ChildSessionTimeoutError) {
        return this.cancel({
          sessionId: childSession.session.id,
          reason: `timeout:${error.timeoutMs}`,
          resolution: {
            kind: "timed_out",
            timeoutMs: error.timeoutMs,
          },
        })
      }

      if (error instanceof ChildSessionCancelledError) {
        return this.cancel({
          sessionId: childSession.session.id,
          reason: error.reason,
          resolution: {
            kind: "cancelled",
            reason: error.reason,
          },
        })
      }

      const latestRun = await this.loadLatestRun(childSession.session.id)
      const normalizedError = normalizeKernelError({
        error,
        metadata: {
          parentSessionId: input.parentSessionId,
          sessionId: childSession.session.id,
          ...(latestRun?.id ? { runId: latestRun.id } : {}),
        },
      })

      if (latestRun?.status === "failed") {
        await this.options.runStore.save({
          ...latestRun,
          metadata: mergeMetadata(latestRun.metadata, {
            childSessionResolution: buildChildSessionResolutionMetadata({
              resolutionKind: "failed",
              sessionId: childSession.session.id,
              runId: latestRun.id,
              error: normalizedError,
            }),
          }),
        })
      }

      return this.join({
        sessionId: childSession.session.id,
        runId: latestRun?.id,
        resolution: {
          kind: "boundary",
          boundary: {
            kind: "failed",
            error: normalizedError,
          },
        },
      })
    }
  }

  async join(input: JoinChildSessionInput): Promise<ChildSessionResult> {
    const session = await this.options.sessionStore.get(input.sessionId)
    const run = input.runId
      ? await this.loadRunForSession(input.sessionId, input.runId)
      : await this.loadLatestRun(input.sessionId)
    const messages = await this.options.messageStore.listBySession(input.sessionId)

    return this.resultNormalizer.normalize({
      session,
      run,
      messages,
      resolution: input.resolution,
    })
  }

  async cancel(input: CancelChildSessionInput): Promise<ChildSessionResult> {
    const resolution = input.resolution ?? {
      kind: "cancelled" as const,
      reason: input.reason,
    }

    await this.markChildSessionCancelled({
      ...input,
      resolution,
    })

    return this.join({
      sessionId: input.sessionId,
      runId: input.runId,
      resolution,
    })
  }

  private async createChildSession(input: RunChildSessionInput): Promise<{
    session: SessionRecord
    messages: readonly MessageRecordWithParts[]
  }> {
    const createdAt = this.options.clock.now()
    const session: SessionRecord = {
      id: input.sessionId ?? asSessionId(this.options.idGenerator.next("session")),
      title: input.title,
      parentSessionId: input.parentSessionId,
      status: "idle",
      createdAt,
      updatedAt: createdAt,
      metadata: input.sessionMetadata ? { ...input.sessionMetadata } : undefined,
    }
    const messages = buildDraftMessages({
      sessionId: session.id,
      idGenerator: this.options.idGenerator,
      clock: this.options.clock,
      drafts: input.initialMessages,
    })

    await this.options.unitOfWork.transaction(async () => {
      await this.options.sessionStore.save(session)
      for (const message of messages) {
        await this.options.messageStore.append(message.message, message.parts)
      }
    })

    return {
      session,
      messages,
    }
  }

  private async loadLatestRun(sessionId: SessionRecord["id"]): Promise<RunRecord | undefined> {
    const runs = await this.options.runStore.listBySession(sessionId)
    return runs[0]
  }

  private async loadRunForSession(
    sessionId: SessionRecord["id"],
    runId: RunRecord["id"],
  ): Promise<RunRecord | undefined> {
    const run = await this.options.runStore.get(runId)
    if (run.sessionId !== sessionId) {
      throw buildChildSessionProtocolFailure({
        code: "child_session_run_session_mismatch",
        message: `Kernel run ${run.id} does not belong to session ${sessionId}`,
        phase: "child_session_state_validation",
        metadata: {
          runId: run.id,
          runSessionId: run.sessionId,
          sessionId,
        },
      })
    }

    return run
  }

  private async markChildSessionCancelled(input: {
    sessionId: SessionRecord["id"]
    runId?: RunRecord["id"]
    reason?: string
    resolution: Extract<ChildSessionResolution, { kind: "cancelled" | "timed_out" }>
  }): Promise<void> {
    const session = await this.options.sessionStore.get(input.sessionId)
    const run = input.runId
      ? await this.loadRunForSession(input.sessionId, input.runId)
      : await this.loadLatestRun(input.sessionId)
    const now = this.options.clock.now()
    const resolutionMetadata = run
      ? buildChildSessionResolutionMetadata({
          resolutionKind: input.resolution.kind,
          sessionId: input.sessionId,
          runId: run.id,
          ...(input.resolution.kind === "cancelled"
            ? { reason: input.resolution.reason ?? input.reason }
            : { timeoutMs: input.resolution.timeoutMs }),
          metadata: input.resolution.metadata,
        })
      : undefined
    const nextSession: SessionRecord = {
      ...session,
      status: "idle",
      updatedAt: now,
    }
    const nextRun = run
      ? run.status === "completed" || run.status === "failed"
        ? run
        : {
            ...run,
            status: "cancelled" as const,
            updatedAt: now,
            completedAt: run.completedAt ?? now,
            metadata: mergeMetadata(run.metadata, {
              ...(input.reason ? { cancelReason: input.reason } : {}),
              ...(resolutionMetadata ? { childSessionResolution: resolutionMetadata } : {}),
            }),
          }
      : undefined

    await this.options.unitOfWork.transaction(async () => {
      await this.options.sessionStore.save(nextSession)
      if (nextRun) {
        await this.options.runStore.save(nextRun)
      }
    })
  }
}
