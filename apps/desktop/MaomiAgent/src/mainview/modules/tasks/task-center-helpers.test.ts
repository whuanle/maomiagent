import { describe, expect, test } from "bun:test";

import type { DesktopTaskCenterItem } from "../../../shared/desktop-task-center";
import {
  buildTaskCenterListQuery,
  compareTaskCenterDisplayOrder,
  filterTaskCenterItems,
  isCriticalTaskCenterItem,
  isSystemTaskCenterItem,
  matchesCriticalTaskCenterFilter,
  matchesSystemTaskCenterFilter,
} from "./task-center-helpers";

function createItem(overrides: Partial<DesktopTaskCenterItem> = {}): DesktopTaskCenterItem {
  return {
    centerId: "default:task-1",
    workspaceId: "default",
    taskId: "task-1",
    title: "Task",
    summary: "Summary",
    sourceKind: "generic",
    exposure: "operator",
    attentionState: "none",
    lifecycleStatus: "queued",
    priority: "normal",
    progress: 0,
    updatedAt: "2026-04-30T00:00:00.000Z",
    surface: "critical",
    visibility: "visible",
    scope: "workspace",
    hasSchedule: false,
    scheduleEnabled: false,
    ...overrides,
  };
}

describe("task-center helpers", () => {
  test("recognizes visible critical and system task surfaces", () => {
    expect(isCriticalTaskCenterItem(createItem())).toBe(true);
    expect(isCriticalTaskCenterItem(createItem({ visibility: "hidden" }))).toBe(false);

    expect(isSystemTaskCenterItem(createItem({
      surface: "system",
      scope: "system",
    }))).toBe(true);
    expect(isSystemTaskCenterItem(createItem({
      surface: "system",
      scope: "system",
      visibility: "hidden",
    }))).toBe(false);
  });

  test("filters critical tasks by running, attention, and failed states", () => {
    const running = createItem({
      taskId: "running",
      lifecycleStatus: "running",
      attentionState: "background",
    });
    const attention = createItem({
      taskId: "attention",
      lifecycleStatus: "running",
      attentionState: "takeover_required",
    });
    const failed = createItem({
      taskId: "failed",
      lifecycleStatus: "failed",
      attentionState: "failed",
    });

    expect(matchesCriticalTaskCenterFilter(running, "running")).toBe(true);
    expect(matchesCriticalTaskCenterFilter(running, "attention")).toBe(false);
    expect(matchesCriticalTaskCenterFilter(attention, "attention")).toBe(true);
    expect(matchesCriticalTaskCenterFilter(failed, "failed")).toBe(true);
    expect(matchesCriticalTaskCenterFilter(attention, "all")).toBe(true);
  });

  test("filters system tasks by active and paused schedules", () => {
    const active = createItem({
      surface: "system",
      scope: "system",
      hasSchedule: true,
      scheduleEnabled: true,
    });
    const paused = createItem({
      surface: "system",
      scope: "system",
      hasSchedule: true,
      scheduleEnabled: false,
    });

    expect(matchesSystemTaskCenterFilter(active, "active")).toBe(true);
    expect(matchesSystemTaskCenterFilter(active, "paused")).toBe(false);
    expect(matchesSystemTaskCenterFilter(paused, "paused")).toBe(true);
    expect(matchesSystemTaskCenterFilter(paused, "all")).toBe(true);
  });

  test("builds visible task-center queries from the active surface", () => {
    expect(buildTaskCenterListQuery({
      activeTab: "critical",
      workspaceId: "workspace-a",
      q: "  takeover  ",
      limit: 1000,
      offset: 0,
    })).toEqual({
      surface: "critical",
      visibility: "visible",
      workspaceId: "workspace-a",
      q: "takeover",
      limit: 1000,
      offset: 0,
    });

    expect(buildTaskCenterListQuery({
      activeTab: "system",
      workspaceId: "workspace-a",
      q: " refresh ",
      limit: 1000,
      offset: 0,
    })).toEqual({
      surface: "system",
      visibility: "visible",
      workspaceId: undefined,
      q: "refresh",
      limit: 1000,
      offset: 0,
    });
  });

  test("filters and sorts only the visible surface items for the active tab", () => {
    const filtered = filterTaskCenterItems({
      activeTab: "critical",
      criticalFilter: "attention",
      systemFilter: "all",
      items: [
        createItem({
          taskId: "system-task",
          surface: "system",
          scope: "system",
          attentionState: "scheduled",
          lifecycleStatus: "queued",
        }),
        createItem({
          taskId: "attention-task",
          attentionState: "takeover_required",
          lifecycleStatus: "running",
          updatedAt: "2026-04-30T00:02:00.000Z",
        }),
        createItem({
          taskId: "running-only",
          attentionState: "background",
          lifecycleStatus: "running",
          updatedAt: "2026-04-30T00:03:00.000Z",
        }),
      ],
    });

    expect(filtered.map((item) => item.taskId)).toEqual(["attention-task"]);
  });

  test("prioritizes running tasks before failed or completed leftovers", () => {
    const ordered = [
      createItem({
        taskId: "success",
        lifecycleStatus: "success",
        updatedAt: "2026-04-30T00:03:00.000Z",
      }),
      createItem({
        taskId: "failed",
        lifecycleStatus: "failed",
        attentionState: "failed",
        updatedAt: "2026-04-30T00:02:00.000Z",
      }),
      createItem({
        taskId: "running",
        lifecycleStatus: "running",
        attentionState: "background",
        updatedAt: "2026-04-30T00:01:00.000Z",
      }),
    ].sort(compareTaskCenterDisplayOrder);

    expect(ordered.map((item) => item.taskId)).toEqual(["running", "failed", "success"]);
  });
});
