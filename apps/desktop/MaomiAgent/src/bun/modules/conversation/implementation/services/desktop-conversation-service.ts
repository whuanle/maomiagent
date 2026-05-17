import { randomUUID } from "node:crypto";

import type { RegisteredToolHandler } from "#maomiagent/kernel/src/adapters";
import type { ToolSource } from "#maomiagent/kernel/src/host/tools";

import type { RuntimeLogger } from "../../../logs";
import {
  DesktopAiConversationRuntime,
  type DesktopAiConversationRuntimeCreateInput,
  type DesktopAiConversationRuntimeFactoryPort,
  type DesktopAiConversationRuntimePort,
  type DesktopAiExecutionProfileMaterializerPort,
  type DesktopAiRuntimePort,
} from "../../../ai";
import type {
  DesktopConversationApplyWorkspaceSettingsInput,
  DesktopConversationApplyWorkspaceSettingsResponse,
  DesktopConversationApprovalMode,
  DesktopConversationPermissionRule,
  DesktopConversationPermissionRuleDecision,
  DesktopConversationAttachmentInput,
  DesktopConversationAnswerInteractionInput,
  DesktopConversationCapabilityListQuery,
  DesktopConversationCapabilityListResponse,
  DesktopConversationCapabilityPreferences,
  DesktopConversationCreateSessionInput,
  DesktopConversationCreateSessionResponse,
  DesktopConversationHideSessionResponse,
  DesktopConversationInteractionReplyResponse,
  DesktopConversationRejectInteractionInput,
  DesktopConversationRuntimeEventsUpdateEvent,
  DesktopConversationSendMessageInput,
  DesktopConversationSendMessageResponse,
  DesktopConversationStopMessageInput,
  DesktopConversationStopMessageResponse,
  DesktopConversationSessionDetail,
  DesktopConversationSessionDetailUpdateEvent,
  DesktopConversationPort,
  DesktopConversationSessionItem,
  DesktopConversationSessionListQuery,
  DesktopConversationSessionListResponse,
  DesktopConversationSessionSettings,
} from "../../index";
import { calculateRetryDelayMs } from "../../../ai/kernel-bridge";
import type { DesktopAgentsQueryPort } from "../../../agents";
import type {
  DesktopConversationCapabilityProvider,
  DesktopConversationCapabilityRegistryPort,
} from "../../abstraction/ports/desktop-conversation-capabilities.ports";
import type { DesktopConversationTaskBridgePort, DesktopTasksQueryPort } from "../../../tasks";
import type { DesktopConversationStore } from "../stores/desktop-conversation-store";
import {
  DEFAULT_DESKTOP_PRIMARY_AGENT_ID,
  resolveDesktopConversationExecutionStrategy,
} from "../../../../../shared/conversation/managed-execution";
import type {
  DesktopTaskExecutionMode,
  DesktopTaskRunMode,
} from "../../../../../shared/desktop-tasks";

const SESSION_ID_RE = /^[a-z0-9][a-z0-9._-]{1,95}$/;
const SESSION_TITLE_MAX_LENGTH = 160;
const SESSION_DETAIL_POLL_INTERVAL_MS = 150;
const CONVERSATION_SETTINGS_KEY = "conversationSettings";
const INTERACTION_GOVERNANCE_KEY = "interactionGovernance";
const CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN = 50;
const CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX = 90;
const MANAGED_EXECUTION_STAGE_INTAKE_LOCKED = "intake_locked";
const MANAGED_EXECUTION_STAGE_READY = "ready";
const MANAGED_EXECUTION_STAGE_RUNNING = "running";
const MANAGED_AUTORETRY_POLICY = {
  maxAttempts: 2,
  baseDelayMs: 50,
  maxDelayMs: 200,
  jitterRatio: 0,
} as const;

type DesktopConversationSessionDetailPublisher = (
  update: DesktopConversationSessionDetailUpdateEvent,
) => void | Promise<void>;

type DesktopConversationRuntimeEventsPublisher = (
  update: DesktopConversationRuntimeEventsUpdateEvent,
) => void | Promise<void>;

type DesktopConversationServiceOptions = {
  conversationDbPath?: string;
  conversationRuntimeFactory?: Pick<DesktopAiConversationRuntimeFactoryPort, "createConversationRuntime">;
  agents?: Pick<DesktopAgentsQueryPort, "list">;
  aiRuntime?: Pick<DesktopAiRuntimePort, "createTurnPort">;
  materializer?: Pick<DesktopAiExecutionProfileMaterializerPort, "materialize">;
  taskBridge?: Pick<
    DesktopConversationTaskBridgePort,
    "completeConversationTask"
    | "ensureConversationTaskRunning"
    | "failConversationTask"
    | "syncManagedConversationRootTask"
    | "markConversationTaskBlocked"
  >;
  tasksQuery?: Pick<DesktopTasksQueryPort, "get">;
  capabilityRegistry?: Pick<DesktopConversationCapabilityRegistryPort, "listCapabilities">;
  capabilityProviders?: readonly DesktopConversationCapabilityProvider[];
  turnNoActivityTimeoutMs?: number;
  toolSources?: ToolSource[];
  toolHandlers?: RegisteredToolHandler[];
  sessionDetailPublisher?: DesktopConversationSessionDetailPublisher;
  runtimeEventsPublisher?: DesktopConversationRuntimeEventsPublisher;
};

type PendingConversationTaskSeed = {
  workspaceId: string;
  promptText?: string;
  attachmentCount?: number;
  rootTaskId?: string;
  selectedAgentId?: string;
  executionMode: DesktopTaskExecutionMode;
  runMode: DesktopTaskRunMode;
  selectedChannelId?: string;
  selectedModelId?: string;
  sessionTitle?: string;
  taskMetadata?: Record<string, unknown>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function paginate<TItem>(items: TItem[], limit = 100, offset = 0) {
  const boundedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), 500) : 100;
  const boundedOffset = Number.isFinite(offset) && offset >= 0 ? Math.trunc(offset) : 0;
  const paged = items.slice(boundedOffset, boundedOffset + boundedLimit);

  return {
    items: paged,
    total: items.length,
    limit: boundedLimit,
    offset: boundedOffset,
    hasMore: boundedOffset + boundedLimit < items.length,
  };
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeBooleanFlag(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeApprovalMode(value: unknown): DesktopConversationApprovalMode | undefined {
  return value === "auto" || value === "manual" ? value : undefined;
}

function normalizePermissionRuleDecision(value: unknown): DesktopConversationPermissionRuleDecision | undefined {
  return value === "approve_always" || value === "reject" ? value : undefined;
}

function normalizeContextCompressionThresholdPercent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const rounded = Math.round(value / 5) * 5;
  if (rounded < CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN) {
    return CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN;
  }
  if (rounded > CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX) {
    return CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX;
  }
  return rounded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeCapabilityPreferences(
  value: unknown,
): DesktopConversationCapabilityPreferences | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const normalizedEntries = Object.entries(value).flatMap(([key, entryValue]) => {
    const capabilityId = normalizeOptionalText(key);
    const enabled = normalizeBooleanFlag(entryValue);
    if (!capabilityId || enabled === undefined) {
      return [];
    }

    return [[capabilityId, enabled] as const];
  });

  if (normalizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(normalizedEntries);
}

function normalizePermissionRule(
  value: unknown,
): DesktopConversationPermissionRule | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const permission = normalizeOptionalText(value.permission);
  const scope = normalizeOptionalText(value.scope);
  const decision = normalizePermissionRuleDecision(value.decision);
  if (!permission || !scope || !decision) {
    return undefined;
  }

  const note = normalizeOptionalText(value.note);
  const title = normalizeOptionalText(value.title);
  const resourceSummary = normalizeOptionalText(value.resourceSummary);

  return {
    permission,
    scope,
    decision,
    ...(typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
      ? { updatedAt: Math.trunc(value.updatedAt) }
      : {}),
    ...(note ? { note } : {}),
    ...(title ? { title } : {}),
    ...(resourceSummary ? { resourceSummary } : {}),
  };
}

function normalizePermissionRules(
  value: unknown,
): DesktopConversationPermissionRule[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((entry) => {
    const normalized = normalizePermissionRule(entry);
    return normalized ? [normalized] : [];
  });
}

function hasCapabilityPreferenceDelta(
  current: DesktopConversationCapabilityPreferences | undefined,
  patch: DesktopConversationCapabilityPreferences | undefined,
): boolean {
  if (!patch) {
    return false;
  }

  return Object.entries(patch).some(([capabilityId, enabled]) => current?.[capabilityId] !== enabled);
}

function hasPermissionRulesDelta(
  current: DesktopConversationPermissionRule[] | undefined,
  patch: DesktopConversationPermissionRule[] | undefined,
): boolean {
  if (patch === undefined) {
    return false;
  }

  return JSON.stringify(current ?? []) !== JSON.stringify(patch);
}

