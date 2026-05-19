import type { ConversationMessagePartView } from "#maomiagent/kernel/src/host/application";

import type {
  DesktopConversationRunItem,
  DesktopConversationRuntimeEventsUpdateEvent,
  DesktopConversationSessionDetail,
  DesktopConversationSessionStatus,
} from "../../../../shared/desktop-conversation";

type DesktopConversationRuntimeEvent = DesktopConversationRuntimeEventsUpdateEvent["events"][number];
type DesktopConversationMessageEntry = DesktopConversationSessionDetail["messages"][number];
type DesktopConversationToolCallEntry = DesktopConversationSessionDetail["toolCalls"][number];
type DesktopConversationInteractionEntry = DesktopConversationSessionDetail["interactions"][number];
type DesktopConversationCheckpointEntry = DesktopConversationSessionDetail["checkpoints"][number];
type DesktopConversationTimelineEntry = DesktopConversationSessionDetail["timeline"][number];

export type MergeDesktopConversationRuntimeEventsResult = {
  detail: DesktopConversationSessionDetail;
  requiresReload: boolean;
};

const STOPPING_DEFERRED_RUNTIME_EVENT_TYPES = new Set<DesktopConversationRuntimeEvent["type"]>([
  "message.appended",
  "message.parts.appended",
  "tool-call.updated",
  "interaction.updated",
]);

export function shouldDeferRuntimeEventsWhileStopping(input: {
  update: DesktopConversationRuntimeEventsUpdateEvent;
  stoppingSessionId?: string | null;
}) {
  const stoppingSessionId = input.stoppingSessionId?.trim() || "";
  if (!stoppingSessionId || input.update.sessionId !== stoppingSessionId) {
    return false;
  }

  return input.update.events.length > 0
    && input.update.events.every((event) => STOPPING_DEFERRED_RUNTIME_EVENT_TYPES.has(event.type));
}

function toIso(value: number) {
  return new Date(value).toISOString();
}

function compareMessages(
  left: DesktopConversationMessageEntry,
  right: DesktopConversationMessageEntry,
) {
  return left.createdAt - right.createdAt || left.messageId.localeCompare(right.messageId, "en", { sensitivity: "base" });
}

function compareToolCalls(
  left: DesktopConversationToolCallEntry,
  right: DesktopConversationToolCallEntry,
) {
  return left.startedAt - right.startedAt
    || left.updatedAt - right.updatedAt
    || left.callId.localeCompare(right.callId, "en", { sensitivity: "base" });
}

function compareInteractions(
  left: DesktopConversationInteractionEntry,
  right: DesktopConversationInteractionEntry,
) {
  return left.createdAt - right.createdAt
    || left.updatedAt - right.updatedAt
    || left.interactionId.localeCompare(right.interactionId, "en", { sensitivity: "base" });
}

function compareCheckpoints(
  left: DesktopConversationCheckpointEntry,
  right: DesktopConversationCheckpointEntry,
) {
  return left.createdAt - right.createdAt
    || left.checkpointId.localeCompare(right.checkpointId, "en", { sensitivity: "base" });
}

function compareRuns(left: DesktopConversationRunItem, right: DesktopConversationRunItem) {
  return left.startedAt - right.startedAt
    || left.updatedAt - right.updatedAt
    || left.id.localeCompare(right.id, "en", { sensitivity: "base" });
}

function compareTimelineEntries(
  left: DesktopConversationTimelineEntry,
  right: DesktopConversationTimelineEntry,
) {
  if (left.at !== right.at) {
    return left.at - right.at;
  }

  const leftKey = left.type === "message"
    ? left.message.messageId
    : left.type === "tool_call"
      ? left.toolCall.callId
      : left.type === "interaction"
        ? left.interaction.interactionId
        : left.checkpoint.checkpointId;
  const rightKey = right.type === "message"
    ? right.message.messageId
    : right.type === "tool_call"
      ? right.toolCall.callId
      : right.type === "interaction"
        ? right.interaction.interactionId
        : right.checkpoint.checkpointId;

  return left.type.localeCompare(right.type, "en", { sensitivity: "base" })
    || leftKey.localeCompare(rightKey, "en", { sensitivity: "base" });
}

