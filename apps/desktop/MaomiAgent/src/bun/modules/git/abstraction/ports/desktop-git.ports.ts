import type {
  DesktopGitBranchNameInput,
  DesktopGitBranchesResult,
  DesktopGitCheckoutBranchInput,
  DesktopGitCommitChangesInput,
  DesktopGitCommitHashInput,
  DesktopGitCommitMessageSuggestionsQuery,
  DesktopGitCommitMessageSuggestionsResult,
  DesktopGitCompareQuery,
  DesktopGitCompareResult,
  DesktopGitCreateBranchInput,
  DesktopGitCreateTagInput,
  DesktopGitCreateWorktreeInput,
  DesktopGitCreateStashInput,
  DesktopGitDeleteBranchInput,
  DesktopGitDiscardChangesInput,
  DesktopGitHistoryDetailResult,
  DesktopGitHistoryQuery,
  DesktopGitHistoryResult,
  DesktopGitHunkMutationInput,
  DesktopGitHunksQuery,
  DesktopGitHunksResult,
  DesktopGitIgnoreResult,
  DesktopGitModuleSnapshotQuery,
  DesktopGitModuleSnapshotResult,
  DesktopGitOperationResult,
  DesktopGitPushRemoteInput,
  DesktopGitRenameBranchInput,
  DesktopGitResetCommitInput,
  DesktopGitReviewDetailQuery,
  DesktopGitReviewDetailResult,
  DesktopGitReviewResult,
  DesktopGitSaveSettingsInput,
  DesktopGitSettingsResult,
  DesktopGitSaveIgnoreInput,
  DesktopGitRemoveWorktreeInput,
  DesktopGitStageChangesInput,
  DesktopGitStashRefInput,
  DesktopGitStashesResult,
  DesktopGitUnstageChangesInput,
  DesktopGitWorktreesResult,
  DesktopGitChangesResult,
} from "../models/desktop-git.models";

export interface DesktopGitQueryPort {
  getGitIgnore(workspaceId: string): Promise<DesktopGitIgnoreResult>;
  getGitSettings(workspaceId: string): Promise<DesktopGitSettingsResult>;
  getGitChanges(workspaceId: string): Promise<DesktopGitChangesResult>;
  getGitReview(
    workspaceId: string,
    input?: {
      scope?: "changed" | "staged";
    },
  ): Promise<DesktopGitReviewResult>;
  getGitReviewDetail(
    workspaceId: string,
    input: DesktopGitReviewDetailQuery,
  ): Promise<DesktopGitReviewDetailResult>;
  compareGitRefs(
    workspaceId: string,
    input: DesktopGitCompareQuery,
  ): Promise<DesktopGitCompareResult>;
  getGitBranches(workspaceId: string): Promise<DesktopGitBranchesResult>;
  getGitStashes(workspaceId: string): Promise<DesktopGitStashesResult>;
  getGitWorktrees(workspaceId: string): Promise<DesktopGitWorktreesResult>;
  getGitHistory(
    workspaceId: string,
    input?: DesktopGitHistoryQuery,
  ): Promise<DesktopGitHistoryResult>;
  getGitHistoryDetail(
    workspaceId: string,
    hash: string,
  ): Promise<DesktopGitHistoryDetailResult>;
  getGitModuleSnapshot(
    workspaceId: string,
    input?: DesktopGitModuleSnapshotQuery,
  ): Promise<DesktopGitModuleSnapshotResult>;
  getGitHunks(
    workspaceId: string,
    input: DesktopGitHunksQuery,
  ): Promise<DesktopGitHunksResult>;
  generateGitCommitMessage(
    workspaceId: string,
    input?: DesktopGitCommitMessageSuggestionsQuery,
  ): Promise<DesktopGitCommitMessageSuggestionsResult>;
}