function normalizeConversationSessionSettings(
  value?: Partial<DesktopConversationSessionSettings> | null,
): DesktopConversationSessionSettings {
  const normalized: DesktopConversationSessionSettings = {};

  const approvalMode = normalizeApprovalMode(value?.approvalMode);
  if (approvalMode) {
    normalized.approvalMode = approvalMode;
  }

  const permissionRules = normalizePermissionRules(value?.permissionRules);
  if (permissionRules !== undefined) {
    normalized.permissionRules = permissionRules;
  }

  const contextCompressionThresholdPercent = normalizeContextCompressionThresholdPercent(
    value?.contextCompressionThresholdPercent,
  );
  if (typeof contextCompressionThresholdPercent === "number") {
    normalized.contextCompressionThresholdPercent = contextCompressionThresholdPercent;
  }

  const managedExecutionEnabled = normalizeBooleanFlag(value?.managedExecutionEnabled);
  if (managedExecutionEnabled !== undefined) {
    normalized.managedExecutionEnabled = managedExecutionEnabled;
  }

  const memoryEnabled = normalizeBooleanFlag(value?.memoryEnabled);
  if (memoryEnabled !== undefined) {
    normalized.memoryEnabled = memoryEnabled;
  }

  const sandboxEnabled = normalizeBooleanFlag(value?.sandboxEnabled);
  if (sandboxEnabled !== undefined) {
    normalized.sandboxEnabled = sandboxEnabled;
  }

  const feishuSmartAssistantEnabled = normalizeBooleanFlag(value?.feishuSmartAssistantEnabled);
  if (feishuSmartAssistantEnabled !== undefined) {
    normalized.feishuSmartAssistantEnabled = feishuSmartAssistantEnabled;
  }

  const capabilityPreferences = normalizeCapabilityPreferences(value?.capabilityPreferences);
  if (capabilityPreferences) {
    normalized.capabilityPreferences = capabilityPreferences;
  }

  return normalized;
}

function readConversationSessionSettings(
  metadata: Record<string, unknown> | undefined,
): DesktopConversationSessionSettings {
  const interactionGovernance = isRecord(metadata?.[INTERACTION_GOVERNANCE_KEY])
    ? metadata[INTERACTION_GOVERNANCE_KEY] as Record<string, unknown>
    : undefined;
  const conversationSettings = isRecord(metadata?.[CONVERSATION_SETTINGS_KEY])
    ? metadata[CONVERSATION_SETTINGS_KEY] as Record<string, unknown>
    : undefined;

  return normalizeConversationSessionSettings({
    approvalMode: normalizeApprovalMode(interactionGovernance?.approvalMode),
    permissionRules: normalizePermissionRules(interactionGovernance?.permissionRules),
    contextCompressionThresholdPercent: normalizeContextCompressionThresholdPercent(
      conversationSettings?.contextCompressionThresholdPercent,
    ),
    managedExecutionEnabled: normalizeBooleanFlag(conversationSettings?.managedExecutionEnabled),
    memoryEnabled: normalizeBooleanFlag(conversationSettings?.memoryEnabled),
    sandboxEnabled: normalizeBooleanFlag(conversationSettings?.sandboxEnabled),
    feishuSmartAssistantEnabled: normalizeBooleanFlag(conversationSettings?.feishuSmartAssistantEnabled),
    capabilityPreferences: normalizeCapabilityPreferences(conversationSettings?.capabilityPreferences),
  });
}

function hasConversationSessionSettingsChange(
  metadata: Record<string, unknown> | undefined,
  settings: DesktopConversationSessionSettings,
): boolean {
  const current = readConversationSessionSettings(metadata);

  return (
    (settings.approvalMode !== undefined && current.approvalMode !== settings.approvalMode)
    || hasPermissionRulesDelta(current.permissionRules, settings.permissionRules)
    || (
      settings.contextCompressionThresholdPercent !== undefined
      && current.contextCompressionThresholdPercent !== settings.contextCompressionThresholdPercent
    )
    || (
      settings.managedExecutionEnabled !== undefined
      && current.managedExecutionEnabled !== settings.managedExecutionEnabled
    )
    || (settings.memoryEnabled !== undefined && current.memoryEnabled !== settings.memoryEnabled)
    || (settings.sandboxEnabled !== undefined && current.sandboxEnabled !== settings.sandboxEnabled)
    || (
      settings.feishuSmartAssistantEnabled !== undefined
      && current.feishuSmartAssistantEnabled !== settings.feishuSmartAssistantEnabled
    )
    || hasCapabilityPreferenceDelta(current.capabilityPreferences, settings.capabilityPreferences)
  );
}

function applyConversationSessionSettings(
  item: DesktopConversationSessionItem,
  settings: DesktopConversationSessionSettings,
): DesktopConversationSessionItem | null {
  if (!hasConversationSessionSettingsChange(item.metadata, settings)) {
    return null;
  }

  const currentMetadata = isRecord(item.metadata) ? item.metadata : undefined;
  const currentInteractionGovernance = isRecord(currentMetadata?.[INTERACTION_GOVERNANCE_KEY])
    ? currentMetadata[INTERACTION_GOVERNANCE_KEY] as Record<string, unknown>
    : undefined;
  const currentConversationSettings = isRecord(currentMetadata?.[CONVERSATION_SETTINGS_KEY])
    ? currentMetadata[CONVERSATION_SETTINGS_KEY] as Record<string, unknown>
    : undefined;
  const currentPermissionRules = normalizePermissionRules(currentInteractionGovernance?.permissionRules);
  const currentCapabilityPreferences = normalizeCapabilityPreferences(
    currentConversationSettings?.capabilityPreferences,
  );

  const interactionGovernancePatch: Record<string, unknown> = {
    ...(settings.approvalMode !== undefined
      ? { approvalMode: settings.approvalMode }
      : {}),
    ...(settings.permissionRules !== undefined
      ? {
          permissionRules: settings.permissionRules.map((rule) => ({
            ...rule,
            updatedAt: typeof rule.updatedAt === "number" && Number.isFinite(rule.updatedAt)
              ? Math.trunc(rule.updatedAt)
              : Date.now(),
          })),
        }
      : {}),
  };

  const nextInteractionGovernance = Object.keys(interactionGovernancePatch).length > 0
    ? mergeMetadata(currentInteractionGovernance, {
        ...(currentPermissionRules !== undefined && settings.permissionRules === undefined
          ? { permissionRules: currentPermissionRules }
          : {}),
        ...interactionGovernancePatch,
      })
    : currentInteractionGovernance;

  const conversationSettingsPatch: Record<string, unknown> = {
    ...(settings.contextCompressionThresholdPercent !== undefined
      ? { contextCompressionThresholdPercent: settings.contextCompressionThresholdPercent }
      : {}),
    ...(settings.managedExecutionEnabled !== undefined
      ? { managedExecutionEnabled: settings.managedExecutionEnabled }
      : {}),
    ...(settings.memoryEnabled !== undefined
      ? { memoryEnabled: settings.memoryEnabled }
      : {}),
    ...(settings.sandboxEnabled !== undefined
      ? { sandboxEnabled: settings.sandboxEnabled }
      : {}),
    ...(settings.feishuSmartAssistantEnabled !== undefined
      ? { feishuSmartAssistantEnabled: settings.feishuSmartAssistantEnabled }
      : {}),
    ...(settings.capabilityPreferences !== undefined
      ? {
          capabilityPreferences: mergeMetadata(
            currentCapabilityPreferences,
            settings.capabilityPreferences,
          ),
        }
      : {}),
  };

  const nextConversationSettings = Object.keys(conversationSettingsPatch).length > 0
    ? mergeMetadata(currentConversationSettings, conversationSettingsPatch)
    : currentConversationSettings;

  const nextMetadata = mergeMetadata(currentMetadata, {
    ...(Object.keys(interactionGovernancePatch).length > 0
      ? { [INTERACTION_GOVERNANCE_KEY]: nextInteractionGovernance }
      : {}),
    ...(Object.keys(conversationSettingsPatch).length > 0
      ? { [CONVERSATION_SETTINGS_KEY]: nextConversationSettings }
      : {}),
  });

  return {
    ...item,
    updatedAt: nowIso(),
    metadata: nextMetadata,
  };
}

function mergeMetadata(
  current: Record<string, unknown> | undefined,
  patch: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!current && !patch) {
    return undefined;
  }

  const next: Record<string, unknown> = {
    ...(current ?? {}),
  };

  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value === undefined) {
      delete next[key];
      continue;
    }

    next[key] = value;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function buildManagedConversationRootTaskId(sessionId: string) {
  return `managed-root-${sessionId}`;
}

function readLinkedRootTaskId(metadata: Record<string, unknown> | undefined) {
  return normalizeOptionalText(metadata?.linkedRootTaskId)
    ?? normalizeOptionalText(metadata?.rootTaskId);
}

function readManagedExecutionStage(metadata: Record<string, unknown> | undefined) {
  return normalizeOptionalText(metadata?.managedExecutionStage);
}