function findInsertIndex<TItem>(
  items: readonly TItem[],
  nextItem: TItem,
  compare: (left: TItem, right: TItem) => number,
) {
  let low = 0;
  let high = items.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (compare(items[mid]!, nextItem) <= 0) {
      low = mid + 1;
      continue;
    }

    high = mid;
  }

  return low;
}

function upsertOrdered<TItem>(
  items: readonly TItem[],
  nextItem: TItem,
  matches: (item: TItem) => boolean,
  compare: (left: TItem, right: TItem) => number,
): TItem[] {
  const index = items.findIndex(matches);
  if (index < 0) {
    const insertAt = findInsertIndex(items, nextItem, compare);
    const nextItems = items.slice();
    nextItems.splice(insertAt, 0, nextItem);
    return nextItems;
  }

  const currentItem = items[index]!;
  const previousItem = items[index - 1];
  const nextNeighbor = items[index + 1];
  const staysOrdered = (!previousItem || compare(previousItem, nextItem) <= 0)
    && (!nextNeighbor || compare(nextItem, nextNeighbor) <= 0);

  if (staysOrdered) {
    const nextItems = items.slice();
    nextItems[index] = nextItem;
    return nextItems;
  }

  const nextItems = items.slice();
  nextItems.splice(index, 1);
  const insertAt = findInsertIndex(nextItems, nextItem, compare);
  nextItems.splice(insertAt, 0, nextItem);

  if (currentItem === nextItem && insertAt === index) {
    return items.slice();
  }

  return nextItems;
}

function enrichMessageParts(
  parts: readonly ConversationMessagePartView[],
  toolCallsById: ReadonlyMap<string, DesktopConversationToolCallEntry>,
): ConversationMessagePartView[] {
  let changed = false;
  const nextParts = parts.map((part) => {
    if ((part.type !== "tool_call" && part.type !== "tool_result") || !part.toolCallId) {
      return part;
    }

    const toolCall = toolCallsById.get(part.toolCallId);
    if (!toolCall || toolCall === part.toolCall) {
      return part;
    }

    changed = true;
    return { ...part, toolCall };
  });

  return changed ? nextParts : parts.slice();
}

function appendMessageParts(
  message: DesktopConversationMessageEntry,
  parts: readonly ConversationMessagePartView[],
  toolCallsById: ReadonlyMap<string, DesktopConversationToolCallEntry>,
): DesktopConversationMessageEntry {
  if (parts.length === 0) {
    return message;
  }

  const nextPartsById = new Map(message.parts.map((part) => [part.partId, part]));
  for (const part of enrichMessageParts(parts, toolCallsById)) {
    nextPartsById.set(part.partId, part);
  }

  const nextParts = [...nextPartsById.values()];
  if (
    nextParts.length === message.parts.length
    && nextParts.every((part, index) => part === message.parts[index])
  ) {
    return message;
  }

  return {
    ...message,
    parts: nextParts,
  };
}

function patchMessageWithToolCall(
  message: DesktopConversationMessageEntry,
  toolCall: DesktopConversationToolCallEntry,
) {
  let changed = false;
  const nextParts = message.parts.map((part) => {
    if ((part.type !== "tool_call" && part.type !== "tool_result") || part.toolCallId !== toolCall.callId) {
      return part;
    }

    changed = true;
    return {
      ...part,
      toolCall,
    };
  });

  return changed ? {
    ...message,
    parts: nextParts,
  } : message;
}

function patchMessagesWithToolCall(
  messages: DesktopConversationSessionDetail["messages"],
  toolCall: DesktopConversationToolCallEntry,
): DesktopConversationMessageEntry[] {
  let changed = false;
  const nextMessages = messages.map((message) => {
    const nextMessage = patchMessageWithToolCall(message, toolCall);
    if (nextMessage !== message) {
      changed = true;
    }
    return nextMessage;
  });

  return changed ? nextMessages : messages;
}

