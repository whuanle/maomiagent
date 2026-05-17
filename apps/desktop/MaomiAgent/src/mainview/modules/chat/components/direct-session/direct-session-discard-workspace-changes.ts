import { discardDesktopGitChanges } from "../../../../lib/desktop-git";

export function createDiscardWorkspaceChangesHandler(
  workspaceId: string | undefined,
  discardChanges: typeof discardDesktopGitChanges = discardDesktopGitChanges,
) {
  const normalizedWorkspaceId = workspaceId?.trim() || "";
  if (!normalizedWorkspaceId) {
    return undefined;
  }

  return async (paths: string[]) => {
    const normalizedPaths = [...new Set(paths.map((path) => path.trim()).filter(Boolean))];
    if (normalizedPaths.length === 0) {
      return;
    }

    await discardChanges(normalizedWorkspaceId, {
      paths: normalizedPaths,
    });
  };
}