function readRetryAfterMs(metadata: Record<string, unknown> | undefined) {
  const value = metadata?.retryAfterMs;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined;
}

function readCompletedPlanExitComposerMode(
  toolCalls: DesktopConversationSessionDetail["toolCalls"],
  runId?: string,
) {
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const toolCall = toolCalls[index];
    if (!toolCall || toolCall.toolName !== "plan_exit" || toolCall.status !== "completed") {
      continue;
    }

    if (runId && toolCall.runId !== runId) {
      continue;
    }

    const output = isRecord(toolCall.output) ? toolCall.output : undefined;
    const composerMode = normalizeOptionalText(output?.composerMode);
    if (composerMode === "agent" || composerMode === "plan") {
      return composerMode;
    }
  }

  return undefined;
}

function isManagedConversationRun(seed: PendingConversationTaskSeed | undefined) {
  return seed?.runMode === "hosted_autopilot"
    || seed?.runMode === "long_task_orchestration"
    || seed?.taskMetadata?.managedExecution === true;
}

function buildManagedConversationRunTaskMetadata(input: {
  seed: PendingConversationTaskSeed;
  rootTaskId: string;
  phase: string;
  managedExecutionStage: string;
  extraMetadata?: Record<string, unknown>;
}) {
  return {
    ...(input.seed.taskMetadata ? { ...input.seed.taskMetadata } : {}),
    rootTask: undefined,
    rootTaskId: input.rootTaskId,
    phase: input.phase,
    managedExecutionStage: input.managedExecutionStage,
    ...(input.extraMetadata ? { ...input.extraMetadata } : {}),
  } satisfies Record<string, unknown>;
}

function buildManagedConversationRootTaskMetadata(input: {
  seed: PendingConversationTaskSeed;
  rootTaskId: string;
  phase: string;
  managedExecutionStage: string;
  extraMetadata?: Record<string, unknown>;
}) {
  return {
    ...(input.seed.taskMetadata ? { ...input.seed.taskMetadata } : {}),
    rootTask: true,
    rootTaskId: input.rootTaskId,
    phase: input.phase,
    managedExecutionStage: input.managedExecutionStage,
    ...(input.extraMetadata ? { ...input.extraMetadata } : {}),
  } satisfies Record<string, unknown>;
}

function normalizeAttachmentSize(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.max(0, Math.trunc(value))
    : undefined;
}

function normalizeAttachmentKind(value: unknown): DesktopConversationAttachmentInput["kind"] {
  if (value === "image" || value === "audio" || value === "video" || value === "file") {
    return value;
  }

  return "file";
}

function normalizeMessageAttachment(
  value: unknown,
  index: number,
): DesktopConversationAttachmentInput {
  if (!isRecord(value)) {
    throw new Error(`message attachment must be an object at index ${index}`);
  }

  const fileName = normalizeOptionalText(value.fileName);
  const dataBase64 = normalizeOptionalText(value.dataBase64);
  if (!fileName || !dataBase64) {
    throw new Error(`message attachment is missing file data at index ${index}`);
  }

  return {
    attachmentId: normalizeOptionalText(value.attachmentId) ?? `attachment-${index + 1}`,
    kind: normalizeAttachmentKind(value.kind),
    fileName,
    dataBase64,
    ...(normalizeOptionalText(value.mimeType) ? { mimeType: normalizeOptionalText(value.mimeType) } : {}),
    ...(typeof normalizeAttachmentSize(value.sizeBytes) === "number"
      ? { sizeBytes: normalizeAttachmentSize(value.sizeBytes) }
      : {}),
  };
}

function normalizeMessageAttachments(value: unknown): DesktopConversationAttachmentInput[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("attachments must be an array when provided");
  }

  return value.map((item, index) => normalizeMessageAttachment(item, index));
}

function normalizeRequiredWorkspaceId(input: unknown): string {
  const normalized = normalizeOptionalText(input);
  if (!normalized) {
    throw new Error("workspaceId is required");
  }

  return normalized;
}

function normalizeSessionId(input: unknown): string {
  const normalized = normalizeOptionalText(input)?.toLowerCase();
  if (!normalized) {
    throw new Error("sessionId is required");
  }

  if (!SESSION_ID_RE.test(normalized)) {
    throw new Error("invalid sessionId format");
  }

  return normalized;
}

function normalizeOptionalSessionId(input: unknown): string | undefined {
  const normalized = normalizeOptionalText(input);
  return normalized ? normalizeSessionId(normalized) : undefined;
}

function buildSessionId(): string {
  return normalizeSessionId(`session-${randomUUID().replaceAll("-", "").slice(0, 24)}`);
}

function normalizeTitle(input: unknown): string | undefined {
  const normalized = normalizeOptionalText(input);
  if (!normalized) {
    return undefined;
  }

  return normalized.slice(0, SESSION_TITLE_MAX_LENGTH);
}

function withSelectedAgentId(
  metadata: Record<string, unknown> | undefined,
  selectedAgentId: string | undefined,
): Record<string, unknown> | undefined {
  const nextMetadata = metadata ? { ...metadata } : {};

  if (!selectedAgentId) {
    delete nextMetadata.selectedAgentId;
    return Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined;
  }

  return {
    ...nextMetadata,
    selectedAgentId,
  };
}

function matchesQuery(item: DesktopConversationSessionItem, queryText: string): boolean {
  if (!queryText) {
    return true;
  }

  return [
    item.sessionId,
    item.workspaceId,
    item.title,
    item.status,
  ].join(" ").toLowerCase().includes(queryText);
}

export class DesktopConversationService implements DesktopConversationPort {
  private mutationQueue: Promise<void> = Promise.resolve();
  private conversationRuntime: DesktopAiConversationRuntimePort | null = null;
  private readonly pendingConversationTaskSeeds = new Map<string, PendingConversationTaskSeed>();
  private readonly sessionMetadataOverlays = new Map<string, Record<string, unknown>>();
  private sessionDetailPublisher: DesktopConversationSessionDetailPublisher | undefined;
  private runtimeEventsPublisher: DesktopConversationRuntimeEventsPublisher | undefined;

  constructor(
    private readonly store: DesktopConversationStore,
    private readonly logger: RuntimeLogger,
    private readonly options: DesktopConversationServiceOptions = {},
  ) {
    this.sessionDetailPublisher = options.sessionDetailPublisher;
    this.runtimeEventsPublisher = options.runtimeEventsPublisher;
  }

  setSessionDetailPublisher(publisher?: DesktopConversationSessionDetailPublisher) {
    this.sessionDetailPublisher = publisher;
  }

  setRuntimeEventsPublisher(publisher?: DesktopConversationRuntimeEventsPublisher) {
    this.runtimeEventsPublisher = publisher;
  }

  async publishRuntimeEventsUpdate(update: DesktopConversationRuntimeEventsUpdateEvent) {
    await this.syncConversationTaskFromRuntimeEvents(update);

    if (!this.runtimeEventsPublisher) {
      return;
    }

    try {
      await this.runtimeEventsPublisher(update);
    } catch {
      // Ignore bridge publish failures so conversation mutations remain authoritative.
    }
  }

  async listSessions(
    input: DesktopConversationSessionListQuery = {},
  ): Promise<DesktopConversationSessionListResponse> {
    const queryText = normalizeOptionalText(input.q)?.toLowerCase() ?? "";
    const statusFilter = input.status && input.status !== "all"
      ? input.status
      : undefined;
    const workspaceId = normalizeOptionalText(input.workspaceId);

    const filtered = this.store.listSessions().filter((item) => {
      if (workspaceId && item.workspaceId !== workspaceId) {
        return false;
      }

      if (statusFilter && item.status !== statusFilter) {
        return false;
      }

      return matchesQuery(item, queryText);
    });

    const sorted = filtered.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
      || right.createdAt.localeCompare(left.createdAt)
      || left.sessionId.localeCompare(right.sessionId, "en", { sensitivity: "base" }),
    );
    const { items, ...meta } = paginate(sorted, input.limit, input.offset);

