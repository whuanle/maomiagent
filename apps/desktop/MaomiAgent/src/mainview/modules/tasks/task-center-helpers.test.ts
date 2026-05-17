import { describe, expect, test } from "bun:test";

import type { DesktopTaskCenterItem } from "../../../shared/desktop-task-center";
import {
  buildTaskCenterConversationSessionRows,
  compareTaskCenterDisplayOrder,
  matchesTaskCenterConversationStatusFilter,
  resolveTaskCenterPageTab,
  shouldDisplayConversationTaskCenterItem,
  shouldDisplayTaskCenterOperationalItem,
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
    hasSchedule: false,
    scheduleEnabled: false,
    ...overrides,
  };
}

describe("task-center helpers", () => {
  test("routes linked-session items into the conversation tab first", () => {
    expect(resolveTaskCenterPageTab(createItem({
      sourceKind: "managed_execution",
      linkedSessionId: "session-1",
    }))).toBe("conversation");

    expect(resolveTaskCenterPageTab(createItem({
      sourceKind: "automation",
      hasSchedule: true,
      scheduleEnabled: true,
    }))).toBe("automation");
  });

  test("groups conversation rows by session and hides normally completed items", () => {
    const rows = buildTaskCenterConversationSessionRows([
      createItem({
        centerId: "default:task-running",
        taskId: "task-running",
        title: "Running task",
        sourceKind: "conversation",
        linkedSessionId: "session-1",
        lifecycleStatus: "running",
        attentionState: "background",
        updatedAt: "2026-04-30T00:01:00.000Z",
      }),
      createItem({
        centerId: "default:task-success",
        taskId: "task-success",
        title: "Completed task",
        sourceKind: "conversation",
        linkedSessionId: "session-1",
        lifecycleStatus: "success",
        attentionState: "none",
        updatedAt: "2026-04-30T00:02:00.000Z",
      }),
      createItem({
        centerId: "default:task-failed",
        taskId: "task-failed",
        title: "Failed task",
        sourceKind: "conversation",
        linkedSessionId: "session-1",
        lifecycleStatus: "failed",
        attentionState: "failed",
        updatedAt: "2026-04-30T00:03:00.000Z",
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: "session-1",
      taskCount: 2,
      failedTaskCount: 1,
      activeTaskCount: 1,
      attentionTaskCount: 1,
    });
    expect(rows[0]?.representativeTask.taskId).toBe("task-running");
  });

  test("filters conversation rows by active, failed, and attention status", () => {
    const [row] = buildTaskCenterConversationSessionRows([
      createItem({
        centerId: "default:task-active",
        taskId: "task-active",
        sourceKind: "conversation",
        linkedSessionId: " session-2 ",
        lifecycleStatus: "running",
        attentionState: "takeover_required",
      }),
      createItem({
        centerId: "default:task-failed",
        taskId: "task-failed",
        sourceKind: "conversation",
        linkedSessionId: "session-2",
        lifecycleStatus: "failed",
        attentionState: "failed",
      }),
      createItem({
        centerId: "default:task-hidden",
        taskId: "task-hidden",
        sourceKind: "conversation",
        linkedSessionId: "   ",
        lifecycleStatus: "running",
        attentionState: "background",
      }),
    ]);

    expect(row?.sessionId).toBe("session-2");
    expect(matchesTaskCenterConversationStatusFilter(row!, "active")).toBe(true);
    expect(matchesTaskCenterConversationStatusFilter(row!, "failed")).toBe(true);
    expect(matchesTaskCenterConversationStatusFilter(row!, "attention")).toBe(true);
    expect(matchesTaskCenterConversationStatusFilter(row!, "all")).toBe(true);
  });

  test("prioritizes running items before failed or completed remnants", () => {
    const ordered = [
      createItem({ taskId: "success", lifecycleStatus: "success", updatedAt: "2026-04-30T00:03:00.000Z" }),
      createItem({ taskId: "failed", lifecycleStatus: "failed", attentionState: "failed", updatedAt: "2026-04-30T00:02:00.000Z" }),
      createItem({ taskId: "running", lifecycleStatus: "running", attentionState: "background", updatedAt: "2026-04-30T00:01:00.000Z" }),
    ].sort(compareTaskCenterDisplayOrder);

    expect(ordered.map((item) => item.taskId)).toEqual(["running", "failed", "success"]);
  });

  test("filters completed and low-value operational leftovers by default", () => {
    expect(shouldDisplayConversationTaskCenterItem(createItem({
      sourceKind: "conversation",
      linkedSessionId: "session-3",
      lifecycleStatus: "cancelled",
      attentionState: "takeover_required",
    }))).toBe(false);

    expect(shouldDisplayTaskCenterOperationalItem(createItem({
      sourceKind: "generic",
      lifecycleStatus: "success",
      attentionState: "none",
    }))).toBe(false);

    expect(shouldDisplayTaskCenterOperationalItem(createItem({
      sourceKind: "managed_execution",
      lifecycleStatus: "running",
      attentionState: "background",
    }))).toBe(true);
  });
});