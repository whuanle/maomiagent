import type {
  DesktopTaskDetailQuery,
  DesktopTaskDetailResponse,
  DesktopTaskListQuery,
  DesktopTaskListResponse,
  DesktopTaskMutationAction,
  DesktopTaskMutationEvent,
  DesktopTaskRecord,
  DesktopTaskRunsListQuery,
  DesktopTaskRunsResponse,
  DesktopTaskWorkspacesResponse,
} from "../../shared/desktop-tasks";
import type {
  DesktopTaskCenterListQuery,
  DesktopTaskCenterListResponse,
} from "../../shared/desktop-task-center";
import { DESKTOP_WINDOW_BRIDGE_READY_EVENT } from "./desktop-window";

type DesktopTasksBridge = {
  listDesktopTaskWorkspaces: () => Promise<DesktopTaskWorkspacesResponse>;
  listDesktopTaskCenter: (query?: DesktopTaskCenterListQuery) => Promise<DesktopTaskCenterListResponse>;
  listDesktopTasks: (query?: DesktopTaskListQuery) => Promise<DesktopTaskListResponse>;
  getDesktopTask: (workspaceId: string, taskId: string) => Promise<DesktopTaskRecord | null>;
  getDesktopTaskDetail: (
    query: DesktopTaskDetailQuery,
  ) => Promise<DesktopTaskDetailResponse | null>;
  listDesktopTaskRuns: (
    query: DesktopTaskRunsListQuery,
  ) => Promise<DesktopTaskRunsResponse | null>;
  runDesktopTaskNow: (workspaceId: string, taskId: string) => Promise<DesktopTaskRecord | null>;
  cancelDesktopTask: (workspaceId: string, taskId: string) => Promise<DesktopTaskRecord | null>;
  retryDesktopTask: (workspaceId: string, taskId: string) => Promise<DesktopTaskRecord | null>;
  pauseDesktopTaskSchedule: (
    workspaceId: string,
    taskId: string,
  ) => Promise<DesktopTaskRecord | null>;
  resumeDesktopTaskSchedule: (
    workspaceId: string,
    taskId: string,
  ) => Promise<DesktopTaskRecord | null>;
};

declare global {
  interface Window {
    maomiDesktopTasks?: DesktopTasksBridge;
  }
}

export const DESKTOP_TASKS_BRIDGE_READY_EVENT = DESKTOP_WINDOW_BRIDGE_READY_EVENT;
export const DESKTOP_TASKS_INVALIDATED_EVENT = "maomi:desktop-tasks-invalidated";

function getDesktopTasksBridge(): DesktopTasksBridge {
  const bridge = window.maomiDesktopTasks;
  if (!bridge) {
    throw new Error("Desktop tasks bridge is unavailable.");
  }

  return bridge;
}

function emitDesktopTasksInvalidated(
  action: DesktopTaskMutationAction,
  item: Pick<DesktopTaskRecord, "workspaceId" | "taskId">,
): void {
  const detail: DesktopTaskMutationEvent = {
    action,
    workspaceId: item.workspaceId,
    taskId: item.taskId,
    at: new Date().toISOString(),
  };

  window.dispatchEvent(
    new CustomEvent<DesktopTaskMutationEvent>(DESKTOP_TASKS_INVALIDATED_EVENT, {
      detail,
    }),
  );
}

async function runMutation(
  action: DesktopTaskMutationAction,
  request: () => Promise<DesktopTaskRecord | null>,
): Promise<DesktopTaskRecord | null> {
  const item = await request();
  if (item) {
    emitDesktopTasksInvalidated(action, item);
  }
  return item;
}

export function hasDesktopTasksBridge(): boolean {
  return Boolean(window.maomiDesktopTasks);
}

export function listDesktopTaskWorkspaces(): Promise<DesktopTaskWorkspacesResponse> {
  return getDesktopTasksBridge().listDesktopTaskWorkspaces();
}

export function listDesktopTaskCenter(
  query: DesktopTaskCenterListQuery = {},
): Promise<DesktopTaskCenterListResponse> {
  return getDesktopTasksBridge().listDesktopTaskCenter(query);
}

export function listDesktopTasks(
  query: DesktopTaskListQuery = {},
): Promise<DesktopTaskListResponse> {
  return getDesktopTasksBridge().listDesktopTasks(query);
}

export function getDesktopTask(
  workspaceId: string,
  taskId: string,
): Promise<DesktopTaskRecord | null> {
  return getDesktopTasksBridge().getDesktopTask(workspaceId, taskId);
}

export function getDesktopTaskDetail(
  query: DesktopTaskDetailQuery,
): Promise<DesktopTaskDetailResponse | null> {
  return getDesktopTasksBridge().getDesktopTaskDetail(query);
}

export function listDesktopTaskRuns(
  query: DesktopTaskRunsListQuery,
): Promise<DesktopTaskRunsResponse | null> {
  return getDesktopTasksBridge().listDesktopTaskRuns(query);
}

export function runDesktopTaskNow(
  workspaceId: string,
  taskId: string,
): Promise<DesktopTaskRecord | null> {
  return runMutation("task.runNow", () => {
    return getDesktopTasksBridge().runDesktopTaskNow(workspaceId, taskId);
  });
}

export function cancelDesktopTask(
  workspaceId: string,
  taskId: string,
): Promise<DesktopTaskRecord | null> {
  return runMutation("task.cancelled", () => {
    return getDesktopTasksBridge().cancelDesktopTask(workspaceId, taskId);
  });
}

export function retryDesktopTask(
  workspaceId: string,
  taskId: string,
): Promise<DesktopTaskRecord | null> {
  return runMutation("task.retry", () => {
    return getDesktopTasksBridge().retryDesktopTask(workspaceId, taskId);
  });
}

export function pauseDesktopTaskSchedule(
  workspaceId: string,
  taskId: string,
): Promise<DesktopTaskRecord | null> {
  return runMutation("task.schedulePaused", () => {
    return getDesktopTasksBridge().pauseDesktopTaskSchedule(workspaceId, taskId);
  });
}

export function resumeDesktopTaskSchedule(
  workspaceId: string,
  taskId: string,
): Promise<DesktopTaskRecord | null> {
  return runMutation("task.scheduleResumed", () => {
    return getDesktopTasksBridge().resumeDesktopTaskSchedule(workspaceId, taskId);
  });
}