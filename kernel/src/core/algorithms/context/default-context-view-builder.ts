import type {
  ContextBlock,
  ContextCheckpointRecord,
  ContextView,
  ContextViewBuilderPort,
  MessageRecordWithParts,
  RunRecord,
  SessionRecord,
  TurnInputContext,
} from "../.."

function sortBlocks(blocks: readonly ContextBlock[]): ContextBlock[] {
  return [...blocks].sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority
    }

    return left.id.localeCompare(right.id)
  })
}

function sortMessages(messages: readonly MessageRecordWithParts[]): MessageRecordWithParts[] {
  return [...messages].sort((left, right) => {
    if (left.message.createdAt !== right.message.createdAt) {
      return left.message.createdAt - right.message.createdAt
    }

    return left.message.id.localeCompare(right.message.id)
  })
}

function sortCheckpoints(checkpoints: readonly ContextCheckpointRecord[]): ContextCheckpointRecord[] {
  return [...checkpoints].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt
    }

    return left.id.localeCompare(right.id)
  })
}

function resolveActiveCheckpoint(input: {
  messages: readonly MessageRecordWithParts[]
  checkpoints: readonly ContextCheckpointRecord[]
}): ContextCheckpointRecord | undefined {
  const messageIds = new Set(input.messages.map((message) => message.message.id))

  return sortCheckpoints(input.checkpoints)
    .filter((checkpoint) =>
      messageIds.has(checkpoint.summaryMessageId)
      && messageIds.has(checkpoint.replacesThroughMessageId),
    )
    .at(-1)
}

function buildVisibleMessages(input: {
  messages: readonly MessageRecordWithParts[]
  activeCheckpoint?: ContextCheckpointRecord
}): MessageRecordWithParts[] {
  const orderedMessages = sortMessages(input.messages)
  if (!input.activeCheckpoint) {
    return orderedMessages
  }

  const cutoffIndex = orderedMessages.findIndex(
    (message) => message.message.id === input.activeCheckpoint!.replacesThroughMessageId,
  )
  if (cutoffIndex < 0) {
    return orderedMessages
  }

  return orderedMessages.filter((message, index) =>
    message.message.id === input.activeCheckpoint!.summaryMessageId
    || index > cutoffIndex,
  )
}

export class DefaultContextViewBuilder implements ContextViewBuilderPort {
  async build(input: {
    session: SessionRecord
    run: RunRecord
    messages: readonly MessageRecordWithParts[]
    checkpoints: readonly ContextCheckpointRecord[]
    turnInput: TurnInputContext
  }): Promise<ContextView> {
    const activeCheckpoint = resolveActiveCheckpoint({
      messages: input.messages,
      checkpoints: input.checkpoints,
    })

    return {
      visibleMessages: buildVisibleMessages({
        messages: input.messages,
        activeCheckpoint,
      }),
      checkpoints: activeCheckpoint ? [activeCheckpoint] : [],
      systemBlocks: sortBlocks(input.turnInput.systemBlocks),
      contextBlocks: sortBlocks(input.turnInput.contextBlocks),
    }
  }
}
