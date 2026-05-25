import type {
  DesktopTaskCenterAttentionState,
  DesktopTaskCenterItem,
  DesktopTaskCenterListQuery,
  DesktopTaskCenterSourceKind,
} from "../../../shared/desktop-task-center";
import type { TasksTranslate as Translate } from "./i18n";
import { formatDateTime } from "./helpers";

export type TaskCenterPageTab = "critical" | "system";

export type TaskCenterCriticalFilter = "all" | "running" | "attention" | "failed";

export type TaskCenterSystemFilter = "all" | "active" | "paused";

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

export function hasTaskCenterSchedule(item: DesktopTaskCenterItem): boolean {
  return item.hasSchedule;
}

export function isTaskCenterScheduleEnabled(item: DesktopTaskCenterItem): boolean {
  return item.hasSchedule && item.scheduleEnabled;
}

export function isTaskCenterSchedulePaused(item: DesktopTaskCenterItem): boolean {
  return item.hasSchedule && !item.scheduleEnabled;
}

export function isTaskCenterRunningItem(item: DesktopTaskCenterItem): boolean {
  return item.lifecycleStatus === "running" || item.lifecycleStatus === "queued";
}

export function isTaskCenterAttentionItem(item: DesktopTaskCenterItem): boolean {
  return item.attentionState === "blocked"
    || item.attentionState === "takeover_required"
    || item.attentionState === "verification_required"
    || item.attentionState === "wrap_up_required"
    || item.attentionState === "failed";
}

export function isCriticalTaskCenterItem(item: DesktopTaskCenterItem): boolean {
  return item.surface === "critical" && item.visibility === "visible";
}

export function isSystemTaskCenterItem(item: DesktopTaskCenterItem): boolean {
  return item.surface === "system" && item.visibility === "visible";
}

export function buildTaskCenterListQuery(input: {
  activeTab: TaskCenterPageTab;
  limit: number;
  offset: number;
  q?: string;
  workspaceId?: string;
}): DesktopTaskCenterListQuery {
  return {
    surface: input.activeTab === "critical" ? "critical" : "system",
    visibility: "visible",
    workspaceId: input.activeTab === "critical" ? input.workspaceId : undefined,
    q: input.q?.trim() || undefined,
    limit: input.limit,
    offset: input.offset,
  };
}

export function filterTaskCenterItems(input: {
  activeTab: TaskCenterPageTab;
  criticalFilter: TaskCenterCriticalFilter;
  items: DesktopTaskCenterItem[];
  systemFilter: TaskCenterSystemFilter;
}): DesktopTaskCenterItem[] {
  const filtered = input.items.filter((item) => {
    if (input.activeTab === "critical") {
      return isCriticalTaskCenterItem(item)
        && matchesCriticalTaskCenterFilter(item, input.criticalFilter);
    }

    return isSystemTaskCenterItem(item)
      && matchesSystemTaskCenterFilter(item, input.systemFilter);
  });

  return filtered.sort(compareTaskCenterDisplayOrder);
}

export function matchesCriticalTaskCenterFilter(
  item: DesktopTaskCenterItem,
  filter: TaskCenterCriticalFilter,
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "running") {
    return isTaskCenterRunningItem(item);
  }
  if (filter === "attention") {
    return isTaskCenterAttentionItem(item);
  }
  return item.lifecycleStatus === "failed" || item.attentionState === "failed";
}

export function matchesSystemTaskCenterFilter(
  item: DesktopTaskCenterItem,
  filter: TaskCenterSystemFilter,
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "active") {
    return isTaskCenterScheduleEnabled(item);
  }
  return isTaskCenterSchedulePaused(item);
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
