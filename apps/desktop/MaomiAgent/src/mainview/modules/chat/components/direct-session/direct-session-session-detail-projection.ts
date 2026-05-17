import type {
  ConversationCheckpointEntry,
  ConversationInteractionEntry,
  ConversationMessageEntry,
  ConversationMessagePartView,
  ConversationTimelineEntry,
  ConversationToolCallEntry,
} from "#maomiagent/kernel/src/host/application";

import type { DesktopConversationSessionDetail } from "../../../../../shared/desktop-conversation";
import {
  filterConversationMessagesForCheckpoint,
  resolveActiveConversationCheckpoint,
} from "../../../../../shared/desktop-conversation";

export const FRONT_END_PROJECTED_TOOL_OUTPUT_KIND = "front-end-tool-output-preview" as const;

export type ConversationSessionDetailProjectionMode = "full" | "active-preview" | "inactive-preview";

export function resolveSessionDetailProjectionMode(input: {
  detailSessionId: string;
  selectedSessionId?: string;
  expandedSessionDetailSessionId?: string;
}): ConversationSessionDetailProjectionMode {
  if (input.detailSessionId !== input.selectedSessionId) {
    return "inactive-preview";
  }

  if (input.expandedSessionDetailSessionId === input.detailSessionId) {
    return "full";
  }

  return "active-preview";
}

export type FrontEndProjectedToolOutput = {
  kind: typeof FRONT_END_PROJECTED_TOOL_OUTPUT_KIND;
  truncated: true;
  summary?: string;
  preview?: string;
  sourceKind: "string" | "record" | "other";
};

const ACTIVE_PREVIEW_MESSAGE_LIMIT = 24;
const INACTIVE_PREVIEW_MESSAGE_LIMIT = 8;
const FAILED_PREVIEW_MESSAGE_LIMIT = 4;
const PROJECTED_TOOL_OUTPUT_PREVIEW_LIMIT = 2048;
const PROJECTED_TOOL_OUTPUT_SUMMARY_LIMIT = 96;
const FRONT_END_PROJECTED_SESSION_DETAIL_KIND = "front-end-session-detail" as const;
const SETTLED_SESSION_STATUS = new Set<DesktopConversationSessionDetail["status"]>([
  "idle",
  "archived",
  "failed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function trimText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function readFirstNonEmptyLine(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return undefined;
  }
}

function summarizeRecordOutput(value: Record<string, unknown>) {
  const summaryFields = [
    value.summary,
    value.title,
    value.message,
    value.text,
    value.output,
    value.preview,
  ];

  for (const candidate of summaryFields) {
    const text = trimText(candidate);
    if (text) {
      return truncateText(text, PROJECTED_TOOL_OUTPUT_SUMMARY_LIMIT);
    }
  }

  const path = trimText(value.path) || trimText(value.absolutePath);
  const cwd = trimText(value.cwd);

  if (Array.isArray(value.items) && typeof value.items.length === "number") {
    const count = value.items.length;
    if (path) {
      return `${count} items · ${path}`;
    }
    return `${count} items`;
  }

  if (path && cwd) {
    return `${path} · ${cwd}`;
  }

  if (path) {
    return path;
  }

  if (cwd) {
    return cwd;
  }

  const json = safeJsonStringify(value);
  const firstLine = json ? readFirstNonEmptyLine(json) : undefined;
  return truncateText(firstLine || json || "", PROJECTED_TOOL_OUTPUT_SUMMARY_LIMIT);
}

function buildProjectedToolOutputSummary(output: unknown) {
  if (typeof output === "string") {
    const firstLine = readFirstNonEmptyLine(output);
    return truncateText(firstLine || output.replace(/\r\n?/g, "\n").trim(), PROJECTED_TOOL_OUTPUT_SUMMARY_LIMIT) || undefined;
  }

  if (isRecord(output)) {
    return summarizeRecordOutput(output);
  }

  return trimText(output)
    ? truncateText(String(output), PROJECTED_TOOL_OUTPUT_SUMMARY_LIMIT)
    : undefined;
}

