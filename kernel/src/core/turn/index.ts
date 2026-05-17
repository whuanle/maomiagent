import type { FinishReason, KernelMetadata, OutputMode, TimestampMs, TokenUsage } from "../common"
import type { AiExecutionProfileRef } from "../../../ai/contracts"
import type { ContextView, PromptEnvelope } from "../context"
import type { RunId, SessionId, TurnId } from "../ids"
import type { MessageRecordWithParts } from "../message"
import type { ToolDescriptor } from "../tool-call"

export const TURN_STATUS_VALUES = [
  "planned",
  "streaming",
  "tool_wait",
  "finished",
  "failed",
] as const

export type TurnStatus = (typeof TURN_STATUS_VALUES)[number]

export type TurnRecord = {
  id: TurnId
  runId: RunId
  sessionId: SessionId
  status: TurnStatus
  sequence: number
  agentId: string
  executionProfile: AiExecutionProfileRef
  startedAt: TimestampMs
  finishedAt?: TimestampMs
  finishReason?: FinishReason
  usage?: TokenUsage
  metadata?: KernelMetadata
}

export type TurnPlan = {
  turn: TurnRecord
  agentId: string
  executionProfile: AiExecutionProfileRef
  tools: readonly ToolDescriptor[]
  contextView: ContextView
  envelope: PromptEnvelope
  outputMode: OutputMode
  visibleMessages: readonly MessageRecordWithParts[]
  stopAfterThisTurn?: boolean
  metadata?: KernelMetadata
}

export * from "./text-turn-planner"
export * from "./kernel-run-engine"
