import type { TagProps } from "antd";

import type {
  DesktopTaskRecord,
  DesktopTaskRunRecord,
  DesktopTaskStatus,
  DesktopTaskStepStatus,
  DesktopTaskType,
} from "../../../shared/desktop-tasks";
import type { TasksTranslate as Translate } from "./i18n";

export type TaskActionName =
  | "runNow"
  | "cancel"
  | "retry"
  | "pauseSchedule"
  | "resumeSchedule";

export type TaskScheduleFilter =
  | "all"
  | "scheduled"
  | "unscheduled"
  | "active"
  | "paused";

export type TaskTypeFilter =
  | "all"
  | DesktopTaskType;

export type TaskScopeFilter =
  | "root"
  | "all";

export type TaskLevel =
  | "root"
  | "child"
  | "standalone";

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function formatDateTime(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export function formatIdText(value: string | undefined): string {
  if (!value) {
    return "-";
  }
  return value.length > 20 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

export function buildTaskRowKey(
  item: Pick<DesktopTaskRecord, "workspaceId" | "taskId">,
): string {
  return `${item.workspaceId}:${item.taskId}`;
}

export function buildTaskActionKey(
  item: Pick<DesktopTaskRecord, "workspaceId" | "taskId">,
  action: TaskActionName,
): string {
  return `${action}:${buildTaskRowKey(item)}`;
}

export function formatGoalSummary(value: string | undefined): string {
  const text = value?.trim();
  if (!text) {
    return "-";
  }

  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}

export function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function matchesTaskSearch(item: DesktopTaskRecord, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalized = query.trim().toLowerCase();
  if (!normalized) {
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
    typeof item.metadata?.sessionId === "string" ? item.metadata.sessionId : undefined,
  ].some((candidate) => candidate?.toLowerCase().includes(normalized));
}

export function isRootTask(item: DesktopTaskRecord): boolean {
  if (item.metadata?.rootTask === true) {
    return true;
  }

  return typeof item.metadata?.rootTaskId === "string"
    && item.metadata.rootTaskId === item.taskId;
}

export function matchesTaskScopeFilter(item: DesktopTaskRecord, filter: TaskScopeFilter): boolean {
  return filter === "all" ? true : isRootTask(item);
}

export function hasTaskSchedule(item: DesktopTaskRecord): boolean {
  return Boolean(item.schedule);
}

export function isTaskScheduleEnabled(item: DesktopTaskRecord): boolean {
  return item.schedule?.enabled !== false;
}

export function isTaskSchedulePaused(item: DesktopTaskRecord): boolean {
  return Boolean(item.schedule) && item.schedule?.enabled === false;
}

export function matchesTaskScheduleFilter(
  item: DesktopTaskRecord,
  filter: TaskScheduleFilter,
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "scheduled") {
    return hasTaskSchedule(item);
  }
  if (filter === "unscheduled") {
    return !hasTaskSchedule(item);
  }
  if (filter === "active") {
    return hasTaskSchedule(item) && isTaskScheduleEnabled(item);
  }
  return isTaskSchedulePaused(item);
}

export function matchesTaskTypeFilter(item: DesktopTaskRecord, filter: TaskTypeFilter): boolean {
  return filter === "all" ? true : item.taskType === filter;
}

export function canRunTaskNowFromTasksPage(item: DesktopTaskRecord): boolean {
  return hasTaskSchedule(item);
}

export function canRetryTaskFromTasksPage(item: DesktopTaskRecord): boolean {
  return hasTaskSchedule(item);
}

export function canCancelTaskFromTasksPage(item: DesktopTaskRecord): boolean {
  return item.status === "queued" || item.status === "running";
}

export function taskStatusLabel(t: Translate, status: DesktopTaskStatus): string {
  return t(`任务页.值.状态.${status}` as const);
}

export function taskStepStatusLabel(t: Translate, status: DesktopTaskStepStatus): string {
  return t(`任务页.值.步骤状态.${status}` as const);
}

export function taskStatusTagColor(
  status: DesktopTaskStatus | DesktopTaskRunRecord["status"],
): TagProps["color"] {
  if (status === "running") {
    return "processing";
  }
  if (status === "success") {
    return "success";
  }
  if (status === "failed") {
    return "error";
  }
  if (status === "cancelled") {
    return "default";
  }
  return "warning";
}

export function taskTypeLabel(t: Translate, value: DesktopTaskRecord["taskType"]): string {
  return t(`任务页.值.taskType.${value}` as const);
}

export function executionModeLabel(
  t: Translate,
  value: DesktopTaskRecord["executionMode"],
): string {
  return t(`任务页.值.executionMode.${value}` as const);
}

export function priorityLabel(t: Translate, value: DesktopTaskRecord["priority"]): string {
  return t(`任务页.值.priority.${value}` as const);
}

export function taskRunModeLabel(t: Translate, value: DesktopTaskRecord["runMode"]): string {
  return t(`任务页.值.runMode.${value}` as const);
}

export function taskPhase(item: DesktopTaskRecord): string | undefined {
  return typeof item.metadata?.phase === "string" ? item.metadata.phase : undefined;
}

export function taskPhaseLabel(t: Translate, item: DesktopTaskRecord): string {
  const phase = taskPhase(item);
  return phase || t("任务页.值.未设置");
}

export function taskBlockedReason(item: DesktopTaskRecord): string | undefined {
  return typeof item.metadata?.blockedReason === "string"
    ? item.metadata.blockedReason
    : undefined;
}

export function taskRootTaskId(item: DesktopTaskRecord): string | undefined {
  if (typeof item.metadata?.rootTaskId === "string" && item.metadata.rootTaskId.trim()) {
    return item.metadata.rootTaskId;
  }

  return isRootTask(item) ? item.taskId : undefined;
}

export function taskLevel(item: DesktopTaskRecord): TaskLevel {
  if (isRootTask(item)) {
    return "root";
  }

  return taskRootTaskId(item) ? "child" : "standalone";
}

export function taskLevelLabel(t: Translate, item: DesktopTaskRecord): string {
  return t(`任务页.值.taskLevel.${taskLevel(item)}` as const);
}

export function sourceOwnerLabel(t: Translate, item: DesktopTaskRecord): string {
  const ownerKind = item.source?.ownerKind;
  const ownerId = item.source?.ownerId;
  if (!ownerKind && !ownerId) {
    return "-";
  }

  const kindLabel = ownerKind
    ? t(`任务页.值.sourceOwnerKind.${ownerKind}` as const)
    : "-";
  return ownerId ? `${kindLabel} / ${ownerId}` : kindLabel;
}

export function taskScheduleLabel(t: Translate, item: DesktopTaskRecord): string {
  if (!item.schedule) {
    return t("任务页.值.schedule.none");
  }
  if (item.schedule.kind === "interval") {
    return t("任务页.值.schedule.interval", {
      分钟: String(item.schedule.intervalMinutes ?? 15),
    });
  }
  return t("任务页.值.schedule.once");
}

export function taskScheduleStateLabel(t: Translate, item: DesktopTaskRecord): string {
  if (!item.schedule) {
    return t("任务页.值.schedule.none");
  }
  return item.schedule.enabled === false
    ? t("任务页.值.schedule.paused")
    : t("任务页.值.schedule.active");
}

export function taskHandlerLabel(item: DesktopTaskRecord): string {
  return item.handler?.displayName || item.handler?.handlerId || "-";
}

export function taskHandlerIdLabel(item: DesktopTaskRecord): string {
  return item.handler?.handlerId || "-";
}

export function taskModuleLabel(item: DesktopTaskRecord): string {
  return item.handler?.moduleId || item.source?.ownerId || "-";
}

export function taskDefinitionKeyLabel(item: DesktopTaskRecord): string {
  return item.handler?.taskKey || "-";
}

export function taskNextRunAtLabel(item: DesktopTaskRecord): string {
  return formatDateTime(item.schedule?.nextRunAt);
}

export function runTriggerLabel(t: Translate, value: DesktopTaskRunRecord["trigger"]): string {
  return t(`任务页.值.trigger.${value}` as const);
}