function buildProjectedToolOutputPreview(output: unknown) {
  if (typeof output === "string") {
    return truncateText(output.replace(/\u0000/g, "").trimEnd(), PROJECTED_TOOL_OUTPUT_PREVIEW_LIMIT) || undefined;
  }

  if (isRecord(output)) {
    const stdout = trimText(output.stdout);
    const stderr = trimText(output.stderr);
    if (stdout || stderr) {
      return truncateText([stdout, stderr].filter(Boolean).join("\n"), PROJECTED_TOOL_OUTPUT_PREVIEW_LIMIT) || undefined;
    }

    const previewFields = [
      output.preview,
      output.output,
      output.text,
      output.message,
      output.content,
      output.result,
    ];

    for (const candidate of previewFields) {
      const text = trimText(candidate);
      if (text) {
        return truncateText(text, PROJECTED_TOOL_OUTPUT_PREVIEW_LIMIT);
      }
    }

    const json = safeJsonStringify(output);
    return truncateText(json || String(output), PROJECTED_TOOL_OUTPUT_PREVIEW_LIMIT) || undefined;
  }

  const text = trimText(output);
  return text ? truncateText(text, PROJECTED_TOOL_OUTPUT_PREVIEW_LIMIT) : undefined;
}

function shouldProjectToolOutput(output: unknown) {
  if (typeof output === "string") {
    return output.length > PROJECTED_TOOL_OUTPUT_PREVIEW_LIMIT;
  }

  if (isRecord(output)) {
    const stdout = trimText(output.stdout);
    const stderr = trimText(output.stderr);
    if (stdout.length > PROJECTED_TOOL_OUTPUT_PREVIEW_LIMIT || stderr.length > PROJECTED_TOOL_OUTPUT_PREVIEW_LIMIT) {
      return true;
    }

    const json = safeJsonStringify(output);
    return Boolean(json && json.length > PROJECTED_TOOL_OUTPUT_PREVIEW_LIMIT);
  }

  return false;
}

function resolveProjectedToolOutputSourceKind(output: unknown) {
  return typeof output === "string"
    ? "string" as const
    : isRecord(output)
      ? "record" as const
      : "other" as const;
}

function createProjectedToolOutput(
  output: unknown,
  options?: {
    preview?: string;
    summary?: string;
    suppressPreview?: boolean;
  },
) {
  const summary = options?.summary ?? buildProjectedToolOutputSummary(output);
  const preview = options?.suppressPreview
    ? undefined
    : (options?.preview ?? buildProjectedToolOutputPreview(output));

  if (!summary && !preview) {
    return undefined;
  }

  return {
    kind: FRONT_END_PROJECTED_TOOL_OUTPUT_KIND,
    truncated: true as const,
    ...(summary ? { summary } : {}),
    ...(preview ? { preview } : {}),
    sourceKind: resolveProjectedToolOutputSourceKind(output),
  } satisfies FrontEndProjectedToolOutput;
}

function shouldCompactSettledCompletedToolOutput(input: {
  detailStatus: DesktopConversationSessionDetail["status"];
  mode: ConversationSessionDetailProjectionMode;
  toolStatus?: ConversationToolCallEntry["status"];
}) {
  return input.mode !== "full"
    && SETTLED_SESSION_STATUS.has(input.detailStatus)
    && input.toolStatus === "completed";
}

function filterArrayPreservingIdentity<Item>(
  items: Item[],
  predicate: (item: Item) => boolean,
): Item[];
function filterArrayPreservingIdentity<Item>(
  items: readonly Item[],
  predicate: (item: Item) => boolean,
): readonly Item[];
function filterArrayPreservingIdentity<Item>(
  items: readonly Item[],
  predicate: (item: Item) => boolean,
) {
  let changed = false;
  const nextItems: Item[] = [];

  for (const item of items) {
    if (predicate(item)) {
      nextItems.push(item);
      continue;
    }

    changed = true;
  }

  return changed ? nextItems : items;
}

