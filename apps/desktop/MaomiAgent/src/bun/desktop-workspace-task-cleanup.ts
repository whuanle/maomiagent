import type { DesktopTasksCommandPort } from "./modules/tasks";
import type { DesktopWorkspaceCommandPort } from "./modules/workspace";

export type RemoveDesktopWorkspaceWithTaskCleanupInput = {
  workspaceId: string;
  tasksCommand: Pick<DesktopTasksCommandPort, "purgeWorkspaceTasks">;
  workspaceCommand: Pick<DesktopWorkspaceCommandPort, "remove">;
};

export type RemoveDesktopWorkspaceWithTaskCleanupResult = {
  removed: boolean;
  purgeResult: {
    taskCount: number;
    runCount: number;
  };
};

export async function removeDesktopWorkspaceWithTaskCleanup(
  input: RemoveDesktopWorkspaceWithTaskCleanupInput,
): Promise<RemoveDesktopWorkspaceWithTaskCleanupResult> {
  const removed = await input.workspaceCommand.remove(input.workspaceId);
  if (!removed) {
    return {
      removed: false,
      purgeResult: {
        taskCount: 0,
        runCount: 0,
      },
    };
  }

  return {
    removed: true,
    purgeResult: await input.tasksCommand.purgeWorkspaceTasks(input.workspaceId),
  };
}
