import type {
  DesktopTaskPriority,
  DesktopTaskRecord,
  DesktopTaskScope,
  DesktopTaskScheduleKind,
  DesktopTaskStatus,
  DesktopTaskSurface,
  DesktopTaskVisibility,
} from "./desktop-tasks";

export const DESKTOP_TASK_CENTER_SOURCE_KIND_VALUES = [
  "automation",
  "managed_execution",
  "child_task",
  "conversation",
  "generic",
] as const;

export const DESKTOP_TASK_CENTER_EXPOSURE_VALUES = [
  "hidden",
  "contextual",
  "operator",
] as const;

export const DESKTOP_TASK_CENTER_ATTENTION_STATE_VALUES = [
  "none",
  "background",
  "scheduled",
  "blocked",
  "takeover_required",
  "verification_required",
  "wrap_up_required",
  "failed",
] as const;

export type DesktopTaskCenterSourceKind =
  (typeof DESKTOP_TASK_CENTER_SOURCE_KIND_VALUES)[number];

export type DesktopTaskCenterExposure =
  (typeof DESKTOP_TASK_CENTER_EXPOSURE_VALUES)[number];

export type DesktopTaskCenterAttentionState =
  (typeof DESKTOP_TASK_CENTER_ATTENTION_STATE_VALUES)[number];
export type DesktopTaskCenterSurface = DesktopTaskSurface;

export type DesktopTaskCenterScopeFilter = "root" | "all";

export type DesktopTaskCenterScheduleFilter =
  | "all"
  | "scheduled"
  | "unscheduled"
  | "active"
  | "paused";

export type DesktopTaskCenterItem = {
  centerId: string;
  workspaceId: string;
  taskId: string;
  title: string;
  summary: string;
  sourceKind: DesktopTaskCenterSourceKind;
  exposure: DesktopTaskCenterExposure;
  attentionState: DesktopTaskCenterAttentionState;
  attentionReason?: string;
  lifecycleStatus: DesktopTaskStatus;
  priority: DesktopTaskPriority;
  phase?: string;
  progress: number;
  updatedAt: string;
  linkedSessionId?: string;
  rootTaskId?: string;
  surface: DesktopTaskCenterSurface;
  visibility: DesktopTaskVisibility;
  scope: DesktopTaskScope;
  identityKey?: string;
  hasSchedule: boolean;
  scheduleKind?: DesktopTaskScheduleKind;
  scheduleIntervalMinutes?: number;
  scheduleEnabled: boolean;
  scheduleNextRunAt?: string;
  handlerId?: string;
  moduleId?: string;
};

export type DesktopTaskCenterListQuery = {
  workspaceId?: string;
  surface?: DesktopTaskCenterSurface | "all";
  visibility?: DesktopTaskVisibility | "all";
  sourceKind?: DesktopTaskCenterSourceKind | "all";
  exposure?: DesktopTaskCenterExposure | "all";
  attentionState?: DesktopTaskCenterAttentionState | "all";
  scope?: DesktopTaskCenterScopeFilter;
  schedule?: DesktopTaskCenterScheduleFilter;
  q?: string;
  limit?: number;
  offset?: number;
};

