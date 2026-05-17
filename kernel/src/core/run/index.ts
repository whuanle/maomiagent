import type { KernelError, KernelMetadata, TimestampMs } from "../common"
import type { InteractionId, RunId, SessionId, TurnId } from "../ids"

export const RUN_STATUS_VALUES = [
  "created",
  "planning",
  "streaming",
  "executing_tools",
  "blocked",
  "awaiting_compaction",
  "completed",
  "failed",
  "cancelled",
] as const

export type RunStatus = (typeof RUN_STATUS_VALUES)[number]

export const RUN_TRIGGER_KIND_VALUES = [
  "user_message",
  "resume_interaction",
  "tool_result",
  "system_continue",
] as const

export type RunTriggerKind = (typeof RUN_TRIGGER_KIND_VALUES)[number]

export type RunTrigger = {
  kind: RunTriggerKind
  refId?: string
}

export type RunRecord = {
  id: RunId
  sessionId: SessionId
  status: RunStatus
  startedAt: TimestampMs
  updatedAt: TimestampMs
  completedAt?: TimestampMs
  currentTurnId?: TurnId
  trigger: RunTrigger
  metadata?: KernelMetadata
}

export type RunBoundary =
  | {
    kind: "completed"
  }
  | {
    kind: "blocked"
    interactionId: InteractionId
  }
  | {
    kind: "awaiting_compaction"
    reason: "context_overflow" | "budget_exceeded"
  }
  | {
    kind: "failed"
    error: KernelError
  }
