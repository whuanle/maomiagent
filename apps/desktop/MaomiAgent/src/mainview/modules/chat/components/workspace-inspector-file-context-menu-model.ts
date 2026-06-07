import type { DesktopGitChangeItem } from "../../../../shared/desktop-git";
import { resolveWorkspaceFileContainingDirectory } from "./workspace-file-location";

function hasGitStatusCodeChange(value: string | undefined) {
  const normalized = value?.trim();
  return Boolean(normalized && normalized !== "-");
}

export function hasWorkspaceInspectorStagedChange(
  change: Pick<DesktopGitChangeItem, "stagedStatus"> | null | undefined,
) {
  return hasGitStatusCodeChange(change?.stagedStatus);
}

export function hasWorkspaceInspectorUnstagedChange(
  change: Pick<DesktopGitChangeItem, "unstagedStatus"> | null | undefined,
) {
  return hasGitStatusCodeChange(change?.unstagedStatus);
}

export type WorkspaceInspectorGitActionState = {
  canViewDiff: boolean;
  canStage: boolean;
  canUnstage: boolean;
};

export function resolveWorkspaceInspectorFileManagerTargetPath(input: {
  absolutePath: string;
  nodeType?: "file" | "directory";
}) {
  const absolutePath = input.absolutePath.trim();
  if (!absolutePath) {
    return "";
  }

  if (input.nodeType === "directory") {
    return absolutePath;
  }

  return resolveWorkspaceFileContainingDirectory({
    absolutePath,
  });
}

export function resolveWorkspaceInspectorGitActionState(input: {
  change?: DesktopGitChangeItem | null;
  isGitRepo?: boolean;
  nodeType?: "file" | "directory";
}): WorkspaceInspectorGitActionState {
  const canUseGitActions = input.nodeType !== "directory"
    && input.isGitRepo === true
    && Boolean(input.change);
  if (!canUseGitActions) {
    return {
      canViewDiff: false,
      canStage: false,
      canUnstage: false,
    };
  }

  return {
    canViewDiff: true,
    canStage: hasWorkspaceInspectorUnstagedChange(input.change),
    canUnstage: hasWorkspaceInspectorStagedChange(input.change),
  };
}
