import {
  BulbOutlined,
  CheckOutlined,
  CodeOutlined,
  CopyOutlined,
  RightOutlined,
  EditOutlined,
  FileSearchOutlined,
  LoadingOutlined,
  RollbackOutlined,
  SearchOutlined,
  ToolOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { message as antMessage } from "antd";
import { memo, useMemo, useState } from "react";

import type {
  ConversationMessageEntry,
  ConversationMessagePartView,
} from "#maomiagent/kernel/src/host/application";

import type { LanguageCode } from "../../../../config/titlebar";
import {
  parseConversationCodeBlockInfoString,
  resolveConversationCodeBlockPreviewMode,
} from "../../../../lib/conversation-code-block-preview";
import type { ChatOpenCodePreviewInput, ChatOpenWorkspaceFilePreviewInput } from "../../types";
import {
  normalizeStreamingMarkdownForRender,
  shouldRenderStreamingMarkdown,
} from "../assistant-streaming";
import { ConversationCodePreviewPanel } from "../code-preview/conversation-code-preview-panel";
import {
  ConversationMessageContent,
  type ConversationMessageCodePreviewPayload,
} from "../message-content";
import { ConversationMessageContentLite } from "../message-content-streaming-lite";
import { resolveConversationMessageCodeBlockLabel } from "../message-content-model";
import { ConversationAttachmentParts } from "../conversation-attachment-parts";
import {
  resolveModifiedMessageFiles,
  type DirectSessionModifiedMessageFile,
  type DirectSessionModifiedMessageFileAction,
} from "./direct-session-message-files";
import {
  formatCompletedExecutionFileCount,
  formatCompletedExecutionTitle,
  formatCompletedExecutionToolCount,
  resolveDirectSessionCompletedExecutionDigest,
} from "./direct-session-message-completed-execution";
import { AssistantThinkingText } from "./assistant-thinking-text";
import {
  buildReasoningPreviewText,
  shouldInlineReasoningBody,
  splitReasoningHeading,
} from "./direct-session-message-reasoning";
import {
  resolveCommandLikeToolHeadline,
  resolveToolDisplayNameFallback,
} from "./direct-session-message-tool-trace";
import { shouldRenderToolTraceBody } from "./direct-session-message-tool-trace-body";
import {
  isProjectedConversationToolOutput,
  readProjectedConversationToolOutputPreview,
  readProjectedConversationToolOutputSummary,
} from "./direct-session-session-detail-projection";
import type { ConversationAvatarSettings } from "./types";
import { WorkspacePathContextMenu } from "../workspace-path-context-menu";

type ChatMessageDisplayRole = "assistant" | "user" | "system";
type MessageTone = "success" | "running" | "warning" | "error";
type ConversationMessageTextLikePart = Extract<ConversationMessagePartView, { type: "text" | "reasoning" }>;
type ConversationMessageToolLikePart = Extract<ConversationMessagePartView, { type: "tool_call" | "tool_result" }>;

type Props = {
  message: ConversationMessageEntry;
  paneWorkspaceId?: string;
  previewWorkspaceId?: string;
  language: LanguageCode;
  workspaceAvatarSettings?: ConversationAvatarSettings;
  isStreaming: boolean;
  streamingPartIds?: readonly string[];
  detailLoading?: boolean;
  onOpenCodePreview: (input: ChatOpenCodePreviewInput) => void;
  onOpenWorkspaceFilePreview?: (input: ChatOpenWorkspaceFilePreviewInput) => void;
  onDiscardWorkspaceChanges?: (paths: string[]) => Promise<void>;
  onLoadFullSessionDetail?: (sessionId: string) => void | Promise<void>;
  onCollapseFullSessionDetail?: (sessionId: string) => void | Promise<void>;
};

const EMBEDDED_PREVIEW_FENCE_PATTERN = /(^|\n)```[ \t]*(?:mermaid|chart|charts|echarts|plotly|vega(?:-lite)?)\b/i;

function trimText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function formatDateTime(value: string | number, language: LanguageCode) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(language);
}

function formatRelativeDateTime(value: string | number, language: LanguageCode) {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return String(value);
  }

  const deltaMs = timestamp - Date.now();
  const absDeltaMs = Math.abs(deltaMs);
  if (absDeltaMs < 60_000) {
    return language === "en-US" ? "Just now" : "刚刚";
  }

  const formatter = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  if (absDeltaMs < 3_600_000) {
    return formatter.format(Math.round(deltaMs / 60_000), "minute");
  }

  if (absDeltaMs < 86_400_000) {
    return formatter.format(Math.round(deltaMs / 3_600_000), "hour");
  }

  if (absDeltaMs < 604_800_000) {
    return formatter.format(Math.round(deltaMs / 86_400_000), "day");
  }

  return formatDateTime(value, language);
}

function resolveMessageWorkspaceId(message: ConversationMessageEntry) {
  const workspaceId = message.metadata?.workspaceId;
  return typeof workspaceId === "string" && workspaceId.trim() ? workspaceId.trim() : undefined;
}

function extractPathLeaf(path: string) {
  const normalized = trimText(path);
  if (!normalized) {
    return "";
  }

  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? normalized;
}

function shouldForceFullRenderForEmbeddedPreview(content: string) {
  return EMBEDDED_PREVIEW_FENCE_PATTERN.test(content);
}

function renderEmbeddedConversationCodePreview(input: {
  payload: ConversationMessageCodePreviewPayload;
  language: LanguageCode;
}) {
  const parsedInfo = parseConversationCodeBlockInfoString(input.payload.infoString);
  const previewMode = resolveConversationCodeBlockPreviewMode({
    previewKind: parsedInfo.previewKind,
    fenceLanguage: parsedInfo.fenceLanguage,
  });

  if (previewMode !== "diagram" && previewMode !== "chart") {
    return undefined;
  }

  return (
    <div className="conversation-code-preview-surface-markdown-embedded-block">
      <ConversationCodePreviewPanel
        code={input.payload.code}
        infoString={input.payload.infoString}
        uiLanguage={input.language}
        plain
        headVariant="language-only"
      />
    </div>
  );
}

function createWorkspaceFilePreviewHandler(input: {
  paneWorkspaceId?: string;
  targetWorkspaceId?: string;
  onOpenWorkspaceFilePreview?: (preview: ChatOpenWorkspaceFilePreviewInput) => void;
}) {
  const paneWorkspaceId = trimText(input.paneWorkspaceId);
  const targetWorkspaceId = trimText(input.targetWorkspaceId);
  if (!paneWorkspaceId || !targetWorkspaceId || !input.onOpenWorkspaceFilePreview) {
    return undefined;
  }

  return (path: string) => {
    const normalizedPath = trimText(path);
    if (!normalizedPath) {
      return;
    }

    input.onOpenWorkspaceFilePreview?.({
      workspaceId: paneWorkspaceId,
      targetWorkspaceId,
      path: normalizedPath,
      title: extractPathLeaf(normalizedPath) || normalizedPath,
    });
  };
}

function resolveToolPreviewPaths(part: Extract<ConversationMessagePartView, { type: "tool_call" | "tool_result" }>) {
  return [...new Set((part.toolCall?.operation.targetPaths ?? [])
    .map((path) => trimText(path))
    .filter(Boolean))];
}

function resolveToolWorkingDirectory(part: Extract<ConversationMessagePartView, { type: "tool_call" | "tool_result" }>) {
  return trimText(part.toolCall?.operation.cwd);
}

function resolveMessageDisplayRole(role: ConversationMessageEntry["role"]): ChatMessageDisplayRole {
  if (role === "user") {
    return "user";
  }

  if (role === "system") {
    return "system";
  }

  return "assistant";
}

function resolveToolStatusTone(status: string | undefined): MessageTone {
  if (status === "failed") {
    return "error";
  }

  if (status === "blocked") {
    return "warning";
  }

  if (status === "completed") {
    return "success";
  }

  return "running";
}

function resolveMessageState(input: {
  message: ConversationMessageEntry;
  isStreaming: boolean;
  isEn: boolean;
}) {
  const hasError = input.message.parts.some((part) => {
    if (part.type === "error") {
      return true;
    }

    return (part.type === "tool_call" || part.type === "tool_result")
      && part.toolCall?.status === "failed";
  });

  if (hasError) {
    return {
      label: input.isEn ? "Error" : "失败",
      tone: "error" as const,
    };
  }

  if (input.isStreaming) {
    return {
      label: input.isEn ? "Thinking" : "思考中",
      tone: "running" as const,
    };
  }

  return null;
}

function shouldShowFooterMessageState(input: {
  messageState: ReturnType<typeof resolveMessageState>;
  displayRole: ChatMessageDisplayRole;
  isStreaming: boolean;
  hasInlineFailurePart: boolean;
}) {
  if (!input.messageState) {
    return false;
  }

  if (input.messageState.tone === "error") {
    return !input.hasInlineFailurePart;
  }

  if (input.messageState.tone === "running") {
    return input.displayRole === "assistant" && input.isStreaming;
  }

  return true;
}

function resolveMessageAvatarFallback(role: ChatMessageDisplayRole, isEn: boolean) {
  if (role === "user") {
    return isEn ? "You" : "我";
  }

  if (role === "system") {
    return isEn ? "SYS" : "系统";
  }

  return "AI";
}

function resolveMessageAvatarDataUrl(role: ChatMessageDisplayRole, workspaceAvatarSettings?: ConversationAvatarSettings) {
  if (role === "assistant") {
    return workspaceAvatarSettings?.assistantAvatarDataUrl;
  }

  if (role === "user") {
    return workspaceAvatarSettings?.userAvatarDataUrl;
  }

  return undefined;
}

function formatMessageRole(role: ConversationMessageEntry["role"], isEn: boolean) {
  switch (role) {
    case "assistant":
      return "AI";
    case "user":
      return isEn ? "You" : "我";
    case "tool":
      return isEn ? "Tool" : "工具";
    case "system":
      return isEn ? "System" : "系统";
    default:
      return role;
  }
}

function formatToolStatus(status: string | undefined, isEn: boolean) {
  switch (status) {
    case "blocked":
      return isEn ? "Blocked" : "待审批";
    case "failed":
      return isEn ? "Failed" : "失败";
    case "completed":
      return isEn ? "Completed" : "完成";
    default:
      return isEn ? "Running" : "执行中";
  }
}

function resolveToolDisplayName(
  part: Extract<ConversationMessagePartView, { type: "tool_call" | "tool_result" }>,
  isEn: boolean,
) {
  const operationLabel = trimText(part.toolCall?.operation.label);
  if (operationLabel) {
    return operationLabel;
  }

  return resolveToolDisplayNameFallback(part.toolName, isEn);
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

function formatStructuredPreview(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > 640 ? `${text.slice(0, 637)}...` : text;
  } catch {
    return String(value);
  }
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function buildErrorTraceSummaryText(value: string) {
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => trimText(line))
    .find(Boolean)
    ?? trimText(value);

  return normalized ? truncateText(normalized, 112) : undefined;
}

function shouldRenderErrorTraceBody(value: string, summary: string | undefined) {
  const normalized = trimText(value);
  if (!normalized || !summary) {
    return false;
  }

  return normalized !== summary;
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

function isStructuredConversationMessagePart(part: ConversationMessagePartView) {
  return part.type !== "text";
}

function hasLaterStructuredPart(parts: readonly ConversationMessagePartView[], index: number) {
  return parts.slice(index + 1).some((part) => isStructuredConversationMessagePart(part));
}

function shouldRenderAsAnswerBlock(input: {
  part: ConversationMessagePartView;
  parts: readonly ConversationMessagePartView[];
  index: number;
  messageRole: ConversationMessageEntry["role"];
}) {
  return input.messageRole === "assistant"
    && input.part.type === "text"
    && !hasLaterStructuredPart(input.parts, input.index);
}

function formatToolOperationKind(kind: string | undefined, isEn: boolean) {
  switch (kind) {
    case "command_execution":
      return isEn ? "Command" : "命令";
    case "file_read":
      return isEn ? "Read" : "读取";
    case "file_write":
      return isEn ? "Write" : "修改";
    case "search":
      return isEn ? "Search" : "搜索";
    case "tool_execution":
      return isEn ? "Tool" : "工具";
    default:
      return isEn ? "Tool trace" : "工具轨迹";
  }
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

function formatFileCount(count: number, isEn: boolean) {
  if (count <= 0) {
    return isEn ? "No files" : "无文件";
  }

  if (isEn) {
    return `${count} modified ${count === 1 ? "file" : "files"}`;
  }

  return `已修改 ${count} 个文件`;
}

function formatModifiedFileAction(action: DirectSessionModifiedMessageFileAction, isEn: boolean) {
  switch (action) {
    case "create":
      return isEn ? "Add" : "新增";
    case "delete":
      return isEn ? "Delete" : "删除";
    case "read":
      return isEn ? "Read" : "读取";
    case "modify":
    default:
      return isEn ? "Modify" : "修改";
  }
}

function formatModifiedFileAffectedLines(item: Pick<DirectSessionModifiedMessageFile, "affectedLines">, isEn: boolean) {
  if (item.affectedLines === undefined) {
    return isEn ? "n/a" : "未统计";
  }

  if (isEn) {
    return `${item.affectedLines} ${item.affectedLines === 1 ? "line" : "lines"}`;
  }

  return `${item.affectedLines} 行`;
}

function formatModifiedFileImpactTitle(
  item: Pick<DirectSessionModifiedMessageFile, "additions" | "deletions">,
  isEn: boolean,
) {
  if (item.additions === undefined && item.deletions === undefined) {
    return undefined;
  }

  const additions = item.additions ?? 0;
  const deletions = item.deletions ?? 0;
  return isEn
    ? `+${additions} / -${deletions}`
    : `新增 ${additions} / 删除 ${deletions}`;
}

function hasToolTraceStructuredSummary(part: ConversationMessageToolLikePart) {
  const output = part.type === "tool_result" && isRecord(part.toolCall?.output)
    ? part.toolCall.output
    : undefined;

  if (!output) {
    return false;
  }

  if (isProjectedConversationToolOutput(output)) {
    return Boolean(readProjectedConversationToolOutputSummary(output) || readProjectedConversationToolOutputPreview(output));
  }

  if (part.toolName === "workspace_read_file") {
    return Boolean(trimText(output.path));
  }

  if (part.toolName === "git_list_changes") {
    return Array.isArray(output.items);
  }

  return Boolean(trimText(output.path) || trimText(output.absolutePath));
}

export function buildToolTraceSummary(part: ConversationMessageToolLikePart, isEn: boolean) {
  const operation = part.toolCall?.operation;
  const command = trimText(operation?.command);
  const previewPaths = resolveToolPreviewPaths(part);
  const output = part.type === "tool_result" && isRecord(part.toolCall?.output)
    ? part.toolCall.output
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
    const path = formatTracePathSummary(trimText(output.path), isEn);
    if (path) {
      return readBoolean(output.binary)
        ? (isEn ? `Binary · ${path}` : `二进制 · ${path}`)
        : path;
    }
  }

  if (part.toolName === "git_list_changes" && output && Array.isArray(output.items)) {
    const count = output.items.length;
    return isEn
      ? `${count} changed ${count === 1 ? "file" : "files"}`
      : `${count} 个变更文件`;
  }

  if (output) {
    const outputPath = formatTracePathSummary(trimText(output.path) || trimText(output.absolutePath), isEn);
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
    name: resolveToolDisplayName(part, isEn),
    summary,
    emphasizeName: false,
  };
}

function resolveToolTraceKind(part: ConversationMessageToolLikePart) {
  const toolName = trimText(part.toolName).toLowerCase();
  switch (part.toolCall?.operation.kind) {
    case "command_execution":
      return "command";
    case "file_read":
      return "read";
    case "file_write":
      return "write";
    case "search":
      return "search";
    default:
      return "tool";
  }
}

function renderReasoningTraceMarker(live: boolean) {
  return (
    <span className={`chat-direct-message-trace-marker is-reasoning${live ? " is-live" : ""}`}>
      <BulbOutlined />
    </span>
  );
}

function renderErrorTraceMarker() {
  return (
    <span className="chat-direct-message-trace-marker is-error">
      <WarningOutlined />
    </span>
  );
}

function renderToolTraceMarker(part: ConversationMessageToolLikePart) {
  const kind = resolveToolTraceKind(part);
  const tone = resolveToolStatusTone(part.toolCall?.status);

  let icon = <ToolOutlined />;
  switch (kind) {
    case "command":
      icon = <CodeOutlined />;
      break;
    case "read":
      icon = <FileSearchOutlined />;
      break;
    case "write":
      icon = <EditOutlined />;
      break;
    case "search":
      icon = <SearchOutlined />;
      break;
  }

  return (
    <span className={`chat-direct-message-trace-marker is-${kind} is-${tone}${tone === "running" ? " is-live" : ""}`}>
      {icon}
    </span>
  );
}

function renderCompletedExecutionMarker() {
  return (
    <span className="chat-direct-message-trace-marker is-summary">
      <CheckOutlined />
    </span>
  );
}

function resolveToolOperationLabel(part: ConversationMessageToolLikePart, isEn: boolean) {
  return formatToolOperationKind(part.toolCall?.operation.kind, isEn);
}

function isCommandLikeToolTrace(part: ConversationMessageToolLikePart) {
  const toolName = trimText(part.toolName).toLowerCase();
  return toolName.startsWith("terminal_") || part.toolCall?.operation.kind === "command_execution";
}

function resolveToolTraceEyebrow(part: ConversationMessageToolLikePart, isEn: boolean) {
  const status = part.toolCall?.status;

  if (isCommandLikeToolTrace(part)) {
    switch (status) {
      case "blocked":
        return isEn ? "Command approval" : "命令待审批";
      case "failed":
        return isEn ? "Command failed" : "命令失败";
      case "completed":
        return isEn ? "Ran command" : "已运行命令";
      default:
        return isEn ? "Running command" : "正在运行命令";
    }
  }

  switch (status) {
    case "blocked":
      return isEn ? "Tool approval" : "工具待审批";
    case "failed":
      return isEn ? "Tool failed" : "工具失败";
    case "completed":
      return isEn ? "Ran tool" : "已调用工具";
    default:
      return isEn ? "Running tool" : "正在运行工具";
  }
}

function shouldShowToolTraceHeaderStatus(part: ConversationMessageToolLikePart) {
  return part.toolCall?.status !== "completed";
}

function shouldShowToolTraceFooterStatus(part: ConversationMessageToolLikePart) {
  return isCommandLikeToolTrace(part) && part.toolCall?.status === "completed";
}

function isConversationMessageTextLikePart(part: ConversationMessagePartView): part is ConversationMessageTextLikePart {
  return part.type === "text" || part.type === "reasoning";
}

function shouldRenderMessagePart(
  part: ConversationMessagePartView,
  messageRole: ConversationMessageEntry["role"],
  hasToolTrace: boolean,
) {
  if (part.type === "meta") {
    return false;
  }

  if (messageRole === "tool" && hasToolTrace && isConversationMessageTextLikePart(part)) {
    return false;
  }

  return true;
}

export function shouldRenderToolTracePart(
  part: Extract<ConversationMessagePartView, { type: "tool_call" | "tool_result" }>,
) {
  if (part.toolCall?.status === "blocked" || part.toolCall?.status === "failed") {
    return true;
  }

  if (trimText(part.toolCall?.operation.command) || resolveToolWorkingDirectory(part)) {
    return true;
  }

  if (resolveToolPreviewPaths(part).length > 0) {
    return true;
  }

  if (hasToolTraceStructuredSummary(part)) {
    return true;
  }

  return Boolean(resolveToolTracePreview(part));
}

export function coalesceRenderableMessageParts(
  parts: readonly ConversationMessagePartView[],
  messageRole: ConversationMessageEntry["role"],
) {
  const hasToolTrace = parts.some((part) => part.type === "tool_call" || part.type === "tool_result");
  const settledToolCallIds = new Set(parts.flatMap((part) => (
    part.type === "tool_result" && part.toolCallId
      ? [part.toolCallId]
      : []
  )));
  const merged: ConversationMessagePartView[] = [];

  for (const part of parts) {
    if (part.type === "tool_call" && part.toolCallId && settledToolCallIds.has(part.toolCallId)) {
      continue;
    }

    if (!shouldRenderMessagePart(part, messageRole, hasToolTrace)) {
      continue;
    }

    if ((part.type === "tool_call" || part.type === "tool_result") && !shouldRenderToolTracePart(part)) {
      continue;
    }

    const previous = merged[merged.length - 1];
    if (isConversationMessageTextLikePart(part) && previous && isConversationMessageTextLikePart(previous) && previous.type === part.type) {
      merged[merged.length - 1] = {
        ...previous,
        text: `${previous.text}${part.text}`,
      };
      continue;
    }

    merged.push(part);
  }

  return merged;
}

function createCodePreviewHandler(input: {
  language: LanguageCode;
  messageId: string;
  partId?: string;
  partIndex: number;
  onOpenCodePreview: (payload: ChatOpenCodePreviewInput) => void;
}) {
  return (payload: ConversationMessageCodePreviewPayload) => {
    input.onOpenCodePreview({
      title: resolveConversationMessageCodeBlockLabel({
        infoString: payload.infoString,
        language: input.language,
      }),
      messageId: `${input.messageId}:${input.partId || `part-${input.partIndex}`}`,
      code: payload.code,
      infoString: payload.infoString,
    });
  };
}

function renderToolPreviewPath(input: {
  language: LanguageCode;
  workspaceId?: string;
  path: string;
  key: string;
  pathKind?: "file" | "directory" | "unknown";
  onOpenWorkspaceFilePreview?: (path: string) => void;
}) {
  return (
    <WorkspacePathContextMenu
      key={input.key}
      language={input.language}
      workspaceId={input.workspaceId}
      path={input.path}
      pathKind={input.pathKind}
    >
      {input.onOpenWorkspaceFilePreview ? (
        <button
          type="button"
          className="chat-direct-tool-path"
          onClick={() => input.onOpenWorkspaceFilePreview?.(input.path)}
        >
          {input.path}
        </button>
      ) : (
        <span className="chat-direct-tool-path">
          {input.path}
        </span>
      )}
    </WorkspacePathContextMenu>
  );
}

function buildToolCopyText(
  part: Extract<ConversationMessagePartView, { type: "tool_call" | "tool_result" }>,
  isEn: boolean,
) {
  const preview = resolveToolTracePreview(part);
  const previewPaths = resolveToolPreviewPaths(part);
  const cwd = resolveToolWorkingDirectory(part);
  const summary = buildToolTraceSummary(part, isEn);

  return [
    resolveToolDisplayName(part, isEn),
    summary,
    cwd ? `${isEn ? "cwd" : "目录"}: ${cwd}` : undefined,
    trimText(part.toolCall?.operation.command)
      ? `> ${trimText(part.toolCall?.operation.command)}`
      : undefined,
    previewPaths.length > 0 ? previewPaths.join("\n") : undefined,
    preview,
  ].filter((value): value is string => Boolean(value)).join("\n");
}

function buildMessageCopyText(parts: ConversationMessagePartView[], isEn: boolean) {
  return parts.map((part) => {
    if (part.type === "text" || part.type === "reasoning") {
      return trimText(part.text);
    }

    if (part.type === "attachment") {
      return trimText(part.fileName) || trimText(part.name) || trimText(part.path) || trimText(part.attachmentId);
    }

    if (part.type === "error") {
      return getErrorText(part.error);
    }

    if (part.type === "meta") {
      return formatStructuredPreview(part.data);
    }

    if (part.type === "tool_call" || part.type === "tool_result") {
      return buildToolCopyText(part, isEn);
    }

    return undefined;
  }).filter((value): value is string => Boolean(value)).join("\n\n").trim();
}

export function resolveToolTracePreview(
  part: Extract<ConversationMessagePartView, { type: "tool_call" | "tool_result" }>,
) {
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

function renderTextContent(input: {
  content: string;
  language: LanguageCode;
  live: boolean;
  messageId: string;
  partId?: string;
  partIndex: number;
  onOpenCodePreview: (payload: ChatOpenCodePreviewInput) => void;
}) {
  const renderStreamingMarkdown = input.live && shouldRenderStreamingMarkdown(input.content);
  const normalizedStreamingMarkdown = renderStreamingMarkdown
    ? normalizeStreamingMarkdownForRender(input.content)
    : {
        content: "",
        appendedSyntheticCodeFence: false,
      };
  const previewCodeBlock = createCodePreviewHandler({
    language: input.language,
    messageId: input.messageId,
    partId: input.partId,
    partIndex: input.partIndex,
    onOpenCodePreview: input.onOpenCodePreview,
  });

  if (input.live) {
    return renderStreamingMarkdown ? (
      <ConversationMessageContentLite
        content={normalizedStreamingMarkdown.content}
        appendedSyntheticCodeFence={normalizedStreamingMarkdown.appendedSyntheticCodeFence}
        language={input.language}
        onPreviewCodeBlock={previewCodeBlock}
      />
    ) : (
      <div className="chat-direct-message-plain-stream">{input.content}</div>
    );
  }

  // Keep the main chat thread on the lightweight renderer by default.
  // The full MDX editor path is reserved for explicit embedded previews.
  if (!shouldForceFullRenderForEmbeddedPreview(input.content)) {
    return (
      <ConversationMessageContentLite
        content={input.content}
        language={input.language}
        onPreviewCodeBlock={previewCodeBlock}
      />
    );
  }

  return (
    <ConversationMessageContent
      content={input.content}
      language={input.language}
      onPreviewCodeBlock={previewCodeBlock}
      renderCodeBlock={(payload) => renderEmbeddedConversationCodePreview({
        payload,
        language: input.language,
      })}
      forceFullRender
    />
  );
}

function renderMessagePart(
  part: ConversationMessagePartView,
  parts: readonly ConversationMessagePartView[],
  language: LanguageCode,
  messageId: string,
  sessionId: string,
  messageRole: ConversationMessageEntry["role"],
  isStreaming: boolean,
  streamingPartIds: readonly string[] | undefined,
  detailLoading: boolean | undefined,
  index: number,
  isEn: boolean,
  workspaceId: string | undefined,
  onOpenCodePreview: (input: ChatOpenCodePreviewInput) => void,
  onOpenWorkspaceFilePreview?: (path: string) => void,
  onLoadFullSessionDetail?: (sessionId: string) => void | Promise<void>,
  onCollapseFullSessionDetail?: (sessionId: string) => void | Promise<void>,
) {
  const isLivePart = isStreaming
    && messageRole === "assistant"
    && (
      !streamingPartIds
      || streamingPartIds.length === 0
      || (part.partId ? streamingPartIds.includes(part.partId) : true)
    );

  if (part.type === "text") {
    const live = isLivePart;
    const answerBlock = shouldRenderAsAnswerBlock({
      part,
      parts,
      index,
      messageRole,
    });

    return (
      <div key={part.partId || `${part.type}-${index}`} className="chat-direct-message-part">
        {answerBlock ? (
          <div className={`chat-direct-message-answer${live ? " is-live" : ""}`}>
            <div className="chat-direct-message-answer-content">
              {renderTextContent({
                content: part.text,
                language,
                live,
                messageId,
                partId: part.partId,
                partIndex: index,
                onOpenCodePreview,
              })}
            </div>
          </div>
        ) : renderTextContent({
          content: part.text,
          language,
          live,
          messageId,
          partId: part.partId,
          partIndex: index,
          onOpenCodePreview,
        })}
      </div>
    );
  }

  if (part.type === "reasoning") {
    const live = isLivePart;
    const reasoning = splitReasoningHeading(part.text, language);
    const hasBody = Boolean(reasoning.body);
    const inlineBody = hasBody && shouldInlineReasoningBody({
      body: reasoning.body,
      live,
    });
    const reasoningPreview = inlineBody ? undefined : buildReasoningPreviewText(reasoning.body);
    const reasoningHeader = (
      <>
        <span className="chat-direct-message-execution-main chat-direct-message-reasoning-main">
          {renderReasoningTraceMarker(live)}
          <span className="chat-direct-message-execution-head chat-direct-message-reasoning-head">
            <span className="chat-direct-message-execution-title-row chat-direct-message-reasoning-title-row">
              <span className="chat-direct-message-reasoning-eyebrow">{isEn ? "Reasoning" : "思考"}</span>
              <span className="chat-direct-message-reasoning-title">{reasoning.title}</span>
            </span>
            {reasoningPreview ? (
              <span className="chat-direct-message-reasoning-preview">{reasoningPreview}</span>
            ) : null}
          </span>
        </span>
        {live ? (
          <span className="chat-direct-message-execution-side">
            <span className="chat-direct-message-reasoning-badge is-live">
              {isEn ? "Live" : "进行中"}
            </span>
          </span>
        ) : null}
      </>
    );

    if (!hasBody) {
      return (
        <div
          key={part.partId || `${part.type}-${index}`}
          className={`chat-direct-message-execution-row chat-direct-message-reasoning${live ? " is-live" : ""} is-static`}
        >
          <div className="chat-direct-message-execution-summary chat-direct-message-reasoning-summary is-static">
            {reasoningHeader}
          </div>
        </div>
      );
    }

    if (inlineBody) {
      return (
        <div
          key={part.partId || `${part.type}-${index}`}
          className={`chat-direct-message-execution-row chat-direct-message-reasoning${live ? " is-live" : ""} is-static is-inline-body`}
        >
          <div className="chat-direct-message-execution-summary chat-direct-message-reasoning-summary is-static">
            {reasoningHeader}
          </div>
          <div className="chat-direct-message-execution-body chat-direct-message-reasoning-body is-inline-body">
            {renderTextContent({
              content: reasoning.body,
              language,
              live,
              messageId,
              partId: part.partId,
              partIndex: index,
              onOpenCodePreview,
            })}
          </div>
        </div>
      );
    }

    return (
      <details
        key={part.partId || `${part.type}-${index}`}
        className={`chat-direct-message-execution-row chat-direct-message-reasoning${live ? " is-live" : ""}`}
      >
        <summary className="chat-direct-message-execution-summary chat-direct-message-reasoning-summary">
          {reasoningHeader}
        </summary>
        <div className="chat-direct-message-execution-body chat-direct-message-reasoning-body">
          {renderTextContent({
            content: reasoning.body,
            language,
            live,
            messageId,
            partId: part.partId,
            partIndex: index,
            onOpenCodePreview,
          })}
        </div>
      </details>
    );
  }

  if (part.type === "attachment") {
    return (
      <div key={part.partId || `${part.type}-${index}`} className="chat-direct-message-part">
        <ConversationAttachmentParts
          attachments={[part]}
          workspaceId={workspaceId}
          onOpenWorkspaceFilePreview={onOpenWorkspaceFilePreview}
        />
      </div>
    );
  }

  if (part.type === "error") {
    const errorText = getErrorText(part.error);
    const errorSummary = buildErrorTraceSummaryText(errorText);
    const hasBody = shouldRenderErrorTraceBody(errorText, errorSummary);
    const errorHeader = (
      <>
        <span className="chat-direct-message-execution-main chat-direct-message-tool-trace-main">
          {renderErrorTraceMarker()}
          <span className="chat-direct-message-execution-head chat-direct-message-tool-trace-head">
            <span className="chat-direct-message-execution-title-row chat-direct-message-tool-trace-title-row">
              <span className="chat-direct-message-tool-trace-kind">{isEn ? "Error" : "错误"}</span>
              <span className="chat-direct-message-tool-name">{isEn ? "Execution failed" : "执行失败"}</span>
            </span>
            {errorSummary ? <span className="chat-direct-message-tool-summary">{errorSummary}</span> : null}
          </span>
        </span>
        <span className="chat-direct-message-execution-side chat-direct-message-tool-trace-side">
          <span className="chat-direct-message-tool-status is-error">{isEn ? "Failed" : "失败"}</span>
        </span>
      </>
    );

    if (!hasBody) {
      return (
        <div
          key={part.partId || `${part.type}-${index}`}
          className="chat-direct-message-execution-row chat-direct-message-tool-trace is-error is-static"
        >
          <div className="chat-direct-message-execution-summary chat-direct-message-tool-trace-summary is-static">
            {errorHeader}
          </div>
        </div>
      );
    }

    return (
      <details
        key={part.partId || `${part.type}-${index}`}
        className="chat-direct-message-execution-row chat-direct-message-tool-trace is-error"
        open
      >
        <summary className="chat-direct-message-execution-summary chat-direct-message-tool-trace-summary">
          {errorHeader}
        </summary>
        <div className="chat-direct-message-execution-body chat-direct-message-tool-trace-body">
          <pre className="chat-direct-message-error">{errorText}</pre>
        </div>
      </details>
    );
  }

  if (part.type === "meta") {
    const preview = formatStructuredPreview(part.data);
    return preview ? (
      <pre key={part.partId || `${part.type}-${index}`} className="chat-direct-message-tool-body">
        {preview}
      </pre>
    ) : null;
  }

  if (part.type !== "tool_call" && part.type !== "tool_result") {
    return null;
  }

  const toolTone = resolveToolStatusTone(part.toolCall?.status);
  const isCommandTrace = isCommandLikeToolTrace(part);
  const command = trimText(part.toolCall?.operation.command);
  const cwd = resolveToolWorkingDirectory(part);
  const previewPaths = resolveToolPreviewPaths(part);
  const headerContent = resolveToolTraceHeaderContent(part, isEn);
  const preview = resolveToolTracePreview(part);
  const projectedToolOutput = isProjectedConversationToolOutput(part.toolCall?.output);
  const defaultOpen = !projectedToolOutput
    && (part.toolCall?.status === "blocked" || part.toolCall?.status === "failed");
  const traceEyebrow = resolveToolTraceEyebrow(part, isEn);
  const showHeaderStatus = shouldShowToolTraceHeaderStatus(part);
  const showFooterStatus = shouldShowToolTraceFooterStatus(part);
  const showLoadFullOutputAction = projectedToolOutput && Boolean(onLoadFullSessionDetail);
  const hasBody = shouldRenderToolTraceBody({
    command,
    cwd,
    previewPaths,
    preview,
    canLoadFullOutput: showLoadFullOutputAction,
  });
  const toolOutputAction = showLoadFullOutputAction ? (
    <button
      type="button"
      className="chat-direct-message-tool-output-expand"
      disabled={detailLoading}
      onClick={() => {
        if (detailLoading) {
          return;
        }
        void onLoadFullSessionDetail?.(sessionId);
      }}
    >
      {detailLoading
        ? (isEn ? "Loading" : "正在加载")
        : (isEn ? "Load full content" : "加载完整内容")}
    </button>
  ) : null;
  const traceHeader = (
    <>
      <span className="chat-direct-message-execution-main chat-direct-message-tool-trace-main">
        {renderToolTraceMarker(part)}
        <span className="chat-direct-message-execution-head chat-direct-message-tool-trace-head">
          <span className={`chat-direct-message-tool-trace-eyebrow${isCommandTrace ? " is-command-like" : ""}`}>{traceEyebrow}</span>
          <span className="chat-direct-message-execution-title-row chat-direct-message-tool-trace-title-row">
            <span className="chat-direct-message-tool-trace-kind">{resolveToolOperationLabel(part, isEn)}</span>
            <span className={`chat-direct-message-tool-name${headerContent.emphasizeName ? " is-primary-summary" : ""}${isCommandTrace ? " is-command-headline" : ""}`}>{headerContent.name}</span>
            {headerContent.summary ? <span className="chat-direct-message-tool-summary">{headerContent.summary}</span> : null}
          </span>
        </span>
      </span>
      <span className="chat-direct-message-execution-side chat-direct-message-tool-trace-side">
        {previewPaths.length > 1 && !headerContent.summary ? (
          <span className="chat-direct-message-tool-trace-chip">{formatPathCount(previewPaths.length, isEn)}</span>
        ) : null}
        {showHeaderStatus ? (
          <span className={`chat-direct-message-tool-status is-${toolTone}`}>
            {formatToolStatus(part.toolCall?.status, isEn)}
          </span>
        ) : null}
      </span>
    </>
  );

  if (!hasBody) {
    return (
      <div key={part.partId || `${part.type}-${index}`} className={`chat-direct-message-execution-row chat-direct-message-tool-trace is-${toolTone}${isCommandTrace ? " is-command-like" : ""} is-static`}>
        <div className="chat-direct-message-execution-summary chat-direct-message-tool-trace-summary is-static">
          {traceHeader}
        </div>
      </div>
    );
  }

  return (
    <details
      key={part.partId || `${part.type}-${index}`}
      className={`chat-direct-message-execution-row chat-direct-message-tool-trace is-${toolTone}${isCommandTrace ? " is-command-like" : ""}`}
      open={defaultOpen}
      onToggle={(event) => {
        if (!event.currentTarget.open && showLoadFullOutputAction && onCollapseFullSessionDetail) {
          void onCollapseFullSessionDetail(sessionId);
        }
      }}
    >
      <summary className="chat-direct-message-execution-summary chat-direct-message-tool-trace-summary">
        {traceHeader}
      </summary>
      <div className={`chat-direct-message-execution-body chat-direct-message-tool-trace-body${isCommandTrace ? " is-command-like" : ""}`}>
        {isCommandTrace ? (
          <div className="chat-direct-message-command-trace-card">
            <div className="chat-direct-message-command-trace-card-head">
              <span className="chat-direct-message-command-trace-card-shell">Shell</span>
              {cwd ? <code className="chat-direct-message-command-trace-card-dir">{cwd}</code> : null}
            </div>
            {command ? (
              <div className="chat-direct-execution-tool-command-row is-command-card">
                <span className="chat-direct-execution-tool-prompt">$</span>
                <code className="chat-direct-execution-tool-command">{command}</code>
              </div>
            ) : null}
            {preview ? <pre className="chat-direct-message-tool-body is-command-card">{preview}</pre> : null}
            {previewPaths.length > 0 ? (
              <div className="chat-direct-tool-paths is-command-card">
                {previewPaths.map((path) => renderToolPreviewPath({
                  language,
                  workspaceId,
                  path,
                  key: `${part.partId || `${part.type}-${index}`}:${path}`,
                  pathKind: "unknown",
                  onOpenWorkspaceFilePreview,
                }))}
              </div>
            ) : null}
            {toolOutputAction}
            {showFooterStatus ? (
              <div className="chat-direct-message-command-trace-card-footer">
                <span className={`chat-direct-message-tool-status is-${toolTone} is-footer`}>
                  <CheckOutlined />
                  {formatToolStatus(part.toolCall?.status, isEn)}
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            {cwd ? (
              <div className="chat-direct-execution-tool-detail-row">
                <span className="chat-direct-execution-tool-detail-label">{isEn ? "Directory" : "目录"}</span>
                <code className="chat-direct-execution-tool-detail-value">{cwd}</code>
              </div>
            ) : null}
            {command ? (
              <div className="chat-direct-execution-tool-command-row">
                <span className="chat-direct-execution-tool-prompt">&gt;</span>
                <code className="chat-direct-execution-tool-command">{command}</code>
              </div>
            ) : null}
            {previewPaths.length > 0 ? (
              <div className="chat-direct-tool-paths">
                {previewPaths.map((path) => renderToolPreviewPath({
                  language,
                  workspaceId,
                  path,
                  key: `${part.partId || `${part.type}-${index}`}:${path}`,
                  pathKind: "unknown",
                  onOpenWorkspaceFilePreview,
                }))}
              </div>
            ) : null}
            {preview ? <pre className="chat-direct-message-tool-body">{preview}</pre> : null}
            {toolOutputAction}
          </>
        )}
      </div>
    </details>
  );
}

function DirectSessionMessageInner(props: Props) {
  const [filesCollapsed, setFilesCollapsed] = useState(true);
  const [discardingPaths, setDiscardingPaths] = useState<string[]>([]);
  const [discardedPaths, setDiscardedPaths] = useState<string[]>([]);
  const isEn = props.language === "en-US";
  const displayRole = resolveMessageDisplayRole(props.message.role);
  const avatarDataUrl = resolveMessageAvatarDataUrl(displayRole, props.workspaceAvatarSettings);
  const workspaceId = trimText(props.previewWorkspaceId) || resolveMessageWorkspaceId(props.message);
  const openWorkspaceFilePreview = createWorkspaceFilePreviewHandler({
    paneWorkspaceId: props.paneWorkspaceId,
    targetWorkspaceId: workspaceId,
    onOpenWorkspaceFilePreview: props.onOpenWorkspaceFilePreview,
  });
  const renderableParts = useMemo(() => coalesceRenderableMessageParts(props.message.parts, props.message.role), [
    props.message.parts,
    props.message.role,
  ]);
  const hasInlineFailurePart = useMemo(() => renderableParts.some((part) => {
    if (part.type === "error") {
      return true;
    }

    return (part.type === "tool_call" || part.type === "tool_result")
      && part.toolCall?.status === "failed";
  }), [renderableParts]);
  const modifiedFiles = useMemo(() => displayRole === "assistant"
    ? resolveModifiedMessageFiles(renderableParts)
    : [], [displayRole, renderableParts]);
  const visibleModifiedFiles = useMemo(() => modifiedFiles.filter((item) => !discardedPaths.includes(item.path)), [
    discardedPaths,
    modifiedFiles,
  ]);
  const discardedFileCount = modifiedFiles.length - visibleModifiedFiles.length;
  const completedExecutionDigest = useMemo(() => resolveDirectSessionCompletedExecutionDigest({
    role: props.message.role,
    parts: renderableParts,
    language: props.language,
    isStreaming: props.isStreaming,
    modifiedFileCount: visibleModifiedFiles.length,
  }), [
    props.isStreaming,
    props.language,
    props.message.role,
    renderableParts,
    visibleModifiedFiles.length,
  ]);
  const executionPartSplitIndex = completedExecutionDigest?.visiblePartStartIndex ?? 0;
  const collapsedExecutionParts = completedExecutionDigest
    ? renderableParts.slice(0, executionPartSplitIndex)
    : [];
  const primaryRenderableParts = completedExecutionDigest
    ? renderableParts.slice(executionPartSplitIndex)
    : renderableParts;
  const messageState = useMemo(() => resolveMessageState({
    message: props.message,
    isStreaming: props.isStreaming,
    isEn,
  }), [isEn, props.isStreaming, props.message]);
  const showFooterMessageState = shouldShowFooterMessageState({
    messageState,
    displayRole,
    isStreaming: props.isStreaming,
    hasInlineFailurePart,
  });
  const hasCopyableMessageBody = renderableParts.some((part) => (
    part.type === "text"
    || part.type === "reasoning"
    || part.type === "attachment"
    || part.type === "error"
    || part.type === "meta"
  ));
  const showCopyAction = !props.isStreaming
    && hasCopyableMessageBody
    && typeof globalThis.navigator?.clipboard?.writeText === "function";
  const showFooterTimestamp = displayRole !== "assistant";
  const showFooter = showFooterMessageState || showCopyAction || showFooterTimestamp;

  async function handleDiscardPaths(paths: string[]) {
    if (!props.onDiscardWorkspaceChanges) {
      return;
    }

    const normalizedPaths = [...new Set(paths.map((path) => path.trim()).filter(Boolean))]
      .filter((path) => !discardedPaths.includes(path) && !discardingPaths.includes(path));
    if (normalizedPaths.length === 0) {
      return;
    }

    setDiscardingPaths((current) => [...new Set([...current, ...normalizedPaths])]);

    try {
      await props.onDiscardWorkspaceChanges(normalizedPaths);
      setDiscardedPaths((current) => [...new Set([...current, ...normalizedPaths])]);
      antMessage.success(isEn
        ? `Reverted ${normalizedPaths.length} file${normalizedPaths.length === 1 ? "" : "s"}`
        : `已撤销 ${normalizedPaths.length} 个文件的修改`);
    } catch (error) {
      antMessage.error(isEn
        ? `Unable to revert changes: ${getErrorText(error)}`
        : `撤销修改失败：${getErrorText(error)}`);
    } finally {
      setDiscardingPaths((current) => current.filter((path) => !normalizedPaths.includes(path)));
    }
  }

  const modifiedFilesSection = visibleModifiedFiles.length > 0 ? (
    <div className="chat-direct-message-files-shell">
      <div className="chat-direct-message-files-header">
        <button
          type="button"
          className="chat-direct-message-files-toggle"
          onClick={() => {
            setFilesCollapsed((current) => !current);
          }}
        >
          <RightOutlined
            className={[
              "chat-direct-message-files-toggle-icon",
              filesCollapsed ? "is-collapsed" : "is-expanded",
            ].join(" ")}
          />
          <span className="chat-direct-message-files-title-group">
            <span className="chat-direct-message-files-title">
              {isEn ? "Modified files" : "修改文件"}
            </span>
            <span className="chat-direct-message-files-count">
              {formatFileCount(visibleModifiedFiles.length, isEn)}
            </span>
            {discardedFileCount > 0 ? (
              <span className="chat-direct-message-files-discarded-note">
                {isEn
                  ? `${discardedFileCount} reverted`
                  : `已撤销 ${discardedFileCount} 个文件`}
              </span>
            ) : null}
          </span>
        </button>
        {!filesCollapsed && props.onDiscardWorkspaceChanges && visibleModifiedFiles.length > 1 ? (
          <button
            type="button"
            className="chat-direct-message-files-undo-all"
            onClick={() => {
              void handleDiscardPaths(visibleModifiedFiles.map((item) => item.path));
            }}
            disabled={discardingPaths.length > 0}
          >
            {discardingPaths.length > 0 ? (
              <LoadingOutlined />
            ) : (
              <RollbackOutlined />
            )}
            <span>{isEn ? "Undo all" : "全部撤销"}</span>
          </button>
        ) : null}
      </div>

      {!filesCollapsed ? (
        <div className="chat-direct-message-files-list">
          {visibleModifiedFiles.map((item) => {
            const isDiscarding = discardingPaths.includes(item.path);
            const actionLabel = formatModifiedFileAction(item.action, isEn);
            const lineLabel = formatModifiedFileAffectedLines(item, isEn);
            const impactTitle = formatModifiedFileImpactTitle(item, isEn);
            const pathNode = (
              <WorkspacePathContextMenu
                language={props.language}
                workspaceId={workspaceId}
                path={item.path}
                pathKind="file"
              >
                {openWorkspaceFilePreview ? (
                  <button
                    type="button"
                    className="chat-direct-message-files-path is-button"
                    title={item.path}
                    onClick={() => openWorkspaceFilePreview?.(item.path)}
                  >
                    {item.path}
                  </button>
                ) : (
                  <span className="chat-direct-message-files-path" title={item.path}>{item.path}</span>
                )}
              </WorkspacePathContextMenu>
            );

            return (
              <div key={item.path} className="chat-direct-message-files-item">
                <div className="chat-direct-message-files-item-main">
                  {pathNode}
                </div>
                <div className="chat-direct-message-files-item-side">
                  <span className="chat-direct-message-files-item-metric is-action">
                    {actionLabel}
                  </span>
                  <span
                    className="chat-direct-message-files-item-metric is-lines"
                    title={impactTitle}
                  >
                    {lineLabel}
                  </span>
                  {props.onDiscardWorkspaceChanges ? (
                    <button
                      type="button"
                      className="chat-direct-message-files-undo"
                      onClick={() => {
                        void handleDiscardPaths([item.path]);
                      }}
                      disabled={isDiscarding}
                    >
                      {isDiscarding ? <LoadingOutlined /> : <RollbackOutlined />}
                      <span>{isEn ? "Undo" : "撤销"}</span>
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <article
      className={`chat-direct-message-row is-${displayRole}${props.isStreaming ? " is-streaming" : ""}`}
    >
      <div className={`chat-direct-message-lane is-${displayRole}`}>
        <div className={`chat-direct-message-frame is-${displayRole}`}>
          <div className="chat-direct-message-avatar-slot">
            <span
              className={[
                "chat-bubble-avatar",
                displayRole === "assistant"
                  ? "chat-bubble-assistant-avatar"
                  : (displayRole === "user" ? "chat-bubble-user-avatar" : "chat-bubble-system-avatar"),
                displayRole === "assistant" && props.isStreaming ? "is-live" : "",
              ].filter(Boolean).join(" ")}
              aria-label={formatMessageRole(props.message.role, isEn)}
              title={formatMessageRole(props.message.role, isEn)}
            >
              {avatarDataUrl ? (
                <img className="chat-bubble-avatar-image" src={avatarDataUrl} alt="" />
              ) : (
                resolveMessageAvatarFallback(displayRole, isEn)
              )}
            </span>
          </div>

          <div className={`chat-direct-message-main is-${displayRole}`}>
            <div
              className={[
                "chat-direct-message-body",
                displayRole === "assistant" ? "is-assistant" : "",
                displayRole === "user" ? "is-user" : "",
              ].filter(Boolean).join(" ")}
            >
              {primaryRenderableParts.map((part, index) => renderMessagePart(
                part,
                renderableParts,
                props.language,
                props.message.messageId,
                props.message.sessionId,
                props.message.role,
                props.isStreaming,
                props.streamingPartIds,
                props.detailLoading,
                executionPartSplitIndex + index,
                isEn,
                workspaceId,
                props.onOpenCodePreview,
                openWorkspaceFilePreview,
                props.onLoadFullSessionDetail,
                props.onCollapseFullSessionDetail,
              ))}
              {completedExecutionDigest && collapsedExecutionParts.length > 0 ? (
                <details className="chat-direct-message-execution-bundle">
                  <summary className="chat-direct-message-execution-summary chat-direct-message-execution-bundle-summary">
                    <span className="chat-direct-message-execution-main chat-direct-message-execution-bundle-main">
                      {renderCompletedExecutionMarker()}
                      <span className="chat-direct-message-execution-head chat-direct-message-execution-bundle-head">
                        <span className="chat-direct-message-execution-title-row chat-direct-message-execution-bundle-title-row">
                          <span className="chat-direct-message-execution-bundle-eyebrow">
                            {isEn ? "Execution summary" : "执行摘要"}
                          </span>
                          <span className="chat-direct-message-execution-bundle-title">
                            {formatCompletedExecutionTitle(completedExecutionDigest.stepCount, props.language)}
                          </span>
                        </span>
                        {completedExecutionDigest.preview ? (
                          <span className="chat-direct-message-execution-bundle-preview">
                            {completedExecutionDigest.preview}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="chat-direct-message-execution-side chat-direct-message-execution-bundle-side">
                      {completedExecutionDigest.toolCallCount > 0 ? (
                        <span className="chat-direct-message-execution-bundle-chip">
                          {formatCompletedExecutionToolCount(completedExecutionDigest.toolCallCount, props.language)}
                        </span>
                      ) : null}
                      {completedExecutionDigest.modifiedFileCount > 0 ? (
                        <span className="chat-direct-message-execution-bundle-chip">
                          {formatCompletedExecutionFileCount(completedExecutionDigest.modifiedFileCount, props.language)}
                        </span>
                      ) : null}
                      <span className="chat-direct-message-execution-bundle-hint">
                        {isEn ? "View steps" : "查看过程"}
                      </span>
                    </span>
                  </summary>
                  <div className="chat-direct-message-execution-body chat-direct-message-execution-bundle-body">
                    {collapsedExecutionParts.map((part, index) => renderMessagePart(
                      part,
                      renderableParts,
                      props.language,
                      props.message.messageId,
                      props.message.sessionId,
                      props.message.role,
                      props.isStreaming,
                      props.streamingPartIds,
                      props.detailLoading,
                      index,
                      isEn,
                      workspaceId,
                      props.onOpenCodePreview,
                      openWorkspaceFilePreview,
                      props.onLoadFullSessionDetail,
                      props.onCollapseFullSessionDetail,
                    ))}
                    {modifiedFilesSection}
                  </div>
                </details>
              ) : null}
            </div>

            {completedExecutionDigest ? null : modifiedFilesSection}

            {showFooter ? (
              <div className={`chat-direct-message-footer is-${displayRole}`}>
                {showFooterMessageState && messageState ? (
                  <span className={`chat-direct-message-footer-meta is-${displayRole}`}>
                    <span
                      className={[
                        "chat-direct-message-status",
                        `is-${messageState.tone}`,
                      ].filter(Boolean).join(" ")}
                    >
                        {messageState.tone === "running" ? (
                          <AssistantThinkingText text={messageState.label} />
                        ) : messageState.label}
                    </span>
                  </span>
                ) : null}
                <span className={`chat-direct-message-footer-side is-${displayRole}`}>
                  {showCopyAction ? (
                    <span className="chat-direct-message-actions">
                      <button
                        type="button"
                        className="chat-direct-message-action"
                        onClick={() => {
                          const copyText = buildMessageCopyText(renderableParts, isEn);
                          if (!copyText) {
                            return;
                          }

                          void globalThis.navigator?.clipboard?.writeText(copyText);
                        }}
                        aria-label={isEn ? "Copy message" : "复制消息"}
                      >
                        <CopyOutlined />
                      </button>
                    </span>
                  ) : null}
                  {showFooterTimestamp ? (
                    <span className="chat-direct-message-footer-note">
                      <span title={formatDateTime(props.message.createdAt, props.language)}>
                        {formatRelativeDateTime(props.message.createdAt, props.language)}
                      </span>
                    </span>
                  ) : null}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export const DirectSessionMessage = memo(DirectSessionMessageInner);
DirectSessionMessage.displayName = "DirectSessionMessage";

export default DirectSessionMessage;
