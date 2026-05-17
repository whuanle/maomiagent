import type { KernelMetadata, OutputMode, TimestampMs } from "../common"
import type { ContextCheckpointId, MessageId, RunId, SessionId, TurnId } from "../ids"
import type { MessageRecordWithParts } from "../message"
import type { ToolDescriptor } from "../tool-call"

export const CONTEXT_BLOCK_KIND_VALUES = [
  "system",
  "instruction",
  "workspace",
  "memory",
  "task",
  "custom",
] as const

export type ContextBlockKind = (typeof CONTEXT_BLOCK_KIND_VALUES)[number]

export const CONTEXT_CHECKPOINT_KIND_VALUES = [
  "summary",
] as const

export type ContextCheckpointRecord = {
  id: ContextCheckpointId
  sessionId: SessionId
  kind: (typeof CONTEXT_CHECKPOINT_KIND_VALUES)[number]
  replacesThroughMessageId: MessageId
  summaryMessageId: MessageId
  createdAt: TimestampMs
  metadata?: KernelMetadata
}

export type ContextBlock = {
  id: string
  kind: ContextBlockKind
  content: string
  priority: number
  metadata?: KernelMetadata
}

export type ContextView = {
  visibleMessages: readonly MessageRecordWithParts[]
  checkpoints: readonly ContextCheckpointRecord[]
  systemBlocks: readonly ContextBlock[]
  contextBlocks: readonly ContextBlock[]
}

export type PromptEnvelope = {
  sessionId: SessionId
  runId: RunId
  turnId: TurnId
  agentId: string
  systemBlocks: readonly ContextBlock[]
  contextBlocks: readonly ContextBlock[]
  messages: readonly MessageRecordWithParts[]
  tools: readonly ToolDescriptor[]
  outputMode: OutputMode
}

export * from "./prompt-envelope-builder"