function patchTimelineMessagesWithToolCall(
  timeline: DesktopConversationSessionDetail["timeline"],
  toolCall: DesktopConversationToolCallEntry,
): DesktopConversationTimelineEntry[] {
  let changed = false;
  const nextTimeline = timeline.map((entry) => {
    if (entry.type !== "message") {
      return entry;
    }

    const nextMessage = patchMessageWithToolCall(entry.message, toolCall);
    if (nextMessage === entry.message) {
      return entry;
    }

    changed = true;
    return {
      ...entry,
      message: nextMessage,
    };
  });

  return changed ? nextTimeline : timeline;
}

function buildPendingInteractions(
  interactions: readonly DesktopConversationInteractionEntry[],
): DesktopConversationInteractionEntry[] {
  return interactions.filter((interaction) => interaction.status === "pending");
}

function upsertTimelineEntry(
  items: readonly DesktopConversationTimelineEntry[],
  nextItem: DesktopConversationTimelineEntry,
) {
  return upsertOrdered(
    items,
    nextItem,
    (item) => {
      if (item.type !== nextItem.type) {
        return false;
      }

      switch (nextItem.type) {
        case "message":
          return item.type === "message" && item.message.messageId === nextItem.message.messageId;
        case "tool_call":
          return item.type === "tool_call" && item.toolCall.callId === nextItem.toolCall.callId;
        case "interaction":
          return item.type === "interaction" && item.interaction.interactionId === nextItem.interaction.interactionId;
        case "checkpoint":
          return item.type === "checkpoint" && item.checkpoint.checkpointId === nextItem.checkpoint.checkpointId;
      }
    },
    compareTimelineEntries,
  );
}

function mapRuntimeRun(
  event: Extract<DesktopConversationRuntimeEvent, { run: unknown }>,
): DesktopConversationRunItem {
  return {
    id: event.run.runId as DesktopConversationRunItem["id"],
    sessionId: event.run.sessionId as DesktopConversationRunItem["sessionId"],
    status: event.run.status,
    startedAt: event.run.startedAt,
    updatedAt: event.run.updatedAt,
    completedAt: event.run.completedAt,
    currentTurnId: event.run.currentTurnId as DesktopConversationRunItem["currentTurnId"],
    trigger: event.run.trigger,
    metadata: event.run.metadata,
    ...(event.type === "run.completed" || event.type === "run.blocked" || event.type === "run.failed"
      ? { boundary: event.boundary }
      : {}),
  };
}

function resolveStatusFromRuntimeEvent(
  current: DesktopConversationSessionStatus,
  event: DesktopConversationRuntimeEvent,
): DesktopConversationSessionStatus {
  switch (event.type) {
    case "session.created":
    case "session.updated":
      return event.session.status;
    case "run.started":
    case "run.blocked":
    case "message.appended":
    case "message.parts.appended":
    case "tool-call.updated":
    case "interaction.updated":
    case "context.checkpoint.created":
      return current === "archived" ? current : "active";
    case "run.completed":
      return "idle";
    case "run.failed":
      return "failed";
    default:
      return current;
  }
}

