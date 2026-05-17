import type { KernelError, KernelMetadata, OutputMode, TimestampMs, TokenUsage, FinishReason } from "../common"
import type { MessageId, MessagePartId, ToolCallId } from "../ids"

export const MESSAGE_ROLE_VALUES = [
  "system",
  "user",
  "assistant",
  "tool",
] as const

export type MessageRole = (typeof MESSAGE_ROLE_VALUES)[number]

export type MessageRecord = {
  id: MessageId
  sessionId: import("../ids").SessionId
  runId?: import("../ids").RunId
  turnId?: import("../ids").TurnId
  role: MessageRole
  createdAt: TimestampMs
  metadata?: KernelMetadata
}

export const MESSAGE_PART_TYPE_VALUES = [
  "text",
  "reasoning",
  "attachment",
  "tool_call_ref",
  "tool_result_ref",
  "error",
  "meta",
] as const

export type MessagePart =
  | {
    id: MessagePartId
    type: (typeof MESSAGE_PART_TYPE_VALUES)[0]
    text: string
  }
  | {
    id: MessagePartId
    type: (typeof MESSAGE_PART_TYPE_VALUES)[1]
    text: string
  }
  | {
    id: MessagePartId
    type: (typeof MESSAGE_PART_TYPE_VALUES)[2]
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
  | {
    id: MessagePartId
    type: (typeof MESSAGE_PART_TYPE_VALUES)[3]
    toolCallId: ToolCallId
    toolName: string
    input?: unknown
  }
  | {
    id: MessagePartId
    type: (typeof MESSAGE_PART_TYPE_VALUES)[4]
    toolCallId: ToolCallId
    toolName: string
  }
  | {
    id: MessagePartId
    type: (typeof MESSAGE_PART_TYPE_VALUES)[5]
    error: KernelError
  }
  | {
    id: MessagePartId
    type: (typeof MESSAGE_PART_TYPE_VALUES)[6]
    data: KernelMetadata
  }

export type MessageRecordWithParts = {
  message: MessageRecord
  parts: readonly MessagePart[]
}

export type AssistantMessageSummary = {
  messageId: MessageId
  finishReason?: FinishReason
  usage?: TokenUsage
  outputMode?: OutputMode
}