function mapArrayPreservingIdentity<Item>(
  items: Item[],
  mapper: (item: Item) => Item,
): Item[];
function mapArrayPreservingIdentity<Item>(
  items: readonly Item[],
  mapper: (item: Item) => Item,
): readonly Item[];
function mapArrayPreservingIdentity<Item>(
  items: readonly Item[],
  mapper: (item: Item) => Item,
) {
  let changed = false;
  const nextItems = items.map((item) => {
    const nextItem = mapper(item);
    if (nextItem !== item) {
      changed = true;
    }
    return nextItem;
  });

  return changed ? nextItems : items;
}

export type FrontEndProjectedConversationSessionPreviewWindow = {
  kind: typeof FRONT_END_PROJECTED_SESSION_DETAIL_KIND;
  mode: ConversationSessionDetailProjectionMode;
  hiddenMessageCount: number;
};

type FrontEndProjectedConversationSessionDetail = DesktopConversationSessionDetail & {
  frontEndProjection?: FrontEndProjectedConversationSessionPreviewWindow;
};

function readFrontEndProjectedConversationSessionPreviewWindow(
  detail: DesktopConversationSessionDetail,
) {
  const projection = (detail as FrontEndProjectedConversationSessionDetail).frontEndProjection;
  if (!isRecord(projection)) {
    return undefined;
  }

  if (projection.kind !== FRONT_END_PROJECTED_SESSION_DETAIL_KIND) {
    return undefined;
  }

  const hiddenMessageCount = projection.hiddenMessageCount;
  if (typeof hiddenMessageCount !== "number" || !Number.isFinite(hiddenMessageCount) || hiddenMessageCount <= 0) {
    return undefined;
  }

  return {
    kind: FRONT_END_PROJECTED_SESSION_DETAIL_KIND,
    mode: projection.mode,
    hiddenMessageCount: Math.floor(hiddenMessageCount),
  } satisfies FrontEndProjectedConversationSessionPreviewWindow;
}

function buildFrontEndProjectedConversationSessionPreviewWindow(
  input: {
    mode: ConversationSessionDetailProjectionMode;
    hiddenMessageCount: number;
  },
): FrontEndProjectedConversationSessionPreviewWindow | undefined {
  if (!Number.isFinite(input.hiddenMessageCount) || input.hiddenMessageCount <= 0) {
    return undefined;
  }

  return {
    kind: FRONT_END_PROJECTED_SESSION_DETAIL_KIND,
    mode: input.mode,
    hiddenMessageCount: Math.floor(input.hiddenMessageCount),
  };
}

function limitConversationMessagesForPreview(
  messages: readonly ConversationMessageEntry[],
  limit: number,
  preserveMessageId?: string,
) {
  if (messages.length <= limit) {
    return {
      messages,
      hiddenMessageCount: 0,
    };
  }

  const tailStart = Math.max(0, messages.length - limit);
  const tailMessages = messages.slice(tailStart);
  const preserveIndex = preserveMessageId
    ? messages.findIndex((message) => message.messageId === preserveMessageId)
    : -1;

  if (preserveIndex < 0 || preserveIndex >= tailStart) {
    return {
      messages: tailMessages,
      hiddenMessageCount: tailStart,
    };
  }

  const preservedMessage = messages[preserveIndex];
  const nextMessages = [preservedMessage, ...tailMessages.filter((message) => message.messageId !== preserveMessageId)];

  return {
    messages: nextMessages,
    hiddenMessageCount: messages.length - nextMessages.length,
  };
}

export function isProjectedConversationToolOutput(value: unknown): value is FrontEndProjectedToolOutput {
  return isRecord(value)
    && value.kind === FRONT_END_PROJECTED_TOOL_OUTPUT_KIND
    && value.truncated === true;
}

