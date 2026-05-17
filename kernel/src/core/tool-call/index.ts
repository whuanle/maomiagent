import type { KernelError, KernelMetadata, TimestampMs } from "../common"
import type { InteractionRecord } from "../interaction"
import type { MessageId, RunId, SessionId, TurnId, ToolCallId } from "../ids"

export const TOOL_CALL_STATUS_VALUES = [
  "pending",
  "executing",
  "blocked",
  "completed",
  "failed",
  "cancelled",
] as const

export type ToolCallStatus = (typeof TOOL_CALL_STATUS_VALUES)[number]

export type ToolDescriptor = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  metadata?: KernelMetadata
}

export type ToolCallRecord = {
  id: ToolCallId
  sessionId: SessionId
  runId: RunId
  turnId: TurnId
  messageId: MessageId
  toolName: string
  input: unknown
  status: ToolCallStatus
  output?: unknown
  error?: KernelError
  interactionId?: import("../ids").InteractionId
  startedAt: TimestampMs
  updatedAt: TimestampMs
  completedAt?: TimestampMs
  metadata?: KernelMetadata
}

export type ToolExecutionOutcome =
  | {
    kind: "completed"
    output: unknown
  }
  | {
    kind: "blocked"
    interaction: InteractionRecord
  }
  | {
    kind: "failed"
    error: KernelError
  }