    return {
      items,
      meta,
    };
  }

  async getSession(sessionId: string): Promise<DesktopConversationSessionItem | null> {
    return this.store.getSession(normalizeSessionId(sessionId));
  }

  async getSessionDetail(sessionId: string): Promise<DesktopConversationSessionDetail | null> {
    const item = this.store.getSession(normalizeSessionId(sessionId));
    if (!item) {
      return null;
    }

    return this.loadSessionDetail(item);
  }

  async listCapabilities(
    input: DesktopConversationCapabilityListQuery,
  ): Promise<DesktopConversationCapabilityListResponse> {
    const workspaceId = normalizeRequiredWorkspaceId(input.workspaceId);
    const sessionId = normalizeOptionalSessionId(input.sessionId);

    if (!this.options.capabilityRegistry) {
      return {
        items: [],
        updatedAt: nowIso(),
      };
    }

    return this.options.capabilityRegistry.listCapabilities({
      workspaceId,
      ...(sessionId ? { sessionId } : {}),
    });
  }

  async createSession(
    input: DesktopConversationCreateSessionInput,
  ): Promise<DesktopConversationCreateSessionResponse> {
    return this.runMutation(async () => {
      const workspaceId = normalizeRequiredWorkspaceId(input.workspaceId);
      const sessionId = input.sessionId ? normalizeSessionId(input.sessionId) : buildSessionId();
      const existing = this.store.getSession(sessionId);
      if (existing) {
        return {
          item: existing,
          created: false,
        };
      }

      const now = nowIso();
      const selectedAgentId = normalizeOptionalText(input.selectedAgentId) ?? DEFAULT_DESKTOP_PRIMARY_AGENT_ID;
      const item: DesktopConversationSessionItem = {
        sessionId,
        workspaceId,
        title: normalizeTitle(input.title) ?? "New conversation",
        status: "idle",
        parentSessionId: normalizeOptionalText(input.parentSessionId),
        metadata: withSelectedAgentId(input.metadata, selectedAgentId),
        createdAt: now,
        updatedAt: now,
      };

      this.store.upsertSession(item);
      await this.logger.info("Desktop conversation session created", {
        context: {
          sessionId,
          workspaceId,
        },
      });

      return {
        item,
        created: true,
      };
    });
  }

  async hideSession(sessionId: string): Promise<DesktopConversationHideSessionResponse> {
    const normalizedSessionId = normalizeSessionId(sessionId);

    return this.runMutation(async () => {
      const current = this.store.getSession(normalizedSessionId);
      if (!current) {
        return {
          sessionId: normalizedSessionId,
          hidden: false,
        };
      }

      const archivedAt = nowIso();
      this.store.upsertSession({
        ...current,
        status: "archived",
        archivedAt,
        updatedAt: archivedAt,
      });
      await this.conversationRuntime?.archiveSession({
        ...current,
        status: "archived",
        archivedAt,
        updatedAt: archivedAt,
      });

      await this.logger.warn("Desktop conversation session archived", {
        context: {
          sessionId: normalizedSessionId,
          workspaceId: current.workspaceId,
        },
      });

      return {
        sessionId: normalizedSessionId,
        hidden: true,
      };
    });
  }

  async applyWorkspaceSettings(
    input: DesktopConversationApplyWorkspaceSettingsInput,
  ): Promise<DesktopConversationApplyWorkspaceSettingsResponse> {
    return this.runMutation(async () => {
      const workspaceId = normalizeRequiredWorkspaceId(input.workspaceId);
      const settings = normalizeConversationSessionSettings(input.settings);
      const workspaceItems = this.store.listSessions().filter((item) => item.workspaceId === workspaceId);
      const updatedItems = workspaceItems.flatMap((item) => {
        const updated = applyConversationSessionSettings(item, settings);
        if (!updated) {
          return [];
        }

        this.store.upsertSession(updated);
        return [updated];
      });

      await this.logger.info("Desktop conversation workspace settings applied", {
        context: {
          workspaceId,
          updatedCount: updatedItems.length,
          totalCount: workspaceItems.length,
          settings,
        },
      });

      return {
        items: updatedItems,
        updatedCount: updatedItems.length,
        totalCount: workspaceItems.length,
      };
    });
  }

  async sendMessage(
    input: DesktopConversationSendMessageInput,
  ): Promise<DesktopConversationSendMessageResponse> {
    return this.runMutation(async () => {
      const sessionId = normalizeSessionId(input.sessionId);
      const current = this.store.getSession(sessionId);
      if (!current) {
        throw new Error(`desktop conversation session not found: ${sessionId}`);
      }

      const text = normalizeOptionalText(input.text);
      const attachments = normalizeMessageAttachments(input.attachments);
      if (!text && attachments.length === 0) {
        throw new Error("message text or attachment is required");
      }

      const selection = readSelectionMetadata(current.metadata);
      const requestedSelectedChannelId = normalizeOptionalText(input.selectedChannelId) ?? selection.selectedChannelId;
      const requestedSelectedModelId = normalizeOptionalText(input.selectedModelId) ?? selection.selectedModelId;
      const requestedSelectedAgentId = normalizeOptionalText(input.selectedAgentId);
      const executionStrategy = resolveDesktopConversationExecutionStrategy({
        text,
        attachmentCount: attachments.length,
        selectedAgentId: requestedSelectedAgentId,
        composerMode: input.composerMode,
        metadata: current.metadata,
      });
      const effectiveSelectedAgentId = executionStrategy.selectedAgentId
        ?? requestedSelectedAgentId
        ?? selection.selectedAgentId;
      const managedRootTaskId = executionStrategy.taskMetadata?.managedExecution === true
        ? readLinkedRootTaskId(current.metadata) ?? buildManagedConversationRootTaskId(sessionId)
        : undefined;
      const sessionMetadata = mergeMetadata(
        executionStrategy.taskMetadata?.managedExecution === true
          ? mergeMetadata(executionStrategy.sessionMetadata, {
              linkedRootTaskId: managedRootTaskId,
              managedExecutionStage: readManagedExecutionStage(current.metadata) ?? MANAGED_EXECUTION_STAGE_INTAKE_LOCKED,
            })
          : executionStrategy.sessionMetadata,
        input.composerMode ? { composerMode: input.composerMode } : undefined,
      );
      const preflightSummary = this.activateSessionForSend(
        current,
        requestedSelectedChannelId,
        requestedSelectedModelId,
        effectiveSelectedAgentId,
        sessionMetadata,
      );
      const pendingTaskSeed: PendingConversationTaskSeed = {
        workspaceId: preflightSummary.workspaceId,
        promptText: text,
        attachmentCount: attachments.length,
        rootTaskId: managedRootTaskId,
        selectedAgentId: effectiveSelectedAgentId,
        executionMode: executionStrategy.executionMode,
        runMode: executionStrategy.runMode,
        selectedChannelId: requestedSelectedChannelId,
        selectedModelId: requestedSelectedModelId,
        sessionTitle: preflightSummary.title,
        taskMetadata: executionStrategy.taskMetadata,
      };
      this.pendingConversationTaskSeeds.set(sessionId, pendingTaskSeed);
      const detailUpdates = await this.startSessionDetailUpdates(sessionId, preflightSummary);
      await this.publishInitialProgressDetail(preflightSummary);

      try {
        const runMetadata = mergeMetadata(executionStrategy.runMetadata, {
          ...(input.composerMode ? { composerMode: input.composerMode } : {}),
        });
        const output = await this.requireConversationRuntime().startUserTurn({
          item: preflightSummary,
          ...(text ? { text } : {}),
          ...(attachments.length > 0 ? { attachments } : {}),
          ...(input.scope ? { scope: input.scope } : {}),
          workspaceId: normalizeOptionalText(input.workspaceId) ?? current.workspaceId,
          ...(requestedSelectedChannelId ? { selectedChannelId: requestedSelectedChannelId } : {}),
          ...(requestedSelectedModelId ? { selectedModelId: requestedSelectedModelId } : {}),
          ...(effectiveSelectedAgentId ? { selectedAgentId: effectiveSelectedAgentId } : {}),
          ...(runMetadata ? { metadata: runMetadata } : {}),
        });
        const synced = await this.syncSessionSummaryFromKernel(preflightSummary, output.run.id);
        const retryResult = await this.retryManagedConversationIfNeeded({
          item: synced,
          output,
          scope: input.scope,
          seed: pendingTaskSeed,
        });
        const resolvedSelection = readSelectionMetadata(retryResult.item.metadata);

        if (await this.logFailedConversationDetail("message", retryResult.detail)) {
          await detailUpdates?.flush(retryResult.detail);

          return {
            detail: retryResult.detail,
          };
        }

        await this.logger.info("Desktop conversation message sent", {
          workspaceId: retryResult.item.workspaceId,
          runId: retryResult.detail.runs[0]?.id ?? output.run.id,
          context: {
            sessionId,
            workspaceId: retryResult.item.workspaceId,
            runId: retryResult.detail.runs[0]?.id ?? output.run.id,
            modelId: resolvedSelection.selectedModelId,
            channelId: resolvedSelection.selectedChannelId,
          },
        });

        await detailUpdates?.flush(retryResult.detail);

        return {
          detail: retryResult.detail,
        };
      } catch (error) {
        this.pendingConversationTaskSeeds.delete(sessionId);
        const failed = this.storeSessionTerminalState(preflightSummary, "failed");

        await this.logger.error("Desktop conversation message failed", {
          error,
          workspaceId: failed.workspaceId,
          runId: failed.lastRunId,
          context: {
            sessionId,
            workspaceId: failed.workspaceId,
            selectedChannelId: requestedSelectedChannelId,
            selectedModelId: requestedSelectedModelId,
            selectedAgentId: effectiveSelectedAgentId,
            error: describeError(error),
          },
        });

        try {
          const detail = await this.loadSessionDetail(failed);
          await detailUpdates?.flush(detail);
        } catch {
          // Ignore auxiliary publish failures so the original mutation error stays authoritative.
        }

        throw error;
      } finally {
        await detailUpdates?.stop();
      }
    });
  }

  async stopMessage(
    input: DesktopConversationStopMessageInput,
  ): Promise<DesktopConversationStopMessageResponse> {
    const sessionId = normalizeSessionId(input.sessionId);
    const current = this.store.getSession(sessionId);
    if (!current) {
      throw new Error(`desktop conversation session not found: ${sessionId}`);
    }

    const runtime = this.conversationRuntime;
    const stopped = runtime ? await runtime.abortActiveTurn(sessionId) : false;
    const synced = await this.syncSessionSummaryFromKernelBySessionId(sessionId, undefined, current)
      .catch(() => current);
    const detail = await this.loadSessionDetail(synced);

    await this.logger.info("Desktop conversation stop requested", {
      context: {
        sessionId,
        workspaceId: synced.workspaceId,
        stopped,
        status: detail.status,
      },
    });

    return {
      detail,
      stopped,
    };
  }

  private async retryManagedConversationIfNeeded(input: {
    item: DesktopConversationSessionItem;
    output: Awaited<ReturnType<DesktopAiConversationRuntimePort["startUserTurn"]>>;
    scope?: DesktopConversationSendMessageInput["scope"];
    seed: PendingConversationTaskSeed;
  }): Promise<{
    item: DesktopConversationSessionItem;
    detail: DesktopConversationSessionDetail;
  }> {
    let currentItem = input.item;
    let currentOutput = input.output;
    let attempt = 0;

    while (true) {
      if (currentOutput.boundary.kind !== "failed"
        || !currentOutput.boundary.error.retryable
        || !isManagedConversationRun(input.seed)) {
        return {
          item: currentItem,
          detail: await this.loadSessionDetail(currentItem),
        };
      }

      if (attempt >= MANAGED_AUTORETRY_POLICY.maxAttempts) {
        this.updateSessionMetadata(currentItem.sessionId, {
          managedExecutionStopReason: "auto_retry_exhausted",
          managedAutoRetryCount: attempt,
        });
        return {
          item: currentItem,
          detail: await this.loadSessionDetail(currentItem),
        };
      }

      attempt += 1;
      const retryDelayMs = calculateRetryDelayMs({
        ...MANAGED_AUTORETRY_POLICY,
        attempt,
        retryAfterMs: readRetryAfterMs(currentOutput.boundary.error.metadata as Record<string, unknown> | undefined),
      });
      const retryMetadataPatch = {
        managedAutoRetryCount: attempt,
        managedExecutionStopReason: undefined,
        blockedReason: undefined,
        lastAutoRetryAt: nowIso(),
        lastAutoRetryDelayMs: retryDelayMs,
        lastRetryableErrorCode: currentOutput.boundary.error.code,
        lastRetryableErrorMessage: currentOutput.boundary.error.message,
      } satisfies Record<string, unknown>;
      const selection = readSelectionMetadata(currentItem.metadata);
      const managedRootTaskId = input.seed.rootTaskId
        ?? readLinkedRootTaskId(currentItem.metadata);
      const retrySeed: PendingConversationTaskSeed = {
        ...input.seed,
        workspaceId: currentItem.workspaceId,
        rootTaskId: managedRootTaskId,
        selectedAgentId: input.seed.selectedAgentId ?? selection.selectedAgentId,
        selectedChannelId: input.seed.selectedChannelId ?? selection.selectedChannelId,
        selectedModelId: input.seed.selectedModelId ?? selection.selectedModelId,
        sessionTitle: input.seed.sessionTitle ?? currentItem.title,
        taskMetadata: mergeMetadata(input.seed.taskMetadata, retryMetadataPatch),
      };

      this.updateSessionMetadata(currentItem.sessionId, retryMetadataPatch);
      if (this.options.taskBridge && managedRootTaskId) {
        await this.options.taskBridge.syncManagedConversationRootTask({
          workspaceId: currentItem.workspaceId,
          sessionId: currentItem.sessionId,
          rootTaskId: managedRootTaskId,
          runId: currentOutput.run.id,
          title: buildConversationTaskTitle({
            selectedAgentId: retrySeed.selectedAgentId,
            sessionTitle: retrySeed.sessionTitle,
          }),
          goal: buildConversationTaskGoal({
            promptText: retrySeed.promptText,
            attachmentCount: retrySeed.attachmentCount,
            sessionTitle: retrySeed.sessionTitle,
          }),
          agentId: retrySeed.selectedAgentId,
          executionMode: retrySeed.executionMode,
          runMode: retrySeed.runMode,
          selectedChannelId: retrySeed.selectedChannelId,
          selectedModelId: retrySeed.selectedModelId,
          status: "running",
          progress: 5,
          message: `Retrying after retryable provider failure (${attempt}/${MANAGED_AUTORETRY_POLICY.maxAttempts}).`,
          metadata: {
            source: "desktop.conversation",
            code: currentOutput.boundary.error.code,
            ...buildManagedConversationRootTaskMetadata({
              seed: retrySeed,
              rootTaskId: managedRootTaskId,
              phase: "retrying_after_failure",
              managedExecutionStage: readManagedExecutionStage(currentItem.metadata)
                ?? MANAGED_EXECUTION_STAGE_RUNNING,
              extraMetadata: retryMetadataPatch,
            }),
          },
        });
      }

      await waitForDuration(retryDelayMs);
      this.pendingConversationTaskSeeds.set(currentItem.sessionId, retrySeed);
      const retried = await this.requireConversationRuntime().continueSystemTurn({
        item: currentItem,
        ...(input.scope ? { scope: input.scope } : {}),
        workspaceId: currentItem.workspaceId,
        ...(retrySeed.selectedChannelId ? { selectedChannelId: retrySeed.selectedChannelId } : {}),
        ...(retrySeed.selectedModelId ? { selectedModelId: retrySeed.selectedModelId } : {}),
        ...(retrySeed.selectedAgentId ? { selectedAgentId: retrySeed.selectedAgentId } : {}),
        metadata: {
          ...retryMetadataPatch,
          phase: "retrying_after_failure",
          retriedFromRunId: currentOutput.run.id,
          retryableErrorCode: currentOutput.boundary.error.code,
          retryableErrorMessage: currentOutput.boundary.error.message,
          autoRetry: true,
        },
      });

      currentItem = await this.syncSessionSummaryFromKernelBySessionId(currentItem.sessionId, retried.run.id);
      currentOutput = retried;
    }
  }

  async answerInteraction(
    input: DesktopConversationAnswerInteractionInput,
  ): Promise<DesktopConversationInteractionReplyResponse> {
    return this.runMutation(async () => {
      const interactionId = normalizeSessionId(input.interactionId);
      const sessionId = normalizeOptionalSessionId(input.sessionId);
      const detailUpdates = await this.startSessionDetailUpdates(
        sessionId ?? "",
        sessionId ? this.store.getSession(sessionId) ?? undefined : undefined,
      );

      try {
        const output = await this.requireConversationRuntime().answerInteraction({
          interactionId,
          response: input.response,
        });
        const synced = await this.syncSessionSummaryFromKernelBySessionId(output.session.id, output.run.id);
        const detail = await this.loadSessionDetail(synced);
        const derivedComposerMode = readCompletedPlanExitComposerMode(detail.toolCalls);
        const nextItem = derivedComposerMode && synced.metadata?.composerMode !== derivedComposerMode
          ? {
              ...synced,
              updatedAt: nowIso(),
              metadata: mergeMetadata(synced.metadata, {
                composerMode: derivedComposerMode,
              }),
            }
          : synced;
        if (nextItem !== synced) {
          this.store.upsertSession(nextItem);
        }
        const nextDetail = nextItem !== synced
          ? {
              ...detail,
              metadata: mergeMetadata(detail.metadata, {
                composerMode: derivedComposerMode,
              }),
            }
          : detail;
        await this.logFailedConversationDetail("answerInteraction", nextDetail);
        await detailUpdates?.flush(nextDetail);

        return {
          detail: nextDetail,
        };
      } finally {
        await detailUpdates?.stop();
      }
    });
  }

  async rejectInteraction(
    input: DesktopConversationRejectInteractionInput,
  ): Promise<DesktopConversationInteractionReplyResponse> {
    return this.runMutation(async () => {
      const interactionId = normalizeSessionId(input.interactionId);
      const sessionId = normalizeOptionalSessionId(input.sessionId);
      const detailUpdates = await this.startSessionDetailUpdates(
        sessionId ?? "",
        sessionId ? this.store.getSession(sessionId) ?? undefined : undefined,
      );

      try {
        const output = await this.requireConversationRuntime().rejectInteraction({
          interactionId,
          reason: normalizeOptionalText(input.reason),
        });
        const synced = await this.syncSessionSummaryFromKernelBySessionId(output.session.id, output.run.id);
        const detail = await this.loadSessionDetail(synced);
        await this.logFailedConversationDetail("rejectInteraction", detail);
        await detailUpdates?.flush(detail);

        return {
          detail,
        };
      } finally {
        await detailUpdates?.stop();
      }
    });
  }

  dispose() {
    this.conversationRuntime?.dispose();
    this.conversationRuntime = null;
  }

  private async runMutation<TValue>(work: () => Promise<TValue>): Promise<TValue> {
    const next = this.mutationQueue.then(work, work);
    this.mutationQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private createLegacyConversationRuntimeFactory() {
    if (!this.options.agents || !this.options.aiRuntime || !this.options.materializer) {
      return undefined;
    }

    return {
      createConversationRuntime: (input: DesktopAiConversationRuntimeCreateInput) => new DesktopAiConversationRuntime({
        ...input,
        agents: this.options.agents!,
        aiRuntime: this.options.aiRuntime!,
        materializer: this.options.materializer!,
        tasksQuery: input.tasksQuery ?? this.options.tasksQuery,
      }),
    } satisfies Pick<DesktopAiConversationRuntimeFactoryPort, "createConversationRuntime">;
  }

  private requireConversationRuntime() {
    if (!this.conversationRuntime) {
      if (!this.options.conversationDbPath) {
        throw new Error("Desktop conversation runtime is not configured.");
      }

      const factory = this.options.conversationRuntimeFactory
        ?? this.createLegacyConversationRuntimeFactory();
      if (!factory) {
        throw new Error("Desktop conversation runtime is not configured.");
      }

      this.conversationRuntime = factory.createConversationRuntime({
        conversationDbPath: this.options.conversationDbPath,
        turnNoActivityTimeoutMs: this.options.turnNoActivityTimeoutMs,
        tasksQuery: this.options.tasksQuery,
        toolSources: this.options.toolSources,
        toolHandlers: this.options.toolHandlers,
        toolContributionResolver: async (
          input: Parameters<NonNullable<DesktopAiConversationRuntimeCreateInput["toolContributionResolver"]>>[0],
        ) => {
          const contributions = await Promise.all((this.options.capabilityProviders ?? []).map(async (provider) => {
            if (!provider.resolveRuntimeContribution) {
              return undefined;
            }

            try {
              return await provider.resolveRuntimeContribution(input);
            } catch {
              return undefined;
            }
          }));

          const toolSources = contributions.flatMap((item) => item?.toolSources ?? []);
          const toolHandlers = contributions.flatMap((item) => item?.toolHandlers ?? []);
          if (toolSources.length === 0 && toolHandlers.length === 0) {
            return undefined;
          }

          return {
            ...(toolSources.length > 0 ? { toolSources } : {}),
            ...(toolHandlers.length > 0 ? { toolHandlers } : {}),
          };
        },
        runtimeEventsPublisher: (
          update: Parameters<NonNullable<DesktopAiConversationRuntimeCreateInput["runtimeEventsPublisher"]>>[0],
        ) => this.publishRuntimeEventsUpdate(update),
      });
    }

    return this.conversationRuntime;
  }

  private storeSessionSelection(
    item: DesktopConversationSessionItem,
    selectedChannelId: string,
    selectedModelId: string,
    selectedAgentId?: string,
  ) {
    const next: DesktopConversationSessionItem = {
      ...item,
      updatedAt: nowIso(),
      metadata: {
        ...(item.metadata ? { ...item.metadata } : {}),
        selectedChannelId,
        selectedModelId,
        ...(selectedAgentId ? { selectedAgentId } : {}),
      },
    };

    this.store.upsertSession(next);
    return next;
  }

  private activateSessionForSend(
    item: DesktopConversationSessionItem,
    selectedChannelId?: string,
    selectedModelId?: string,
    selectedAgentId?: string,
    metadata?: Record<string, unknown>,
  ) {
    const next: DesktopConversationSessionItem = {
      ...item,
      status: "active",
      updatedAt: nowIso(),
      metadata: withSelectedAgentId({
        ...(item.metadata ? { ...item.metadata } : {}),
        ...(metadata ? { ...metadata } : {}),
        ...(selectedChannelId ? { selectedChannelId } : {}),
        ...(selectedModelId ? { selectedModelId } : {}),
      }, selectedAgentId),
    };

    this.store.upsertSession(next);
    return next;
  }

  private storeSessionTerminalState(
    item: DesktopConversationSessionItem,
    status: DesktopConversationSessionItem["status"],
  ) {
    const next: DesktopConversationSessionItem = {
      ...item,
      status,
      updatedAt: nowIso(),
    };

    this.store.upsertSession(next);
    return next;
  }

  private async publishInitialProgressDetail(item: DesktopConversationSessionItem) {
    if (!this.sessionDetailPublisher) {
      return;
    }

    try {
      const detail = await this.loadSessionDetail(item);
      await this.publishSessionDetailUpdate({
        detail,
        reason: "progress",
      });
    } catch {
      // Ignore auxiliary progress publish failures so the mutation result remains authoritative.
    }
  }

  private async syncSessionSummaryFromKernel(
    fallback: DesktopConversationSessionItem,
    lastRunId?: string,
  ) {
    return this.syncSessionSummaryFromKernelBySessionId(fallback.sessionId, lastRunId, fallback);
  }

  private async syncSessionSummaryFromKernelBySessionId(
    sessionId: string,
    lastRunId?: string,
    fallback?: DesktopConversationSessionItem,
  ) {
    const current = this.store.getSession(sessionId) ?? fallback;
    if (!current) {
      throw new Error(`desktop conversation session not found: ${sessionId}`);
    }

    const detail = await this.loadSessionDetail(current);
    const latestRun = detail.runs.at(-1);
    const next: DesktopConversationSessionItem = {
      ...current,
      title: detail.title,
      status: detail.status,
      archivedAt: detail.archivedAt,
      updatedAt: latestRun ? toIsoFromRun(latestRun) : detail.updatedAt,
      lastRunId: lastRunId ?? latestRun?.id ?? current.lastRunId,
      metadata: detail.metadata ? { ...detail.metadata } : undefined,
    };

    this.store.upsertSession(next);
    this.sessionMetadataOverlays.delete(sessionId);
    return next;
  }

  private async startSessionDetailUpdates(
    sessionId: string,
    fallback?: DesktopConversationSessionItem,
  ) {
    if (!this.sessionDetailPublisher || !sessionId) {
      return null;
    }

    let stopped = false;
    let lastSignature: string | undefined;

    const publishCurrent = async (reason: DesktopConversationSessionDetailUpdateEvent["reason"]) => {
      const current = this.store.getSession(sessionId) ?? fallback;
      if (!current) {
        return;
      }

      const detail = await this.loadSessionDetail(current);
      const signature = JSON.stringify(detail);
      if (signature === lastSignature) {
        return;
      }

      lastSignature = signature;
      await this.publishSessionDetailUpdate({ detail, reason });
    };

    const seed = this.store.getSession(sessionId) ?? fallback;
    if (seed) {
      try {
        lastSignature = JSON.stringify(await this.loadSessionDetail(seed));
      } catch {
        lastSignature = undefined;
      }
    }

    const task = (async () => {
      while (!stopped) {
        try {
          await publishCurrent("progress");
        } catch {
          // Ignore auxiliary publish failures so the mutation path stays authoritative.
        }

        if (stopped) {
          break;
        }

        await waitForDuration(SESSION_DETAIL_POLL_INTERVAL_MS);
      }
    })();

    return {
      flush: async (detail: DesktopConversationSessionDetail) => {
        const signature = JSON.stringify(detail);
        if (signature === lastSignature) {
          return;
        }

        lastSignature = signature;
        await this.publishSessionDetailUpdate({ detail, reason: "final" });
      },
      stop: async () => {
        stopped = true;
        await task;
      },
    };
  }

  private async publishSessionDetailUpdate(update: DesktopConversationSessionDetailUpdateEvent) {
    if (!this.sessionDetailPublisher) {
      return;
    }

    try {
      await this.sessionDetailPublisher(update);
    } catch {
      // Ignore bridge publish failures so the mutation result remains the source of truth.
    }
  }

  private async syncConversationTaskFromRuntimeEvents(
    update: DesktopConversationRuntimeEventsUpdateEvent,
  ) {
    if (!this.options.taskBridge || update.events.length === 0) {
      return;
    }

    for (const event of update.events) {
      const workspaceId = await this.resolveConversationTaskWorkspaceId(event.sessionId, update.workspaceId);
      if (!workspaceId) {
        continue;
      }

      const seed = this.resolvePendingConversationTaskSeed(event.sessionId, workspaceId);
      const managedRootTaskId = isManagedConversationRun(seed)
        ? seed.rootTaskId ?? buildManagedConversationRootTaskId(event.sessionId)
        : undefined;

      if (event.type === "run.started") {
        if (managedRootTaskId) {
          await this.options.taskBridge.syncManagedConversationRootTask({
            workspaceId,
            sessionId: event.sessionId,
            rootTaskId: managedRootTaskId,
            runId: event.run.runId,
            title: buildConversationTaskTitle({
              selectedAgentId: seed.selectedAgentId,
              sessionTitle: seed.sessionTitle,
            }),
            goal: buildConversationTaskGoal({
              promptText: seed.promptText,
              attachmentCount: seed.attachmentCount,
              sessionTitle: seed.sessionTitle,
            }),
            agentId: seed.selectedAgentId,
            executionMode: seed.executionMode,
            runMode: seed.runMode,
            selectedChannelId: seed.selectedChannelId,
            selectedModelId: seed.selectedModelId,
            progress: 15,
            message: "Collecting the managed task specification.",
            metadata: {
              source: "desktop.conversation",
              ...buildManagedConversationRootTaskMetadata({
                seed,
                rootTaskId: managedRootTaskId,
                phase: "intake_active",
                managedExecutionStage: MANAGED_EXECUTION_STAGE_INTAKE_LOCKED,
              }),
            },
          });
          this.updateSessionMetadata(event.sessionId, {
            linkedRootTaskId: managedRootTaskId,
            managedExecutionStage: MANAGED_EXECUTION_STAGE_INTAKE_LOCKED,
          });
        }

        await this.options.taskBridge.ensureConversationTaskRunning({
          workspaceId,
          sessionId: event.sessionId,
          runId: event.run.runId,
          title: buildConversationTaskTitle({
            selectedAgentId: seed.selectedAgentId,
            sessionTitle: seed.sessionTitle,
          }),
          goal: buildConversationTaskGoal({
            promptText: seed.promptText,
            attachmentCount: seed.attachmentCount,
            sessionTitle: seed.sessionTitle,
          }),
          agentId: seed.selectedAgentId,
          executionMode: seed.executionMode,
          runMode: seed.runMode,
          selectedChannelId: seed.selectedChannelId,
          selectedModelId: seed.selectedModelId,
          metadata: {
            source: "desktop.conversation",
            ...(managedRootTaskId
              ? buildManagedConversationRunTaskMetadata({
                  seed,
                  rootTaskId: managedRootTaskId,
                  phase: "intake_active",
                  managedExecutionStage: MANAGED_EXECUTION_STAGE_INTAKE_LOCKED,
                })
              : seed.taskMetadata ? { ...seed.taskMetadata } : {}),
          },
        });
        continue;
      }

      if (event.type === "run.blocked") {
        if (managedRootTaskId) {
          await this.options.taskBridge.syncManagedConversationRootTask({
            workspaceId,
            sessionId: event.sessionId,
            rootTaskId: managedRootTaskId,
            runId: event.run.runId,
            title: buildConversationTaskTitle({
              selectedAgentId: seed.selectedAgentId,
              sessionTitle: seed.sessionTitle,
            }),
            goal: buildConversationTaskGoal({
              promptText: seed.promptText,
              attachmentCount: seed.attachmentCount,
              sessionTitle: seed.sessionTitle,
            }),
            agentId: seed.selectedAgentId,
            executionMode: seed.executionMode,
            runMode: seed.runMode,
            selectedChannelId: seed.selectedChannelId,
            selectedModelId: seed.selectedModelId,
            progress: 40,
            message: "Waiting for additional task details or approval.",
            metadata: {
              source: "desktop.conversation",
              ...buildManagedConversationRootTaskMetadata({
                seed,
                rootTaskId: managedRootTaskId,
                phase: "awaiting_input",
                managedExecutionStage: MANAGED_EXECUTION_STAGE_INTAKE_LOCKED,
                extraMetadata: {
                  waitingForInteraction: true,
                  blockedInteractionId: event.boundary.interactionId,
                  blockedReason: "Waiting for interaction",
                },
              }),
            },
          });
          this.updateSessionMetadata(event.sessionId, {
            linkedRootTaskId: managedRootTaskId,
            managedExecutionStage: MANAGED_EXECUTION_STAGE_INTAKE_LOCKED,
          });
        }

        await this.options.taskBridge.ensureConversationTaskRunning({
          workspaceId,
          sessionId: event.sessionId,
          runId: event.run.runId,
          title: buildConversationTaskTitle({
            selectedAgentId: seed.selectedAgentId,
            sessionTitle: seed.sessionTitle,
          }),
          goal: buildConversationTaskGoal({
            promptText: seed.promptText,
            attachmentCount: seed.attachmentCount,
            sessionTitle: seed.sessionTitle,
          }),
          agentId: seed.selectedAgentId,
          executionMode: seed.executionMode,
          runMode: seed.runMode,
          selectedChannelId: seed.selectedChannelId,
          selectedModelId: seed.selectedModelId,
          metadata: {
            source: "desktop.conversation",
            ...(managedRootTaskId
              ? buildManagedConversationRunTaskMetadata({
                  seed,
                  rootTaskId: managedRootTaskId,
                  phase: "awaiting_input",
                  managedExecutionStage: MANAGED_EXECUTION_STAGE_INTAKE_LOCKED,
                  extraMetadata: {
                    waitingForInteraction: true,
                    blockedInteractionId: event.boundary.interactionId,
                    blockedReason: "Waiting for interaction",
                  },
                })
              : seed.taskMetadata ? { ...seed.taskMetadata } : {}),
          },
        });
        await this.options.taskBridge.markConversationTaskBlocked({
          workspaceId,
          runId: event.run.runId,
          interactionId: event.boundary.interactionId,
          message: "Waiting for interaction",
          metadata: {
            source: "desktop.conversation",
            ...(managedRootTaskId
              ? buildManagedConversationRunTaskMetadata({
                  seed,
                  rootTaskId: managedRootTaskId,
                  phase: "awaiting_input",
                  managedExecutionStage: MANAGED_EXECUTION_STAGE_INTAKE_LOCKED,
                  extraMetadata: {
                    waitingForInteraction: true,
                    blockedInteractionId: event.boundary.interactionId,
                    blockedReason: "Waiting for interaction",
                  },
                })
              : {}),
          },
        });
        continue;
      }

      if (event.type === "run.completed") {
        if (managedRootTaskId) {
          await this.options.taskBridge.syncManagedConversationRootTask({
            workspaceId,
            sessionId: event.sessionId,
            rootTaskId: managedRootTaskId,
            runId: event.run.runId,
            title: buildConversationTaskTitle({
              selectedAgentId: seed.selectedAgentId,
              sessionTitle: seed.sessionTitle,
            }),
            goal: buildConversationTaskGoal({
              promptText: seed.promptText,
              attachmentCount: seed.attachmentCount,
              sessionTitle: seed.sessionTitle,
            }),
            agentId: seed.selectedAgentId,
            executionMode: seed.executionMode,
            runMode: seed.runMode,
            selectedChannelId: seed.selectedChannelId,
            selectedModelId: seed.selectedModelId,
            progress: 60,
            message: "Ready to confirm the managed task takeover.",
            metadata: {
              source: "desktop.conversation",
              ...buildManagedConversationRootTaskMetadata({
                seed,
                rootTaskId: managedRootTaskId,
                phase: "awaiting_task_confirmation",
                managedExecutionStage: MANAGED_EXECUTION_STAGE_READY,
                extraMetadata: {
                  waitingForInteraction: undefined,
                  blockedInteractionId: undefined,
                  blockedReason: undefined,
                },
              }),
            },
          });
          this.updateSessionMetadata(event.sessionId, {
            linkedRootTaskId: managedRootTaskId,
            managedExecutionStage: MANAGED_EXECUTION_STAGE_READY,
          });
        }

        const summary = await this.resolveConversationTaskCompletionSummary(event.sessionId);
        await this.options.taskBridge.completeConversationTask({
          workspaceId,
          runId: event.run.runId,
          summary,
          metadata: {
            source: "desktop.conversation",
            ...(managedRootTaskId
              ? buildManagedConversationRunTaskMetadata({
                  seed,
                  rootTaskId: managedRootTaskId,
                  phase: "awaiting_task_confirmation",
                  managedExecutionStage: MANAGED_EXECUTION_STAGE_READY,
                  extraMetadata: {
                    waitingForInteraction: undefined,
                    blockedInteractionId: undefined,
                    blockedReason: undefined,
                  },
                })
              : {}),
          },
        });
        this.pendingConversationTaskSeeds.delete(event.sessionId);
        continue;
      }

      if (event.type === "run.failed") {
        if (managedRootTaskId) {
          await this.options.taskBridge.syncManagedConversationRootTask({
            workspaceId,
            sessionId: event.sessionId,
            rootTaskId: managedRootTaskId,
            runId: event.run.runId,
            title: buildConversationTaskTitle({
              selectedAgentId: seed.selectedAgentId,
              sessionTitle: seed.sessionTitle,
            }),
            goal: buildConversationTaskGoal({
              promptText: seed.promptText,
              attachmentCount: seed.attachmentCount,
              sessionTitle: seed.sessionTitle,
            }),
            agentId: seed.selectedAgentId,
            executionMode: seed.executionMode,
            runMode: seed.runMode,
            selectedChannelId: seed.selectedChannelId,
            selectedModelId: seed.selectedModelId,
            status: "failed",
            progress: 0,
            message: event.boundary.error.message,
            metadata: {
              source: "desktop.conversation",
              code: event.boundary.error.code,
              ...buildManagedConversationRootTaskMetadata({
                seed,
                rootTaskId: managedRootTaskId,
                phase: "failed",
                managedExecutionStage: readManagedExecutionStage(this.store.getSession(event.sessionId)?.metadata)
                  ?? MANAGED_EXECUTION_STAGE_INTAKE_LOCKED,
                extraMetadata: {
                  managedExecutionStopReason: "failed",
                  blockedReason: event.boundary.error.message,
                },
              }),
            },
          });
          this.updateSessionMetadata(event.sessionId, {
            linkedRootTaskId: managedRootTaskId,
            managedExecutionStopReason: "failed",
          });
        }

        await this.options.taskBridge.failConversationTask({
          workspaceId,
          runId: event.run.runId,
          code: event.boundary.error.code,
          message: event.boundary.error.message,
          metadata: {
            source: "desktop.conversation",
            ...(managedRootTaskId
              ? buildManagedConversationRunTaskMetadata({
                  seed,
                  rootTaskId: managedRootTaskId,
                  phase: "failed",
                  managedExecutionStage: readManagedExecutionStage(this.store.getSession(event.sessionId)?.metadata)
                    ?? MANAGED_EXECUTION_STAGE_INTAKE_LOCKED,
                  extraMetadata: {
                    managedExecutionStopReason: "failed",
                    blockedReason: event.boundary.error.message,
                  },
                })
              : {}),
          },
        });
        this.pendingConversationTaskSeeds.delete(event.sessionId);
      }
    }
  }

  private resolvePendingConversationTaskSeed(
    sessionId: string,
    workspaceId: string,
  ): PendingConversationTaskSeed {
    const seed = this.pendingConversationTaskSeeds.get(sessionId);
    const current = this.store.getSession(sessionId);
    const selection = readSelectionMetadata(current?.metadata);

    return {
      workspaceId,
      promptText: seed?.promptText,
      attachmentCount: seed?.attachmentCount,
      rootTaskId: seed?.rootTaskId ?? readLinkedRootTaskId(current?.metadata),
      selectedAgentId: seed?.selectedAgentId ?? selection.selectedAgentId,
      executionMode: seed?.executionMode ?? "interactive",
      runMode: seed?.runMode ?? "normal",
      selectedChannelId: seed?.selectedChannelId ?? selection.selectedChannelId,
      selectedModelId: seed?.selectedModelId ?? selection.selectedModelId,
      sessionTitle: seed?.sessionTitle ?? current?.title,
      taskMetadata: seed?.taskMetadata,
    };
  }

  private async resolveConversationTaskWorkspaceId(
    sessionId: string,
    fallbackWorkspaceId?: string,
  ): Promise<string | undefined> {
    const current = this.store.getSession(sessionId);
    if (current?.workspaceId) {
      return current.workspaceId;
    }

    const seed = this.pendingConversationTaskSeeds.get(sessionId);
    return fallbackWorkspaceId ?? seed?.workspaceId;
  }

  private async resolveConversationTaskCompletionSummary(sessionId: string): Promise<string | undefined> {
    const current = this.store.getSession(sessionId);
    if (!current) {
      return undefined;
    }

    try {
      const detail = await this.loadSessionDetail(current);
      return buildConversationTaskCompletionSummary(detail);
    } catch {
      return undefined;
    }
  }

  private updateSessionMetadata(sessionId: string, patch: Record<string, unknown>) {
    const overlay = mergeMetadata(this.sessionMetadataOverlays.get(sessionId), patch);
    if (overlay) {
      this.sessionMetadataOverlays.set(sessionId, overlay);
    } else {
      this.sessionMetadataOverlays.delete(sessionId);
    }

    const current = this.store.getSession(sessionId);
    if (!current) {
      return undefined;
    }

    return {
      ...current,
      updatedAt: nowIso(),
      metadata: mergeMetadata(current.metadata, overlay),
    };
  }

  private async loadSessionDetail(
    item: DesktopConversationSessionItem,
  ): Promise<DesktopConversationSessionDetail> {
    const detail = await this.requireConversationRuntime().loadSessionDetail(item);
    const current = this.store.getSession(item.sessionId) ?? item;
    const overlay = this.sessionMetadataOverlays.get(item.sessionId);

    return {
      ...detail,
      metadata: mergeMetadata(
        mergeMetadata(
          detail.metadata,
          mergeMetadata(current.metadata, overlay),
        ),
        {
          ...(detail.metadata && typeof detail.metadata.planState === "object" && detail.metadata.planState
            ? { planState: detail.metadata.planState }
            : {}),
        },
      ),
    };
  }

  private async logFailedConversationDetail(
    action: "message" | "answerInteraction" | "rejectInteraction",
    detail: DesktopConversationSessionDetail,
  ): Promise<boolean> {
    if (detail.status !== "failed") {
      return false;
    }

    const failedRun = [...detail.runs].reverse().find((run) => run.boundary?.kind === "failed");
    const failedBoundary = failedRun?.boundary?.kind === "failed" ? failedRun.boundary : undefined;
    const latestFailedToolCall = [...detail.toolCalls].reverse().find((call) =>
      call.status === "failed"
      && (!failedRun || call.runId === failedRun.id),
    );

    await this.logger.error(`Desktop conversation ${action} failed`, {
      workspaceId: detail.workspaceId,
      runId: failedRun?.id ?? detail.runs.at(-1)?.id,
      stack: extractKernelErrorStack(failedBoundary?.error) ?? extractKernelErrorStack(latestFailedToolCall?.error),
      context: {
        sessionId: detail.sessionId,
        workspaceId: detail.workspaceId,
        status: detail.status,
        runId: failedRun?.id ?? detail.runs.at(-1)?.id,
        boundary: failedBoundary,
        latestFailedToolCall: latestFailedToolCall
          ? {
              callId: latestFailedToolCall.callId,
              toolName: latestFailedToolCall.toolName,
              error: latestFailedToolCall.error,
            }
          : undefined,
        pendingInteractionCount: detail.pendingInteractions.length,
        runCount: detail.runs.length,
      },
    });

    return true;
  }
}

