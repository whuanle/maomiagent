import type {
  ConversationCheckpointEntry,
  ConversationInteractionEntry,
  ConversationMessageEntry,
  ConversationRuntimeEvent,
  ConversationTimelineEntry,
  ConversationToolCallEntry,
} from "#maomiagent/kernel/src/host/application";
import type { PermissionInteractionRequest, RunBoundary, RunRecord } from "#maomiagent/kernel/core";

import type { DesktopModelRuntimeSelectionQuery } from "./desktop-models";
import type { DesktopTerminalShellKind } from "./desktop-terminals";

export const DESKTOP_CONVERSATION_ASSET_BASE_URL = "http://127.0.0.1:39091";

export type DesktopConversationSessionStatus = "idle" | "active" | "archived" | "failed";

export type DesktopConversationSessionItem = {
  sessionId: string;
  workspaceId: string;
  title: string;
  status: DesktopConversationSessionStatus;
  parentSessionId?: string;
  archivedAt?: string;
  lastRunId?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

export type DesktopConversationSessionListQuery = {
  workspaceId?: string;
  q?: string;
  status?: DesktopConversationSessionStatus | "all";
  limit?: number;
  offset?: number;
};

export type DesktopConversationSessionListResponse = {
  items: DesktopConversationSessionItem[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

export type DesktopConversationCreateSessionInput = {
  workspaceId: string;
  sessionId?: string;
  title?: string;
  selectedAgentId?: string;
  parentSessionId?: string;
  metadata?: Record<string, unknown>;
};

export type DesktopConversationCreateSessionResponse = {
  item: DesktopConversationSessionItem;
  created: boolean;
};

export type DesktopConversationRenameSessionInput = {
  sessionId: string;
  title: string;
};

export type DesktopConversationRenameSessionResponse = {
  item: DesktopConversationSessionItem;
};

export type DesktopConversationHideSessionResponse = {
  sessionId: string;
  hidden: boolean;
};

export type DesktopConversationApprovalMode = "auto" | "manual";

export type DesktopConversationPermissionRuleDecision = "approve_always" | "reject";

export type DesktopConversationPermissionRule = {
  scope: string;
  permission: string;
  decision: DesktopConversationPermissionRuleDecision;
  updatedAt?: number;
  note?: string;
  title?: string;
  resourceSummary?: string;
};

function normalizeDesktopConversationPermissionResource(
  resource: NonNullable<PermissionInteractionRequest["resources"]>[number],
) {
  return JSON.stringify({
    kind: resource.kind,
    path: resource.path ?? null,
    uri: resource.uri ?? null,
    command: resource.command ?? null,
    workspaceId: resource.workspaceId ?? null,
    worktreeId: resource.worktreeId ?? null,
    toolName: resource.toolName ?? null,
  });
}

export function buildDesktopConversationPermissionRuleScope(
  request: PermissionInteractionRequest,
) {
  return JSON.stringify({
    permission: request.permission,
    operationKind: request.operation?.kind ?? null,
    resources: (request.resources ?? []).map(normalizeDesktopConversationPermissionResource).sort(),
  });
}

export type DesktopConversationCapabilityPreferences = Record<string, boolean>;

export type DesktopConversationWorkspaceFilePreviewMode = "preview" | "source";

export const DESKTOP_CONVERSATION_CONTEXT_COMPRESSION_THRESHOLD_PERCENT_DEFAULT = 80;
export const DESKTOP_CONVERSATION_CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN = 50;
export const DESKTOP_CONVERSATION_CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX = 90;

export type DesktopConversationWorkspaceSettings = {
  approvalAutoEnabled: boolean;
  contextCompressionThresholdPercent: number;
  defaultFilePreviewMode: DesktopConversationWorkspaceFilePreviewMode;
  assistantAvatarDataUrl?: string;
  defaultTerminalShellKind?: DesktopTerminalShellKind;
  selectedChannelId?: string;
  selectedModelId?: string;
  userAvatarDataUrl?: string;
  thinkingEnabled: boolean;
  managedExecutionEnabled: boolean;
  permissionRules?: DesktopConversationPermissionRule[];
  memoryEnabled: boolean;
  sandboxEnabled: boolean;
  feishuSmartAssistantEnabled: boolean;
  capabilityPreferences: DesktopConversationCapabilityPreferences;
};

export function clampDesktopConversationContextCompressionThresholdPercent(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DESKTOP_CONVERSATION_CONTEXT_COMPRESSION_THRESHOLD_PERCENT_DEFAULT;
  }

  const normalized = Math.round(value / 5) * 5;
  if (normalized < DESKTOP_CONVERSATION_CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN) {
    return DESKTOP_CONVERSATION_CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN;
  }
  if (normalized > DESKTOP_CONVERSATION_CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX) {
    return DESKTOP_CONVERSATION_CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX;
  }
  return normalized;
}

export function createDefaultDesktopConversationWorkspaceSettings(): DesktopConversationWorkspaceSettings {
  return {
    approvalAutoEnabled: true,
    contextCompressionThresholdPercent: DESKTOP_CONVERSATION_CONTEXT_COMPRESSION_THRESHOLD_PERCENT_DEFAULT,
    defaultFilePreviewMode: "preview",
    thinkingEnabled: true,
    managedExecutionEnabled: false,
    memoryEnabled: true,
    sandboxEnabled: false,
    feishuSmartAssistantEnabled: false,
    capabilityPreferences: {
      "memory.runtime": true,
      "mcp.runtime": true,
      "skills.runtime": true,
      "feishu.smartAssistant": false,
    },
  };
}

export type DesktopConversationReadWorkspaceSettingsInput = {
  workspaceId: string;
};

export type DesktopConversationReadWorkspaceSettingsResponse = {
  workspaceId: string;
  version: 1;
  path: string;
  exists: boolean;
  updatedAt?: string;
  settings: DesktopConversationWorkspaceSettings;
  warnings: string[];
};

export type DesktopConversationSaveWorkspaceSettingsInput = {
  workspaceId: string;
  patch: Partial<DesktopConversationWorkspaceSettings>;
  syncExistingSessions?: boolean;
};

export type DesktopConversationSaveWorkspaceSettingsResponse = {
  workspaceId: string;
  version: 1;
  path: string;
  updatedAt: string;
  settings: DesktopConversationWorkspaceSettings;
  warnings: string[];
  syncedSessionCount: number;
};

export type DesktopConversationSessionSettings = {
  approvalMode?: DesktopConversationApprovalMode;
  permissionRules?: DesktopConversationPermissionRule[];
  contextCompressionThresholdPercent?: number;
  managedExecutionEnabled?: boolean;
  thinkingEnabled?: boolean;
  memoryEnabled?: boolean;
  sandboxEnabled?: boolean;
  feishuSmartAssistantEnabled?: boolean;
  capabilityPreferences?: DesktopConversationCapabilityPreferences;
};

export type DesktopConversationCapabilityScope = "workspace";

export type DesktopConversationToggleCapabilityDescriptor = {
  capabilityId: string;
  moduleId: string;
  scope: DesktopConversationCapabilityScope;
  controlKind: "toggle";
  title: string;
  description?: string;
  statusText?: string;
};

export type DesktopConversationActionCapabilityDescriptor = {
  capabilityId: string;
  moduleId: string;
  scope: DesktopConversationCapabilityScope;
  controlKind: "action";
  actionId: string;
  actionLabel: string;
  title: string;
  description?: string;
  statusText?: string;
};

export type DesktopConversationCapabilityDescriptor =
  | DesktopConversationToggleCapabilityDescriptor
  | DesktopConversationActionCapabilityDescriptor;

export type DesktopConversationCapabilityListQuery = {
  workspaceId: string;
  sessionId?: string;
};

export type DesktopConversationCapabilityListResponse = {
  items: DesktopConversationCapabilityDescriptor[];
  updatedAt: string;
};

export type DesktopConversationApplyWorkspaceSettingsInput = {
  workspaceId: string;
  settings: DesktopConversationSessionSettings;
};

export type DesktopConversationApplyWorkspaceSettingsResponse = {
  items: DesktopConversationSessionItem[];
  updatedCount: number;
  totalCount: number;
};

export type DesktopConversationRunItem = RunRecord & {
  boundary?: RunBoundary;
};

export type DesktopConversationTokenUsageSummary = {
  runId: string;
  modelId?: string;
  channelId?: string;
  turnCount: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  totalTokens: number;
};

export type DesktopConversationCompactionStatusSummary = {
  status: "running" | "completed" | "failed";
  reason?: "context_overflow" | "budget_exceeded" | "manual";
  attempt: number;
  startedAt: string;
  completedAt?: string;
  failedAt?: string;
  prunedMessageCount?: number;
  protectedMessageCount?: number;
  continuationKind?: string;
  errorMessage?: string;
};

export type DesktopConversationContextBudgetSummary = {
  runId: string;
  modelId?: string;
  channelId?: string;
  estimatedPromptTokens: number;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  compressionThresholdPercent?: number;
  compressionThresholdTokens?: number;
  promptUsagePercent?: number;
  thresholdUsagePercent?: number;
  shouldAutoCompress: boolean;
  breakdown: {
    systemTokens: number;
    contextTokens: number;
    messageTokens: number;
    toolTokens: number;
    outputSchemaTokens: number;
  };
  compaction?: DesktopConversationCompactionStatusSummary;
};

export type DesktopConversationSessionDetail = DesktopConversationSessionItem & {
  runs: DesktopConversationRunItem[];
  messages: ConversationMessageEntry[];
  toolCalls: ConversationToolCallEntry[];
  interactions: ConversationInteractionEntry[];
  pendingInteractions: ConversationInteractionEntry[];
  checkpoints: ConversationCheckpointEntry[];
  timeline: ConversationTimelineEntry[];
  latestTokenUsage?: DesktopConversationTokenUsageSummary;
  currentContextBudget?: DesktopConversationContextBudgetSummary;
};

export function resolveActiveConversationCheckpoint(input: {
  messages: readonly Pick<ConversationMessageEntry, "messageId">[];
  checkpoints: readonly ConversationCheckpointEntry[];
}) {
  const messageIds = new Set(input.messages.map((message) => message.messageId));

  return [...input.checkpoints]
    .sort((left, right) => left.createdAt - right.createdAt || left.checkpointId.localeCompare(right.checkpointId))
    .filter((checkpoint) =>
      messageIds.has(checkpoint.summaryMessageId)
      && messageIds.has(checkpoint.replacesThroughMessageId))
    .at(-1);
}

export function filterConversationMessagesForCheckpoint<TMessage extends { messageId: string }>(input: {
  messages: readonly TMessage[];
  checkpoint?: Pick<ConversationCheckpointEntry, "summaryMessageId" | "replacesThroughMessageId">;
}) {
  if (!input.checkpoint) {
    return [...input.messages];
  }

  const cutoffIndex = input.messages.findIndex((message) => message.messageId === input.checkpoint?.replacesThroughMessageId);
  if (cutoffIndex < 0) {
    return [...input.messages];
  }

  return input.messages.filter((message, index) =>
    message.messageId === input.checkpoint?.summaryMessageId
    || index > cutoffIndex);
}

export type DesktopConversationSessionDetailUpdateReason = "progress" | "final";

export type DesktopConversationSessionDetailUpdateEvent = {
  detail: DesktopConversationSessionDetail;
  reason: DesktopConversationSessionDetailUpdateReason;
};

export type DesktopConversationRuntimeEventsUpdateEvent = {
  sessionId: string;
  workspaceId?: string;
  events: ConversationRuntimeEvent[];
};

export type DesktopConversationAttachmentKind = "image" | "audio" | "video" | "file";

export type DesktopConversationAttachmentInput = {
  attachmentId: string;
  kind: DesktopConversationAttachmentKind;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  dataBase64: string;
};

export type DesktopConversationComposerMode = "agent" | "plan";

export type DesktopConversationSendMessageInput = DesktopModelRuntimeSelectionQuery & {
  sessionId: string;
  text?: string;
  attachments?: DesktopConversationAttachmentInput[];
  selectedAgentId?: string;
  composerMode?: DesktopConversationComposerMode;
  metadata?: Record<string, unknown>;
};

export type DesktopConversationSendMessageResponse = {
  detail: DesktopConversationSessionDetail;
};

export type DesktopConversationStopMessageInput = {
  sessionId: string;
};

export type DesktopConversationStopMessageResponse = {
  detail: DesktopConversationSessionDetail;
  stopped: boolean;
};

export type DesktopConversationAnswerInteractionInput = {
  sessionId?: string;
  interactionId: string;
  response: unknown;
};

export type DesktopConversationRejectInteractionInput = {
  sessionId?: string;
  interactionId: string;
  reason?: string;
};

export type DesktopConversationInteractionReplyResponse = {
  detail: DesktopConversationSessionDetail;
};
