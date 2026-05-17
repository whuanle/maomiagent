import type { ConversationMessageEntry } from "#maomiagent/kernel/src/host/application";

export type DirectSessionDisplayMessageGroup = {
  key: string;
  message: ConversationMessageEntry;
  previewSourceMessage: ConversationMessageEntry;
  containsLatestMessage: boolean;
  streamingPartIds: string[];
  messageIds: string[];
  sourceMessages?: readonly ConversationMessageEntry[];
};

function resolveDisplayRole(role: ConversationMessageEntry["role"]): "assistant" | "user" | "system" {
  if (role === "user") {
    return "user";
  }

  if (role === "system") {
    return "system";
  }

  return "assistant";
}

function resolveDisplayParts(message: ConversationMessageEntry) {
  const hasToolTrace = message.parts.some((part) => part.type === "tool_call" || part.type === "tool_result");
  if (message.role !== "tool" || !hasToolTrace) {
    return message.parts;
  }

  return message.parts.filter((part) => part.type !== "text" && part.type !== "reasoning");
}

function isTextLikePart(part: ConversationMessageEntry["parts"][number]): part is Extract<ConversationMessageEntry["parts"][number], { type: "text" | "reasoning" }> {
  return part.type === "text" || part.type === "reasoning";
}

function withDisplayBoundarySeparator(
  previousParts: readonly ConversationMessageEntry["parts"][number][],
  nextParts: readonly ConversationMessageEntry["parts"][number][],
) {
  if (previousParts.length === 0 || nextParts.length === 0) {
    return [...nextParts];
  }

  const previousTail = previousParts[previousParts.length - 1];
  const nextHead = nextParts[0];
  if (!previousTail || !nextHead || !isTextLikePart(previousTail) || !isTextLikePart(nextHead) || previousTail.type !== nextHead.type) {
    return [...nextParts];
  }

  if (!nextHead.text || /^\s/u.test(nextHead.text)) {
    return [...nextParts];
  }

  return [
    {
      ...nextHead,
      text: `\n\n${nextHead.text}`,
    },
    ...nextParts.slice(1),
  ];
}

function areStringListsEqual(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function areSourceMessagesEqual(
  left: readonly ConversationMessageEntry[] | undefined,
  right: readonly ConversationMessageEntry[] | undefined,
) {
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function resolveGroupCacheKey(messageIds: readonly string[]) {
  return messageIds.join("\u0000");
}

function reusePreviousDisplayGroup(
  group: DirectSessionDisplayMessageGroup,
  previousGroupsByKey: ReadonlyMap<string, DirectSessionDisplayMessageGroup>,
) {
  const previousGroup = previousGroupsByKey.get(resolveGroupCacheKey(group.messageIds));
  if (!previousGroup || !areSourceMessagesEqual(previousGroup.sourceMessages, group.sourceMessages)) {
    return group;
  }

  const previousMessageIds = previousGroup.messageIds.length > 0
    ? previousGroup.messageIds
    : [previousGroup.message.messageId];
  const nextMessageIds = areStringListsEqual(previousMessageIds, group.messageIds)
    ? previousMessageIds
    : group.messageIds;
  const nextStreamingPartIds = areStringListsEqual(previousGroup.streamingPartIds, group.streamingPartIds)
    ? previousGroup.streamingPartIds
    : group.streamingPartIds;

  if (
    previousGroup.previewSourceMessage === group.previewSourceMessage
    && previousGroup.containsLatestMessage === group.containsLatestMessage
    && nextStreamingPartIds === previousGroup.streamingPartIds
    && nextMessageIds === previousMessageIds
  ) {
    return previousGroup;
  }

  return {
    ...previousGroup,
    previewSourceMessage: group.previewSourceMessage,
    containsLatestMessage: group.containsLatestMessage,
    streamingPartIds: nextStreamingPartIds,
    messageIds: nextMessageIds,
    sourceMessages: previousGroup.sourceMessages ?? group.sourceMessages,
  };
}

export function groupDirectSessionMessagesForDisplay(
  messages: readonly ConversationMessageEntry[],
  latestMessageId?: string,
  options?: {
    preserveBoundaryMessageIds?: readonly string[];
    previousGroups?: readonly DirectSessionDisplayMessageGroup[];
  },
): DirectSessionDisplayMessageGroup[] {
  const groups: DirectSessionDisplayMessageGroup[] = [];
  const preservedBoundaryMessageIds = new Set(options?.preserveBoundaryMessageIds ?? []);
  const previousGroupsByKey = new Map(
    (options?.previousGroups ?? []).map((group) => [
      resolveGroupCacheKey(group.messageIds.length > 0 ? group.messageIds : [group.message.messageId]),
      group,
    ] as const),
  );

  for (const message of messages) {
    const currentRole = resolveDisplayRole(message.role);
    const displayParts = resolveDisplayParts(message);
    const previous = groups[groups.length - 1];
    const previousContainsPreservedBoundary = previous?.messageIds.some((messageId) => preservedBoundaryMessageIds.has(messageId)) ?? false;
    const currentIsPreservedBoundary = preservedBoundaryMessageIds.has(message.messageId);
    if (
      previous
      && resolveDisplayRole(previous.message.role) === "assistant"
      && currentRole === "assistant"
      && !previousContainsPreservedBoundary
      && !currentIsPreservedBoundary
    ) {
      const mergedDisplayParts = withDisplayBoundarySeparator(previous.message.parts, displayParts);
      previous.message = {
        ...previous.message,
        runId: message.runId ?? previous.message.runId,
        turnId: message.turnId ?? previous.message.turnId,
        role: "assistant",
        metadata: message.metadata ?? previous.message.metadata,
        parts: [...previous.message.parts, ...mergedDisplayParts],
      };
      previous.previewSourceMessage = message;
      previous.containsLatestMessage = previous.containsLatestMessage || message.messageId === latestMessageId;
      previous.messageIds.push(message.messageId);
      previous.sourceMessages = [...(previous.sourceMessages ?? []), message];
      if (message.messageId === latestMessageId) {
        previous.streamingPartIds = mergedDisplayParts
          .map((part) => part.partId)
          .filter(Boolean);
      }
      continue;
    }

    groups.push({
      key: message.messageId,
      message: currentRole !== message.role || displayParts !== message.parts
        ? { ...message, role: currentRole, parts: displayParts }
        : message,
      previewSourceMessage: message,
      containsLatestMessage: message.messageId === latestMessageId,
      streamingPartIds: message.messageId === latestMessageId
        ? displayParts.map((part) => part.partId).filter(Boolean)
        : [],
      messageIds: [message.messageId],
      sourceMessages: [message],
    });
  }

  if (previousGroupsByKey.size === 0) {
    return groups;
  }

  return groups.map((group) => reusePreviousDisplayGroup(group, previousGroupsByKey));
}
