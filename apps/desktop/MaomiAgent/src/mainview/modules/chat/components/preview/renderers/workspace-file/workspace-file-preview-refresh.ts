import type {
  ConversationRuntimeEvent,
  ConversationToolCallEntry,
} from "#maomiagent/kernel/src/host/application";

export function normalizePreviewPath(path: string) {
  return path
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .toLowerCase();
}

function isWriteLikeSuccessfulToolCall(toolCall: ConversationToolCallEntry) {
  if (toolCall.status !== "completed" || toolCall.error) {
    return false;
  }

  const operationKind = toolCall.operation.kind?.trim();
  if (operationKind === "file_write") {
    return true;
  }

  if (operationKind && operationKind !== "tool_execution") {
    return false;
  }

  return /(apply_patch|create_file|write|edit|update|patch|delete|remove)/i.test(toolCall.toolName);
}

export function toolCallTargetsPreviewPath(toolCall: ConversationToolCallEntry, previewPath: string) {
  if (!isWriteLikeSuccessfulToolCall(toolCall)) {
    return false;
  }

  return (toolCall.operation.targetPaths ?? []).some((targetPath) => {
    const normalizedTargetPath = normalizePreviewPath(targetPath);
    return normalizedTargetPath === previewPath
      || normalizedTargetPath.endsWith(`/${previewPath}`);
  });
}

export function resolveToolCallFingerprint(
  toolCalls: readonly ConversationToolCallEntry[],
  previewPath: string,
) {
  const latestToolCall = toolCalls.reduce<ConversationToolCallEntry | null>((latest, toolCall) => {
    if (!toolCallTargetsPreviewPath(toolCall, previewPath)) {
      return latest;
    }

    if (!latest || toolCall.updatedAt > latest.updatedAt) {
      return toolCall;
    }

    return latest;
  }, null);

  return latestToolCall ? `${latestToolCall.callId}:${latestToolCall.updatedAt}` : "";
}

export function resolveRuntimeEventFingerprint(
  events: readonly ConversationRuntimeEvent[],
  previewPath: string,
) {
  const toolCalls = events
    .filter((event): event is Extract<ConversationRuntimeEvent, { type: "tool-call.updated" }> =>
      event.type === "tool-call.updated")
    .map((event) => event.toolCall);

  return resolveToolCallFingerprint(toolCalls, previewPath);
}
