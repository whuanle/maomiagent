import type {
  DesktopTaskCenterAttentionState,
  DesktopTaskCenterItem,
  DesktopTaskCenterSourceKind,
} from "../../../shared/desktop-task-center";
import type { TasksTranslate as Translate } from "./i18n";
import { formatDateTime } from "./helpers";

export type TaskCenterSourceFilter = "all" | DesktopTaskCenterSourceKind;

export type TaskCenterAttentionFilter = "all" | DesktopTaskCenterAttentionState;

export type TaskCenterPageTab = "conversation" | "automation" | "execution";

export type TaskCenterConversationStatusFilter = "active" | "failed" | "attention" | "all";

export type TaskCenterConversationSessionRow = {
  sessionKey: string;
  sessionId: string;
  workspaceId: string;
  taskCount: number;
  activeTaskCount: number;
  failedTaskCount: number;
  attentionTaskCount: number;
  titles: string[];
  updatedAt: string;
  representativeTask: DesktopTaskCenterItem;
};

const TASK_CENTER_LIFECYCLE_WEIGHTS: Record<DesktopTaskCenterItem["lifecycleStatus"], number> = {
  running: 600,
  queued: 520,
  failed: 420,
  success: 0,
  cancelled: -40,
};

const TASK_CENTER_ATTENTION_WEIGHTS: Record<DesktopTaskCenterAttentionState, number> = {
  takeover_required: 500,
  verification_required: 480,
  wrap_up_required: 460,
  blocked: 440,
  failed: 420,
  scheduled: 200,
  background: 120,
  none: 0,
};

export function matchesTaskCenterSearch(item: DesktopTaskCenterItem, query: string): boolean {
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
    item.summary,
    item.workspaceId,
    item.linkedSessionId,
    item.rootTaskId,
    item.handlerId,
    item.moduleId,
    item.attentionReason,
  ].some((candidate) => candidate?.toLowerCase().includes(normalized));
}

export function isTaskCenterRootTask(item: DesktopTaskCenterItem): boolean {
  return Boolean(item.rootTaskId) && item.rootTaskId === item.taskId;
}

export function matchesTaskCenterScopeFilter(
  item: DesktopTaskCenterItem,
  filter: "root" | "all",
): boolean {
  return filter === "all" ? true : isTaskCenterRootTask(item);
}

export function hasTaskCenterSchedule(item: DesktopTaskCenterItem): boolean {
  return item.hasSchedule;
}

export function isTaskCenterScheduleEnabled(item: DesktopTaskCenterItem): boolean {
  return item.hasSchedule && item.scheduleEnabled;
}

export function isTaskCenterSchedulePaused(item: DesktopTaskCenterItem): boolean {
  return item.hasSchedule && !item.scheduleEnabled;
}

export function matchesTaskCenterScheduleFilter(
  item: DesktopTaskCenterItem,
  filter: "all" | "scheduled" | "unscheduled" | "active" | "paused",
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "scheduled") {
    return hasTaskCenterSchedule(item);
  }
  if (filter === "unscheduled") {
    return !hasTaskCenterSchedule(item);
  }
  if (filter === "active") {
    return isTaskCenterScheduleEnabled(item);
  }
  return isTaskCenterSchedulePaused(item);
}

export function matchesTaskCenterSourceFilter(
  item: DesktopTaskCenterItem,
  filter: TaskCenterSourceFilter,
): boolean {
  return filter === "all" ? true : item.sourceKind === filter;
}

export function matchesTaskCenterAttentionFilter(
  item: DesktopTaskCenterItem,
  filter: TaskCenterAttentionFilter,
): boolean {
  return filter === "all" ? true : item.attentionState === filter;
}

export function isTaskCenterActive(item: DesktopTaskCenterItem): boolean {
  return item.lifecycleStatus === "running" || item.lifecycleStatus === "queued";
}

export function needsForegroundTaskCenterAttention(item: DesktopTaskCenterItem): boolean {
  return item.attentionState === "blocked"
    || item.attentionState === "takeover_required"
    || item.attentionState === "verification_required"
    || item.attentionState === "wrap_up_required"
    || item.attentionState === "failed";
}

export function resolveTaskCenterPageTab(item: DesktopTaskCenterItem): TaskCenterPageTab {
  if (item.linkedSessionId) {
    return "conversation";
  }

  if (item.sourceKind === "automation") {
    return "automation";
  }

  return "execution";
}

export function shouldDisplayConversationTaskCenterItem(item: DesktopTaskCenterItem): boolean {
  if (!item.linkedSessionId?.trim()) {
    return false;
  }

  if (item.lifecycleStatus === "success" || item.lifecycleStatus === "cancelled") {
    return false;
  }

  return isTaskCenterActive(item)
    || item.lifecycleStatus === "failed"
    || needsForegroundTaskCenterAttention(item);
}

export function shouldDisplayTaskCenterOperationalItem(item: DesktopTaskCenterItem): boolean {
  if (hasTaskCenterSchedule(item)) {
    return true;
  }

  if (resolveTaskCenterPageTab(item) === "conversation") {
    return shouldDisplayConversationTaskCenterItem(item);
  }

  return isTaskCenterActive(item)
    || item.lifecycleStatus === "failed"
    || needsForegroundTaskCenterAttention(item);
}

export function canRunTaskCenterNow(item: DesktopTaskCenterItem): boolean {
  return item.hasSchedule;
}

export function canRetryTaskCenter(item: DesktopTaskCenterItem): boolean {
  return item.hasSchedule;
}

