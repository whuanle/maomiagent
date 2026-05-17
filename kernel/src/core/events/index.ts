import type { KernelError, TimestampMs } from "../common"
import type { ContextCheckpointRecord } from "../context"
import type { EventId } from "../ids"
import type { InteractionRecord } from "../interaction"
import type { MessagePart, MessageRecord, MessageRecordWithParts } from "../message"
import type { RunBoundary, RunRecord } from "../run"
import type { SessionRecord } from "../session"
import type { ToolCallRecord } from "../tool-call"
import type { TurnPlan, TurnRecord } from "../turn"

export const RUN_COMPACTION_REASON_VALUES = [
  "context_overflow",
  "budget_exceeded",
  "manual",
] as const

export type RunCompactionReason = (typeof RUN_COMPACTION_REASON_VALUES)[number]

export const RUN_COMPACTION_STATUS_VALUES = [
  "running",
  "completed",
  "failed",
] as const

export type RunCompactionStatus = (typeof RUN_COMPACTION_STATUS_VALUES)[number]

export const RUN_COMPACTION_CONTINUATION_KIND_VALUES = [
  "system_continue",
  "replay_user_message",
] as const

export type RunCompactionContinuationKind =
  (typeof RUN_COMPACTION_CONTINUATION_KIND_VALUES)[number]

export type RunCompactionState =
  | {
    status: "running"
    attempt: number
    reason: RunCompactionReason
    startedAt: TimestampMs
  }
  | {
    status: "completed"
    attempt: number
    reason: RunCompactionReason
    startedAt: TimestampMs
    completedAt: TimestampMs
    summaryMessageId: string
    checkpointId: string
    replayMessageId?: string
    continuationKind: RunCompactionContinuationKind
    prunedMessageCount: number
    protectedMessageCount: number
    protectedToolNames: readonly string[]
  }
  | {
    status: "failed"
    attempt: number
    reason: RunCompactionReason
    startedAt: TimestampMs
    failedAt: TimestampMs
    error: KernelError
  }

export type KernelEventPayloadMap = {
  "session.created": {
    session: SessionRecord
  }
  "session.updated": {
    session: SessionRecord
  }
  "run.started": {
    run: RunRecord
  }
  "run.completed": {
    run: RunRecord
    boundary: Extract<RunBoundary, { kind: "completed" }>
  }
  "run.blocked": {
    run: RunRecord
    boundary: Extract<RunBoundary, { kind: "blocked" }>
  }
  "run.failed": {
    run: RunRecord
    boundary: Extract<RunBoundary, { kind: "failed" }>
  }
  "compaction.started": {
    run: RunRecord
    compaction: Extract<RunCompactionState, { status: "running" }>
  }
  "compaction.completed": {
    run: RunRecord
    compaction: Extract<RunCompactionState, { status: "completed" }>
  }
  "compaction.failed": {
    run: RunRecord
    compaction: Extract<RunCompactionState, { status: "failed" }>
  }
  "turn.planned": {
    plan: TurnPlan
  }
  "turn.started": {
    turn: TurnRecord
  }
  "turn.completed": {
    turn: TurnRecord
  }
  "message.appended": {
    message: MessageRecordWithParts
  }
  "message.parts.appended": {
    message: MessageRecord
    parts: readonly MessagePart[]
  }
  "tool-call.updated": {
    toolCall: ToolCallRecord
  }
  "interaction.updated": {
    interaction: InteractionRecord
  }
  "context.checkpoint.created": {
    checkpoint: ContextCheckpointRecord
  }
}

export type KernelEventType = keyof KernelEventPayloadMap

export type KernelEvent<TType extends KernelEventType = KernelEventType> = {
  id: EventId
  type: TType
  occurredAt: TimestampMs
  payload: KernelEventPayloadMap[TType]
}