export function readProjectedConversationToolOutputSummary(value: unknown) {
  if (!isProjectedConversationToolOutput(value)) {
    return undefined;
  }

  return trimText(value.summary) || undefined;
}

export function readProjectedConversationToolOutputPreview(value: unknown) {
  if (!isProjectedConversationToolOutput(value)) {
    return undefined;
  }

  return trimText(value.preview) || undefined;
}

function projectConversationToolOutput(input: {
  output: unknown;
  detailStatus: DesktopConversationSessionDetail["status"];
  mode: ConversationSessionDetailProjectionMode;
  toolStatus?: ConversationToolCallEntry["status"];
}) {
  const compactSettledCompletedOutput = shouldCompactSettledCompletedToolOutput({
    detailStatus: input.detailStatus,
    mode: input.mode,
    toolStatus: input.toolStatus,
  });

  if (isProjectedConversationToolOutput(input.output)) {
    if (!compactSettledCompletedOutput || !readProjectedConversationToolOutputPreview(input.output)) {
      return input.output;
    }

    const summary = readProjectedConversationToolOutputSummary(input.output)
      ?? buildProjectedToolOutputSummary(input.output);

    return {
      ...input.output,
      ...(summary ? { summary } : {}),
      preview: undefined,
    };
  }

  if (!compactSettledCompletedOutput && !shouldProjectToolOutput(input.output)) {
    return input.output;
  }

  const projected = createProjectedToolOutput(input.output, compactSettledCompletedOutput
    ? {
        summary: buildProjectedToolOutputSummary(input.output),
        suppressPreview: true,
      }
    : undefined);

  return projected ?? input.output;
}

function projectToolCall(
  toolCall: ConversationToolCallEntry,
  mode: ConversationSessionDetailProjectionMode,
  detailStatus: DesktopConversationSessionDetail["status"],
) {
  if (mode === "full") {
    return toolCall;
  }

  const projectedOutput = projectConversationToolOutput({
    output: toolCall.output,
    detailStatus,
    mode,
    toolStatus: toolCall.status,
  });
  if (projectedOutput === toolCall.output) {
    return toolCall;
  }

  return {
    ...toolCall,
    output: projectedOutput,
  };
}

function collectRetainedMessageIds(messages: readonly ConversationMessageEntry[]) {
  return new Set(messages.map((message) => message.messageId));
}

function collectReferencedToolCallIds(messages: readonly ConversationMessageEntry[]) {
  const toolCallIds = new Set<string>();

  for (const message of messages) {
    for (const part of message.parts) {
      if ((part.type === "tool_call" || part.type === "tool_result") && part.toolCallId) {
        toolCallIds.add(part.toolCallId);
      }
    }
  }

  return toolCallIds;
}

function collectRetainedRunIds(input: {
  messages: readonly ConversationMessageEntry[];
  toolCalls: readonly ConversationToolCallEntry[];
  interactions: readonly ConversationInteractionEntry[];
}) {
  const runIds = new Set<string>();

  for (const message of input.messages) {
    if (message.runId) {
      runIds.add(message.runId);
    }
  }

  for (const toolCall of input.toolCalls) {
    if (toolCall.runId) {
      runIds.add(toolCall.runId);
    }
  }

  for (const interaction of input.interactions) {
    if (interaction.runId) {
      runIds.add(interaction.runId);
    }
  }

  return runIds;
}

function projectMessageParts(
  parts: readonly ConversationMessagePartView[],
  toolCallsById: ReadonlyMap<string, ConversationToolCallEntry>,
) {
  let changed = false;
  const nextParts = parts.map((part) => {
    if ((part.type !== "tool_call" && part.type !== "tool_result") || !part.toolCallId) {
      return part;
    }

    const projectedToolCall = toolCallsById.get(part.toolCallId);
    if (!projectedToolCall || projectedToolCall === part.toolCall) {
      return part;
    }

    changed = true;
    return {
      ...part,
      toolCall: projectedToolCall,
    };
  });

  return changed ? nextParts : parts;
}

