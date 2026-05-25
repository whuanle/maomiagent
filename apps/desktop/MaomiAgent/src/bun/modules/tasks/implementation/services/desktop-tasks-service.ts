import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type { RuntimeLogger } from "../../../logs";
import {
  DESKTOP_TASK_EXECUTION_MODE_VALUES,
  DESKTOP_TASK_ORIGIN_VALUES,
  DESKTOP_TASK_PRIORITY_VALUES,
  DESKTOP_TASK_RUN_MODE_VALUES,
  DESKTOP_TASK_RUN_STATUS_VALUES,
  DESKTOP_TASK_SCHEDULE_KIND_VALUES,
  DESKTOP_TASK_SOURCE_OWNER_KIND_VALUES,
  DESKTOP_TASK_STATUS_VALUES,
  DESKTOP_TASK_STEP_STATUS_VALUES,
  DESKTOP_TASK_TYPE_VALUES,
  type DesktopTaskExecutionMode,
  type DesktopTaskManagedHandlerBinding,
  type DesktopTaskOutput,
  type DesktopTaskPriority,
  type DesktopTaskRecord,
  type DesktopTaskRunMode,
  type DesktopTaskRunRecord,
  type DesktopTaskRunsResponse,
  type DesktopTaskSchedule,
  type DesktopTaskScope,
  type DesktopTaskSourceOwnerKind,
  type DesktopTaskSourceRecord,
  type DesktopTaskStatus,
  type DesktopTaskStep,
  type DesktopTaskStepStatus,
  type DesktopTaskType,
  type DesktopTaskWorkspaceSummary,
} from "../../../../../shared/desktop-tasks";
import {
  projectDesktopTaskRecordToTaskCenterItem,
  type DesktopTaskCenterItem,
} from "../../../../../shared/desktop-task-center";
import type { DesktopWorkspaceQueryPort } from "../../../workspace";
import type {
  DesktopConversationTaskArchiveInput,
  DesktopConversationTaskBlockedInput,
  DesktopConversationTaskCompleteInput,
  DesktopConversationTaskFailInput,
  DesktopManagedConversationRootTaskPatchInput,
  DesktopManagedConversationRootTaskSyncInput,
  DesktopConversationTaskRunInput,
  DesktopTaskCenterListQuery,
  DesktopTaskCenterListResponse,
  DesktopScheduledTaskDefinition,
  DesktopScheduledTaskExecutionResult,
  DesktopTaskDetailResponse,
  DesktopTaskListQuery,
  DesktopTaskListResponse,
  DesktopTaskWorkspacePurgeResult,
  DesktopTaskWorkspacesResponse,
} from "../../abstraction/models/desktop-tasks.models";
import type {
  DesktopConversationTaskBridgePort,
  DesktopScheduledTaskHandler,
  DesktopScheduledTaskRegistryPort,
  DesktopTasksPort,
} from "../../abstraction/ports/desktop-tasks.ports";
import type { DesktopTasksStore } from "../stores/desktop-tasks-store";

type LegacyTaskStorage = {
  items?: unknown[];
  runs?: unknown[];
  version?: string;
  updatedAt?: string;
};

type LegacyWorkspaceState = {
  items?: Array<{
    workspaceId?: string;
    name?: string;
  }>;
};

type StartedTaskRun = {
  definition?: DesktopScheduledTaskDefinition;
  handler: DesktopScheduledTaskHandler;
  runId: string;
  startedAt: string;
  task: DesktopTaskRecord;
};

type CollectedManagedDefinition = {
  handler: DesktopScheduledTaskHandler;
  definition: DesktopScheduledTaskDefinition;
};

const DEFAULT_LIMIT = 200;
const DEFAULT_RUN_LIMIT = 20;
const MAX_LIMIT = 1000;
const DEFAULT_SCHEDULER_BATCH_SIZE = 20;
const DEFAULT_SCHEDULER_INTERVAL_MS = 30_000;
const ARCHIVED_SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const SYSTEM_WORKSPACE_ID = "system";
const SYSTEM_TASK_RUN_HISTORY_LIMIT = 10;

export class DesktopTasksError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function trimText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function toFiniteInt(
  value: unknown,
  fallback: number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.trunc(value);
  return Math.max(min, Math.min(max, normalized));
}

function clampProgress(value: unknown, fallback: number): number {
  return toFiniteInt(value, fallback, 0, 100);
}

function isOneOf<TValue extends string>(
  value: unknown,
  allowed: readonly TValue[],
): value is TValue {
  return typeof value === "string" && allowed.includes(value as TValue);
}

function ensureWorkspaceId(value: unknown): string {
  const workspaceId = trimText(value);
  if (!workspaceId) {
    throw new DesktopTasksError("INVALID_ARGUMENT", "workspaceId is required", {
      field: "workspaceId",
    });
  }
  return workspaceId;
}

function ensureTaskId(value: unknown): string {
  const taskId = trimText(value);
  if (!taskId) {
    throw new DesktopTasksError("INVALID_ARGUMENT", "taskId is required", {
      field: "taskId",
    });
  }
  return taskId;
}

function normalizeTaskPriority(value: unknown, fallback: DesktopTaskPriority): DesktopTaskPriority {
  return isOneOf(value, DESKTOP_TASK_PRIORITY_VALUES) ? value : fallback;
}

function normalizeTaskStatus(value: unknown, fallback: DesktopTaskStatus): DesktopTaskStatus {
  return isOneOf(value, DESKTOP_TASK_STATUS_VALUES) ? value : fallback;
}

function normalizeTaskExecutionMode(
  value: unknown,
  fallback: DesktopTaskExecutionMode,
): DesktopTaskExecutionMode {
  return isOneOf(value, DESKTOP_TASK_EXECUTION_MODE_VALUES) ? value : fallback;
}

function normalizeTaskRunMode(value: unknown, fallback: DesktopTaskRunMode): DesktopTaskRunMode {
  return isOneOf(value, DESKTOP_TASK_RUN_MODE_VALUES) ? value : fallback;
}

function normalizeTaskOrigin(
  value: unknown,
  fallback: DesktopTaskRecord["origin"],
): DesktopTaskRecord["origin"] {
  return isOneOf(value, DESKTOP_TASK_ORIGIN_VALUES) ? value : fallback;
}

function normalizeTaskStepStatus(
  value: unknown,
  fallback: DesktopTaskStepStatus,
): DesktopTaskStepStatus {
  return isOneOf(value, DESKTOP_TASK_STEP_STATUS_VALUES) ? value : fallback;
}

function normalizeTaskRunStatus(
  value: unknown,
  fallback: DesktopTaskRunRecord["status"],
): DesktopTaskRunRecord["status"] {
  return isOneOf(value, DESKTOP_TASK_RUN_STATUS_VALUES) ? value : fallback;
}

function normalizeTaskSchedule(input: unknown): DesktopTaskSchedule | undefined {
  const record = asRecord(input);
  if (!record) {
    return undefined;
  }

  const kind = isOneOf(record.kind, DESKTOP_TASK_SCHEDULE_KIND_VALUES)
    ? record.kind
    : undefined;
  if (!kind) {
    return undefined;
  }

  return {
    kind,
    intervalMinutes: kind === "interval"
      ? toFiniteInt(record.intervalMinutes, 15, 1, 10080)
      : undefined,
    nextRunAt: trimText(record.nextRunAt),
    timezone: trimText(record.timezone),
    enabled: toBoolean(record.enabled, true),
  };
}

function defaultScheduleNextRunAt(schedule: DesktopTaskSchedule): string | undefined {
  const nextRunAt = trimText(schedule.nextRunAt);
  if (nextRunAt) {
    return nextRunAt;
  }
  if (schedule.kind === "interval") {
    const intervalMinutes = schedule.intervalMinutes ?? 15;
    return new Date(Date.now() + intervalMinutes * 60_000).toISOString();
  }
  return nowIso();
}

function mergeManagedSchedule(
  current: DesktopTaskSchedule | undefined,
  definition: DesktopTaskSchedule | undefined,
): DesktopTaskSchedule | undefined {
  if (!definition) {
    return current;
  }

  const nextRunAt = current?.enabled === false
    ? current.nextRunAt ?? definition.nextRunAt ?? defaultScheduleNextRunAt(definition)
    : definition.nextRunAt ?? current?.nextRunAt ?? defaultScheduleNextRunAt(definition);

  return {
    kind: definition.kind,
    intervalMinutes:
      definition.kind === "interval"
        ? definition.intervalMinutes ?? current?.intervalMinutes ?? 15
        : undefined,
    nextRunAt,
    timezone: definition.timezone ?? current?.timezone,
    enabled: current?.enabled === false ? false : definition.enabled ?? true,
  };
}

function advanceScheduleAfterRun(
  schedule: DesktopTaskSchedule | undefined,
  finishedAt: string,
): DesktopTaskSchedule | undefined {
  if (!schedule) {
    return undefined;
  }
  if (schedule.enabled === false) {
    return schedule;
  }
  if (schedule.kind === "interval") {
    const intervalMinutes = schedule.intervalMinutes ?? 15;
    return {
      ...schedule,
      enabled: schedule.enabled ?? true,
      nextRunAt: new Date(Date.parse(finishedAt) + intervalMinutes * 60_000).toISOString(),
    };
  }
  return {
    ...schedule,
    enabled: false,
    nextRunAt: finishedAt,
  };
}

function readScheduleNextRunAtMs(schedule: DesktopTaskSchedule | undefined): number | null {
  if (!schedule || schedule.enabled === false) {
    return null;
  }
  if (!schedule.nextRunAt) {
    return null;
  }
  const parsed = Date.parse(schedule.nextRunAt);
  return Number.isFinite(parsed) ? parsed : null;
}

function isScheduledTaskDue(schedule: DesktopTaskSchedule | undefined, nowMs: number): boolean {
  const nextRunAtMs = readScheduleNextRunAtMs(schedule);
  return nextRunAtMs !== null && nextRunAtMs <= nowMs;
}

function normalizeSourceRecord(input: unknown): DesktopTaskSourceRecord | undefined {
  const record = asRecord(input);
  if (!record) {
    return undefined;
  }
  const ownerKind = isOneOf(record.ownerKind, DESKTOP_TASK_SOURCE_OWNER_KIND_VALUES)
    ? record.ownerKind
    : undefined;
  const ownerId = trimText(record.ownerId);
  if (!ownerKind && !ownerId) {
    return undefined;
  }
  return {
    ownerKind: ownerKind as DesktopTaskSourceOwnerKind | undefined,
    ownerId,
  };
}

function normalizeHandlerBinding(input: unknown): DesktopTaskManagedHandlerBinding | undefined {
  const record = asRecord(input);
  if (!record) {
    return undefined;
  }
  const handlerId = trimText(record.handlerId);
  const moduleId = trimText(record.moduleId);
  const taskKey = trimText(record.taskKey);
  if (!handlerId || !moduleId || !taskKey) {
    return undefined;
  }
  return {
    handlerId,
    moduleId,
    taskKey,
    displayName: trimText(record.displayName),
    payload: asRecord(record.payload) ?? undefined,
  };
}