export type DesktopTaskCenterListResponse = {
  items: DesktopTaskCenterItem[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

const MANAGED_INTAKE_AGENT_ID = "managed-autopilot";

type ProjectionAttention = {
  attentionState: DesktopTaskCenterAttentionState;
  exposure: DesktopTaskCenterExposure;
  reason?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function trimText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function summarizeText(value: unknown, maxLength = 180): string | undefined {
  const text = trimText(value);
  if (!text) {
    return undefined;
  }

  return text.length > maxLength
    ? `${text.slice(0, Math.max(0, maxLength - 3))}...`
    : text;
}

function buildCenterId(item: Pick<DesktopTaskRecord, "workspaceId" | "taskId">): string {
  return `${item.workspaceId}:${item.taskId}`;
}

function readTaskMetadata(item: DesktopTaskRecord): Record<string, unknown> | undefined {
  return isRecord(item.metadata) ? item.metadata : undefined;
}

function resolveRootTaskId(item: DesktopTaskRecord): string | undefined {
  const metadata = readTaskMetadata(item);
  const rootTaskId = trimText(metadata?.rootTaskId);
  if (rootTaskId) {
    return rootTaskId;
  }

  return metadata?.rootTask === true ? item.taskId : undefined;
}

function resolveScope(item: DesktopTaskRecord): DesktopTaskScope {
  if (item.scope === "system" || item.workspaceId === "system") {
    return "system";
  }

  return "workspace";
}

function isManagedExecutionTask(item: DesktopTaskRecord): boolean {
  const metadata = readTaskMetadata(item);
  return item.runMode === "hosted_autopilot"
    || item.runMode === "long_task_orchestration"
    || metadata?.managedExecution === true
    || metadata?.rootTask === true;
}

function isChildTask(item: DesktopTaskRecord): boolean {
  const metadata = readTaskMetadata(item);
  const taskKind = trimText(metadata?.taskKind);
  return taskKind === "task"
    || taskKind === "todo"
    || taskKind === "checkpoint"
    || isRecord(metadata?.childSessionResolution)
    || isRecord(metadata?.resolutionMetadata);
}

function isAutomationTask(item: DesktopTaskRecord): boolean {
  return Boolean(item.schedule) || Boolean(item.handler);
}

function resolveSourceKind(item: DesktopTaskRecord): DesktopTaskCenterSourceKind {
  if (isChildTask(item)) {
    return "child_task";
  }
  if (isManagedExecutionTask(item)) {
    return "managed_execution";
  }
  if (isAutomationTask(item)) {
    return "automation";
  }
  if (trimText(item.linkedSessionId)) {
    return "conversation";
  }
  return "generic";
}

function readPhase(item: DesktopTaskRecord): string | undefined {
  return trimText(readTaskMetadata(item)?.phase);
}

function readBlockedReason(item: DesktopTaskRecord): string | undefined {
  return trimText(readTaskMetadata(item)?.blockedReason);
}

function readVerificationRequirement(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  const plan = isRecord(metadata?.verificationPlan) ? metadata.verificationPlan : undefined;
  const mode = trimText(plan?.mode);
  const status = trimText(plan?.status);
  if (!mode || mode === "local" || status === "verified") {
    return undefined;
  }

  return summarizeText(plan?.summary)
    ?? trimText(metadata?.blockedReason)
    ?? "The task is waiting for verification before it can close.";
}

function hasWrapUpPending(metadata: Record<string, unknown> | undefined): boolean {
  const wrapUpStatus = trimText(metadata?.wrapUpStatus);
  const wrapUpCommands = Array.isArray(metadata?.wrapUpCommands)
    ? metadata.wrapUpCommands
      .map((item) => trimText(item))
      .filter((item): item is string => Boolean(item))
    : [];

  if (wrapUpStatus === "pending") {
    return true;
  }

  return wrapUpCommands.length > 0
    && wrapUpStatus !== "completed"
    && wrapUpStatus !== "skipped";
}

function readTakeoverRequirement(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  const managedExecutionStage = trimText(metadata?.managedExecutionStage);
  const executionAgentId = trimText(metadata?.executionAgentId);
  if (
    managedExecutionStage !== "intake_locked"
    && managedExecutionStage !== "ready"
    && executionAgentId !== MANAGED_INTAKE_AGENT_ID
  ) {
    return undefined;
  }

  if (executionAgentId && executionAgentId !== MANAGED_INTAKE_AGENT_ID) {
    return undefined;
  }

  return "Managed intake is waiting for a dedicated takeover session to continue execution.";
}

function readChildResolutionKind(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  const resolution = isRecord(metadata?.childSessionResolution)
    ? metadata.childSessionResolution
    : isRecord(metadata?.resolutionMetadata)
      ? metadata.resolutionMetadata
      : undefined;
  return trimText(resolution?.resolutionKind);
}

function resolveAttention(item: DesktopTaskRecord): ProjectionAttention {
  const metadata = readTaskMetadata(item);
  const phase = readPhase(item);
  const blockedReason = readBlockedReason(item);
  const childResolutionKind = readChildResolutionKind(metadata);

  if (item.status === "failed" || childResolutionKind === "failed" || childResolutionKind === "timed_out") {
    return {
      attentionState: "failed",
      exposure: "contextual",
      reason: summarizeText(item.error?.message) ?? blockedReason,
    };
  }

  if (isManagedExecutionTask(item)) {
    const wrapUpReason = hasWrapUpPending(metadata)
      && (
        phase === "awaiting_wrap_up"
        || phase === "wrap_up_recorded"
        || trimText(metadata?.managedExecutionStopReason) === "completed"
        || phase === "completed"
      )
      ? summarizeText(metadata?.wrapUpSummary)
        ?? blockedReason
        ?? "Final wrap-up work is still pending before the task can close."
      : undefined;
    if (wrapUpReason) {
      return {
        attentionState: "wrap_up_required",
        exposure: "contextual",
        reason: wrapUpReason,
      };
    }

    const verificationReason = phase === "awaiting_external_verification"
      || phase === "awaiting_manual_confirmation"
      || phase === "awaiting_verification"
      ? blockedReason ?? readVerificationRequirement(metadata)
      : readVerificationRequirement(metadata);
    if (verificationReason) {
      return {
        attentionState: "verification_required",
        exposure: "contextual",
        reason: verificationReason,
      };
    }

    const takeoverReason = readTakeoverRequirement(metadata);
    if (takeoverReason) {
      return {
        attentionState: "takeover_required",
        exposure: "contextual",
        reason: takeoverReason,
      };
    }
  }

  if (blockedReason || childResolutionKind === "blocked" || phase?.startsWith("awaiting_")) {
    return {
      attentionState: "blocked",
      exposure: "contextual",
      reason: blockedReason ?? "The task is waiting for user input or runtime recovery.",
    };
  }

  if (item.schedule?.enabled !== false && item.schedule?.nextRunAt) {
    return {
      attentionState: item.status === "running" ? "background" : "scheduled",
      exposure: "hidden",
    };
  }

  if (item.status === "running") {
    return {
      attentionState: "background",
      exposure: isManagedExecutionTask(item) || isChildTask(item) ? "hidden" : "operator",
    };
  }

  return {
    attentionState: "none",
    exposure: isAutomationTask(item) ? "operator" : "operator",
  };
}

function needsUserAttention(attention: ProjectionAttention): boolean {
  return attention.attentionState === "blocked"
    || attention.attentionState === "takeover_required"
    || attention.attentionState === "verification_required"
    || attention.attentionState === "wrap_up_required"
    || attention.attentionState === "failed";
}

function resolveSurface(
  item: DesktopTaskRecord,
  sourceKind: DesktopTaskCenterSourceKind,
  attention: ProjectionAttention,
): DesktopTaskSurface {
  if (item.surface === "system" || resolveScope(item) === "system") {
    return "system";
  }

  if (item.surface === "critical") {
    return "critical";
  }

  if (item.surface === "internal") {
    return "internal";
  }

  const rootTaskId = resolveRootTaskId(item);
  const isRootTask = Boolean(rootTaskId) && rootTaskId === item.taskId;
  if (!isRootTask) {
    return "internal";
  }

  if (sourceKind !== "managed_execution" && sourceKind !== "automation") {
    return needsUserAttention(attention) ? "critical" : "internal";
  }

  if (
    item.status === "running"
    || item.status === "queued"
    || item.status === "failed"
    || needsUserAttention(attention)
  ) {
    return "critical";
  }

  return "internal";
}

function resolveVisibility(
  item: DesktopTaskRecord,
  surface: DesktopTaskSurface,
): DesktopTaskVisibility {
  if (item.visibility === "hidden") {
    return "hidden";
  }

  if (item.visibility === "visible") {
    return "visible";
  }

  return surface === "internal" ? "hidden" : "visible";
}

function buildSummary(item: DesktopTaskRecord, attentionReason: string | undefined): string {
  return attentionReason
    ?? summarizeText(item.outputs?.[0]?.value)
    ?? summarizeText(item.goal)
    ?? item.title;
}

export function projectDesktopTaskRecordToTaskCenterItem(
  item: DesktopTaskRecord,
): DesktopTaskCenterItem {
  const attention = resolveAttention(item);
  const sourceKind = resolveSourceKind(item);
  const scope = resolveScope(item);
  const surface = resolveSurface(item, sourceKind, attention);
  const visibility = resolveVisibility(item, surface);

  return {
    centerId: buildCenterId(item),
    workspaceId: item.workspaceId,
    taskId: item.taskId,
    title: item.title,
    summary: buildSummary(item, attention.reason),
    sourceKind,
    exposure: attention.exposure,
    attentionState: attention.attentionState,
    attentionReason: attention.reason,
    lifecycleStatus: item.status,
    priority: item.priority,
    phase: readPhase(item),
    progress: item.progress,
    updatedAt: item.updatedAt,
    linkedSessionId: trimText(item.linkedSessionId),
    rootTaskId: resolveRootTaskId(item),
    surface,
    visibility,
    scope,
    identityKey: trimText(item.identityKey),
    hasSchedule: Boolean(item.schedule),
    scheduleKind: item.schedule?.kind,
    scheduleIntervalMinutes: item.schedule?.intervalMinutes,
    scheduleEnabled: item.schedule?.enabled !== false,
    scheduleNextRunAt: trimText(item.schedule?.nextRunAt),
    handlerId: trimText(item.handler?.handlerId),
    moduleId: trimText(item.handler?.moduleId),
  };
}

export function isTaskCenterVisibleSurface(item: DesktopTaskCenterItem): boolean {
  return item.visibility === "visible"
    && (item.surface === "critical" || item.surface === "system");
}
