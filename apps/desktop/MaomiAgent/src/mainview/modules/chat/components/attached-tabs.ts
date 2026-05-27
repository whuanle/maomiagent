import type {
  ChatAttachedTabRequest,
  ChatAttachedTabState,
  ChatPreviewSource,
} from "../types";

const CHAT_ATTACHED_TAB_PREFIX = "attached:";

function normalizeMessageCodeBlockPreviewSource(
  input: Extract<ChatPreviewSource, { kind: "message-code-block" }>,
): Extract<ChatPreviewSource, { kind: "message-code-block" }> {
  return {
    kind: input.kind,
    tabId: input.tabId.trim(),
    language: input.language,
    code: input.code.replace(/\r\n/g, "\n"),
    infoString: input.infoString?.trim() || undefined,
  };
}

function normalizeWorkspaceFilePreviewSource(
  input: Extract<ChatPreviewSource, { kind: "workspace-file" }>,
): Extract<ChatPreviewSource, { kind: "workspace-file" }> {
  return {
    kind: input.kind,
    path: input.path.trim().replaceAll("\\", "/"),
    targetWorkspaceId: input.targetWorkspaceId?.trim() || undefined,
    requestId: input.requestId?.trim() || undefined,
  };
}

function normalizeFeishuDocPreviewSource(
  input: Extract<ChatPreviewSource, { kind: "feishu-doc" }>,
): Extract<ChatPreviewSource, { kind: "feishu-doc" }> {
  return {
    kind: input.kind,
    docId: input.docId.trim(),
    path: input.path.trim().replaceAll("\\", "/"),
    targetWorkspaceId: input.targetWorkspaceId?.trim() || undefined,
    requestId: input.requestId?.trim() || undefined,
  };
}

export function normalizeConversationAttachedTabRequest(
  input: ChatAttachedTabRequest,
): ChatAttachedTabRequest {
  const workspaceId = input.workspaceId?.trim() || undefined;

  if (input.source.kind === "message-code-block") {
    const source = normalizeMessageCodeBlockPreviewSource(input.source);
    return {
      kind: "preview",
      title: input.title.trim() || (source.language === "en-US" ? "Preview" : "预览"),
      workspaceId,
      source,
    };
  }

  if (input.source.kind === "workspace-file") {
    const source = normalizeWorkspaceFilePreviewSource(input.source);
    return {
      kind: "preview",
      title: input.title.trim() || source.path,
      workspaceId,
      source,
    };
  }

  const source = normalizeFeishuDocPreviewSource(input.source);
  return {
    kind: "preview",
    title: input.title.trim() || source.docId,
    workspaceId,
    source,
  };
}

export function resolveConversationAttachedTabKey(
  input: ChatAttachedTabRequest,
): string {
  const normalized = normalizeConversationAttachedTabRequest(input);

  if (normalized.source.kind === "message-code-block") {
    return `${CHAT_ATTACHED_TAB_PREFIX}code-preview:${normalized.source.tabId}`;
  }

  if (normalized.source.kind === "feishu-doc") {
    return [
      CHAT_ATTACHED_TAB_PREFIX,
      "feishu-doc",
      normalized.workspaceId ?? "global",
      normalized.source.targetWorkspaceId ?? "default",
      normalized.source.docId,
      normalized.source.path,
    ].join(":");
  }

  return [
    CHAT_ATTACHED_TAB_PREFIX,
    "workspace-file",
    normalized.workspaceId ?? "global",
    normalized.source.targetWorkspaceId ?? "default",
    normalized.source.path,
  ].join(":");
}

export function createConversationAttachedTabState(
  input: ChatAttachedTabRequest,
): ChatAttachedTabState {
  const normalized = normalizeConversationAttachedTabRequest(input);

  return {
    ...normalized,
    key: resolveConversationAttachedTabKey(normalized),
  };
}

export function upsertConversationAttachedTabs(
  current: ChatAttachedTabState[],
  nextItem: ChatAttachedTabState,
): ChatAttachedTabState[] {
  if (current.some((item) => item.key === nextItem.key)) {
    return current.map((item) => item.key === nextItem.key ? nextItem : item);
  }

  return [nextItem, ...current];
}