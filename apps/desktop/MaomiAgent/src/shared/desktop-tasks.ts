export const DESKTOP_TASK_STATUS_VALUES = [
  "queued",
  "running",
  "success",
  "failed",
  "cancelled",
] as const;

export const DESKTOP_TASK_PRIORITY_VALUES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;

export const DESKTOP_TASK_TYPE_VALUES = [
  "conversation",
  "execution",
  "automation",
] as const;

export const DESKTOP_TASK_EXECUTION_MODE_VALUES = [
  "interactive",
  "background",
] as const;

export const DESKTOP_TASK_RUN_MODE_VALUES = [
  "normal",
  "long_task_orchestration",
  "hosted_autopilot",
] as const;

export const DESKTOP_TASK_ORIGIN_VALUES = [
  "chat",
  "manual",
  "system",
] as const;

export const DESKTOP_TASK_SCHEDULE_KIND_VALUES = [
  "once",
  "interval",
] as const;

export const DESKTOP_TASK_STEP_STATUS_VALUES = [
  "pending",
  "running",
  "success",
  "failed",
  "cancelled",
] as const;

export const DESKTOP_TASK_RUN_STATUS_VALUES = [
  "running",
  "success",
  "failed",
  "cancelled",
] as const;

export const DESKTOP_TASK_SOURCE_OWNER_KIND_VALUES = [
  "builtin",
  "module",
  "system",
  "external",
] as const;
export const DESKTOP_TASK_SURFACE_VALUES = [
  "critical",
  "system",
  "internal",
] as const;
export const DESKTOP_TASK_SCOPE_VALUES = [
  "workspace",
  "system",
] as const;
export const DESKTOP_TASK_VISIBILITY_VALUES = [
  "visible",
  "hidden",
] as const;

export type DesktopTaskStatus = (typeof DESKTOP_TASK_STATUS_VALUES)[number];
export type DesktopTaskPriority = (typeof DESKTOP_TASK_PRIORITY_VALUES)[number];
export type DesktopTaskType = (typeof DESKTOP_TASK_TYPE_VALUES)[number];
export type DesktopTaskExecutionMode =
  (typeof DESKTOP_TASK_EXECUTION_MODE_VALUES)[number];
export type DesktopTaskRunMode = (typeof DESKTOP_TASK_RUN_MODE_VALUES)[number];
export type DesktopTaskOrigin = (typeof DESKTOP_TASK_ORIGIN_VALUES)[number];
export type DesktopTaskScheduleKind =
  (typeof DESKTOP_TASK_SCHEDULE_KIND_VALUES)[number];
export type DesktopTaskStepStatus =
  (typeof DESKTOP_TASK_STEP_STATUS_VALUES)[number];
export type DesktopTaskRunStatus =
  (typeof DESKTOP_TASK_RUN_STATUS_VALUES)[number];
export type DesktopTaskSourceOwnerKind =
  (typeof DESKTOP_TASK_SOURCE_OWNER_KIND_VALUES)[number];
export type DesktopTaskSurface = (typeof DESKTOP_TASK_SURFACE_VALUES)[number];
export type DesktopTaskScope = (typeof DESKTOP_TASK_SCOPE_VALUES)[number];
export type DesktopTaskVisibility =
  (typeof DESKTOP_TASK_VISIBILITY_VALUES)[number];

export type DesktopTaskSchedule = {
  kind: DesktopTaskScheduleKind;
  intervalMinutes?: number;
  nextRunAt?: string;
  timezone?: string;
  enabled?: boolean;
};

export type DesktopTaskManagedHandlerBinding = {
  handlerId: string;
  moduleId: string;
  taskKey: string;
  displayName?: string;
  payload?: Record<string, unknown>;
};

export type DesktopTaskSourceRecord = {
  ownerKind?: DesktopTaskSourceOwnerKind;
  ownerId?: string;
};

export type DesktopTaskStep = {
  stepId: string;
  title: string;
  agentId?: string;
  status: DesktopTaskStepStatus;
  message?: string;
  startedAt?: string;
  finishedAt?: string;
};

export type DesktopTaskOutput = {
  name: string;
  value: string;
};

export type DesktopTaskRecord = {
  taskId: string;
  title: string;
  goal: string;
  workspaceId: string;
  taskType: DesktopTaskType;
  executionMode: DesktopTaskExecutionMode;
  runMode: DesktopTaskRunMode;
  origin: DesktopTaskOrigin;
  linkedSessionId?: string;
  agentId?: string;
  priority: DesktopTaskPriority;
  status: DesktopTaskStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  surface?: DesktopTaskSurface;
  visibility?: DesktopTaskVisibility;
  scope?: DesktopTaskScope;
  identityKey?: string;
  hiddenAt?: string;
  purgeAfterAt?: string;
  deferredCompaction?: boolean;
  error?: {
    code?: string;
    message: string;
  };
  runCount: number;
  lastRunId?: string;
  steps: DesktopTaskStep[];
  outputs?: DesktopTaskOutput[];
  schedule?: DesktopTaskSchedule;
  handler?: DesktopTaskManagedHandlerBinding;
  source?: DesktopTaskSourceRecord;
  metadata?: Record<string, unknown>;
};

export type DesktopTaskRunTrigger = "manual" | "auto" | "retry" | "takeover";

export type DesktopTaskRunRecord = {
  runId: string;
  taskId: string;
  workspaceId: string;
  sessionId?: string;
  status: DesktopTaskRunStatus;
  executor: string;
  trigger: DesktopTaskRunTrigger;
  selectedChannelId?: string;
  selectedModelId?: string;
  selectionSnapshotEtag?: string;
  startedAt: string;
  finishedAt?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: {
    code?: string;
    message: string;
  };
};

export type DesktopTaskWorkspaceSummary = {
  workspaceId: string;
  name: string;
  taskCount: number;
  lastTaskAt?: string;
};

export type DesktopTaskListQuery = {
  workspaceId?: string;
  rootTaskId?: string;
  status?: DesktopTaskStatus | "all";
  q?: string;
  limit?: number;
  offset?: number;
};

export type DesktopTaskRunsQuery = {
  limit?: number;
  offset?: number;
};

export type DesktopTaskListResponse = {
  items: DesktopTaskRecord[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

export type DesktopTaskRunsResponse = {
  items: DesktopTaskRunRecord[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

export type DesktopTaskWorkspacesResponse = {
  items: DesktopTaskWorkspaceSummary[];
};

export type DesktopTaskDetailQuery = {
  workspaceId: string;
  taskId: string;
  runLimit?: number;
  runOffset?: number;
};

export type DesktopTaskRunsListQuery = {
  workspaceId: string;
  taskId: string;
  limit?: number;
  offset?: number;
};

export type DesktopTaskActionInput = {
  workspaceId: string;
  taskId: string;
};

export type DesktopTaskDetailResponse = {
  item: DesktopTaskRecord;
  runs: DesktopTaskRunRecord[];
  runsMeta: DesktopTaskRunsResponse["meta"];
};

export type DesktopTaskMutationAction =
  | "task.created"
  | "task.updated"
  | "task.deleted"
  | "task.runNow"
  | "task.cancelled"
  | "task.retry"
  | "task.schedulePaused"
  | "task.scheduleResumed";

export type DesktopTaskMutationEvent = {
  action: DesktopTaskMutationAction;
  workspaceId: string;
  taskId: string;
  at: string;
};
