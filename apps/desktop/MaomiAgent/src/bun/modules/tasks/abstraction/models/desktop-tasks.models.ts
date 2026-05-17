export type {
  DesktopTaskActionInput,
  DesktopTaskDetailQuery,
  DesktopTaskDetailResponse,
  DesktopTaskExecutionMode,
  DesktopTaskManagedHandlerBinding,
  DesktopTaskListQuery,
  DesktopTaskListResponse,
  DesktopTaskOrigin,
  DesktopTaskOutput,
  DesktopTaskPriority,
  DesktopTaskRecord,
  DesktopTaskRunMode,
  DesktopTaskRunRecord,
  DesktopTaskRunsListQuery,
  DesktopTaskRunsQuery,
  DesktopTaskRunsResponse,
  DesktopTaskRunStatus,
  DesktopTaskSchedule,
  DesktopTaskSourceRecord,
  DesktopTaskStatus,
  DesktopTaskStep,
  DesktopTaskStepStatus,
  DesktopTaskType,
  DesktopTaskWorkspaceSummary,
  DesktopTaskWorkspacesResponse,
} from "../../../../../shared/desktop-tasks";
export type {
  DesktopTaskCenterAttentionState,
  DesktopTaskCenterExposure,
  DesktopTaskCenterItem,
  DesktopTaskCenterListQuery,
  DesktopTaskCenterListResponse,
  DesktopTaskCenterSourceKind,
} from "../../../../../shared/desktop-task-center";

import type {
  DesktopTaskExecutionMode,
  DesktopTaskOutput,
  DesktopTaskPriority,
  DesktopTaskRecord,
  DesktopTaskRunMode,
  DesktopTaskRunRecord,
  DesktopTaskSchedule,
  DesktopTaskSourceRecord,
  DesktopTaskStatus,
  DesktopTaskStep,
} from "../../../../../shared/desktop-tasks";

export type DesktopConversationTaskRunInput = {
  workspaceId: string;
  sessionId: string;
  runId: string;
  title: string;
  goal: string;
  agentId?: string;
  executionMode?: DesktopTaskExecutionMode;
  runMode?: DesktopTaskRunMode;
  selectedChannelId?: string;
  selectedModelId?: string;
  selectionSnapshotEtag?: string;
  metadata?: Record<string, unknown>;
};

export type DesktopManagedConversationRootTaskSyncInput = {
  workspaceId: string;
  sessionId: string;
  rootTaskId: string;
  runId: string;
  title: string;
  goal: string;
  agentId?: string;
  executionMode?: DesktopTaskExecutionMode;
  runMode?: DesktopTaskRunMode;
  status?: DesktopTaskStatus;
  progress?: number;
  message?: string;
  selectedChannelId?: string;
  selectedModelId?: string;
  selectionSnapshotEtag?: string;
  metadata?: Record<string, unknown>;
};

export type DesktopManagedConversationRootTaskPatchInput = {
  workspaceId: string;
  rootTaskId: string;
  sessionId?: string;
  runId?: string;
  status?: DesktopTaskStatus;
  progress?: number;
  message?: string;
  outputs?: DesktopTaskOutput[];
  metadata?: Record<string, unknown>;
};

export type DesktopConversationTaskBlockedInput = {
  workspaceId: string;
  runId: string;
  interactionId?: string;
  message?: string;
  metadata?: Record<string, unknown>;
};

export type DesktopConversationTaskCompleteInput = {
  workspaceId: string;
  runId: string;
  summary?: string;
  outputs?: DesktopTaskOutput[];
  metadata?: Record<string, unknown>;
};

export type DesktopConversationTaskFailInput = {
  workspaceId: string;
  runId: string;
  code?: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export type DesktopScheduledTaskDefinition = {
  taskKey: string;
  workspaceId: string;
  title: string;
  goal: string;
  schedule: DesktopTaskSchedule;
  priority?: DesktopTaskPriority;
  payload?: Record<string, unknown>;
  source?: DesktopTaskSourceRecord;
  metadata?: Record<string, unknown>;
};

export type DesktopScheduledTaskExecutionContext = {
  runId: string;
  workspaceId: string;
  trigger: DesktopTaskRunRecord["trigger"];
  task: DesktopTaskRecord;
  definition?: DesktopScheduledTaskDefinition;
  signal: AbortSignal;
};

export type DesktopScheduledTaskExecutionResult = {
  summary?: string;
  outputs?: DesktopTaskOutput[];
  steps?: DesktopTaskStep[];
  schedule?: DesktopTaskSchedule;
  metadata?: Record<string, unknown>;
};

export type DesktopScheduledTaskHandlerDescriptor = {
  handlerId: string;
  moduleId: string;
  displayName?: string;
};