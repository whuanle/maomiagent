import { describe, expect, test } from "bun:test";

import {
  projectDesktopTaskRecordToTaskCenterItem,
} from "../../../../shared/desktop-task-center";
import type { DesktopTaskRecord } from "../../../../shared/desktop-tasks";

function createTask(overrides: Partial<DesktopTaskRecord> = {}): DesktopTaskRecord {
  return {
    taskId: "task-1",
    title: "Task Title",
    goal: "Task goal",
    workspaceId: "repo-a",
    taskType: "execution",
    executionMode: "background",
    runMode: "normal",
    origin: "system",
    priority: "normal",
    status: "queued",
    progress: 0,
    createdAt: "2026-04-30T00:00:00.000Z",
    updatedAt: "2026-04-30T00:00:00.000Z",
    runCount: 0,
    steps: [],
    ...overrides,
  };
}

describe("projectDesktopTaskRecordToTaskCenterItem", () => {
  test("projects explicit system tasks into the visible system surface", () => {
    const projected = projectDesktopTaskRecordToTaskCenterItem(createTask({
      taskId: "feishu-refresh-token",
      workspaceId: "system",
      title: "Refresh token",
      goal: "Refresh the access token on interval.",
      taskType: "automation",
      status: "success",
      surface: "system",
      scope: "system",
      visibility: "visible",
      identityKey: "system::handler.refresh-token::refresh-token",
      schedule: {
        kind: "interval",
        intervalMinutes: 30,
        nextRunAt: "2026-04-30T00:30:00.000Z",
        enabled: true,
      },
      handler: {
        handlerId: "handler.refresh-token",
        moduleId: "desktop.feishu",
        taskKey: "refresh-token",
      },
    }));

    expect(projected).toMatchObject({
      workspaceId: "system",
      sourceKind: "automation",
      exposure: "hidden",
      attentionState: "scheduled",
      surface: "system",
      scope: "system",
      visibility: "visible",
      identityKey: "system::handler.refresh-token::refresh-token",
      priority: "normal",
      hasSchedule: true,
      scheduleKind: "interval",
      scheduleIntervalMinutes: 30,
      scheduleEnabled: true,
      scheduleNextRunAt: "2026-04-30T00:30:00.000Z",
      handlerId: "handler.refresh-token",
      moduleId: "desktop.feishu",
    });
  });

  test("projects managed execution verification gates as contextual attention", () => {
    const projected = projectDesktopTaskRecordToTaskCenterItem(createTask({
      taskId: "task-managed-verification",
      title: "Ship release",
      goal: "Ship the release and wait for GitHub Actions.",
      taskType: "conversation",
      runMode: "hosted_autopilot",
      status: "running",
      linkedSessionId: "session-1",
      metadata: {
        rootTask: true,
        phase: "awaiting_external_verification",
        blockedReason: "Waiting for GitHub Actions to pass.",
        verificationPlan: {
          mode: "external",
          status: "pending",
          summary: "GitHub Actions must pass before the task can close.",
        },
      },
    }));

    expect(projected).toMatchObject({
      sourceKind: "managed_execution",
      exposure: "contextual",
      attentionState: "verification_required",
      attentionReason: "Waiting for GitHub Actions to pass.",
      rootTaskId: "task-managed-verification",
      linkedSessionId: "session-1",
      surface: "critical",
      visibility: "visible",
      scope: "workspace",
    });
  });

  test("projects managed wrap-up gates separately from generic blocked states", () => {
    const projected = projectDesktopTaskRecordToTaskCenterItem(createTask({
      taskId: "task-managed-wrap-up",
      title: "Release wrap-up",
      goal: "Complete release wrap-up.",
      taskType: "conversation",
      runMode: "hosted_autopilot",
      status: "running",
      progress: 98,
      metadata: {
        rootTask: true,
        phase: "completed",
        managedExecutionStopReason: "completed",
        wrapUpCommands: ["bun install"],
        wrapUpStatus: "pending",
        wrapUpSummary: "The final wrap-up command still needs to run.",
      },
    }));

    expect(projected).toMatchObject({
      sourceKind: "managed_execution",
      exposure: "contextual",
      attentionState: "wrap_up_required",
      attentionReason: "The final wrap-up command still needs to run.",
      surface: "critical",
    });
  });

  test("projects intake-locked managed work as takeover required", () => {
    const projected = projectDesktopTaskRecordToTaskCenterItem(createTask({
      taskId: "task-managed-takeover",
      title: "Managed intake",
      goal: "Confirm the spec and wait for takeover.",
      taskType: "conversation",
      runMode: "hosted_autopilot",
      status: "running",
      metadata: {
        rootTask: true,
        managedExecutionStage: "ready",
        executionAgentId: "managed-autopilot",
      },
    }));

    expect(projected).toMatchObject({
      sourceKind: "managed_execution",
      exposure: "contextual",
      attentionState: "takeover_required",
      surface: "critical",
    });
    expect(projected.attentionReason).toContain("takeover session");
  });

  test("projects blocked child-session tasks as contextual child work", () => {
    const projected = projectDesktopTaskRecordToTaskCenterItem(createTask({
      taskId: "task-child-blocked",
      title: "Checkpoint review",
      goal: "Wait for approval before continuing.",
      taskType: "execution",
      status: "running",
      metadata: {
        taskKind: "checkpoint",
        blockedReason: "Need a confirmation before continuing.",
        childSessionResolution: {
          resolutionKind: "blocked",
          interactionId: "interaction-1",
        },
      },
    }));

    expect(projected).toMatchObject({
      sourceKind: "child_task",
      exposure: "contextual",
      attentionState: "blocked",
      attentionReason: "Need a confirmation before continuing.",
      surface: "internal",
      visibility: "hidden",
      scope: "workspace",
    });
  });

  test("projects ordinary conversation runs as hidden internal items", () => {
    const projected = projectDesktopTaskRecordToTaskCenterItem(createTask({
      taskId: "conversation-run_123",
      title: "Assistant task",
      goal: "Continue the current conversation.",
      taskType: "conversation",
      executionMode: "interactive",
      runMode: "normal",
      linkedSessionId: "session-2",
      status: "running",
      metadata: {
        sessionId: "session-2",
        runId: "run_123",
      },
    }));

    expect(projected).toMatchObject({
      taskId: "conversation-run_123",
      sourceKind: "conversation",
      surface: "internal",
      visibility: "hidden",
      scope: "workspace",
    });
  });
});