function projectMessages(
  messages: readonly ConversationMessageEntry[],
  toolCallsById: ReadonlyMap<string, ConversationToolCallEntry>,
) {
  let changed = false;
  const nextMessages = messages.map((message) => {
    const nextParts = projectMessageParts(message.parts, toolCallsById);
    if (nextParts === message.parts) {
      return message;
    }

    changed = true;
    return {
      ...message,
      parts: nextParts,
    };
  });

  return changed ? nextMessages : messages;
}

function projectCheckpoints(
  checkpoints: readonly ConversationCheckpointEntry[],
  retainedMessageIds: ReadonlySet<string>,
) {
  return filterArrayPreservingIdentity(checkpoints, (checkpoint) =>
    retainedMessageIds.has(checkpoint.summaryMessageId)
    && retainedMessageIds.has(checkpoint.replacesThroughMessageId));
}

function projectTimelineEntry(
  entry: ConversationTimelineEntry,
  messageById: ReadonlyMap<string, ConversationMessageEntry>,
  toolCallById: ReadonlyMap<string, ConversationToolCallEntry>,
  interactionById: ReadonlyMap<string, ConversationInteractionEntry>,
  checkpointById: ReadonlyMap<string, ConversationCheckpointEntry>,
) {
  switch (entry.type) {
    case "message": {
      const message = messageById.get(entry.message.messageId);
      return message ? { ...entry, message } : entry;
    }
    case "tool_call": {
      const toolCall = toolCallById.get(entry.toolCall.callId);
      return toolCall ? { ...entry, toolCall } : entry;
    }
    case "interaction": {
      const interaction = interactionById.get(entry.interaction.interactionId);
      return interaction ? { ...entry, interaction } : entry;
    }
    case "checkpoint": {
      const checkpoint = checkpointById.get(entry.checkpoint.checkpointId);
      return checkpoint ? { ...entry, checkpoint } : entry;
    }
    default:
      return entry;
  }
}

function projectTimeline(
  timeline: readonly ConversationTimelineEntry[],
  messageById: ReadonlyMap<string, ConversationMessageEntry>,
  toolCallById: ReadonlyMap<string, ConversationToolCallEntry>,
  interactionById: ReadonlyMap<string, ConversationInteractionEntry>,
  checkpointById: ReadonlyMap<string, ConversationCheckpointEntry>,
  retainedMessageIds: ReadonlySet<string>,
  retainedToolCallIds: ReadonlySet<string>,
  retainedInteractionIds: ReadonlySet<string>,
  retainedCheckpointIds: ReadonlySet<string>,
) {
  const filtered = filterArrayPreservingIdentity(timeline, (entry) => {
    switch (entry.type) {
      case "message":
        return retainedMessageIds.has(entry.message.messageId);
      case "tool_call":
        return retainedToolCallIds.has(entry.toolCall.callId);
      case "interaction":
        return retainedInteractionIds.has(entry.interaction.interactionId);
      case "checkpoint":
        return retainedCheckpointIds.has(entry.checkpoint.checkpointId);
      default:
        return false;
    }
  });

  let changed = false;
  const nextTimeline = filtered.map((entry) => {
    const nextEntry = projectTimelineEntry(
      entry,
      messageById,
      toolCallById,
      interactionById,
      checkpointById,
    );
    if (nextEntry !== entry) {
      changed = true;
    }
    return nextEntry;
  });

  return changed ? nextTimeline : filtered;
}

function getPreviewMessageLimit(detail: DesktopConversationSessionDetail) {
  if (detail.status === "failed") {
    return FAILED_PREVIEW_MESSAGE_LIMIT;
  }

  return INACTIVE_PREVIEW_MESSAGE_LIMIT;
}

