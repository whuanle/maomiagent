import type { MessagePart, MessageRecordWithParts } from "../.."

const DEFAULT_PROTECT_RECENT_USER_TURNS = 2
const DEFAULT_PROTECT_TOKENS = 40_000
const DEFAULT_MINIMUM_PRUNE_TOKENS = 20_000
const DEFAULT_PRUNED_OUTPUT_TEXT = "[Old tool result content cleared]"
const DEFAULT_PROTECTED_TOOL_NAMES = ["skill"] as const

export type ToolOutputPruneResult = {
  messages: readonly MessageRecordWithParts[]
  prunedMessageIds: readonly MessageRecordWithParts["message"]["id"][]
  protectedMessageIds: readonly MessageRecordWithParts["message"]["id"][]
  protectedToolNames: readonly string[]
  totalCandidateTokens: number
  prunedTokens: number
}

function estimateTextTokens(text: string): number {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) {
    return 0
  }

  return Math.ceil(normalized.length / 4)
}

function estimatePartTokens(part: MessagePart): number {
  switch (part.type) {
    case "text":
    case "reasoning":
      return estimateTextTokens(part.text)
    case "attachment":
      return estimateTextTokens([part.attachmentId, part.mimeType, part.name].filter(Boolean).join(" "))
    case "tool_call_ref":
      return estimateTextTokens(part.toolName) + estimateTextTokens(JSON.stringify(part.input ?? {}))
    case "tool_result_ref":
      return estimateTextTokens(part.toolName)
    case "error":
      return estimateTextTokens(JSON.stringify(part.error))
    case "meta":
      return estimateTextTokens(JSON.stringify(part.data))
  }
}

function findToolResultName(message: MessageRecordWithParts): string | undefined {
  return message.parts.find((part): part is Extract<MessagePart, { type: "tool_result_ref" }> => part.type === "tool_result_ref")?.toolName
}

function isCompletedToolResultMessage(message: MessageRecordWithParts): boolean {
  return message.message.role === "tool"
    && message.parts.some((part) => part.type === "tool_result_ref")
}

function estimateToolResultTokens(message: MessageRecordWithParts): number {
  return message.parts.reduce((sum, part) => {
    if (part.type === "tool_result_ref") {
      return sum
    }

    return sum + estimatePartTokens(part)
  }, 0)
}

function buildPrunedToolResultMessage(input: {
  message: MessageRecordWithParts
  clearedOutputText: string
}): MessageRecordWithParts {
  const toolRefs = input.message.parts.filter(
    (part): part is Extract<MessagePart, { type: "tool_result_ref" }> => part.type === "tool_result_ref",
  )
  const firstContentPart = input.message.parts.find((part) => part.type !== "tool_result_ref")

  return {
    message: input.message.message,
    parts: [
      ...toolRefs,
      ...(firstContentPart
        ? [{
            id: firstContentPart.id,
            type: "text" as const,
            text: input.clearedOutputText,
          }]
        : []),
    ],
  }
}

export function pruneOldToolOutputs(input: {
  messages: readonly MessageRecordWithParts[]
  protectRecentUserTurns?: number
  protectTokens?: number
  minimumPruneTokens?: number
  protectedToolNames?: readonly string[]
  clearedOutputText?: string
}): ToolOutputPruneResult {
  const protectRecentUserTurns = input.protectRecentUserTurns ?? DEFAULT_PROTECT_RECENT_USER_TURNS
  const protectTokens = input.protectTokens ?? DEFAULT_PROTECT_TOKENS
  const minimumPruneTokens = input.minimumPruneTokens ?? DEFAULT_MINIMUM_PRUNE_TOKENS
  const protectedToolNames = new Set(input.protectedToolNames ?? DEFAULT_PROTECTED_TOOL_NAMES)
  const clearedOutputText = input.clearedOutputText ?? DEFAULT_PRUNED_OUTPUT_TEXT

  let seenUserTurns = 0
  let totalCandidateTokens = 0
  let prunedTokens = 0
  const toPrune = new Set<MessageRecordWithParts["message"]["id"]>()
  const protectedMessageIds = new Set<MessageRecordWithParts["message"]["id"]>()

  for (let index = input.messages.length - 1; index >= 0; index -= 1) {
    const message = input.messages[index]!
    if (message.message.role === "user") {
      seenUserTurns += 1
    }

    if (seenUserTurns < protectRecentUserTurns) {
      continue
    }

    if (!isCompletedToolResultMessage(message)) {
      continue
    }

    const toolName = findToolResultName(message)
    if (toolName && protectedToolNames.has(toolName)) {
      protectedMessageIds.add(message.message.id)
      continue
    }

    const estimate = estimateToolResultTokens(message)
    totalCandidateTokens += estimate

    if (totalCandidateTokens > protectTokens) {
      prunedTokens += estimate
      toPrune.add(message.message.id)
    }
  }

  if (prunedTokens < minimumPruneTokens) {
    return {
      messages: input.messages,
      prunedMessageIds: [],
      protectedMessageIds: [...protectedMessageIds],
      protectedToolNames: [...protectedToolNames],
      totalCandidateTokens,
      prunedTokens: 0,
    }
  }

  return {
    messages: input.messages.map((message) =>
      toPrune.has(message.message.id)
        ? buildPrunedToolResultMessage({
            message,
            clearedOutputText,
          })
        : message,
    ),
    prunedMessageIds: [...toPrune],
    protectedMessageIds: [...protectedMessageIds],
    protectedToolNames: [...protectedToolNames],
    totalCandidateTokens,
    prunedTokens,
  }
}