function normalizeTaskOutput(value: unknown): DesktopTaskOutput | null {
  const record = asRecord(value);
  const name = trimText(record?.name);
  const outputValue = trimText(record?.value);
  if (!name || !outputValue) {
    return null;
  }
  return {
    name,
    value: outputValue,
  };
}

function normalizeTaskOutputs(value: unknown): DesktopTaskOutput[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value
    .map((entry) => normalizeTaskOutput(entry))
    .filter((entry): entry is DesktopTaskOutput => entry !== null);
  return items.length > 0 ? items : undefined;
}

function normalizeTaskStep(value: unknown): DesktopTaskStep | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const stepId = trimText(record.stepId);
  const title = trimText(record.title);
  if (!stepId || !title) {
    return null;
  }
  return {
    stepId,
    title,
    agentId: trimText(record.agentId),
    status: normalizeTaskStepStatus(record.status, "pending"),
    message: trimText(record.message),
    startedAt: trimText(record.startedAt),
    finishedAt: trimText(record.finishedAt),
  };
}

function normalizeTaskSteps(value: unknown): DesktopTaskStep[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeTaskStep(entry))
    .filter((entry): entry is DesktopTaskStep => entry !== null);
}

function inferTaskType(input: {
  explicit: unknown;
  linkedSessionId?: string;
  schedule?: DesktopTaskSchedule;
  handler?: DesktopTaskManagedHandlerBinding;
  metadata?: Record<string, unknown> | null;
}): DesktopTaskType {
  if (isOneOf(input.explicit, DESKTOP_TASK_TYPE_VALUES)) {
    return input.explicit;
  }
  if (input.linkedSessionId || trimText(input.metadata?.sessionId)) {
    return "conversation";
  }
  if (input.schedule || input.handler) {
    return "automation";
  }
  return "execution";
}

function inferExecutionMode(input: {
  explicit: unknown;
  taskType: DesktopTaskType;
  schedule?: DesktopTaskSchedule;
  handler?: DesktopTaskManagedHandlerBinding;
}): DesktopTaskExecutionMode {
  if (isOneOf(input.explicit, DESKTOP_TASK_EXECUTION_MODE_VALUES)) {
    return input.explicit;
  }
  if (input.schedule || input.handler || input.taskType === "automation") {
    return "background";
  }
  return "interactive";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && trimText(error.message)) {
    return error.message.trim();
  }
  return "Unknown task execution error";
}

function compareByUpdatedAtDesc(left: DesktopTaskRecord, right: DesktopTaskRecord): number {
  return right.updatedAt.localeCompare(left.updatedAt)
    || right.createdAt.localeCompare(left.createdAt)
    || left.taskId.localeCompare(right.taskId);
}

function compareByStartedAtDesc(left: DesktopTaskRunRecord, right: DesktopTaskRunRecord): number {
  return right.startedAt.localeCompare(left.startedAt)
    || right.runId.localeCompare(left.runId);
}

function createDefaultSuccessSteps(
  task: DesktopTaskRecord,
  handler: DesktopScheduledTaskHandler,
  finishedAt: string,
): DesktopTaskStep[] {
  return [{
    stepId: `${task.taskId}:complete`,
    title: handler.displayName ?? task.title,
    status: "success",
    finishedAt,
    message: "Task completed",
  }];
}

function buildDefaultManagedSource(
  handler: DesktopScheduledTaskHandler,
): DesktopTaskSourceRecord {
  return {
    ownerKind: "module",
    ownerId: handler.moduleId,
  };
}

function normalizeManagedDefinition(
  input: unknown,
): DesktopScheduledTaskDefinition | null {
  const record = asRecord(input);
  if (!record) {
    return null;
  }

  const taskKey = trimText(record.taskKey);
  const scope = record.scope === "system" ? "system" : "workspace";
  const workspaceId = scope === "system"
    ? SYSTEM_WORKSPACE_ID
    : trimText(record.workspaceId);
  const title = trimText(record.title);
  const goal = trimText(record.goal);
  const schedule = normalizeTaskSchedule(record.schedule);
  if (!taskKey || !workspaceId || !title || !goal || !schedule) {
    return null;
  }

  return {
    taskKey,
    workspaceId,
    scope,
    title,
    goal,
    schedule,
    priority: normalizeTaskPriority(record.priority, "normal"),
    payload: asRecord(record.payload) ?? undefined,
    source: normalizeSourceRecord(record.source),
    metadata: asRecord(record.metadata) ?? undefined,
  };
}

