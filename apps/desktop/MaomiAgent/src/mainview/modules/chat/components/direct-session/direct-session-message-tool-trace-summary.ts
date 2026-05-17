import type { ConversationMessagePartView } from "#maomiagent/kernel/src/host/application";

import {
  readProjectedConversationToolOutputPreview,
  readProjectedConversationToolOutputSummary,
} from "./direct-session-session-detail-projection";
import {
  resolveCommandLikeToolHeadline,
  resolveToolDisplayNameFallback,
} from "./direct-session-message-tool-trace";

type ConversationMessageToolLikePart = Extract<ConversationMessagePartView, { type: "tool_call" | "tool_result" }>;

function trimText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function formatTracePathSummary(path: string, isEn: boolean) {
  const normalized = trimText(path).replaceAll("\\", "/");
  if (!normalized) {
    return undefined;
  }

  if (normalized === "." || normalized === "./") {
    return isEn ? "workspace root" : "工作区根目录";
  }

  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) ?? normalized;
}

function formatPathCount(count: number, isEn: boolean) {
  if (count <= 0) {
    return undefined;
  }

  if (isEn) {
    return `${count} ${count === 1 ? "path" : "paths"}`;
  }

  return `${count} 个路径`;
}

function resolveToolPreviewPaths(part: ConversationMessageToolLikePart) {
  return [...new Set((part.toolCall?.operation.targetPaths ?? [])
    .map((path) => trimText(path))
    .filter(Boolean))];
}

function getErrorText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    const record = value as { message?: unknown; code?: unknown };
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
    if (typeof record.code === "string" && record.code.trim()) {
      return record.code;
    }
  }

  return String(value ?? "Unknown error");
}

function resolveToolTracePreview(part: ConversationMessageToolLikePart) {
  if (part.type !== "tool_result") {
    return undefined;
  }

  const projectedPreview = readProjectedConversationToolOutputPreview(part.toolCall?.output);
  if (projectedPreview) {
    return projectedPreview;
  }

  if (part.toolCall?.status === "failed") {
    return getErrorText(part.toolCall?.error ?? part.toolCall?.output);
  }

  if (part.toolCall?.operation.kind !== "command_execution") {
    return undefined;
  }

  const output = part.toolCall?.output;
  if (typeof output === "string") {
    return output;
  }

  if (!isRecord(output)) {
    return undefined;
  }

  const stdout = trimText(output.stdout);
  const stderr = trimText(output.stderr);
  const merged = [stdout, stderr].filter(Boolean).join("\n").trim();
  if (merged) {
    return merged;
  }

  return trimText(output.output)
    || trimText(output.text)
    || trimText(output.message)
    || undefined;
}

export function buildToolTraceSummary(part: ConversationMessageToolLikePart, isEn: boolean) {
  const operation = part.toolCall?.operation;
  const command = trimText(operation?.command);
  const previewPaths = resolveToolPreviewPaths(part);
  const output = part.type === "tool_result"
    ? part.toolCall?.output
    : undefined;
  const projectedSummary = readProjectedConversationToolOutputSummary(output);

  if (projectedSummary) {
    return projectedSummary;
  }

  if (command && operation?.kind !== "command_execution") {
    return truncateText(command, 64);
  }

  if (previewPaths.length === 1) {
    return truncateText(formatTracePathSummary(previewPaths[0] ?? "", isEn) ?? "", 72);
  }

  if (previewPaths.length > 1) {
    return formatPathCount(previewPaths.length, isEn);
  }

  if (part.toolName === "workspace_read_file" && output) {
    const path = formatTracePathSummary(trimText((output as Record<string, unknown>).path), isEn);
    if (path) {
      return readBoolean((output as Record<string, unknown>).binary)
        ? (isEn ? `Binary · ${path}` : `二进制 · ${path}`)
        : path;
    }
  }

  if (part.toolName === "git_list_changes" && output) {
    const items = (output as Record<string, unknown>).items;
    if (!Array.isArray(items)) {
      return undefined;
    }

    const count = items.length;
    return isEn
      ? `${count} changed ${count === 1 ? "file" : "files"}`
      : `${count} 个变更文件`;
  }

  if (output) {
    const outputPath = formatTracePathSummary(trimText((output as Record<string, unknown>).path) || trimText((output as Record<string, unknown>).absolutePath), isEn);
    if (outputPath) {
      return truncateText(outputPath, 64);
    }
  }

  return undefined;
}

export function resolveToolTraceHeaderContent(part: ConversationMessageToolLikePart, isEn: boolean) {
  const summary = buildToolTraceSummary(part, isEn);
  const output = part.type === "tool_result"
    ? part.toolCall?.output
    : undefined;
  const projectedOutputSummary = readProjectedConversationToolOutputSummary(output);
  const terminalHeadline = resolveCommandLikeToolHeadline({
    toolName: part.toolName,
    isEn,
    operationKind: part.toolCall?.operation.kind,
    command: part.toolCall?.operation.command,
    summary,
    preview: projectedOutputSummary ? undefined : resolveToolTracePreview(part),
    output,
  });
  if (terminalHeadline) {
    return {
      name: terminalHeadline,
      summary: undefined,
      emphasizeName: true,
    };
  }

  return {
    name: resolveToolDisplayNameFallback(part.toolName, isEn),
    summary,
    emphasizeName: false,
  };
}
