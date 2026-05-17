import type {
  ClockPort,
  ContextCheckpointStorePort,
  ContextViewBuilderPort,
  EventSinkPort,
  IdGeneratorPort,
  KernelError,
  KernelRunEnginePort,
  MessageStorePort,
  RunCompactionState,
  RunBoundary,
  RunRecord,
  RunStorePort,
  SessionRecord,
  SessionStorePort,
  TurnInputAssemblerPort,
  UnitOfWorkPort,
} from "../../core"
import type { WorkspaceBinding } from "../workspace"
import type { CompactionExecutionProfilePolicy } from "../../../ai/execution-profiles"
import { DefaultCompactionExecutionProfilePolicy } from "../../../ai/execution-profiles"
import { publishKernelEvents } from "../../adapters/events"
import {
  CompactionCoordinator,
  type CompactionCoordinatorCompletion,
} from "./compaction-coordinator"
import type { WorkspaceRuntimeHostState } from "./workspace-runtime-host"

export type SessionHostExecutionMode = "start" | "resume"

export type SessionHostExecutionDisposition = "foreground" | "background"

export type SessionHostWorkspaceRuntimeDescriptor = {
  workspaceId?: string
  executionWorkspaceId?: string
  workspaceRoot?: string
  executionWorkspaceRoot?: string
  worktreeId?: string
  worktreeRoot?: string
  sandboxMode?: string
  runtimeProfileSignature?: string
  bindingSource?: WorkspaceBinding["source"]
  hostId?: string
  leaseId?: string
  state?: WorkspaceRuntimeHostState
  reason?: string
  activeLeaseCount?: number
}

export type SessionHostExecutionContext = {
  mode: SessionHostExecutionMode
  disposition: SessionHostExecutionDisposition
  binding?: WorkspaceBinding
  workspaceRuntime?: SessionHostWorkspaceRuntimeDescriptor
}

type SessionHostOptions = {
  kernelRunEngine: KernelRunEnginePort
  sessionStore: SessionStorePort
  runStore: RunStorePort
  messageStore: MessageStorePort
  contextCheckpointStore: ContextCheckpointStorePort
  turnInputAssembler: TurnInputAssemblerPort
  contextViewBuilder: ContextViewBuilderPort
  compactionCoordinator: CompactionCoordinator
  compactionExecutionProfilePolicy?: CompactionExecutionProfilePolicy
  unitOfWork: UnitOfWorkPort
  clock: ClockPort
  idGenerator?: IdGeneratorPort
  eventSink?: EventSinkPort
}

export interface SessionHostPort {
  executeUntilBoundary(input: {
    sessionId: SessionRecord["id"]
    runId: RunRecord["id"]
    execution?: SessionHostExecutionContext
  }): Promise<RunBoundary>

  startRun(input: {
    sessionId: SessionRecord["id"]
    runId: RunRecord["id"]
    execution?: SessionHostExecutionContext
  }): Promise<RunBoundary>

  resumeRun(input: {
    sessionId: SessionRecord["id"]
    runId: RunRecord["id"]
    execution?: SessionHostExecutionContext
  }): Promise<RunBoundary>
}

const MAX_CONSECUTIVE_COMPACTIONS = 2

type RunningCompactionState = Extract<RunCompactionState, { status: "running" }>

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function buildCompactionErrorMetadata(input: {
  metadata?: Record<string, unknown>
  reason: RunCompactionState["reason"]
  attempt: number
  phase: string
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    phase: input.phase,
    compactionReason: input.reason,
    compactionAttempt: input.attempt,
    compactionMaxAttempts: MAX_CONSECUTIVE_COMPACTIONS,
  }

  return input.metadata
    ? {
        ...metadata,
        ...input.metadata,
      }
    : metadata
}

function inferCompactionFailurePhase(error: KernelError): string {
  const phase = typeof error.metadata?.phase === "string"
    ? error.metadata.phase
    : undefined

  if (phase) {
    return phase
  }

  if (error.code === "compaction_loop_detected") {
    return "loop_guard"
  }

  return "execution"
}