function compareJsonLike(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeTaskMetadata(
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

function buildManagedLookupKey(
  workspaceId: string,
  handlerId: string,
  taskKey: string,
): string {
  return `${workspaceId}::${handlerId}::${taskKey}`;
}

function buildManagedIdentityKey(
  scope: DesktopTaskScope,
  handlerId: string,
  taskKey: string,
): string {
  return `${scope}::${handlerId}::${taskKey}`;
}

function buildManagedLookupKeyForTask(item: DesktopTaskRecord): string | null {
  if (!item.handler?.handlerId || !item.handler.taskKey) {
    return null;
  }
  return buildManagedLookupKey(item.workspaceId, item.handler.handlerId, item.handler.taskKey);
}

function resolveManagedTaskScope(
  definition: Pick<DesktopScheduledTaskDefinition, "scope" | "workspaceId">,
): DesktopTaskScope {
  return definition.scope === "system" || definition.workspaceId === SYSTEM_WORKSPACE_ID
    ? "system"
    : "workspace";
}

function buildManagedIdentityKeyForTask(item: DesktopTaskRecord): string | null {
  if (!item.handler?.handlerId || !item.handler.taskKey) {
    return null;
  }

  const scope = item.scope === "system" || item.workspaceId === SYSTEM_WORKSPACE_ID
    ? "system"
    : "workspace";
  return buildManagedIdentityKey(scope, item.handler.handlerId, item.handler.taskKey);
}

function createDefaultFailedSteps(
  task: DesktopTaskRecord,
  handler: DesktopScheduledTaskHandler,
  finishedAt: string,
  message: string,
): DesktopTaskStep[] {
  return [{
    stepId: `${task.taskId}:failed`,
    title: handler.displayName ?? task.title,
    status: "failed",
    finishedAt,
    message,
  }];
}

function buildRunSummary(
  handler: DesktopScheduledTaskHandler,
  result: DesktopScheduledTaskExecutionResult | undefined,
): string {
  return trimText(result?.summary)
    ?? handler.displayName
    ?? handler.handlerId;
}

function ensureConversationRunId(value: unknown): string {
  const runId = trimText(value);
  if (!runId) {
    throw new DesktopTasksError("INVALID_ARGUMENT", "runId is required", {
      field: "runId",
    });
  }
  return runId;
}

function buildConversationTaskId(runId: string): string {
  return `conversation-${runId}`;
}

function buildConversationTaskProgress(input: {
  currentProgress?: number;
  requestedProgress?: number;
  status: DesktopTaskStatus;
}) {
  const requested = clampProgress(
    input.requestedProgress,
    input.status === "success"
      ? 100
      : input.status === "failed"
        ? 0
        : 10,
  );

  if (input.status === "failed") {
    return 0;
  }

  if (input.status === "success") {
    return 100;
  }

  return Math.max(input.currentProgress ?? 0, requested);
}

function createConversationRunningSteps(
  task: Pick<DesktopTaskRecord, "taskId" | "title">,
  startedAt: string,
  message?: string,
): DesktopTaskStep[] {
  return [{
    stepId: `${task.taskId}:running`,
    title: task.title,
    status: "running",
    startedAt,
    ...(message ? { message } : {}),
  }];
}

function createConversationBlockedSteps(
  task: Pick<DesktopTaskRecord, "taskId" | "title">,
  startedAt: string | undefined,
  message?: string,
): DesktopTaskStep[] {
  return [{
    stepId: `${task.taskId}:blocked`,
    title: task.title,
    status: "pending",
    ...(startedAt ? { startedAt } : {}),
    ...(message ? { message } : {}),
  }];
}

function createConversationSuccessSteps(
  task: Pick<DesktopTaskRecord, "taskId" | "title">,
  startedAt: string | undefined,
  finishedAt: string,
  message: string,
): DesktopTaskStep[] {
  return [{
    stepId: `${task.taskId}:success`,
    title: task.title,
    status: "success",
    ...(startedAt ? { startedAt } : {}),
    finishedAt,
    message,
  }];
}

function createConversationFailedSteps(
  task: Pick<DesktopTaskRecord, "taskId" | "title">,
  startedAt: string | undefined,
  finishedAt: string,
  message: string,
): DesktopTaskStep[] {
  return [{
    stepId: `${task.taskId}:failed`,
    title: task.title,
    status: "failed",
    ...(startedAt ? { startedAt } : {}),
    finishedAt,
    message,
  }];
}

function resolveTaskRootTaskId(item: DesktopTaskRecord): string | undefined {
  const metadata = asRecord(item.metadata);
  const rootTaskId = trimText(metadata?.rootTaskId);
  if (rootTaskId) {
    return rootTaskId;
  }
  return metadata?.rootTask === true ? item.taskId : undefined;
}

function buildTaskStorageKey(item: Pick<DesktopTaskRecord, "workspaceId" | "taskId">): string {
  return `${item.workspaceId}:${item.taskId}`;
}

function readTrimmedEnv(name: string): string | undefined {
  const value = process.env[name];
  return trimText(value);
}

function resolveLegacyConfigDir(): string {
  const configured = readTrimmedEnv("MAOMI_CONFIG_DIR");
  return configured ? resolve(configured) : join(homedir(), ".maomiagent");
}

function resolveLegacyPaths(): { tasksStatePath: string; workspacesStatePath: string } {
  const configDir = resolveLegacyConfigDir();
  return {
    tasksStatePath: join(configDir, "tasks-state.json"),
    workspacesStatePath: join(configDir, "workspaces-state.json"),
  };
}

export class DesktopTasksService
implements DesktopTasksPort, DesktopScheduledTaskRegistryPort, DesktopConversationTaskBridgePort {
  private mutationQueue: Promise<void> = Promise.resolve();
  private readonly handlers = new Map<string, DesktopScheduledTaskHandler>();
  private managedDefinitions = new Map<string, DesktopScheduledTaskDefinition>();
  private definitionsDirty = true;
  private legacyImportPromise: Promise<void> | null = null;
  private legacyImported = false;
  private projectionBackfillPromise: Promise<void> | null = null;
  private projectionBackfilled = false;
  private syncPromise: Promise<void> | null = null;
  private schedulerTickPromise: Promise<void> | null = null;
  private schedulerHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly store: DesktopTasksStore,
    private readonly workspaceQuery: DesktopWorkspaceQueryPort,
    private readonly logger: RuntimeLogger,
  ) {}

  register(handler: DesktopScheduledTaskHandler): void {
    const handlerId = trimText(handler.handlerId);
    const moduleId = trimText(handler.moduleId);
    if (!handlerId || !moduleId) {
      throw new DesktopTasksError(
        "INVALID_ARGUMENT",
        "scheduled task handler must provide handlerId and moduleId",
      );
    }

    const normalizedHandler: DesktopScheduledTaskHandler = {
      ...handler,
      handlerId,
      moduleId,
      displayName: trimText(handler.displayName),
    };
    this.handlers.set(normalizedHandler.handlerId, normalizedHandler);
    this.definitionsDirty = true;
  }

  unregister(handlerId: string): void {
    const normalizedHandlerId = trimText(handlerId);
    if (!normalizedHandlerId) {
      return;
    }

    this.handlers.delete(normalizedHandlerId);
    this.managedDefinitions = new Map(
      [...this.managedDefinitions.entries()].filter(([key]) =>
        !key.includes(`::${normalizedHandlerId}::`)
      ),
    );
    this.definitionsDirty = true;
  }

  listHandlers() {
    return Array.from(this.handlers.values())
      .map((handler) => ({
        handlerId: handler.handlerId,
        moduleId: handler.moduleId,
        displayName: handler.displayName,
      }))
      .sort((left, right) => left.handlerId.localeCompare(right.handlerId));
  }

  async syncManagedTasks(): Promise<void> {
    await this.ensureLegacyImported();
    await this.ensureManagedTasksSynced();
  }

  async runMaintenanceNow(now = nowIso()): Promise<void> {
    await this.ensureLegacyImported();
    await this.ensureManagedTasksSynced();

    await this.runMutation(async () => {
      this.purgeExpiredHiddenTasks(now);
      this.compactDeferredSystemTasks(now);
      this.trimSystemTaskRunHistory();
    });
  }

  startScheduler(intervalMs = DEFAULT_SCHEDULER_INTERVAL_MS): void {
    if (this.schedulerHandle) {
      return;
    }

    this.schedulerHandle = setInterval(() => {
      void this.runSchedulerTick();
    }, intervalMs);
    void this.runSchedulerTick();
  }

  stopScheduler(): void {
    if (!this.schedulerHandle) {
      return;
    }

    clearInterval(this.schedulerHandle);
    this.schedulerHandle = null;
  }

  async listWorkspaces(): Promise<DesktopTaskWorkspacesResponse> {
    await this.ensureLegacyImported();
    const workspaceMap = new Map<string, DesktopTaskWorkspaceSummary>();
    const [desktopWorkspaces, cachedNames, tasks] = await Promise.all([
      this.workspaceQuery.list({ limit: MAX_LIMIT, offset: 0 }),
      Promise.resolve(this.store.listWorkspaceNames()),
      Promise.resolve(this.store.listTasks()),
    ]);

    desktopWorkspaces.items.forEach((workspace) => {
      workspaceMap.set(workspace.workspaceId, {
        workspaceId: workspace.workspaceId,
        name: workspace.name,
        taskCount: 0,
      });
    });

    cachedNames.forEach((workspace) => {
      if (!workspaceMap.has(workspace.workspaceId)) {
        workspaceMap.set(workspace.workspaceId, {
          workspaceId: workspace.workspaceId,
          name: workspace.name || workspace.workspaceId,
          taskCount: 0,
        });
      }
    });

    tasks.forEach((task) => {
      if (task.scope === "system" || task.workspaceId === SYSTEM_WORKSPACE_ID) {
        return;
      }

      const existing = workspaceMap.get(task.workspaceId);
      if (!existing) {
        workspaceMap.set(task.workspaceId, {
          workspaceId: task.workspaceId,
          name: task.workspaceId,
          taskCount: 1,
          lastTaskAt: task.updatedAt,
        });
        return;
      }
      existing.taskCount += 1;
      if (!existing.lastTaskAt || task.updatedAt > existing.lastTaskAt) {
        existing.lastTaskAt = task.updatedAt;
      }
    });

    return {
      items: Array.from(workspaceMap.values()).sort((left, right) => {
        if (left.taskCount !== right.taskCount) {
          return right.taskCount - left.taskCount;
        }
        if ((left.lastTaskAt ?? "") !== (right.lastTaskAt ?? "")) {
          return (right.lastTaskAt ?? "").localeCompare(left.lastTaskAt ?? "");
        }
        return left.name.localeCompare(right.name, "zh-CN", { sensitivity: "base" });
      }),
    };
  }

  async list(input: DesktopTaskListQuery = {}): Promise<DesktopTaskListResponse> {
    await this.ensureLegacyImported();
    const keyword = trimText(input.q)?.toLowerCase() ?? "";
    const workspaceId = trimText(input.workspaceId);
    const rootTaskId = trimText(input.rootTaskId);
    const status = isOneOf(input.status, DESKTOP_TASK_STATUS_VALUES) ? input.status : undefined;
    const limit = toFiniteInt(input.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = toFiniteInt(input.offset, 0, 0);

    const filtered = this.store.listTasks()
      .sort(compareByUpdatedAtDesc)
      .filter((item) => {
        if (workspaceId && item.workspaceId !== workspaceId) {
          return false;
        }
        if (rootTaskId && resolveTaskRootTaskId(item) !== rootTaskId) {
          return false;
        }
        if (status && item.status !== status) {
          return false;
        }
        if (!keyword) {
          return true;
        }
        return [
          item.taskId,
          item.title,
          item.goal,
          item.workspaceId,
          item.agentId,
          item.linkedSessionId,
          item.handler?.handlerId,
          item.handler?.moduleId,
          item.handler?.taskKey,
          trimText(item.metadata?.sessionId),
        ].some((candidate) => candidate?.toLowerCase().includes(keyword));
      });

    return {
      items: filtered.slice(offset, offset + limit),
      meta: {
        total: filtered.length,
        limit,
        offset,
        hasMore: offset + limit < filtered.length,
      },
    };
  }

  async listTaskCenter(
    input: DesktopTaskCenterListQuery = {},
  ): Promise<DesktopTaskCenterListResponse> {
    await this.ensureLegacyImported();
    await this.ensureManagedTasksSynced();
    const keyword = trimText(input.q)?.toLowerCase() ?? "";
    const workspaceId = trimText(input.workspaceId);
    const surface = input.surface && input.surface !== "all"
      ? input.surface
      : undefined;
    const visibility = input.visibility && input.visibility !== "all"
      ? input.visibility
      : "visible";
    const sourceKind = input.sourceKind && input.sourceKind !== "all"
      ? input.sourceKind
      : undefined;
    const exposure = input.exposure && input.exposure !== "all"
      ? input.exposure
      : undefined;
    const attentionState = input.attentionState && input.attentionState !== "all"
      ? input.attentionState
      : undefined;
    const scope = input.scope === "root"
      ? "root"
      : "all";
    const schedule = input.schedule && input.schedule !== "all"
      ? input.schedule
      : undefined;
    const limit = toFiniteInt(input.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = toFiniteInt(input.offset, 0, 0);

    const filtered = this.store.listTasks()
      .sort(compareByUpdatedAtDesc)
      .map((item) => projectDesktopTaskRecordToTaskCenterItem(item))
      .filter((item) => {
        if (workspaceId && item.workspaceId !== workspaceId) {
          return false;
        }
        if (surface && item.surface !== surface) {
          return false;
        }
        if (visibility !== "all" && item.visibility !== visibility) {
          return false;
        }
        if (sourceKind && item.sourceKind !== sourceKind) {
          return false;
        }
        if (exposure && item.exposure !== exposure) {
          return false;
        }
        if (attentionState && item.attentionState !== attentionState) {
          return false;
        }
        if (scope === "root" && item.rootTaskId !== item.taskId) {
          return false;
        }
        if (schedule === "scheduled" && !item.hasSchedule) {
          return false;
        }
        if (schedule === "unscheduled" && item.hasSchedule) {
          return false;
        }
        if (schedule === "active" && !(item.hasSchedule && item.scheduleEnabled)) {
          return false;
        }
        if (schedule === "paused" && !(item.hasSchedule && !item.scheduleEnabled)) {
          return false;
        }
        if (!keyword) {
          return true;
        }
        return this.matchesTaskCenterSearch(item, keyword);
      });

    return {
      items: filtered.slice(offset, offset + limit),
      meta: {
        total: filtered.length,
        limit,
        offset,
        hasMore: offset + limit < filtered.length,
      },
    };
  }

  async get(workspaceId: string, taskId: string): Promise<DesktopTaskRecord | null> {
    await this.ensureLegacyImported();
    return this.store.getTask(ensureWorkspaceId(workspaceId), ensureTaskId(taskId));
  }

  async listRuns(input: {
    workspaceId: string;
    taskId: string;
    limit?: number;
    offset?: number;
  }): Promise<DesktopTaskRunsResponse | null> {
    await this.ensureLegacyImported();
    const task = await this.get(input.workspaceId, input.taskId);
    if (!task) {
      return null;
    }
    const limit = toFiniteInt(input.limit, DEFAULT_RUN_LIMIT, 1, MAX_LIMIT);
    const offset = toFiniteInt(input.offset, 0, 0);
    const items = this.store.listTaskRuns(task.workspaceId, task.taskId).sort(compareByStartedAtDesc);
    return {
      items: items.slice(offset, offset + limit),
      meta: {
        total: items.length,
        limit,
        offset,
        hasMore: offset + limit < items.length,
      },
    };
  }

  async getDetail(input: {
    workspaceId: string;
    taskId: string;
    runLimit?: number;
    runOffset?: number;
  }): Promise<DesktopTaskDetailResponse | null> {
    const item = await this.get(input.workspaceId, input.taskId);
    if (!item) {
      return null;
    }
    const runsResponse = await this.listRuns({
      workspaceId: input.workspaceId,
      taskId: input.taskId,
      limit: input.runLimit,
      offset: input.runOffset,
    });
    return {
      item,
      runs: runsResponse?.items ?? [],
      runsMeta: runsResponse?.meta ?? {
        total: 0,
        limit: toFiniteInt(input.runLimit, DEFAULT_RUN_LIMIT, 1, MAX_LIMIT),
        offset: toFiniteInt(input.runOffset, 0, 0),
        hasMore: false,
      },
    };
  }

  async runNow(workspaceId: string, taskId: string): Promise<DesktopTaskRecord | null> {
    return this.runManagedTask(workspaceId, taskId, "manual");
  }

  async cancel(workspaceId: string, taskId: string): Promise<DesktopTaskRecord | null> {
    await this.ensureLegacyImported();
    const item = await this.transitionTask(workspaceId, taskId, "cancelled", {
      progress: 0,
      clearRunMarkers: false,
    });
    if (item) {
      await this.logger.warn("Desktop task cancelled", {
        workspaceId: item.workspaceId,
        taskId: item.taskId,
      });
    }
    return item;
  }

  async retry(workspaceId: string, taskId: string): Promise<DesktopTaskRecord | null> {
    await this.ensureLegacyImported();
    const item = await this.transitionTask(workspaceId, taskId, "queued", {
      progress: 0,
      clearRunMarkers: true,
    });
    if (item) {
      await this.logger.info("Desktop task reset for retry", {
        workspaceId: item.workspaceId,
        taskId: item.taskId,
      });
    }
    return item;
  }

  async pauseSchedule(workspaceId: string, taskId: string): Promise<DesktopTaskRecord | null> {
    await this.ensureLegacyImported();
    return this.updateScheduleEnabled(workspaceId, taskId, false);
  }

  async resumeSchedule(workspaceId: string, taskId: string): Promise<DesktopTaskRecord | null> {
    await this.ensureLegacyImported();
    return this.updateScheduleEnabled(workspaceId, taskId, true);
  }

  async purgeWorkspaceTasks(workspaceId: string): Promise<DesktopTaskWorkspacePurgeResult> {
    await this.ensureLegacyImported();
    const normalizedWorkspaceId = ensureWorkspaceId(workspaceId);
    if (normalizedWorkspaceId === SYSTEM_WORKSPACE_ID) {
      return {
        taskCount: 0,
        runCount: 0,
      };
    }

    return this.runMutation(async () => {
      return this.store.deleteTasksByWorkspace(normalizedWorkspaceId);
    });
  }

  async listDueScheduledTasks(limit = DEFAULT_LIMIT): Promise<DesktopTaskRecord[]> {
    await this.ensureLegacyImported();
    await this.ensureManagedTasksSynced();
    const normalizedLimit = toFiniteInt(limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
    const nowMs = Date.now();

    return this.store.listTasks()
      .filter((item) =>
        Boolean(item.handler)
        && !(item.visibility === "hidden" && Boolean(item.hiddenAt ?? item.purgeAfterAt))
        && item.deferredCompaction !== true
        && item.status !== "running"
        && item.status !== "cancelled"
        && isScheduledTaskDue(item.schedule, nowMs))
      .sort((left, right) => {
        const leftNextRunAt = readScheduleNextRunAtMs(left.schedule) ?? Number.MAX_SAFE_INTEGER;
        const rightNextRunAt = readScheduleNextRunAtMs(right.schedule) ?? Number.MAX_SAFE_INTEGER;
        if (leftNextRunAt !== rightNextRunAt) {
          return leftNextRunAt - rightNextRunAt;
        }
        return left.updatedAt.localeCompare(right.updatedAt);
      })
      .slice(0, normalizedLimit);
  }

  async runScheduledTask(
    workspaceId: string,
    taskId: string,
  ): Promise<DesktopTaskRecord | null> {
    return this.runManagedTask(workspaceId, taskId, "auto");
  }

  async archiveConversationSessionTasks(
    input: DesktopConversationTaskArchiveInput,
  ): Promise<void> {
    await this.ensureLegacyImported();
    const workspaceId = ensureWorkspaceId(input.workspaceId);
    const sessionId = ensureTaskId(input.sessionId);
    const archivedAt = trimText(input.archivedAt) ?? nowIso();
    const purgeAfterAt = this.buildArchivedTaskPurgeAfterAt(archivedAt);

    await this.runMutation(async () => {
      this.store.listTasks().forEach((current) => {
        if (current.workspaceId !== workspaceId) {
          return;
        }
        if (this.resolveTaskSessionId(current) !== sessionId) {
          return;
        }

        const projected = projectDesktopTaskRecordToTaskCenterItem(current);
        if (projected.surface === "critical") {
          return;
        }

        const next: DesktopTaskRecord = {
          ...current,
          visibility: "hidden",
          hiddenAt: archivedAt,
          purgeAfterAt,
          updatedAt: archivedAt,
        };
        if (!compareJsonLike(current, next)) {
          this.store.upsertTask(next);
        }
      });
    });
  }

  async ensureConversationTaskRunning(
    input: DesktopConversationTaskRunInput,
  ): Promise<DesktopTaskRecord> {
    await this.ensureLegacyImported();
    const workspaceId = ensureWorkspaceId(input.workspaceId);
    const sessionId = ensureTaskId(input.sessionId);
    const runId = ensureConversationRunId(input.runId);
    const title = trimText(input.title);
    const goal = trimText(input.goal);
    if (!title || !goal) {
      throw new DesktopTasksError("INVALID_ARGUMENT", "conversation task title and goal are required", {
        workspaceId,
        runId,
      });
    }
    const executionMode = normalizeTaskExecutionMode(input.executionMode, "interactive");
    const runMode = normalizeTaskRunMode(input.runMode, "normal");

    return this.runMutation(async () => {
      const timestamp = nowIso();
      const taskId = buildConversationTaskId(runId);
      const current = this.store.getTask(workspaceId, taskId);
      const next: DesktopTaskRecord = current
        ? {
            ...current,
            title,
            goal,
            linkedSessionId: sessionId,
            agentId: trimText(input.agentId) ?? current.agentId,
            executionMode,
            runMode,
            status: "running",
            progress: Math.max(current.progress, 10),
            startedAt: current.startedAt ?? timestamp,
            finishedAt: undefined,
            updatedAt: timestamp,
            lastRunId: runId,
            error: undefined,
            steps: createConversationRunningSteps(current, current.startedAt ?? timestamp),
            metadata: mergeTaskMetadata(current.metadata, {
              sessionId,
              runId,
              selectedChannelId: trimText(input.selectedChannelId),
              selectedModelId: trimText(input.selectedModelId),
              selectionSnapshotEtag: trimText(input.selectionSnapshotEtag),
              ...(input.metadata ?? {}),
            }),
          }
        : {
            taskId,
            title,
            goal,
            workspaceId,
            taskType: "conversation",
            executionMode,
            runMode,
            origin: "chat",
            linkedSessionId: sessionId,
            agentId: trimText(input.agentId),
            priority: "normal",
            status: "running",
            progress: 10,
            createdAt: timestamp,
            updatedAt: timestamp,
            startedAt: timestamp,
            runCount: 0,
            lastRunId: runId,
            steps: createConversationRunningSteps({ taskId, title }, timestamp),
            metadata: mergeTaskMetadata(undefined, {
              sessionId,
              runId,
              selectedChannelId: trimText(input.selectedChannelId),
              selectedModelId: trimText(input.selectedModelId),
              selectionSnapshotEtag: trimText(input.selectionSnapshotEtag),
              ...(input.metadata ?? {}),
            }),
          };
      const classified = this.applyProjectedTaskCenterState(next);
      this.store.upsertTask(classified);
      return classified;
    });
  }

  async syncManagedConversationRootTask(
    input: DesktopManagedConversationRootTaskSyncInput,
  ): Promise<DesktopTaskRecord> {
    await this.ensureLegacyImported();
    const workspaceId = ensureWorkspaceId(input.workspaceId);
    const sessionId = ensureTaskId(input.sessionId);
    const rootTaskId = ensureTaskId(input.rootTaskId);
    const runId = ensureConversationRunId(input.runId);
    const title = trimText(input.title);
    const goal = trimText(input.goal);
    if (!title || !goal) {
      throw new DesktopTasksError("INVALID_ARGUMENT", "managed root task title and goal are required", {
        workspaceId,
        rootTaskId,
      });
    }

    const executionMode = normalizeTaskExecutionMode(input.executionMode, "background");
    const runMode = normalizeTaskRunMode(input.runMode, "hosted_autopilot");
    const status = normalizeTaskStatus(input.status, "running");
    const message = trimText(input.message);

    return this.runMutation(async () => {
      const timestamp = nowIso();
      const current = this.store.getTask(workspaceId, rootTaskId);
      const startedAt = current?.startedAt ?? timestamp;
      const progress = buildConversationTaskProgress({
        currentProgress: current?.progress,
        requestedProgress: input.progress,
        status,
      });
      const next: DesktopTaskRecord = {
        ...(current ?? {
          taskId: rootTaskId,
          workspaceId,
          taskType: "conversation" as const,
          origin: "chat" as const,
          priority: "normal" as const,
          createdAt: timestamp,
          runCount: 0,
          outputs: [],
        }),
        taskId: rootTaskId,
        title,
        goal,
        workspaceId,
        taskType: current?.taskType ?? "conversation",
        executionMode,
        runMode,
        origin: current?.origin ?? "chat",
        linkedSessionId: sessionId,
        agentId: trimText(input.agentId) ?? current?.agentId,
        priority: current?.priority ?? "normal",
        status,
        progress,
        updatedAt: timestamp,
        startedAt,
        finishedAt: status === "failed" || status === "success" ? timestamp : undefined,
        lastRunId: runId,
        error: status === "failed"
          ? {
              code: trimText(asRecord(input.metadata)?.code),
              message: message ?? current?.error?.message ?? "Managed root task failed",
            }
          : undefined,
        steps: status === "failed"
          ? createConversationFailedSteps(
              { taskId: rootTaskId, title },
              startedAt,
              timestamp,
              message ?? "Managed root task failed",
            )
          : status === "success"
            ? createConversationSuccessSteps(
                { taskId: rootTaskId, title },
                startedAt,
                timestamp,
                message ?? "Managed root task completed",
              )
            : createConversationRunningSteps(
                { taskId: rootTaskId, title },
                startedAt,
                message,
              ),
        metadata: mergeTaskMetadata(current?.metadata, {
          sessionId,
          runId,
          rootTask: true,
          rootTaskId,
          selectedChannelId: trimText(input.selectedChannelId),
          selectedModelId: trimText(input.selectedModelId),
          selectionSnapshotEtag: trimText(input.selectionSnapshotEtag),
          ...(input.metadata ?? {}),
        }),
      };

      const classified = this.applyProjectedTaskCenterState(next);
      this.store.upsertTask(classified);
      return classified;
    });
  }

  async patchManagedConversationRootTask(
    input: DesktopManagedConversationRootTaskPatchInput,
  ): Promise<DesktopTaskRecord | null> {
    await this.ensureLegacyImported();
    const workspaceId = ensureWorkspaceId(input.workspaceId);
    const rootTaskId = ensureTaskId(input.rootTaskId);

    return this.runMutation(async () => {
      const current = this.store.getTask(workspaceId, rootTaskId);
      if (!current) {
        return null;
      }

      const status = normalizeTaskStatus(input.status, current.status);
      const timestamp = nowIso();
      const message = trimText(input.message);
      const outputs = input.outputs
        ? normalizeTaskOutputs(input.outputs) ?? current.outputs
        : current.outputs;
      const startedAt = current.startedAt ?? timestamp;
      const next: DesktopTaskRecord = {
        ...current,
        linkedSessionId: trimText(input.sessionId) ?? current.linkedSessionId,
        status,
        progress: buildConversationTaskProgress({
          currentProgress: current.progress,
          requestedProgress: input.progress,
          status,
        }),
        updatedAt: timestamp,
        finishedAt: status === "success" || status === "failed" ? timestamp : undefined,
        lastRunId: trimText(input.runId) ?? current.lastRunId,
        error: status === "failed"
          ? {
              code: trimText(asRecord(input.metadata)?.code) ?? current.error?.code,
              message: message ?? current.error?.message ?? "Managed root task failed",
            }
          : undefined,
        outputs,
        steps: status === "failed"
          ? createConversationFailedSteps(
              current,
              startedAt,
              timestamp,
              message ?? current.error?.message ?? "Managed root task failed",
            )
          : status === "success"
            ? createConversationSuccessSteps(
                current,
                startedAt,
                timestamp,
                message ?? current.steps[0]?.message ?? "Managed root task completed",
              )
            : createConversationRunningSteps(
                current,
                startedAt,
                message ?? current.steps[0]?.message,
              ),
        metadata: mergeTaskMetadata(current.metadata, {
          ...(trimText(input.sessionId) ? { sessionId: trimText(input.sessionId) } : {}),
          ...(trimText(input.runId) ? { runId: trimText(input.runId) } : {}),
          ...(input.metadata ?? {}),
        }),
      };

      const classified = this.applyProjectedTaskCenterState(next);
      this.store.upsertTask(classified);
      return classified;
    });
  }

  async markConversationTaskBlocked(
    input: DesktopConversationTaskBlockedInput,
  ): Promise<DesktopTaskRecord | null> {
    await this.ensureLegacyImported();
    const workspaceId = ensureWorkspaceId(input.workspaceId);
    const runId = ensureConversationRunId(input.runId);
    const taskId = buildConversationTaskId(runId);

    return this.runMutation(async () => {
      const current = this.store.getTask(workspaceId, taskId);
      if (!current) {
        return null;
      }

      const next: DesktopTaskRecord = {
        ...current,
        status: "running",
        progress: Math.max(current.progress, 60),
        updatedAt: nowIso(),
        lastRunId: runId,
        steps: createConversationBlockedSteps(
          current,
          current.startedAt,
          trimText(input.message) ?? current.steps[0]?.message,
        ),
        metadata: mergeTaskMetadata(current.metadata, {
          waitingForInteraction: true,
          blockedInteractionId: trimText(input.interactionId),
          ...(input.metadata ?? {}),
        }),
      };
      const classified = this.applyProjectedTaskCenterState(next);
      this.store.upsertTask(classified);
      return classified;
    });
  }

  async completeConversationTask(
    input: DesktopConversationTaskCompleteInput,
  ): Promise<DesktopTaskRecord | null> {
    await this.ensureLegacyImported();
    const workspaceId = ensureWorkspaceId(input.workspaceId);
    const runId = ensureConversationRunId(input.runId);
    const taskId = buildConversationTaskId(runId);

    return this.runMutation(async () => {
      const current = this.store.getTask(workspaceId, taskId);
      if (!current) {
        return null;
      }
      if (current.status === "success" && current.lastRunId === runId && current.finishedAt) {
        return current;
      }

      const finishedAt = nowIso();
      const summary = trimText(input.summary) ?? "Conversation task completed";
      const outputs = normalizeTaskOutputs(input.outputs) ?? [{
        name: "summary",
        value: summary,
      }];
      const next: DesktopTaskRecord = {
        ...current,
        status: "success",
        progress: 100,
        runCount: current.runCount + 1,
        lastRunId: runId,
        finishedAt,
        updatedAt: finishedAt,
        error: undefined,
        outputs,
        steps: createConversationSuccessSteps(current, current.startedAt, finishedAt, summary),
        metadata: mergeTaskMetadata(current.metadata, {
          waitingForInteraction: undefined,
          blockedInteractionId: undefined,
          ...(input.metadata ?? {}),
        }),
      };

      const runRecord: DesktopTaskRunRecord = {
        runId,
        taskId: current.taskId,
        workspaceId: current.workspaceId,
        sessionId: trimText(current.linkedSessionId) ?? trimText(current.metadata?.sessionId),
        status: "success",
        executor: trimText(current.agentId) ?? "desktop.conversation",
        trigger: "manual",
        selectedChannelId: trimText(current.metadata?.selectedChannelId),
        selectedModelId: trimText(current.metadata?.selectedModelId),
        selectionSnapshotEtag: trimText(current.metadata?.selectionSnapshotEtag),
        startedAt: current.startedAt ?? finishedAt,
        finishedAt,
        input: {
          goal: current.goal,
          sessionId: current.linkedSessionId,
          agentId: current.agentId,
        },
        output: {
          summary,
          outputCount: outputs.length,
        },
      };

      const classified = this.applyProjectedTaskCenterState(next);
      this.store.upsertTask(classified);
      this.store.upsertTaskRun(runRecord);
      return classified;
    });
  }

  async failConversationTask(
    input: DesktopConversationTaskFailInput,
  ): Promise<DesktopTaskRecord | null> {
    await this.ensureLegacyImported();
    const workspaceId = ensureWorkspaceId(input.workspaceId);
    const runId = ensureConversationRunId(input.runId);
    const taskId = buildConversationTaskId(runId);
    const message = trimText(input.message);
    if (!message) {
      throw new DesktopTasksError("INVALID_ARGUMENT", "conversation task failure message is required", {
        workspaceId,
        runId,
      });
    }

    return this.runMutation(async () => {
      const current = this.store.getTask(workspaceId, taskId);
      if (!current) {
        return null;
      }
      if (current.status === "failed" && current.lastRunId === runId && current.finishedAt) {
        return current;
      }

      const finishedAt = nowIso();
      const next: DesktopTaskRecord = {
        ...current,
        status: "failed",
        progress: 0,
        runCount: current.runCount + 1,
        lastRunId: runId,
        finishedAt,
        updatedAt: finishedAt,
        error: {
          code: trimText(input.code),
          message,
        },
        steps: createConversationFailedSteps(current, current.startedAt, finishedAt, message),
        metadata: mergeTaskMetadata(current.metadata, {
          waitingForInteraction: undefined,
          blockedInteractionId: undefined,
          ...(input.metadata ?? {}),
        }),
      };

      const runRecord: DesktopTaskRunRecord = {
        runId,
        taskId: current.taskId,
        workspaceId: current.workspaceId,
        sessionId: trimText(current.linkedSessionId) ?? trimText(current.metadata?.sessionId),
        status: "failed",
        executor: trimText(current.agentId) ?? "desktop.conversation",
        trigger: "manual",
        selectedChannelId: trimText(current.metadata?.selectedChannelId),
        selectedModelId: trimText(current.metadata?.selectedModelId),
        selectionSnapshotEtag: trimText(current.metadata?.selectionSnapshotEtag),
        startedAt: current.startedAt ?? finishedAt,
        finishedAt,
        input: {
          goal: current.goal,
          sessionId: current.linkedSessionId,
          agentId: current.agentId,
        },
        error: {
          code: trimText(input.code),
          message,
        },
      };

      const classified = this.applyProjectedTaskCenterState(next);
      this.store.upsertTask(classified);
      this.store.upsertTaskRun(runRecord);
      return classified;
    });
  }

  private async ensureLegacyImported(): Promise<void> {
    if (this.legacyImported) {
      await this.ensureStoredTaskProjectionBackfilled();
      return;
    }
    if (!this.legacyImportPromise) {
      this.legacyImportPromise = this.runMutation(async () => {
        if (this.legacyImported) {
          return;
        }
        if (!this.store.isEmpty()) {
          this.legacyImported = true;
          return;
        }

        const [legacyTasks, legacyWorkspaces] = await Promise.all([
          this.loadLegacyTaskStorage(),
          this.loadLegacyWorkspaceState(),
        ]);

        const tasks = Array.isArray(legacyTasks.items)
          ? legacyTasks.items
            .map((item) => this.normalizeTaskRecord(item))
            .filter((item): item is DesktopTaskRecord => item !== null)
          : [];
        const taskIds = new Set(tasks.map((item) => `${item.workspaceId}:${item.taskId}`));
        const runs = Array.isArray(legacyTasks.runs)
          ? legacyTasks.runs
            .map((item) => this.normalizeTaskRunRecord(item))
            .filter((item): item is DesktopTaskRunRecord => {
              return item !== null && taskIds.has(`${item.workspaceId}:${item.taskId}`);
            })
          : [];
        const workspaceRows = (legacyWorkspaces ?? [])
          .flatMap((item) => {
            const workspaceId = trimText(item.workspaceId);
            const name = trimText(item.name);
            if (!workspaceId || !name) {
              return [];
            }
            return [{
              workspaceId,
              name,
              updatedAt: legacyTasks.updatedAt && trimText(legacyTasks.updatedAt)
                ? legacyTasks.updatedAt
                : nowIso(),
            }];
          });

        if (tasks.length > 0 || runs.length > 0 || workspaceRows.length > 0) {
          this.store.replaceAll({
            tasks,
            runs,
            workspaces: workspaceRows,
          });
          await this.logger.info("Desktop tasks imported from legacy state", {
            context: {
              taskCount: tasks.length,
              runCount: runs.length,
              workspaceCount: workspaceRows.length,
            },
          });
        }

        this.legacyImported = true;
      });
    }

    await this.legacyImportPromise;
    await this.ensureStoredTaskProjectionBackfilled();
  }

  private async ensureStoredTaskProjectionBackfilled(): Promise<void> {
    if (this.projectionBackfilled) {
      return;
    }

    if (!this.projectionBackfillPromise) {
      this.projectionBackfillPromise = this.runMutation(async () => {
        if (this.projectionBackfilled) {
          return;
        }

        let changedCount = 0;
        this.store.listTasks().forEach((current) => {
          if (!this.shouldBackfillTaskProjection(current)) {
            return;
          }

          const next = this.buildBackfilledTaskProjection(current);
          if (compareJsonLike(current, next)) {
            return;
          }

          this.store.upsertTask(next);
          changedCount += 1;
        });

        if (changedCount > 0) {
          await this.logger.info("Desktop task projection metadata backfilled", {
            context: {
              taskCount: changedCount,
            },
          });
        }

        this.projectionBackfilled = true;
      }).finally(() => {
        this.projectionBackfillPromise = null;
      });
    }

    await this.projectionBackfillPromise;
  }

  private async ensureManagedTasksSynced(): Promise<void> {
    if (!this.definitionsDirty && !this.syncPromise) {
      return;
    }

    if (!this.syncPromise) {
      this.syncPromise = (async () => {
        const collected = await this.collectManagedDefinitions();
        const definitionMap = new Map<string, DesktopScheduledTaskDefinition>();

        for (const item of collected) {
          definitionMap.set(
            buildManagedLookupKey(
              item.definition.workspaceId,
              item.handler.handlerId,
              item.definition.taskKey,
            ),
            item.definition,
          );
        }

        await this.runMutation(async () => {
          const storage = this.store.listTasks();
          const itemIndexByKey = new Map<string, DesktopTaskRecord>();
          const matchedStorageKeys = new Set<string>();
          let changed = false;

          storage.forEach((item) => {
            const key = buildManagedLookupKeyForTask(item);
            if (key) {
              itemIndexByKey.set(key, item);
            }
          });

          for (const item of collected) {
            const scope = resolveManagedTaskScope(item.definition);
            if (scope === "system") {
              const candidates = storage.filter((candidate) =>
                candidate.handler?.handlerId === item.handler.handlerId
                && candidate.handler?.taskKey === item.definition.taskKey
              );

              candidates.forEach((candidate) => {
                matchedStorageKeys.add(buildTaskStorageKey(candidate));
              });

              const current = this.pickCanonicalManagedTaskCandidate(candidates);
              if (!current) {
                this.store.upsertTask(this.createManagedTaskRecord(item.handler, item.definition));
                changed = true;
                continue;
              }

              const next = this.mergeManagedTaskRecord(current, item.handler, item.definition);
              if (!compareJsonLike(current, next)) {
                this.saveTaskRecord(current, next);
                changed = true;
              }

              const runningCanonical = (current.status === "running" || next.status === "running")
                ? current
                : null;

              for (const candidate of candidates) {
                if (buildTaskStorageKey(candidate) === buildTaskStorageKey(current)) {
                  continue;
                }

                if (runningCanonical) {
                  const duplicate: DesktopTaskRecord = {
                    ...candidate,
                    surface: "system",
                    visibility: "hidden",
                    scope: "system",
                    identityKey: buildManagedIdentityKey("system", item.handler.handlerId, item.definition.taskKey),
                    deferredCompaction: true,
                    updatedAt: nowIso(),
                  };
                  if (!compareJsonLike(candidate, duplicate)) {
                    this.store.upsertTask(duplicate);
                    changed = true;
                  }
                  continue;
                }

                this.deleteTaskRecord(candidate);
                changed = true;
              }
              continue;
            }

            const key = buildManagedLookupKey(
              item.definition.workspaceId,
              item.handler.handlerId,
              item.definition.taskKey,
            );
            const current = itemIndexByKey.get(key);

            if (!current) {
              this.store.upsertTask(this.createManagedTaskRecord(item.handler, item.definition));
              changed = true;
              continue;
            }

            matchedStorageKeys.add(buildTaskStorageKey(current));
            const next = this.mergeManagedTaskRecord(current, item.handler, item.definition);
            if (!compareJsonLike(current, next)) {
              this.saveTaskRecord(current, next);
              changed = true;
            }
          }

          for (const current of storage) {
            if (matchedStorageKeys.has(buildTaskStorageKey(current))) {
              continue;
            }

            const key = buildManagedLookupKeyForTask(current);
            if (!key || definitionMap.has(key)) {
              continue;
            }

            const nextSchedule = current.schedule
              ? { ...current.schedule, enabled: false }
              : current.schedule;
            if (compareJsonLike(current.schedule, nextSchedule)) {
              continue;
            }

            const next: DesktopTaskRecord = {
              ...current,
              ...(nextSchedule ? { schedule: nextSchedule } : {}),
              metadata: mergeTaskMetadata(current.metadata, {
                managedScheduleDisabledBySync: true,
              }),
              updatedAt: nowIso(),
            };
            if (!compareJsonLike(current, next)) {
              this.store.upsertTask(next);
              changed = true;
            }
          }

          if (changed) {
            await this.logger.info("Desktop managed task definitions synced", {
              context: {
                definitions: collected.length,
              },
            });
          }
        });

        this.managedDefinitions = definitionMap;
        this.definitionsDirty = false;
      })().finally(() => {
        this.syncPromise = null;
      });
    }

    return this.syncPromise;
  }

  private async collectManagedDefinitions(): Promise<CollectedManagedDefinition[]> {
    const result: CollectedManagedDefinition[] = [];
    const seen = new Set<string>();

    for (const handler of this.handlers.values()) {
      try {
        const definitions = await handler.listDefinitions();
        const items = Array.isArray(definitions) ? definitions : [];

        for (const rawItem of items) {
          const definition = normalizeManagedDefinition(rawItem);
          if (!definition) {
            await this.logger.warn("Skipped invalid scheduled task definition", {
              context: {
                handlerId: handler.handlerId,
                moduleId: handler.moduleId,
              },
            });
            continue;
          }

          const key = buildManagedLookupKey(
            definition.workspaceId,
            handler.handlerId,
            definition.taskKey,
          );
          if (seen.has(key)) {
            await this.logger.warn("Skipped duplicated scheduled task definition", {
              context: {
                handlerId: handler.handlerId,
                moduleId: handler.moduleId,
                taskKey: definition.taskKey,
                workspaceId: definition.workspaceId,
              },
            });
            continue;
          }

          seen.add(key);
          result.push({
            handler,
            definition,
          });
        }
      } catch (error) {
        await this.logger.error("Failed to enumerate scheduled task definitions", {
          context: {
            handlerId: handler.handlerId,
            moduleId: handler.moduleId,
            error: toErrorMessage(error),
          },
        });
      }
    }

    return result;
  }

  private async loadLegacyTaskStorage(): Promise<LegacyTaskStorage> {
    const paths = resolveLegacyPaths();
    try {
      const raw = await fs.readFile(paths.tasksStatePath, "utf-8");
      return JSON.parse(raw) as LegacyTaskStorage;
    } catch {
      return {};
    }
  }

  private async loadLegacyWorkspaceState(): Promise<LegacyWorkspaceState["items"]> {
    const paths = resolveLegacyPaths();
    try {
      const raw = await fs.readFile(paths.workspacesStatePath, "utf-8");
      const parsed = JSON.parse(raw) as LegacyWorkspaceState;
      return Array.isArray(parsed.items) ? parsed.items : [];
    } catch {
      return [];
    }
  }

  private normalizeTaskRecord(value: unknown): DesktopTaskRecord | null {
    const record = asRecord(value);
    if (!record) {
      return null;
    }

    const rawWorkspaceId = trimText(record.workspaceId);
    const schedule = normalizeTaskSchedule(record.schedule);
    const handler = normalizeHandlerBinding(record.handler);
    const metadata = asRecord(record.metadata) ?? undefined;
    const taskType = inferTaskType({
      explicit: record.taskType,
      linkedSessionId: trimText(record.linkedSessionId),
      schedule,
      handler,
      metadata: metadata ?? null,
    });
    const status = normalizeTaskStatus(record.status, "queued");
    const title = trimText(record.title);
    const goal = trimText(record.goal);
    const scope = record.scope === "system" || rawWorkspaceId === SYSTEM_WORKSPACE_ID
      ? "system"
      : "workspace";
    const workspaceId = scope === "system" ? SYSTEM_WORKSPACE_ID : rawWorkspaceId;

    if (!workspaceId || !title || !goal) {
      return null;
    }

    const identityKey = trimText(record.identityKey)
      ?? (scope === "system" && handler
        ? buildManagedIdentityKey(scope, handler.handlerId, handler.taskKey)
        : undefined);

    return this.applyProjectedTaskCenterState({
      taskId: trimText(record.taskId) ?? `task_${randomUUID()}`,
      title,
      goal,
      workspaceId,
      taskType,
      executionMode: inferExecutionMode({
        explicit: record.executionMode,
        taskType,
        schedule,
        handler,
      }),
      runMode: normalizeTaskRunMode(record.runMode, "normal"),
      origin: normalizeTaskOrigin(record.origin, handler ? "system" : "manual"),
      linkedSessionId: trimText(record.linkedSessionId),
      agentId: trimText(record.agentId),
      priority: normalizeTaskPriority(record.priority, "normal"),
      status,
      progress: clampProgress(record.progress, status === "success" ? 100 : 0),
      createdAt: trimText(record.createdAt) ?? nowIso(),
      updatedAt: trimText(record.updatedAt) ?? nowIso(),
      startedAt: trimText(record.startedAt),
      finishedAt: trimText(record.finishedAt),
      error: isRecord(record.error) && trimText(record.error.message)
        ? {
          code: trimText(record.error.code),
          message: trimText(record.error.message) as string,
        }
        : undefined,
      runCount: toFiniteInt(record.runCount, 0, 0),
      lastRunId: trimText(record.lastRunId),
      steps: normalizeTaskSteps(record.steps),
      outputs: normalizeTaskOutputs(record.outputs),
      schedule,
      handler,
      source: normalizeSourceRecord(record.source),
      surface: record.surface === "critical" || record.surface === "system" || record.surface === "internal"
        ? record.surface
        : scope === "system"
          ? "system"
          : undefined,
      visibility: record.visibility === "visible" || record.visibility === "hidden"
        ? record.visibility
        : scope === "system"
          ? "visible"
          : undefined,
      scope,
      identityKey,
      hiddenAt: trimText(record.hiddenAt),
      purgeAfterAt: trimText(record.purgeAfterAt),
      deferredCompaction: record.deferredCompaction === true,
      metadata,
    });
  }

  private normalizeTaskRunRecord(value: unknown): DesktopTaskRunRecord | null {
    const record = asRecord(value);
    if (!record) {
      return null;
    }

    const taskId = trimText(record.taskId);
    const workspaceId = trimText(record.workspaceId);
    if (!taskId || !workspaceId) {
      return null;
    }

    return {
      runId: trimText(record.runId) ?? `run_${randomUUID()}`,
      taskId,
      workspaceId,
      sessionId: trimText(record.sessionId),
      status: normalizeTaskRunStatus(record.status, "success"),
      executor: trimText(record.executor) ?? "desktop.tasks",
      trigger: record.trigger === "auto"
        || record.trigger === "retry"
        || record.trigger === "takeover"
        ? record.trigger
        : "manual",
      selectedChannelId: trimText(record.selectedChannelId),
      selectedModelId: trimText(record.selectedModelId),
      selectionSnapshotEtag: trimText(record.selectionSnapshotEtag),
      startedAt: trimText(record.startedAt) ?? nowIso(),
      finishedAt: trimText(record.finishedAt),
      input: asRecord(record.input) ?? undefined,
      output: asRecord(record.output) ?? undefined,
      error: isRecord(record.error) && trimText(record.error.message)
        ? {
          code: trimText(record.error.code),
          message: trimText(record.error.message) as string,
        }
        : undefined,
    };
  }

  private buildManagedTaskClassification(
    current: DesktopTaskRecord | undefined,
    handler: DesktopScheduledTaskHandler,
    definition: DesktopScheduledTaskDefinition,
  ): Pick<
    DesktopTaskRecord,
    "workspaceId" | "surface" | "visibility" | "scope" | "identityKey" | "deferredCompaction"
  > {
    const scope = resolveManagedTaskScope(definition);
    const shouldMoveToSystemWorkspace = scope === "system" && current?.status !== "running";

    return {
      workspaceId: scope === "system"
        ? shouldMoveToSystemWorkspace
          ? SYSTEM_WORKSPACE_ID
          : current?.workspaceId ?? SYSTEM_WORKSPACE_ID
        : definition.workspaceId,
      surface: scope === "system" ? "system" : current?.surface ?? "internal",
      visibility: scope === "system" ? "visible" : current?.visibility ?? "hidden",
      scope,
      identityKey: buildManagedIdentityKey(scope, handler.handlerId, definition.taskKey),
      deferredCompaction: current?.deferredCompaction ?? false,
    };
  }

  private pickCanonicalManagedTaskCandidate(
    candidates: DesktopTaskRecord[],
  ): DesktopTaskRecord | null {
    if (candidates.length === 0) {
      return null;
    }

    return candidates
      .slice()
      .sort((left, right) => {
        if (left.status === "running" && right.status !== "running") {
          return -1;
        }
        if (left.status !== "running" && right.status === "running") {
          return 1;
        }
        return compareByUpdatedAtDesc(left, right);
      })[0] ?? null;
  }

  private saveTaskRecord(current: DesktopTaskRecord | undefined, next: DesktopTaskRecord): void {
    this.store.upsertTask(next);
    if (
      current
      && buildTaskStorageKey(current) !== buildTaskStorageKey(next)
    ) {
      this.store.deleteTaskRunsByTask(current.workspaceId, current.taskId);
      this.store.deleteTask(current.workspaceId, current.taskId);
    }
  }

  private deleteTaskRecord(item: DesktopTaskRecord): void {
    this.store.deleteTaskRunsByTask(item.workspaceId, item.taskId);
    this.store.deleteTask(item.workspaceId, item.taskId);
  }

  private applyProjectedTaskCenterState(item: DesktopTaskRecord): DesktopTaskRecord {
    const projected = projectDesktopTaskRecordToTaskCenterItem(item);
    return {
      ...item,
      surface: projected.surface,
      visibility: projected.visibility,
      scope: projected.scope,
    };
  }

  private shouldBackfillTaskProjection(item: DesktopTaskRecord): boolean {
    if (!item.surface || !item.visibility || !item.scope) {
      return true;
    }

    return item.surface === "internal"
      && item.visibility === "visible"
      && item.scope !== "system"
      && item.workspaceId !== SYSTEM_WORKSPACE_ID;
  }

  private buildBackfilledTaskProjection(item: DesktopTaskRecord): DesktopTaskRecord {
    return this.applyProjectedTaskCenterState({
      ...item,
      surface: undefined,
      visibility: item.visibility === "hidden" ? "hidden" : undefined,
      scope: item.scope === "system" || item.workspaceId === SYSTEM_WORKSPACE_ID
        ? "system"
        : undefined,
    });
  }

  private resolveTaskSessionId(item: DesktopTaskRecord): string | undefined {
    return trimText(item.linkedSessionId) ?? trimText(asRecord(item.metadata)?.sessionId);
  }

  private buildArchivedTaskPurgeAfterAt(archivedAt: string): string {
    return new Date(Date.parse(archivedAt) + ARCHIVED_SESSION_RETENTION_MS).toISOString();
  }

  private compactDeferredSystemTasks(at: string): void {
    const grouped = new Map<string, DesktopTaskRecord[]>();

    this.store.listTasks().forEach((item) => {
      const identityKey = item.identityKey ?? buildManagedIdentityKeyForTask(item);
      if (!identityKey) {
        return;
      }

      if ((item.scope ?? "workspace") !== "system" && item.workspaceId !== SYSTEM_WORKSPACE_ID) {
        return;
      }

      const current = grouped.get(identityKey);
      if (current) {
        current.push({
          ...item,
          identityKey,
        });
      } else {
        grouped.set(identityKey, [{
          ...item,
          identityKey,
        }]);
      }
    });

    grouped.forEach((items, identityKey) => {
      const canonical = this.pickCanonicalManagedTaskCandidate(items);
      if (!canonical) {
        return;
      }

      if (canonical.status === "running") {
        items.forEach((item) => {
          if (buildTaskStorageKey(item) === buildTaskStorageKey(canonical)) {
            return;
          }
          const hiddenDuplicate: DesktopTaskRecord = {
            ...item,
            surface: "system",
            visibility: "hidden",
            scope: "system",
            identityKey,
            deferredCompaction: true,
            updatedAt: at,
          };
          if (!compareJsonLike(item, hiddenDuplicate)) {
            this.store.upsertTask(hiddenDuplicate);
          }
        });
        return;
      }

      const canonicalNext: DesktopTaskRecord = {
        ...canonical,
        workspaceId: SYSTEM_WORKSPACE_ID,
        surface: "system",
        visibility: "visible",
        scope: "system",
        identityKey,
        deferredCompaction: false,
        updatedAt: at,
      };
      this.saveTaskRecord(canonical, canonicalNext);

      items.forEach((item) => {
        if (buildTaskStorageKey(item) === buildTaskStorageKey(canonical)) {
          return;
        }
        this.deleteTaskRecord(item);
      });
    });
  }

  private purgeExpiredHiddenTasks(at: string): void {
    const cutoff = Date.parse(at);
    this.store.listTasks().forEach((item) => {
      if (item.visibility !== "hidden" || !item.purgeAfterAt) {
        return;
      }

      const purgeAt = Date.parse(item.purgeAfterAt);
      if (!Number.isFinite(purgeAt) || purgeAt > cutoff) {
        return;
      }

      this.deleteTaskRecord(item);
    });
  }

  private trimSystemTaskRunHistory(): void {
    this.store.listTasks().forEach((item) => {
      if ((item.scope ?? "workspace") !== "system" && item.workspaceId !== SYSTEM_WORKSPACE_ID) {
        return;
      }
      this.store.trimTaskRuns(item.workspaceId, item.taskId, SYSTEM_TASK_RUN_HISTORY_LIMIT);
    });
  }

  private createManagedTaskRecord(
    handler: DesktopScheduledTaskHandler,
    definition: DesktopScheduledTaskDefinition,
  ): DesktopTaskRecord {
    const timestamp = nowIso();
    const classification = this.buildManagedTaskClassification(undefined, handler, definition);

    return {
      taskId: `task_${randomUUID()}`,
      title: definition.title,
      goal: definition.goal,
      workspaceId: classification.workspaceId,
      taskType: "automation",
      executionMode: "background",
      runMode: "normal",
      origin: "system",
      priority: definition.priority ?? "normal",
      status: "queued",
      progress: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      runCount: 0,
      steps: [],
      surface: classification.surface,
      visibility: classification.visibility,
      scope: classification.scope,
      identityKey: classification.identityKey,
      deferredCompaction: classification.deferredCompaction,
      schedule: mergeManagedSchedule(undefined, definition.schedule),
      handler: {
        handlerId: handler.handlerId,
        moduleId: handler.moduleId,
        taskKey: definition.taskKey,
        displayName: handler.displayName,
        payload: definition.payload,
      },
      source: definition.source ?? buildDefaultManagedSource(handler),
      metadata: definition.metadata,
    };
  }

  private mergeManagedTaskRecord(
    current: DesktopTaskRecord,
    handler: DesktopScheduledTaskHandler,
    definition: DesktopScheduledTaskDefinition,
  ): DesktopTaskRecord {
    const shouldRestoreManagedSchedule =
      asRecord(current.metadata)?.managedScheduleDisabledBySync === true;
    const classification = this.buildManagedTaskClassification(current, handler, definition);
    const schedule = shouldRestoreManagedSchedule
      ? {
        kind: definition.schedule.kind,
        intervalMinutes:
          definition.schedule.kind === "interval"
            ? definition.schedule.intervalMinutes ?? 15
            : undefined,
        nextRunAt:
          definition.schedule.nextRunAt
          ?? current.schedule?.nextRunAt
          ?? defaultScheduleNextRunAt(definition.schedule),
        timezone: definition.schedule.timezone,
        enabled: definition.schedule.enabled ?? true,
      }
      : mergeManagedSchedule(current.schedule, definition.schedule);

    const candidate: DesktopTaskRecord = {
      ...current,
      workspaceId: classification.workspaceId,
      title: definition.title,
      goal: definition.goal,
      taskType: "automation",
      executionMode: "background",
      runMode: "normal",
      origin: "system",
      priority: definition.priority ?? current.priority,
      surface: classification.surface,
      visibility: classification.visibility,
      scope: classification.scope,
      identityKey: classification.identityKey,
      deferredCompaction: classification.deferredCompaction,
      schedule,
      handler: {
        handlerId: handler.handlerId,
        moduleId: handler.moduleId,
        taskKey: definition.taskKey,
        displayName: handler.displayName,
        payload: definition.payload,
      },
      source: definition.source ?? current.source ?? buildDefaultManagedSource(handler),
      metadata: mergeTaskMetadata(current.metadata, {
        ...(definition.metadata ?? {}),
        managedScheduleDisabledBySync:
          shouldRestoreManagedSchedule
            ? undefined
            : current.metadata?.managedScheduleDisabledBySync,
      }),
    };

    if (compareJsonLike(current, candidate)) {
      return current;
    }

    return {
      ...candidate,
      updatedAt: nowIso(),
    };
  }

  private async runManagedTask(
    workspaceId: string,
    taskId: string,
    trigger: DesktopTaskRunRecord["trigger"],
  ): Promise<DesktopTaskRecord | null> {
    await this.ensureLegacyImported();
    await this.ensureManagedTasksSynced();
    const started = await this.startTaskRun(workspaceId, taskId);
    if (!started) {
      return null;
    }

    const controller = new AbortController();

    try {
      const result = await started.handler.execute({
        runId: started.runId,
        workspaceId: started.task.workspaceId,
        trigger,
        task: started.task,
        definition: started.definition,
        signal: controller.signal,
      });
      const item = await this.finishTaskRunSuccess(started, result, trigger);
      await this.runMaintenanceNow();
      await this.logger.info("Desktop managed task run completed", {
        workspaceId: item.workspaceId,
        taskId: item.taskId,
        runId: item.lastRunId,
        context: {
          trigger,
          handlerId: item.handler?.handlerId,
        },
      });
      return item;
    } catch (error) {
      const item = await this.finishTaskRunFailure(started, error, trigger);
      await this.runMaintenanceNow();
      await this.logger.error("Desktop managed task run failed", {
        workspaceId: item.workspaceId,
        taskId: item.taskId,
        runId: item.lastRunId,
        context: {
          trigger,
          handlerId: item.handler?.handlerId,
          error: item.error?.message,
        },
      });
      throw new DesktopTasksError(
        "TASK_EXECUTION_FAILED",
        item.error?.message ?? toErrorMessage(error),
        {
          workspaceId: item.workspaceId,
          taskId: item.taskId,
          handlerId: item.handler?.handlerId,
          runId: item.lastRunId,
          trigger,
        },
      );
    }
  }

  private async startTaskRun(
    workspaceId: string,
    taskId: string,
  ): Promise<StartedTaskRun | null> {
    const normalizedWorkspaceId = ensureWorkspaceId(workspaceId);
    const normalizedTaskId = ensureTaskId(taskId);

    return this.runMutation(async () => {
      const current = this.store.getTask(normalizedWorkspaceId, normalizedTaskId);
      if (!current) {
        return null;
      }
      if (!current.handler) {
        throw new DesktopTasksError("HANDLER_NOT_FOUND", "task handler is not registered", {
          workspaceId: current.workspaceId,
          taskId: current.taskId,
        });
      }
      const handler = this.handlers.get(current.handler.handlerId);
      if (!handler) {
        throw new DesktopTasksError("HANDLER_NOT_FOUND", "task handler is not registered", {
          workspaceId: current.workspaceId,
          taskId: current.taskId,
          handlerId: current.handler.handlerId,
        });
      }
      const definition = current.handler
        ? this.managedDefinitions.get(
          buildManagedLookupKey(
            current.workspaceId,
            current.handler.handlerId,
            current.handler.taskKey,
          ),
        )
        : undefined;
      if (!definition) {
        throw new DesktopTasksError(
          "DEFINITION_NOT_FOUND",
          "scheduled task definition is not registered",
          {
            workspaceId: current.workspaceId,
            taskId: current.taskId,
            handlerId: current.handler.handlerId,
            taskKey: current.handler.taskKey,
          },
        );
      }
      if (current.status === "running") {
        throw new DesktopTasksError("CONFLICT", "task is already running", {
          workspaceId: current.workspaceId,
          taskId: current.taskId,
        });
      }

      const startedAt = nowIso();
      const runId = `run_${randomUUID()}`;
      const next: DesktopTaskRecord = {
        ...current,
        status: "running",
        progress: 10,
        startedAt,
        finishedAt: undefined,
        updatedAt: startedAt,
        error: undefined,
      };
      this.store.upsertTask(next);
      return {
        definition,
        handler,
        runId,
        startedAt,
        task: next,
      };
    });
  }

  private async finishTaskRunSuccess(
    started: StartedTaskRun,
    result: void | DesktopScheduledTaskExecutionResult,
    trigger: DesktopTaskRunRecord["trigger"],
  ): Promise<DesktopTaskRecord> {
    return this.runMutation(async () => {
      const current = this.store.getTask(started.task.workspaceId, started.task.taskId);
      if (!current) {
        throw new DesktopTasksError("NOT_FOUND", "task not found", {
          workspaceId: started.task.workspaceId,
          taskId: started.task.taskId,
        });
      }

      const finishedAt = nowIso();
      const executionResult = result === undefined ? undefined : result;
      const summary = buildRunSummary(started.handler, executionResult);
      const outputs = normalizeTaskOutputs(executionResult?.outputs) ?? [{
        name: "dispatch_result",
        value: summary,
      }];
      const steps = normalizeTaskSteps(executionResult?.steps);
      const next: DesktopTaskRecord = {
        ...current,
        status: "success",
        progress: 100,
        runCount: current.runCount + 1,
        lastRunId: started.runId,
        startedAt: started.startedAt,
        finishedAt,
        updatedAt: finishedAt,
        error: undefined,
        steps: steps.length > 0
          ? steps
          : createDefaultSuccessSteps(current, started.handler, finishedAt),
        outputs,
        schedule: advanceScheduleAfterRun(
          normalizeTaskSchedule(executionResult?.schedule) ?? current.schedule,
          finishedAt,
        ),
        metadata: {
          ...(asRecord(current.metadata) ?? {}),
          ...(asRecord(executionResult?.metadata) ?? {}),
        },
      };

      const runRecord: DesktopTaskRunRecord = {
        runId: started.runId,
        taskId: current.taskId,
        workspaceId: current.workspaceId,
        sessionId: trimText(current.linkedSessionId) ?? trimText(current.metadata?.sessionId),
        status: "success",
        executor: started.handler.handlerId,
        trigger,
        selectedChannelId: trimText(current.metadata?.selectedChannelId),
        selectedModelId: trimText(current.metadata?.selectedModelId),
        selectionSnapshotEtag: trimText(current.metadata?.selectionSnapshotEtag),
        startedAt: started.startedAt,
        finishedAt,
        input: {
          goal: current.goal,
          handlerId: started.handler.handlerId,
          taskKey: started.definition?.taskKey ?? current.handler?.taskKey,
        },
        output: {
          summary,
          outputCount: outputs.length,
        },
      };

      this.store.upsertTask(next);
      this.store.upsertTaskRun(runRecord);
      return next;
    });
  }

  private async finishTaskRunFailure(
    started: StartedTaskRun,
    error: unknown,
    trigger: DesktopTaskRunRecord["trigger"],
  ): Promise<DesktopTaskRecord> {
    return this.runMutation(async () => {
      const current = this.store.getTask(started.task.workspaceId, started.task.taskId);
      if (!current) {
        throw new DesktopTasksError("NOT_FOUND", "task not found", {
          workspaceId: started.task.workspaceId,
          taskId: started.task.taskId,
        });
      }
      const finishedAt = nowIso();
      const message = toErrorMessage(error);
      const next: DesktopTaskRecord = {
        ...current,
        status: "failed",
        progress: 0,
        runCount: current.runCount + 1,
        lastRunId: started.runId,
        startedAt: started.startedAt,
        finishedAt,
        updatedAt: finishedAt,
        schedule: advanceScheduleAfterRun(current.schedule, finishedAt),
        error: {
          code: error instanceof DesktopTasksError ? error.code : undefined,
          message,
        },
        steps: createDefaultFailedSteps(current, started.handler, finishedAt, message),
      };

      const runRecord: DesktopTaskRunRecord = {
        runId: started.runId,
        taskId: current.taskId,
        workspaceId: current.workspaceId,
        sessionId: trimText(current.linkedSessionId) ?? trimText(current.metadata?.sessionId),
        status: "failed",
        executor: started.handler.handlerId,
        trigger,
        selectedChannelId: trimText(current.metadata?.selectedChannelId),
        selectedModelId: trimText(current.metadata?.selectedModelId),
        selectionSnapshotEtag: trimText(current.metadata?.selectionSnapshotEtag),
        startedAt: started.startedAt,
        finishedAt,
        input: {
          goal: current.goal,
          handlerId: started.handler.handlerId,
          taskKey: started.definition?.taskKey ?? current.handler?.taskKey,
        },
        error: {
          code: error instanceof DesktopTasksError ? error.code : undefined,
          message,
        },
      };

      this.store.upsertTask(next);
      this.store.upsertTaskRun(runRecord);
      return next;
    });
  }

  private async updateScheduleEnabled(
    workspaceId: string,
    taskId: string,
    enabled: boolean,
  ): Promise<DesktopTaskRecord | null> {
    const normalizedWorkspaceId = ensureWorkspaceId(workspaceId);
    const normalizedTaskId = ensureTaskId(taskId);

    const item = await this.runMutation(async () => {
      const current = this.store.getTask(normalizedWorkspaceId, normalizedTaskId);
      if (!current) {
        return null;
      }
      if (!current.schedule) {
        throw new DesktopTasksError("INVALID_ARGUMENT", "task schedule is not configured", {
          taskId: current.taskId,
          workspaceId: current.workspaceId,
        });
      }
      const next: DesktopTaskRecord = {
        ...current,
        schedule: {
          ...current.schedule,
          enabled,
          nextRunAt: enabled
            ? current.schedule.nextRunAt ?? defaultScheduleNextRunAt(current.schedule)
            : current.schedule.nextRunAt,
        },
        updatedAt: nowIso(),
      };
      const classified = this.applyProjectedTaskCenterState(next);
      this.store.upsertTask(classified);
      return classified;
    });

    if (item) {
      await this.logger.info(
        enabled ? "Desktop task schedule resumed" : "Desktop task schedule paused",
        {
          workspaceId: item.workspaceId,
          taskId: item.taskId,
        },
      );
    }
    return item;
  }

  private async transitionTask(
    workspaceId: string,
    taskId: string,
    status: DesktopTaskStatus,
    options: {
      progress: number;
      clearRunMarkers: boolean;
    },
  ): Promise<DesktopTaskRecord | null> {
    const normalizedWorkspaceId = ensureWorkspaceId(workspaceId);
    const normalizedTaskId = ensureTaskId(taskId);

    return this.runMutation(async () => {
      const current = this.store.getTask(normalizedWorkspaceId, normalizedTaskId);
      if (!current) {
        return null;
      }
      const timestamp = nowIso();
      const next: DesktopTaskRecord = {
        ...current,
        status,
        progress: options.progress,
        updatedAt: timestamp,
        finishedAt: status === "queued" ? undefined : timestamp,
        error: status === "queued" ? undefined : current.error,
      };

      if (options.clearRunMarkers) {
        next.startedAt = undefined;
        next.finishedAt = undefined;
        next.steps = current.steps.map((step) => ({
          ...step,
          status: "pending",
          startedAt: undefined,
          finishedAt: undefined,
          message: undefined,
        }));
      }

      this.store.upsertTask(next);
      return next;
    });
  }

  private async runSchedulerTick(): Promise<void> {
    if (this.schedulerTickPromise) {
      return this.schedulerTickPromise;
    }

    this.schedulerTickPromise = (async () => {
      await this.ensureLegacyImported();
      await this.ensureManagedTasksSynced();
      const dueTasks = await this.listDueScheduledTasks(DEFAULT_SCHEDULER_BATCH_SIZE);
      for (const task of dueTasks) {
        try {
          await this.runScheduledTask(task.workspaceId, task.taskId);
        } catch (error) {
          await this.logger.error("Scheduled desktop task run failed", {
            workspaceId: task.workspaceId,
            taskId: task.taskId,
            context: {
              error: toErrorMessage(error),
            },
          });
        }
      }
      await this.runMaintenanceNow();
    })().finally(() => {
      this.schedulerTickPromise = null;
    });

    return this.schedulerTickPromise;
  }

  private matchesTaskCenterSearch(item: DesktopTaskCenterItem, keyword: string): boolean {
    return [
      item.taskId,
      item.title,
      item.summary,
      item.workspaceId,
      item.linkedSessionId,
      item.rootTaskId,
      item.handlerId,
      item.moduleId,
      item.phase,
      item.attentionReason,
    ].some((candidate) => candidate?.toLowerCase().includes(keyword));
  }

  private async runMutation<TValue>(work: () => Promise<TValue>): Promise<TValue> {
    const next = this.mutationQueue.then(work, work);
    this.mutationQueue = next.then(() => undefined, () => undefined);
    return next;
  }
}
