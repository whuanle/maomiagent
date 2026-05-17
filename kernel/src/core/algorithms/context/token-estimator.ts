import type { MessagePart, PromptEnvelope } from "../.."

export type TokenEstimate = {
  promptTokens: number
  breakdown: {
    systemTokens: number
    contextTokens: number
    messageTokens: number
    toolTokens: number
    outputSchemaTokens: number
  }
}

function estimateTextTokens(text: string): number {
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) {
    return 0
  }

  return Math.ceil(normalized.length / 4)
}

function estimateJsonTokens(value: unknown): number {
  const serialized = JSON.stringify(value)
  return estimateTextTokens(serialized ?? "")
}

function estimateMessagePartTokens(part: MessagePart): number {
  switch (part.type) {
    case "text":
    case "reasoning":
      return estimateTextTokens(part.text)
    case "attachment":
      return estimateTextTokens([part.attachmentId, part.mimeType, part.name].filter(Boolean).join(" "))
    case "tool_call_ref":
      return estimateTextTokens(part.toolName) + estimateJsonTokens(part.input)
    case "tool_result_ref":
      return estimateTextTokens(part.toolName)
    case "error":
      return estimateJsonTokens(part.error)
    case "meta":
      return estimateJsonTokens(part.data)
  }
}

function estimateMessageTokens(envelope: PromptEnvelope): number {
  return envelope.messages.reduce((sum, message) => {
    const roleOverhead = 4
    return sum + roleOverhead + message.parts.reduce(
      (partSum, part) => partSum + estimateMessagePartTokens(part),
      0,
    )
  }, 0)
}

function estimateToolTokens(envelope: PromptEnvelope): number {
  return envelope.tools.reduce((sum, tool) => sum
    + estimateTextTokens(tool.name)
    + estimateTextTokens(tool.description)
    + estimateJsonTokens(tool.inputSchema), 0)
}

export class RoughTokenEstimator {
  estimate(input: {
    envelope: PromptEnvelope
  }): TokenEstimate {
    const systemTokens = input.envelope.systemBlocks.reduce(
      (sum, block) => sum + estimateTextTokens(block.content),
      0,
    )
    const contextTokens = input.envelope.contextBlocks.reduce(
      (sum, block) => sum + estimateTextTokens(block.content),
      0,
    )
    const messageTokens = estimateMessageTokens(input.envelope)
    const toolTokens = estimateToolTokens(input.envelope)
    const outputSchemaTokens =
      input.envelope.outputMode.kind === "json_schema"
        ? estimateJsonTokens(input.envelope.outputMode.schema)
        : 0

    return {
      promptTokens: systemTokens + contextTokens + messageTokens + toolTokens + outputSchemaTokens,
      breakdown: {
        systemTokens,
        contextTokens,
        messageTokens,
        toolTokens,
        outputSchemaTokens,
      },
    }
  }
}