function toIsoFromRun(run: { updatedAt: number }) {
  return new Date(run.updatedAt).toISOString();
}

function waitForDuration(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

function readSelectionMetadata(metadata: Record<string, unknown> | undefined) {
  return {
    selectedChannelId: normalizeOptionalText(metadata?.selectedChannelId),
    selectedModelId: normalizeOptionalText(metadata?.selectedModelId),
    selectedAgentId: normalizeOptionalText(metadata?.selectedAgentId),
  };
}

function buildConversationTaskTitle(input: {
  selectedAgentId?: string;
  sessionTitle?: string;
}) {
  const selectedAgentId = normalizeOptionalText(input.selectedAgentId);
  const sessionTitle = normalizeOptionalText(input.sessionTitle);
  if (selectedAgentId) {
    return sessionTitle && sessionTitle !== "New conversation"
      ? `${selectedAgentId}: ${sessionTitle}`
      : `Agent task: ${selectedAgentId}`;
  }
  if (sessionTitle && sessionTitle !== "New conversation") {
    return sessionTitle;
  }
  return "Conversation task";
}

function buildConversationTaskGoal(input: {
  promptText?: string;
  attachmentCount?: number;
  sessionTitle?: string;
}) {
  const promptText = normalizeOptionalText(input.promptText);
  if (promptText) {
    return promptText;
  }
  if ((input.attachmentCount ?? 0) > 0) {
    return `Process ${input.attachmentCount} conversation attachment${input.attachmentCount === 1 ? "" : "s"}`;
  }
  const sessionTitle = normalizeOptionalText(input.sessionTitle);
  if (sessionTitle && sessionTitle !== "New conversation") {
    return `Continue conversation ${sessionTitle}`;
  }
  return "Continue the current conversation.";
}

function buildConversationTaskCompletionSummary(
  detail: DesktopConversationSessionDetail,
): string | undefined {
  for (let index = detail.messages.length - 1; index >= 0; index -= 1) {
    const message = detail.messages[index];
    if (message?.role !== "assistant") {
      continue;
    }

    const summary = message.parts.reduce<string[]>((parts, part) => {
      if (part.type !== "text") {
        return parts;
      }

      const text = part.text.trim();
      if (text) {
        parts.push(text);
      }

      return parts;
    }, []).join(" ").trim();

    if (!summary) {
      continue;
    }

    return summary.length <= 240 ? summary : `${summary.slice(0, 237).trimEnd()}...`;
  }

  return undefined;
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function extractKernelErrorStack(error: { metadata?: Record<string, unknown> } | undefined) {
  if (!error || !isRecord(error.metadata)) {
    return undefined;
  }

  return normalizeOptionalText(error.metadata.stack);
}