import type { MessagePart, MessageRecordWithParts, MessageRole } from "../.."

export type MediaDegradeScope = "all_messages" | "tool_messages"

export type MediaDegradeResult = {
  messages: readonly MessageRecordWithParts[]
  degradedMessages: number
  degradedParts: number
}

function shouldDegradeMessage(input: {
  role: MessageRole
  scope: MediaDegradeScope
}): boolean {
  if (input.scope === "all_messages") {
    return true
  }

  return input.role === "tool"
}

function buildAttachmentPlaceholder(part: Extract<MessagePart, { type: "attachment" }>): string {
  const label = part.name ?? part.attachmentId
  return `[Attachment removed from context: ${label} (${part.mimeType})]`
}

function degradeMessageParts(input: {
  parts: readonly MessagePart[]
}): {
  parts: MessagePart[]
  degradedParts: number
} {
  let degradedParts = 0

  const parts = input.parts.map((part) => {
    if (part.type !== "attachment") {
      return part
    }

    degradedParts += 1

    return {
      id: part.id,
      type: "text" as const,
      text: buildAttachmentPlaceholder(part),
    }
  })

  return {
    parts,
    degradedParts,
  }
}

export function degradeMessageMedia(input: {
  messages: readonly MessageRecordWithParts[]
  scope?: MediaDegradeScope
}): MediaDegradeResult {
  const scope = input.scope ?? "all_messages"
  let degradedMessages = 0
  let degradedParts = 0

  const messages = input.messages.map((message) => {
    if (!shouldDegradeMessage({
      role: message.message.role,
      scope,
    })) {
      return message
    }

    const degraded = degradeMessageParts({
      parts: message.parts,
    })
    if (degraded.degradedParts === 0) {
      return message
    }

    degradedMessages += 1
    degradedParts += degraded.degradedParts

    return {
      message: message.message,
      parts: degraded.parts,
    }
  })

  return {
    messages,
    degradedMessages,
    degradedParts,
  }
}