function resolveProjectedMessages(
  detail: DesktopConversationSessionDetail,
  mode: ConversationSessionDetailProjectionMode,
) {
  const checkpoint = resolveActiveConversationCheckpoint({
    messages: detail.messages,
    checkpoints: detail.checkpoints,
  });

  if (mode === "full") {
    return {
      messages: detail.messages,
      checkpoint,
      previewWindow: undefined,
    };
  }

  const checkpointMessages = checkpoint
    ? filterConversationMessagesForCheckpoint({
        messages: detail.messages,
        checkpoint,
      })
    : detail.messages;

  const previewLimit = mode === "active-preview"
    ? ACTIVE_PREVIEW_MESSAGE_LIMIT
    : getPreviewMessageLimit(detail);
  const limitedMessages = limitConversationMessagesForPreview(
    checkpointMessages,
    previewLimit,
    checkpoint?.summaryMessageId,
  );
  const baselineHiddenMessageCount = mode === "active-preview"
    ? (readFrontEndProjectedConversationSessionPreviewWindow(detail)?.hiddenMessageCount ?? 0)
    : 0;

  return {
    messages: limitedMessages.messages,
    checkpoint,
    previewWindow: mode === "active-preview"
      ? buildFrontEndProjectedConversationSessionPreviewWindow(
        {
          mode,
          hiddenMessageCount: baselineHiddenMessageCount + limitedMessages.hiddenMessageCount,
        },
      )
      : undefined,
  };
}