function cloneRunCompactionState(compaction: RunCompactionState): RunCompactionState {
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

function withRunCompactionState(input: {
  run: RunRecord
  compaction: RunCompactionState
}): RunRecord {
  return {
    ...input.run,
    metadata: {
      ...(input.run.metadata ?? {}),
      compaction: cloneRunCompactionState(input.compaction),
    },
  }
}

function normalizeKernelError(error: unknown): KernelError {
  if (
    error
    && typeof error === "object"
    && typeof (error as Record<string, unknown>).code === "string"
    && typeof (error as Record<string, unknown>).message === "string"
  ) {
    return {
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
    }
  }

  if (error instanceof Error) {
    return {
      code: "compaction_failed",
      message: error.message,
    }
  }

  return {
    code: "compaction_failed",
    message: "Unknown compaction failure",
  }
}

function buildCompactionPersistenceError(input: {
  error: unknown
  code: string
  message: string
  phase: string
  reason: RunCompactionState["reason"]
  attempt: number
}): KernelError {
  const cause = normalizeKernelError(input.error)
  const causeMetadata = isRecord(cause.metadata)
    ? cause.metadata
    : undefined

  return {
    code: input.code,
    message: input.message,
    retryable: false,
    metadata: buildCompactionErrorMetadata({
      metadata: {
        ...(causeMetadata ?? {}),
        ...(cause.code ? { causeCode: cause.code } : {}),
        ...(cause.message ? { causeMessage: cause.message } : {}),
      },
      reason: input.reason,
      attempt: input.attempt,
      phase: input.phase,
    }),
  }
}

function buildCompactionFailureError(input: {
  error: unknown
  compaction: RunningCompactionState
}): KernelError {
  const cause = normalizeKernelError(input.error)
  const causeMetadata = isRecord(cause.metadata)
    ? cause.metadata
    : undefined

  return {
    ...cause,
    metadata: buildCompactionErrorMetadata({
      metadata: causeMetadata,
      reason: input.compaction.reason,
      attempt: input.compaction.attempt,
      phase: inferCompactionFailurePhase(cause),
    }),
  }
}

export class SessionHost implements SessionHostPort {
  private readonly compactionExecutionProfilePolicy: CompactionExecutionProfilePolicy

  constructor(private readonly options: SessionHostOptions) {
    this.compactionExecutionProfilePolicy =
      options.compactionExecutionProfilePolicy
      ?? new DefaultCompactionExecutionProfilePolicy()
  }

  async startRun(input: {
    sessionId: SessionRecord["id"]
    runId: RunRecord["id"]
    execution?: SessionHostExecutionContext
    signal?: AbortSignal
  }): Promise<RunBoundary> {
    return this.executeUntilBoundary(input)
  }

  async resumeRun(input: {
    sessionId: SessionRecord["id"]
    runId: RunRecord["id"]
    execution?: SessionHostExecutionContext
    signal?: AbortSignal
  }): Promise<RunBoundary> {
    return this.executeUntilBoundary(input)
  }

  async executeUntilBoundary(input: {
    sessionId: SessionRecord["id"]
    runId: RunRecord["id"]
    execution?: SessionHostExecutionContext
    signal?: AbortSignal
  }): Promise<RunBoundary> {
    let compactionAttempts = 0

    while (true) {
      const boundary = await this.options.kernelRunEngine.executeUntilBoundary(input)
      if (boundary.kind !== "awaiting_compaction") {
        return boundary
      }

      compactionAttempts += 1
      const lifecycle = await this.persistCompactionStarted({
        sessionId: input.sessionId,
        runId: input.runId,
        reason: boundary.reason,
        attempt: compactionAttempts,
      })
      if (compactionAttempts > MAX_CONSECUTIVE_COMPACTIONS) {
        return this.persistCompactionFailure({
          session: lifecycle.session,
          run: lifecycle.run,
          compaction: lifecycle.compaction,
          error: {
            code: "compaction_loop_detected",
            message: "Compaction could not produce a resumable context within the allowed attempts",
          },
        })
      }

      try {
        await this.handleAwaitingCompaction({
          session: lifecycle.session,
          run: lifecycle.run,
          compaction: lifecycle.compaction,
          reason: boundary.reason,
        })
      } catch (error) {
        return this.persistCompactionFailure({
          session: lifecycle.session,
          run: lifecycle.run,
          compaction: lifecycle.compaction,
          error,
        })
      }
    }
  }

  private async persistCompactionStarted(input: {
    sessionId: SessionRecord["id"]
    runId: RunRecord["id"]
    reason: Extract<RunBoundary, { kind: "awaiting_compaction" }>["reason"]
    attempt: number
  }): Promise<{
    session: SessionRecord
    run: RunRecord
    compaction: RunningCompactionState
  }> {
    const session = await this.options.sessionStore.get(input.sessionId)
    const run = await this.options.runStore.get(input.runId)
    const now = this.options.clock.now()
    const compaction: RunningCompactionState = {
      status: "running",
      attempt: input.attempt,
      reason: input.reason,
      startedAt: now,
    }
    const nextRun = withRunCompactionState({
      run: {
        ...run,
        updatedAt: now,
      },
      compaction,
    })

    try {
      await this.options.runStore.save(nextRun)
    } catch (error) {
      throw buildCompactionPersistenceError({
        error,
        code: "compaction_state_persist_failed",
        message: "Failed to persist compaction start state",
        phase: "start_persistence",
        reason: input.reason,
        attempt: input.attempt,
      })
    }
    if (this.options.idGenerator) {
      await publishKernelEvents({
        events: [{
          type: "compaction.started",
          payload: {
            run: nextRun,
            compaction,
          },
        }],
        eventSink: this.options.eventSink,
        clock: this.options.clock,
        idGenerator: this.options.idGenerator,
      })
    }

    return {
      session,
      run: nextRun,
      compaction,
    }
  }

  private async handleAwaitingCompaction(input: {
    session: SessionRecord
    run: RunRecord
    compaction: RunningCompactionState
    reason: Extract<RunBoundary, { kind: "awaiting_compaction" }>["reason"]
  }): Promise<void> {
    const messages = await this.options.messageStore.listBySession(input.session.id)
    const checkpoints = await this.options.contextCheckpointStore.listBySession(input.session.id)
    const turnInput = await this.options.turnInputAssembler.load({
      session: input.session,
      run: input.run,
      visibleMessages: messages,
    })
    const contextView = await this.options.contextViewBuilder.build({
      session: input.session,
      run: input.run,
      messages,
      checkpoints,
      turnInput,
    })
    const selection = await this.compactionExecutionProfilePolicy.resolve({
      session: input.session,
      run: input.run,
      reason: input.reason,
      turnInput,
      contextView,
    })
    const result = await this.options.compactionCoordinator.compact({
      session: input.session,
      run: input.run,
      contextView,
      reason: input.reason,
      executionProfile: selection.executionProfile,
    })

    await this.persistCompactionContinuation({
      session: input.session,
      run: input.run,
      compaction: input.compaction,
      completion: result.completion,
      trigger: result.continueTrigger,
    })
  }

  private async persistCompactionContinuation(input: {
    session: SessionRecord
    run: RunRecord
    compaction: RunningCompactionState
    completion: CompactionCoordinatorCompletion
    trigger: RunRecord["trigger"]
  }): Promise<void> {
    const now = this.options.clock.now()
    const session: SessionRecord = {
      ...input.session,
      status: "active",
      updatedAt: now,
    }
    const compaction: Extract<RunCompactionState, { status: "completed" }> = {
      status: "completed",
      attempt: input.compaction.attempt,
      reason: input.compaction.reason,
      startedAt: input.compaction.startedAt,
      completedAt: now,
      summaryMessageId: input.completion.summaryMessageId,
      checkpointId: input.completion.checkpointId,
      replayMessageId: input.completion.replayMessageId,
      continuationKind: input.completion.continuationKind,
      prunedMessageCount: input.completion.prunedMessageCount,
      protectedMessageCount: input.completion.protectedMessageCount,
      protectedToolNames: [...input.completion.protectedToolNames],
    }
    const run = withRunCompactionState({
      run: {
        ...input.run,
        status: "planning",
        updatedAt: now,
        trigger: input.trigger,
      },
      compaction,
    })

    try {
      await this.options.unitOfWork.transaction(async () => {
        await this.options.sessionStore.save(session)
        await this.options.runStore.save(run)
      })
    } catch (error) {
      throw buildCompactionPersistenceError({
        error,
        code: "compaction_state_persist_failed",
        message: "Failed to persist compaction continuation state",
        phase: "continuation_persistence",
        reason: input.compaction.reason,
        attempt: input.compaction.attempt,
      })
    }
    if (this.options.idGenerator) {
      await publishKernelEvents({
        events: [{
          type: "compaction.completed",
          payload: {
            run,
            compaction,
          },
        }],
        eventSink: this.options.eventSink,
        clock: this.options.clock,
        idGenerator: this.options.idGenerator,
      })
    }
  }

  private async persistCompactionFailure(input: {
    session: SessionRecord
    run: RunRecord
    compaction: RunningCompactionState
    error: unknown
  }): Promise<RunBoundary> {
    const now = this.options.clock.now()
    const kernelError = buildCompactionFailureError({
      error: input.error,
      compaction: input.compaction,
    })
    const failedSession: SessionRecord = {
      ...input.session,
      status: "failed",
      updatedAt: now,
    }
    const compaction: Extract<RunCompactionState, { status: "failed" }> = {
      status: "failed",
      attempt: input.compaction.attempt,
      reason: input.compaction.reason,
      startedAt: input.compaction.startedAt,
      failedAt: now,
      error: kernelError,
    }
    const failedRun = withRunCompactionState({
      run: {
        ...input.run,
        status: "failed",
        updatedAt: now,
        completedAt: now,
      },
      compaction,
    })

    try {
      await this.options.unitOfWork.transaction(async () => {
        await this.options.sessionStore.save(failedSession)
        await this.options.runStore.save(failedRun)
      })
    } catch (error) {
      throw buildCompactionPersistenceError({
        error,
        code: "compaction_failure_persist_failed",
        message: "Failed to persist compaction failure state",
        phase: "failure_persistence",
        reason: input.compaction.reason,
        attempt: input.compaction.attempt,
      })
    }
    if (this.options.idGenerator) {
      await publishKernelEvents({
        events: [{
          type: "compaction.failed",
          payload: {
            run: failedRun,
            compaction,
          },
        }, {
          type: "run.failed",
          payload: {
            run: failedRun,
            boundary: {
              kind: "failed",
              error: kernelError,
            },
          },
        }],
        eventSink: this.options.eventSink,
        clock: this.options.clock,
        idGenerator: this.options.idGenerator,
      })
    }

    return {
      kind: "failed",
      error: kernelError,
    }
  }
}
