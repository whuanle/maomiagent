import { describe, expect, test } from "bun:test";

import {
  DEFAULT_MANAGED_TAKEOVER_AGENT_ID,
  hasManagedTakeoverChildSession,
  resolveManagedTakeoverLaunchBehavior,
  resolveManagedTakeoverLaunchPlan,
} from "./managed-takeover";

describe("resolveManagedTakeoverLaunchPlan", () => {
  test("returns a launch plan for a ready intake session", () => {
    expect(resolveManagedTakeoverLaunchPlan({
      sourceSession: {
        sessionId: "session-intake",
        status: "idle",
        metadata: {
          linkedRootTaskId: "managed-root-session-intake",
          managedExecutionStage: "ready",
          preferredExecutionAgentId: "planner",
        },
      },
      metadata: {
        linkedRootTaskId: "managed-root-session-intake",
        managedExecutionStage: "ready",
        phase: "awaiting_task_confirmation",
        preferredExecutionAgentId: "planner",
      },
      sessions: [],
    })).toEqual({
      rootTaskId: "managed-root-session-intake",
      executionAgentId: "planner",
    });
  });

  test("reuses an existing non-archived takeover session for the same root task", () => {
    const plan = resolveManagedTakeoverLaunchPlan({
      sourceSession: {
        sessionId: "session-intake",
        status: "idle",
        metadata: {
          linkedRootTaskId: "managed-root-session-intake",
          managedExecutionStage: "ready",
        },
      },
      metadata: {
        linkedRootTaskId: "managed-root-session-intake",
        managedExecutionStage: "ready",
      },
      sessions: [{
        sessionId: "session-takeover",
        workspaceId: "workspace-1",
        title: "Managed execution",
        status: "active",
        parentSessionId: "session-intake",
        createdAt: "2026-05-04T00:00:00.000Z",
        updatedAt: "2026-05-04T00:00:00.000Z",
        metadata: {
          linkedRootTaskId: "managed-root-session-intake",
          managedExecution: true,
          rootTask: false,
        },
      }],
    });

    expect(plan).toEqual({
      rootTaskId: "managed-root-session-intake",
      executionAgentId: DEFAULT_MANAGED_TAKEOVER_AGENT_ID,
      existingSessionId: "session-takeover",
    });
    expect(hasManagedTakeoverChildSession({
      sourceSession: {
        sessionId: "session-intake",
        status: "idle",
        metadata: {
          linkedRootTaskId: "managed-root-session-intake",
          managedExecutionStage: "ready",
        },
      },
      sessions: [{
        sessionId: "session-takeover",
        workspaceId: "workspace-1",
        title: "Managed execution",
        status: "active",
        parentSessionId: "session-intake",
        createdAt: "2026-05-04T00:00:00.000Z",
        updatedAt: "2026-05-04T00:00:00.000Z",
        metadata: {
          linkedRootTaskId: "managed-root-session-intake",
          managedExecution: true,
          rootTask: false,
        },
      }],
    })).toBe(true);
    expect(resolveManagedTakeoverLaunchBehavior(plan)).toBe("keep_current_session");
  });

  test("opens a new takeover session only when one does not exist yet", () => {
    const plan = resolveManagedTakeoverLaunchPlan({
      sourceSession: {
        sessionId: "session-intake",
        status: "idle",
        metadata: {
          linkedRootTaskId: "managed-root-session-intake",
          managedExecutionStage: "ready",
        },
      },
      sessions: [],
    });

    expect(resolveManagedTakeoverLaunchBehavior(plan)).toBe("create_and_open");
  });

  test("does not launch from archived, failed, or child sessions", () => {
    expect(resolveManagedTakeoverLaunchPlan({
      sourceSession: {
        sessionId: "session-intake",
        status: "failed",
        metadata: {
          linkedRootTaskId: "managed-root-session-intake",
          managedExecutionStage: "ready",
        },
      },
      sessions: [],
    })).toBeUndefined();

    expect(resolveManagedTakeoverLaunchPlan({
      sourceSession: {
        sessionId: "session-child",
        status: "idle",
        parentSessionId: "session-intake",
        metadata: {
          linkedRootTaskId: "managed-root-session-intake",
          managedExecutionStage: "ready",
        },
      },
      sessions: [],
    })).toBeUndefined();
  });
});