export function canCancelTaskCenter(item: DesktopTaskCenterItem): boolean {
  return item.lifecycleStatus === "queued" || item.lifecycleStatus === "running";
}

export function needsTaskCenterContextEntry(item: DesktopTaskCenterItem): boolean {
  return item.attentionState === "takeover_required"
    || item.attentionState === "verification_required"
    || item.attentionState === "wrap_up_required"
    || item.attentionState === "blocked"
    || item.attentionState === "failed";
}

export function compareTaskCenterAttention(
  left: DesktopTaskCenterItem,
  right: DesktopTaskCenterItem,
): number {
  const weightDelta =
    TASK_CENTER_ATTENTION_WEIGHTS[right.attentionState]
    - TASK_CENTER_ATTENTION_WEIGHTS[left.attentionState];
  if (weightDelta !== 0) {
    return weightDelta;
  }

  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
}

export function compareTaskCenterDisplayOrder(
  left: DesktopTaskCenterItem,
  right: DesktopTaskCenterItem,
): number {
  const lifecycleDelta =
    TASK_CENTER_LIFECYCLE_WEIGHTS[right.lifecycleStatus]
    - TASK_CENTER_LIFECYCLE_WEIGHTS[left.lifecycleStatus];
  if (lifecycleDelta !== 0) {
    return lifecycleDelta;
  }

  return compareTaskCenterAttention(left, right);
}

export function buildTaskCenterConversationSessionRows(
  items: DesktopTaskCenterItem[],
): TaskCenterConversationSessionRow[] {
  const grouped = new Map<string, DesktopTaskCenterItem[]>();

  for (const item of items) {
    if (!shouldDisplayConversationTaskCenterItem(item)) {
      continue;
    }

    const sessionId = item.linkedSessionId?.trim();
    if (!sessionId) {
      continue;
    }

    const sessionKey = `${item.workspaceId}:${sessionId}`;
    const current = grouped.get(sessionKey);
    if (current) {
      current.push(item);
    } else {
      grouped.set(sessionKey, [item]);
    }
  }

  return Array.from(grouped.entries())
    .map(([sessionKey, sessionItems]) => {
      const sorted = sessionItems.slice().sort(compareTaskCenterDisplayOrder);
      const representativeTask = sorted[0] as DesktopTaskCenterItem;
      const sessionId = representativeTask.linkedSessionId?.trim() || sessionKey.slice(sessionKey.indexOf(":") + 1);
      const failedTaskCount = sorted.filter((item) =>
        item.lifecycleStatus === "failed" || item.attentionState === "failed",
      ).length;
      const activeTaskCount = sorted.filter((item) => isTaskCenterActive(item)).length;
      const attentionTaskCount = sorted.filter((item) => needsForegroundTaskCenterAttention(item)).length;

      return {
        sessionKey,
        sessionId,
        workspaceId: representativeTask.workspaceId,
        taskCount: sorted.length,
        activeTaskCount,
        failedTaskCount,
        attentionTaskCount,
        titles: sorted.map((item) => item.title),
        updatedAt: representativeTask.updatedAt,
        representativeTask,
      };
    })
    .sort((left, right) => compareTaskCenterDisplayOrder(left.representativeTask, right.representativeTask));
}

export function matchesTaskCenterConversationStatusFilter(
  row: TaskCenterConversationSessionRow,
  filter: TaskCenterConversationStatusFilter,
): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "active") {
    return row.activeTaskCount > 0;
  }

  if (filter === "failed") {
    return row.failedTaskCount > 0;
  }

  return row.attentionTaskCount > 0;
}

export function taskCenterSourceKindLabel(
  t: Translate,
  value: DesktopTaskCenterSourceKind,
): string {
  return t(`任务页.值.sourceKind.${value}` as const);
}

export function taskCenterExposureLabel(
  t: Translate,
  value: DesktopTaskCenterItem["exposure"],
): string {
  return t(`任务页.值.exposure.${value}` as const);
}

export function taskCenterAttentionStateLabel(
  t: Translate,
  value: DesktopTaskCenterAttentionState,
): string {
  return t(`任务页.值.attention.${value}` as const);
}

export function taskCenterPhaseLabel(t: Translate, item: DesktopTaskCenterItem): string {
  return item.phase || t("任务页.值.未设置");
}

export function taskCenterAttentionReason(item: DesktopTaskCenterItem): string | undefined {
  return item.attentionReason;
}

export function taskCenterHandlerLabel(item: DesktopTaskCenterItem): string {
  return item.handlerId || "-";
}

export function taskCenterModuleLabel(item: DesktopTaskCenterItem): string {
  return item.moduleId || "-";
}

export function taskCenterScheduleLabel(t: Translate, item: DesktopTaskCenterItem): string {
  if (!item.hasSchedule) {
    return t("任务页.值.schedule.none");
  }
  if (item.scheduleKind === "interval") {
    return t("任务页.值.schedule.interval", {
      分钟: String(item.scheduleIntervalMinutes ?? 15),
    });
  }
  return t("任务页.值.schedule.once");
}

export function taskCenterScheduleStateLabel(t: Translate, item: DesktopTaskCenterItem): string {
  if (!item.hasSchedule) {
    return t("任务页.值.schedule.none");
  }
  return item.scheduleEnabled
    ? t("任务页.值.schedule.active")
    : t("任务页.值.schedule.paused");
}

export function taskCenterNextRunAtLabel(item: DesktopTaskCenterItem): string {
  return formatDateTime(item.scheduleNextRunAt);
}