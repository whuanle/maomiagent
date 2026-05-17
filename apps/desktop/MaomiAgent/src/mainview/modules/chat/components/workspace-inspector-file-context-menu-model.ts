import type { DesktopGitChangeItem } from "../../../../shared/desktop-git";

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

export function resolveWorkspaceInspectorGitActionState(input: {
  change?: DesktopGitChangeItem | null;
  isGitRepo?: boolean;
}): WorkspaceInspectorGitActionState {
  const canUseGitActions = input.isGitRepo === true && Boolean(input.change);
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