export interface DesktopGitCommandPort {
  saveGitIgnore(
    workspaceId: string,
    input: DesktopGitSaveIgnoreInput,
  ): Promise<DesktopGitOperationResult>;
  saveGitSettings(
    workspaceId: string,
    input: DesktopGitSaveSettingsInput,
  ): Promise<DesktopGitOperationResult>;
  initGitRepository(workspaceId: string): Promise<DesktopGitOperationResult>;
  stageGitChanges(
    workspaceId: string,
    input: DesktopGitStageChangesInput,
  ): Promise<DesktopGitOperationResult>;
  unstageGitChanges(
    workspaceId: string,
    input: DesktopGitUnstageChangesInput,
  ): Promise<DesktopGitOperationResult>;
  discardGitChanges(
    workspaceId: string,
    input: DesktopGitDiscardChangesInput,
  ): Promise<DesktopGitOperationResult>;
  commitGitChanges(
    workspaceId: string,
    input: DesktopGitCommitChangesInput,
  ): Promise<DesktopGitOperationResult>;
  createGitStash(
    workspaceId: string,
    input?: DesktopGitCreateStashInput,
  ): Promise<DesktopGitOperationResult>;
  applyGitStash(
    workspaceId: string,
    input: DesktopGitStashRefInput,
  ): Promise<DesktopGitOperationResult>;
  popGitStash(
    workspaceId: string,
    input: DesktopGitStashRefInput,
  ): Promise<DesktopGitOperationResult>;
  dropGitStash(
    workspaceId: string,
    input: DesktopGitStashRefInput,
  ): Promise<DesktopGitOperationResult>;
  createGitBranch(
    workspaceId: string,
    input: DesktopGitCreateBranchInput,
  ): Promise<DesktopGitOperationResult>;
  createGitTag(
    workspaceId: string,
    input: DesktopGitCreateTagInput,
  ): Promise<DesktopGitOperationResult>;
  createGitWorktree(
    workspaceId: string,
    input: DesktopGitCreateWorktreeInput,
  ): Promise<DesktopGitOperationResult>;
  removeGitWorktree(
    workspaceId: string,
    input: DesktopGitRemoveWorktreeInput,
  ): Promise<DesktopGitOperationResult>;
  pruneGitWorktrees(workspaceId: string): Promise<DesktopGitOperationResult>;
  checkoutGitBranch(
    workspaceId: string,
    input: DesktopGitCheckoutBranchInput,
  ): Promise<DesktopGitOperationResult>;
  mergeGitBranchIntoCurrent(
    workspaceId: string,
    input: DesktopGitBranchNameInput,
  ): Promise<DesktopGitOperationResult>;
  rebaseCurrentGitBranch(
    workspaceId: string,
    input: DesktopGitBranchNameInput,
  ): Promise<DesktopGitOperationResult>;
  renameGitBranch(
    workspaceId: string,
    input: DesktopGitRenameBranchInput,
  ): Promise<DesktopGitOperationResult>;
  deleteGitBranch(
    workspaceId: string,
    input: DesktopGitDeleteBranchInput,
  ): Promise<DesktopGitOperationResult>;
  fetchGitRemote(workspaceId: string): Promise<DesktopGitOperationResult>;
  pullGitRemote(workspaceId: string): Promise<DesktopGitOperationResult>;
  pushGitRemote(
    workspaceId: string,
    input?: DesktopGitPushRemoteInput,
  ): Promise<DesktopGitOperationResult>;
  revertGitCommit(
    workspaceId: string,
    input: DesktopGitCommitHashInput,
  ): Promise<DesktopGitOperationResult>;
  cherryPickGitCommit(
    workspaceId: string,
    input: DesktopGitCommitHashInput,
  ): Promise<DesktopGitOperationResult>;
  resetGitCommit(
    workspaceId: string,
    input: DesktopGitResetCommitInput,
  ): Promise<DesktopGitOperationResult>;
  stageGitHunks(
    workspaceId: string,
    input: DesktopGitHunkMutationInput,
  ): Promise<DesktopGitOperationResult>;
  unstageGitHunks(
    workspaceId: string,
    input: DesktopGitHunkMutationInput,
  ): Promise<DesktopGitOperationResult>;
  discardGitHunks(
    workspaceId: string,
    input: DesktopGitHunkMutationInput,
  ): Promise<DesktopGitOperationResult>;
}

export type DesktopGitPort = DesktopGitQueryPort & DesktopGitCommandPort;
