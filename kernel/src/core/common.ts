export type TimestampMs = number

export type KernelMetadata = Readonly<Record<string, unknown>>

export const KERNEL_FINISH_REASON_VALUES = [
  "stop",
  "tool_calls",
  "max_tokens",
  "cancelled",
  "error",
  "unknown",
] as const

export type FinishReason = (typeof KERNEL_FINISH_REASON_VALUES)[number]

export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  reasoningTokens?: number
  cachedInputTokens?: number
}

export type OutputMode =
  | {
    kind: "text"
  }
  | {
    kind: "json_schema"
    schema: Record<string, unknown>
  }

export type KernelError = {
  code: string
  message: string
  retryable?: boolean
  metadata?: KernelMetadata
}
