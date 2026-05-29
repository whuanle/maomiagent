import type {
  ConversationRuntimeEvent,
  ConversationToolCallEntry,
} from "#maomiagent/kernel/src/host/application";

import {
  normalizePreviewPath,
  resolveRuntimeEventFingerprint,
  resolveToolCallFingerprint,
} from "../workspace-file/workspace-file-preview-refresh";

export function normalizeFeishuDocPreviewPaths(input: {
  path: string;
  fallbackPath?: string;
}) {
  return [...new Set([
    normalizePreviewPath(input.path),
    input.fallbackPath ? normalizePreviewPath(input.fallbackPath) : "",
  ].filter((value) => value.length > 0))];
}

export function resolveFeishuDocToolCallFingerprint(
  toolCalls: readonly ConversationToolCallEntry[],
  previewPaths: readonly string[],
) {
  return previewPaths
    .map((previewPath) => resolveToolCallFingerprint(toolCalls, previewPath))
    .filter((fingerprint) => fingerprint.length > 0)
    .join("|");
}

export function resolveFeishuDocRuntimeEventFingerprint(
  events: readonly ConversationRuntimeEvent[],
  previewPaths: readonly string[],
) {
  return previewPaths
    .map((previewPath) => resolveRuntimeEventFingerprint(events, previewPath))
    .filter((fingerprint) => fingerprint.length > 0)
    .join("|");
}
