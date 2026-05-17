import type {
  ConversationMessageEntry,
  ConversationMessagePartView,
} from "#maomiagent/kernel/src/host/application";

import type { LanguageCode } from "../../../../config/titlebar";
import { splitReasoningHeading } from "./direct-session-message-reasoning";
import { resolveToolTraceHeaderContent } from "./direct-session-message-tool-trace-summary";

const EXECUTION_HIGHLIGHT_LIMIT = 3;
const EXECUTION_HIGHLIGHT_TEXT_LIMIT = 56;

export type DirectSessionCompletedExecutionDigest = {
  visiblePartStartIndex: number;
  stepCount: number;
  toolCallCount: number;
  modifiedFileCount: number;
  preview?: string;
  highlights: string[];
};

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
    .map((line) => trimText(line))
    .find(Boolean);
}

function isCompletedToolPart(
  part: ConversationMessagePartView,
): part is Extract<ConversationMessagePartView, { type: "tool_call" | "tool_result" }> {
  return (part.type === "tool_call" || part.type === "tool_result")
    && part.toolCall?.status === "completed";
}

function isExecutionTracePart(part: ConversationMessagePartView) {
  return part.type === "reasoning"
    || part.type === "tool_call"
    || part.type === "tool_result"
    || part.type === "error"
    || part.type === "meta";
}

function isVisibleAnswerTailPart(part: ConversationMessagePartView) {
  return part.type === "text" || part.type === "attachment";
}

function hasBlockingExecutionState(parts: readonly ConversationMessagePartView[]) {
  return parts.some((part) => {
    if (part.type === "error") {
      return true;
    }

    if (part.type !== "tool_call" && part.type !== "tool_result") {
      return false;
    }

    return part.toolCall?.status !== "completed";
  });
}

function resolveExecutionHighlight(
  part: ConversationMessagePartView,
  language: LanguageCode,
) {
  const isEn = language === "en-US";

  if (part.type === "reasoning") {
    const heading = splitReasoningHeading(part.text, language);
    const title = trimText(heading.title);
    const fallbackTitle = language === "en-US" ? "Reasoning" : "思考";
    const preview = readFirstNonEmptyLine(heading.body);
    const candidate = title && title !== fallbackTitle
      ? title
      : (preview ?? title);
    return candidate ? truncateText(candidate, EXECUTION_HIGHLIGHT_TEXT_LIMIT) : undefined;
  }

  if (part.type === "tool_call" || part.type === "tool_result") {
    const header = resolveToolTraceHeaderContent(part, isEn);
    const label = header.emphasizeName
      ? header.name
      : (header.summary ?? header.name);
    const normalized = trimText(label);
    return normalized ? truncateText(normalized, EXECUTION_HIGHLIGHT_TEXT_LIMIT) : undefined;
  }

  if (part.type === "error") {
    return isEn ? "Execution failed" : "执行失败";
  }

  return undefined;
}

function buildExecutionPreview(
  parts: readonly ConversationMessagePartView[],
  language: LanguageCode,
) {
  const highlights: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const highlight = resolveExecutionHighlight(part, language);
    if (!highlight) {
      continue;
    }

    const dedupeKey = highlight.toLocaleLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    highlights.push(highlight);

    if (highlights.length >= EXECUTION_HIGHLIGHT_LIMIT) {
      break;
    }
  }

  return highlights;
}

export function formatCompletedExecutionTitle(stepCount: number, language: LanguageCode) {
  if (language === "en-US") {
    return `${stepCount} ${stepCount === 1 ? "step" : "steps"} completed`;
  }

  return `已执行 ${stepCount} 步`;
}

export function formatCompletedExecutionToolCount(toolCallCount: number, language: LanguageCode) {
  if (toolCallCount <= 0) {
    return undefined;
  }

  if (language === "en-US") {
    return `${toolCallCount} ${toolCallCount === 1 ? "tool" : "tools"}`;
  }

  return `${toolCallCount} 次工具调用`;
}

export function formatCompletedExecutionFileCount(modifiedFileCount: number, language: LanguageCode) {
  if (modifiedFileCount <= 0) {
    return undefined;
  }

  if (language === "en-US") {
    return `${modifiedFileCount} ${modifiedFileCount === 1 ? "file changed" : "files changed"}`;
  }

  return `修改 ${modifiedFileCount} 个文件`;
}

export function resolveDirectSessionCompletedExecutionDigest(input: {
  role: ConversationMessageEntry["role"];
  parts: readonly ConversationMessagePartView[];
  language: LanguageCode;
  isStreaming: boolean;
  modifiedFileCount?: number;
}) {
  if (input.role !== "assistant" || input.isStreaming || input.parts.length < 2) {
    return undefined;
  }

  let lastExecutionIndex = -1;
  for (let index = input.parts.length - 1; index >= 0; index -= 1) {
    if (isExecutionTracePart(input.parts[index]!)) {
      lastExecutionIndex = index;
      break;
    }
  }

  if (lastExecutionIndex < 0 || lastExecutionIndex >= input.parts.length - 1) {
    return undefined;
  }

  const executionParts = input.parts.slice(0, lastExecutionIndex + 1);
  const visibleTailParts = input.parts.slice(lastExecutionIndex + 1);

  if (!visibleTailParts.every((part) => isVisibleAnswerTailPart(part))) {
    return undefined;
  }

  if (!visibleTailParts.some((part) => (
    part.type === "attachment"
      ? true
      : part.type === "text" && Boolean(trimText(part.text))
  ))) {
    return undefined;
  }

  if (!executionParts.some((part) => part.type === "tool_call" || part.type === "tool_result")) {
    return undefined;
  }

  if (hasBlockingExecutionState(executionParts)) {
    return undefined;
  }

  const stepCount = executionParts.filter((part) => isExecutionTracePart(part)).length;
  if (stepCount <= 0) {
    return undefined;
  }

  const toolCallCount = new Set(
    executionParts
      .filter((part) => isCompletedToolPart(part))
      .map((part) => part.toolCallId),
  ).size;
  const highlights = buildExecutionPreview(executionParts, input.language);

  return {
    visiblePartStartIndex: lastExecutionIndex + 1,
    stepCount,
    toolCallCount,
    modifiedFileCount: input.modifiedFileCount ?? 0,
    preview: highlights.length > 0 ? highlights.join(" · ") : undefined,
    highlights,
  } satisfies DirectSessionCompletedExecutionDigest;
}
