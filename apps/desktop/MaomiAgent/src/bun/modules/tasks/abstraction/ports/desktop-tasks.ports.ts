import type {
  DesktopConversationTaskBlockedInput,
  DesktopConversationTaskCompleteInput,
  DesktopConversationTaskFailInput,
  DesktopManagedConversationRootTaskPatchInput,
  DesktopManagedConversationRootTaskSyncInput,
  DesktopConversationTaskRunInput,
  DesktopTaskCenterListQuery,
  DesktopTaskCenterListResponse,
  DesktopScheduledTaskDefinition,
  DesktopScheduledTaskExecutionContext,
  DesktopScheduledTaskExecutionResult,
  DesktopScheduledTaskHandlerDescriptor,
  DesktopTaskDetailResponse,
  DesktopTaskListQuery,
  DesktopTaskListResponse,
  DesktopTaskRecord,
  DesktopTaskRunsResponse,
  DesktopTaskWorkspacesResponse,
} from "../models/desktop-tasks.models";

export interface DesktopScheduledTaskHandler
  extends DesktopScheduledTaskHandlerDescriptor {
  listDefinitions():
    | DesktopScheduledTaskDefinition[]
    | Promise<DesktopScheduledTaskDefinition[]>;
  execute(
    context: DesktopScheduledTaskExecutionContext,
  ):
    | void
    | DesktopScheduledTaskExecutionResult
    | Promise<void | DesktopScheduledTaskExecutionResult>;
}

export interface DesktopScheduledTaskRegistryPort {
  register(handler: DesktopScheduledTaskHandler): void;
  unregister(handlerId: string): void;
  listHandlers(): DesktopScheduledTaskHandlerDescriptor[];
}

export interface DesktopConversationTaskBridgePort {
  ensureConversationTaskRunning(input: DesktopConversationTaskRunInput): Promise<DesktopTaskRecord>;
  syncManagedConversationRootTask(input: DesktopManagedConversationRootTaskSyncInput): Promise<DesktopTaskRecord>;
  patchManagedConversationRootTask(input: DesktopManagedConversationRootTaskPatchInput): Promise<DesktopTaskRecord | null>;
  markConversationTaskBlocked(input: DesktopConversationTaskBlockedInput): Promise<DesktopTaskRecord | null>;
  completeConversationTask(input: DesktopConversationTaskCompleteInput): Promise<DesktopTaskRecord | null>;
  failConversationTask(input: DesktopConversationTaskFailInput): Promise<DesktopTaskRecord | null>;
}

export interface DesktopTasksQueryPort {
  listWorkspaces(): Promise<DesktopTaskWorkspacesResponse>;
  listTaskCenter(input?: DesktopTaskCenterListQuery): Promise<DesktopTaskCenterListResponse>;
  list(input?: DesktopTaskListQuery): Promise<DesktopTaskListResponse>;
  get(workspaceId: string, taskId: string): Promise<DesktopTaskRecord | null>;
  getDetail(input: {
    workspaceId: string;
    taskId: string;
    runLimit?: number;
    runOffset?: number;
  }): Promise<DesktopTaskDetailResponse | null>;
  listRuns(input: {
    workspaceId: string;
    taskId: string;
    limit?: number;
    offset?: number;
  }): Promise<DesktopTaskRunsResponse | null>;
}

export interface DesktopTasksCommandPort {
  runNow(workspaceId: string, taskId: string): Promise<DesktopTaskRecord | null>;
  cancel(workspaceId: string, taskId: string): Promise<DesktopTaskRecord | null>;
  retry(workspaceId: string, taskId: string): Promise<DesktopTaskRecord | null>;
  pauseSchedule(workspaceId: string, taskId: string): Promise<DesktopTaskRecord | null>;
  resumeSchedule(workspaceId: string, taskId: string): Promise<DesktopTaskRecord | null>;
}

export type DesktopTasksPort = DesktopTasksQueryPort & DesktopTasksCommandPort;