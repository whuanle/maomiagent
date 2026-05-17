import { describe, expect, test } from "bun:test";

import { resolveManagedSessionIndicator } from "./managed-session-status";

describe("resolveManagedSessionIndicator", () => {
  test("maps ready managed intake metadata to a confirmation indicator", () => {
    expect(resolveManagedSessionIndicator("idle", {
      linkedRootTaskId: "managed-root-session-1",
      managedExecutionStage: "ready",
      phase: "awaiting_task_confirmation",
    }, "zh-CN")).toEqual({
      label: "待确认",
      badgeTone: "warning",
      statusTone: "warning",
    });
  });

  test("maps intake-locked managed metadata to an intake indicator", () => {
    expect(resolveManagedSessionIndicator("idle", {
      linkedRootTaskId: "managed-root-session-1",
      managedExecutionStage: "intake_locked",
    }, "en-US")).toEqual({
      label: "Collecting spec",
      badgeTone: "running",
      statusTone: "running",
    });
  });

  test("maps running managed execution metadata to an active indicator", () => {
    expect(resolveManagedSessionIndicator("active", {
      linkedRootTaskId: "managed-root-session-1",
      managedExecutionStage: "running",
      phase: "executing_plan",
    }, "zh-CN")).toEqual({
      label: "执行中",
      badgeTone: "running",
      statusTone: "running",
    });
  });

  test("maps retrying managed execution metadata to a retry indicator", () => {
    expect(resolveManagedSessionIndicator("active", {
      linkedRootTaskId: "managed-root-session-1",
      managedExecutionStage: "running",
      phase: "retrying_after_failure",
    }, "en-US")).toEqual({
      label: "Retrying",
      badgeTone: "running",
      statusTone: "running",
    });
  });

  test("ignores archived and failed sessions even when managed metadata exists", () => {
    expect(resolveManagedSessionIndicator("failed", {
      linkedRootTaskId: "managed-root-session-1",
      managedExecutionStage: "ready",
    }, "zh-CN")).toBeUndefined();
    expect(resolveManagedSessionIndicator("archived", {
      linkedRootTaskId: "managed-root-session-1",
      managedExecutionStage: "ready",
    }, "zh-CN")).toBeUndefined();
  });
});