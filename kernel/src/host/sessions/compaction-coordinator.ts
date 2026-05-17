import type {
  ContextCheckpointStorePort,
  ContextView,
  ClockPort,
  EventSinkPort,
  IdGeneratorPort,
  KernelError,
  MessageStorePort,
  RunCompactionContinuationKind,
  RunRecord,
  RunTrigger,
  SessionRecord,
  UnitOfWorkPort,
} from "../../core"
import type { AiExecutionProfileRef } from "../../../ai/contracts"
import type { CompactionArtifact, CompactionEngine, CompactionReason } from "../../core/algorithms/context"
import { publishKernelEvents, type PendingKernelEvent } from "../../adapters/events"

export type CompactionCoordinatorCompletion = {
  summaryMessageId: string
  checkpointId: string
  replayMessageId?: string
  continuationKind: RunCompactionContinuationKind
  prunedMessageCount: number
  protectedMessageCount: number
  protectedToolNames: readonly string[]
}

export type CompactionCoordinatorResult = {
  artifact: CompactionArtifact
  continueTrigger: RunTrigger
  completion: CompactionCoordinatorCompletion
}

type CompactionCoordinatorOptions = {
  compactionEngine: CompactionEngine
  messageStore: MessageStorePort
  contextCheckpointStore: ContextCheckpointStorePort
  unitOfWork: UnitOfWorkPort
  clock?: ClockPort
  idGenerator?: IdGeneratorPort
  eventSink?: EventSinkPort
}

function normalizeKernelError(error: unknown): KernelError | undefined {
  if (!error || typeof error !== "object") {
    return error instanceof Error
      ? {
          code: "compaction_failed",
          message: error.message,
        }
      : undefined
  }

  const code = typeof (error as Record<string, unknown>).code === "string"
    ? (error as Record<string, unknown>).code as string
    : undefined
  const message = typeof (error as Record<string, unknown>).message === "string"
    ? (error as Record<string, unknown>).message as string
    : undefined
  const retryable = typeof (error as Record<string, unknown>).retryable === "boolean"
    ? (error as Record<string, unknown>).retryable as boolean
    : undefined
  const metadata = (error as Record<string, unknown>).metadata
    && typeof (error as Record<string, unknown>).metadata === "object"
    && !Array.isArray((error as Record<string, unknown>).metadata)
      ? (error as Record<string, unknown>).metadata as Record<string, unknown>
      : undefined

  if (!code || !message) {
    return undefined
  }

  return {
    code,
    message,
    ...(retryable !== undefined ? { retryable } : {}),
    ...(metadata ? { metadata } : {}),
  }
}

function buildCompactionPersistenceError(input: {
  error: unknown
  code: string
  message: string
  phase: string
}): KernelError {
  const cause = normalizeKernelError(input.error)

  return {
    code: input.code,
    message: input.message,
    retryable: false,
    metadata: {
      phase: input.phase,
      ...(cause?.code ? { causeCode: cause.code } : {}),
      ...(cause?.message ? { causeMessage: cause.message } : {}),
    },
  }
}

export class CompactionCoordinator {
  constructor(private readonly options: CompactionCoordinatorOptions) {}

  async compact(input: {
    session: SessionRecord
    run: RunRecord
    contextView: ContextView
    reason?: CompactionReason
    executionProfile?: AiExecutionProfileRef
  }): Promise<CompactionCoordinatorResult> {
    const artifact = await this.options.compactionEngine.compact(input)

    try {
      await this.options.unitOfWork.transaction(async () => {
        await this.options.messageStore.append(
          artifact.summaryMessage.message,
          artifact.summaryMessage.parts,
        )
        if (artifact.replayMessage) {
          await this.options.messageStore.append(
            artifact.replayMessage.message,
            artifact.replayMessage.parts,
          )
        }
        await this.options.contextCheckpointStore.save(artifact.checkpoint)
      })
    } catch (error) {
      throw buildCompactionPersistenceError({
        error,
        code: "compaction_artifact_persist_failed",
        message: "Failed to persist compaction artifact",
        phase: "artifact_persistence",
      })
    }
    if (this.options.clock && this.options.idGenerator) {
      const events: PendingKernelEvent[] = [
        {
          type: "message.appended",
          payload: {
            message: artifact.summaryMessage,
          },
        },
      ]
      if (artifact.replayMessage) {
        events.push({
          type: "message.appended",
          payload: {
            message: {
              message: artifact.replayMessage.message,
              parts: artifact.replayMessage.parts,
            },
          },
        })
      }
      events.push({
        type: "context.checkpoint.created",
        payload: {
          checkpoint: artifact.checkpoint,
        },
      })
      await publishKernelEvents({
        events,
        eventSink: this.options.eventSink,
        clock: this.options.clock,
        idGenerator: this.options.idGenerator,
      })
    }

    return {
      artifact,
      continueTrigger:
        artifact.continuation.kind === "replay_user_message"
          ? {
              kind: "user_message",
              refId: artifact.continuation.replayMessageId,
            }
          : {
              kind: "system_continue",
              refId: artifact.summaryMessage.message.id,
            },
      completion: {
        summaryMessageId: artifact.summaryMessage.message.id,
        checkpointId: artifact.checkpoint.id,
        replayMessageId: artifact.replayMessage?.message.id,
        continuationKind: artifact.continuation.kind,
        prunedMessageCount: artifact.stats.prunedMessageIds.length,
        protectedMessageCount: artifact.decisions.protectedMessageIds.length,
        protectedToolNames: [...artifact.decisions.protectedToolNames],
      },
    }
  }
}
