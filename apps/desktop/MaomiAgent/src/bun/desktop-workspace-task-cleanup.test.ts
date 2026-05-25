import { describe, expect, test } from "bun:test";

import { removeDesktopWorkspaceWithTaskCleanup } from "./desktop-workspace-task-cleanup";

describe("removeDesktopWorkspaceWithTaskCleanup", () => {
  test("purges workspace tasks after the workspace is removed", async () => {
    const calls: string[] = [];

    const result = await removeDesktopWorkspaceWithTaskCleanup({
      workspaceId: "workspace-1",
      workspaceCommand: {
        async remove(workspaceId) {
          calls.push(`remove:${workspaceId}`);
          return true;
        },
      },
      tasksCommand: {
        async purgeWorkspaceTasks(workspaceId) {
          calls.push(`purge:${workspaceId}`);
          return {
            taskCount: 3,
            runCount: 5,
          };
        },
      },
    });

    expect(result).toEqual({
      removed: true,
      purgeResult: {
        taskCount: 3,
        runCount: 5,
      },
    });
    expect(calls).toEqual(["remove:workspace-1", "purge:workspace-1"]);
  });

  test("skips task purge when the workspace is already missing", async () => {
    const calls: string[] = [];

    const result = await removeDesktopWorkspaceWithTaskCleanup({
      workspaceId: "workspace-2",
      workspaceCommand: {
        async remove(workspaceId) {
          calls.push(`remove:${workspaceId}`);
          return false;
        },
      },
      tasksCommand: {
        async purgeWorkspaceTasks(workspaceId) {
          calls.push(`purge:${workspaceId}`);
          return {
            taskCount: 99,
            runCount: 99,
          };
        },
      },
    });

    expect(result).toEqual({
      removed: false,
      purgeResult: {
        taskCount: 0,
        runCount: 0,
      },
    });
    expect(calls).toEqual(["remove:workspace-2"]);
  });
});