export function projectConversationSessionDetail(
  detail: DesktopConversationSessionDetail,
  mode: ConversationSessionDetailProjectionMode,
): DesktopConversationSessionDetail {
  if (mode === "full") {
    return detail;
  }

  const existingProjection = readFrontEndProjectedConversationSessionPreviewWindow(detail);
  if (existingProjection?.mode === mode) {
    return detail;
  }

  const projectedMessagesState = resolveProjectedMessages(detail, mode);
  const retainedMessages = projectedMessagesState.messages;
  const existingPreviewWindow = existingProjection;
  const nextPreviewWindow = projectedMessagesState.previewWindow;
  const retainedMessageIds = collectRetainedMessageIds(retainedMessages);
  const referencedToolCallIds = collectReferencedToolCallIds(retainedMessages);
  const previewRunIds = collectRetainedRunIds({
    messages: retainedMessages,
    toolCalls: [],
    interactions: [],
  });

  if (mode === "active-preview" && detail.runs.length > 0) {
    previewRunIds.add(detail.runs.at(-1)!.id);
  }

  const retainedToolCalls = mode === "active-preview"
    ? filterArrayPreservingIdentity(detail.toolCalls, (toolCall) =>
      referencedToolCallIds.has(toolCall.callId))
    : filterArrayPreservingIdentity(detail.toolCalls, (toolCall) => referencedToolCallIds.has(toolCall.callId));
  const projectedToolCalls = mapArrayPreservingIdentity(
    retainedToolCalls,
    (toolCall) => projectToolCall(toolCall, mode, detail.status),
  );
  const projectedToolCallsById = new Map(projectedToolCalls.map((toolCall) => [toolCall.callId, toolCall]));
  const nextMessages = projectMessages(retainedMessages, projectedToolCallsById);
  const messageById = new Map(nextMessages.map((message) => [message.messageId, message]));
  const retainedCheckpointIds = new Set(
    projectCheckpoints(detail.checkpoints, retainedMessageIds).map((checkpoint) => checkpoint.checkpointId),
  );
  const nextCheckpoints = projectCheckpoints(detail.checkpoints, retainedMessageIds);
  const checkpointById = new Map(nextCheckpoints.map((checkpoint) => [checkpoint.checkpointId, checkpoint]));
  const retainedRunIds = collectRetainedRunIds({
    messages: nextMessages,
    toolCalls: projectedToolCalls,
    interactions: [],
  });
  const nextRuns = filterArrayPreservingIdentity(detail.runs, (run) => retainedRunIds.has(run.id));
  const visibleRunIds = new Set([
    ...retainedRunIds,
    ...(nextRuns.length > 0
      ? nextRuns.map((run) => run.id)
      : detail.runs.at(-1)
        ? [detail.runs.at(-1)!.id]
        : []),
  ]);
  const nextInteractions = mode === "active-preview"
    ? filterArrayPreservingIdentity(detail.interactions, (interaction) =>
      visibleRunIds.has(interaction.runId))
    : filterArrayPreservingIdentity(detail.interactions, (interaction) => retainedRunIds.has(interaction.runId));
  const nextPendingInteractions = mode === "active-preview"
    ? filterArrayPreservingIdentity(detail.pendingInteractions, (interaction) =>
      visibleRunIds.has(interaction.runId))
    : filterArrayPreservingIdentity(detail.pendingInteractions, (interaction) => retainedRunIds.has(interaction.runId));
  const interactionById = new Map(nextInteractions.map((interaction) => [interaction.interactionId, interaction]));
  const toolCallById = projectedToolCallsById;
  const nextTimeline = mode === "active-preview"
    ? projectTimeline(
      detail.timeline,
      messageById,
      toolCallById,
      interactionById,
      checkpointById,
      retainedMessageIds,
      referencedToolCallIds,
      new Set(nextInteractions.map((interaction) => interaction.interactionId)),
      retainedCheckpointIds,
    )
    : (detail.timeline.length === 0 ? detail.timeline : []);
  const fallbackRun = detail.runs.at(-1);
  const retainedRuns = nextRuns.length > 0
    ? nextRuns
    : (fallbackRun
      ? (detail.runs.length === 1 ? detail.runs : [fallbackRun])
      : detail.runs);
  const nextLastRunId = retainedRuns.at(-1)?.id ?? detail.lastRunId;
  const nextLatestTokenUsage = mode === "active-preview" ? detail.latestTokenUsage : undefined;
  const nextCurrentContextBudget = mode === "active-preview" ? detail.currentContextBudget : undefined;

  if (
    nextMessages === detail.messages
    && projectedToolCalls === detail.toolCalls
    && nextInteractions === detail.interactions
    && nextPendingInteractions === detail.pendingInteractions
    && nextCheckpoints === detail.checkpoints
    && nextTimeline === detail.timeline
    && retainedRuns === detail.runs
    && nextLastRunId === detail.lastRunId
    && nextLatestTokenUsage === detail.latestTokenUsage
    && nextCurrentContextBudget === detail.currentContextBudget
    && existingPreviewWindow?.hiddenMessageCount === nextPreviewWindow?.hiddenMessageCount
  ) {
    return detail;
  }

  const nextDetail: FrontEndProjectedConversationSessionDetail = {
    ...detail,
    messages: nextMessages as ConversationMessageEntry[],
    toolCalls: projectedToolCalls,
    interactions: nextInteractions,
    pendingInteractions: nextPendingInteractions,
    checkpoints: nextCheckpoints as ConversationCheckpointEntry[],
    timeline: nextTimeline as ConversationTimelineEntry[],
    runs: retainedRuns,
    lastRunId: nextLastRunId,
    ...(mode === "active-preview"
      ? {
          latestTokenUsage: nextLatestTokenUsage,
          currentContextBudget: nextCurrentContextBudget,
        }
      : {
          latestTokenUsage: undefined,
          currentContextBudget: undefined,
        }),
  };

  if (nextPreviewWindow) {
    nextDetail.frontEndProjection = nextPreviewWindow;
  }

  return nextDetail;
}

export function readProjectedConversationSessionPreviewWindow(detail: DesktopConversationSessionDetail) {
  return readFrontEndProjectedConversationSessionPreviewWindow(detail);
}