export function mergeDesktopConversationRuntimeEvents(
  detail: DesktopConversationSessionDetail,
  events: readonly DesktopConversationRuntimeEvent[],
): MergeDesktopConversationRuntimeEventsResult {
  let nextDetail = detail;
  let requiresReload = false;

  for (const event of events) {
    const toolCallsById = new Map(nextDetail.toolCalls.map((toolCall) => [toolCall.callId, toolCall]));

    switch (event.type) {
      case "session.created":
      case "session.updated": {
        nextDetail = {
          ...nextDetail,
          title: event.session.title,
          status: event.session.status,
          parentSessionId: event.session.parentSessionId,
          archivedAt: event.session.archivedAt ? toIso(event.session.archivedAt) : undefined,
          metadata: event.session.metadata ? { ...event.session.metadata } : undefined,
          updatedAt: toIso(event.session.updatedAt),
        };
        break;
      }
      case "run.started":
      case "run.completed":
      case "run.blocked":
      case "run.failed": {
        const run = mapRuntimeRun(event);
        const runs = upsertOrdered(nextDetail.runs, run, (item) => item.id === run.id, compareRuns);
        nextDetail = {
          ...nextDetail,
          runs,
          lastRunId: run.id,
          status: resolveStatusFromRuntimeEvent(nextDetail.status, event),
          updatedAt: toIso(event.run.updatedAt),
        };
        break;
      }
      case "message.appended": {
        const message = {
          ...event.message,
          parts: enrichMessageParts(event.message.parts, toolCallsById),
        };
        nextDetail = {
          ...nextDetail,
          messages: upsertOrdered(nextDetail.messages, message, (item) => item.messageId === message.messageId, compareMessages),
          timeline: upsertTimelineEntry(nextDetail.timeline, {
            type: "message",
            at: message.createdAt,
            message,
          }),
          status: resolveStatusFromRuntimeEvent(nextDetail.status, event),
          updatedAt: toIso(event.occurredAt),
        };
        break;
      }
      case "message.parts.appended": {
        const currentMessage = nextDetail.messages.find((item) => item.messageId === event.message.messageId);
        const message = currentMessage
          ? appendMessageParts(currentMessage, event.message.parts, toolCallsById)
          : {
              ...event.message,
              parts: enrichMessageParts(event.message.parts, toolCallsById),
            };
        nextDetail = {
          ...nextDetail,
          messages: upsertOrdered(nextDetail.messages, message, (item) => item.messageId === message.messageId, compareMessages),
          timeline: upsertTimelineEntry(nextDetail.timeline, {
            type: "message",
            at: message.createdAt,
            message,
          }),
          status: resolveStatusFromRuntimeEvent(nextDetail.status, event),
          updatedAt: toIso(event.occurredAt),
        };
        break;
      }
      case "tool-call.updated": {
        const toolCall = event.toolCall;
        const toolCalls = upsertOrdered(nextDetail.toolCalls, toolCall, (item) => item.callId === toolCall.callId, compareToolCalls);
        const messages = patchMessagesWithToolCall(nextDetail.messages, toolCall);
        const timeline = patchTimelineMessagesWithToolCall(nextDetail.timeline, toolCall);
        nextDetail = {
          ...nextDetail,
          toolCalls,
          messages,
          timeline: upsertTimelineEntry(timeline, {
            type: "tool_call",
            at: toolCall.startedAt,
            toolCall,
          }),
          status: resolveStatusFromRuntimeEvent(nextDetail.status, event),
          updatedAt: toIso(event.occurredAt),
        };
        break;
      }
      case "interaction.updated": {
        const interactions = upsertOrdered(
          nextDetail.interactions,
          event.interaction,
          (item) => item.interactionId === event.interaction.interactionId,
          compareInteractions,
        );
        nextDetail = {
          ...nextDetail,
          interactions,
          pendingInteractions: buildPendingInteractions(interactions),
          timeline: upsertTimelineEntry(nextDetail.timeline, {
            type: "interaction",
            at: event.interaction.createdAt,
            interaction: event.interaction,
          }),
          status: resolveStatusFromRuntimeEvent(nextDetail.status, event),
          updatedAt: toIso(event.occurredAt),
        };
        break;
      }
      case "context.checkpoint.created": {
        const checkpoint = event.checkpoint;
        nextDetail = {
          ...nextDetail,
          checkpoints: upsertOrdered(
            nextDetail.checkpoints,
            checkpoint,
            (item) => item.checkpointId === checkpoint.checkpointId,
            compareCheckpoints,
          ),
          timeline: upsertTimelineEntry(nextDetail.timeline, {
            type: "checkpoint",
            at: checkpoint.createdAt,
            checkpoint,
          }),
          status: resolveStatusFromRuntimeEvent(nextDetail.status, event),
          updatedAt: toIso(event.occurredAt),
        };
        break;
      }
      case "compaction.started":
      case "compaction.completed":
      case "compaction.failed": {
        requiresReload = true;
        break;
      }
      default: {
        const exhaustiveCheck: never = event;
        void exhaustiveCheck;
        requiresReload = true;
      }
    }
  }

  return {
    detail: nextDetail,
    requiresReload,
  };
}
