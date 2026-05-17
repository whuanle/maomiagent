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
  DesktopGitSaveIgnoreInput,
  DesktopGitStageChangesInput,
  DesktopGitStashRefInput,
  DesktopGitStashesResult,
  DesktopGitUnstageChangesInput,
  DesktopGitChangesResult,
} from "../../shared/desktop-git";
import { DESKTOP_WINDOW_BRIDGE_READY_EVENT } from "./desktop-window";

type DesktopGitBridge = {
  getDesktopGitIgnore: (workspaceId: string) => Promise<DesktopGitIgnoreResult>;
  getDesktopGitChanges: (workspaceId: string) => Promise<DesktopGitChangesResult>;
  getDesktopGitReview: (
    workspaceId: string,
  ) => Promise<DesktopGitReviewResult>;
  getDesktopGitReviewDetail: (
    workspaceId: string,
    query: DesktopGitReviewDetailQuery,
  ) => Promise<DesktopGitReviewDetailResult>;
  compareDesktopGitRefs: (
    workspaceId: string,
    query: DesktopGitCompareQuery,
  ) => Promise<DesktopGitCompareResult>;
  getDesktopGitBranches: (workspaceId: string) => Promise<DesktopGitBranchesResult>;
  getDesktopGitStashes: (workspaceId: string) => Promise<DesktopGitStashesResult>;
  getDesktopGitHistory: (
    workspaceId: string,
    query?: DesktopGitHistoryQuery,
  ) => Promise<DesktopGitHistoryResult>;
  getDesktopGitHistoryDetail: (
    workspaceId: string,
    hash: string,
  ) => Promise<DesktopGitHistoryDetailResult>;
  getDesktopGitModuleSnapshot: (
    workspaceId: string,
    query?: DesktopGitModuleSnapshotQuery,
  ) => Promise<DesktopGitModuleSnapshotResult>;
  getDesktopGitHunks: (
    workspaceId: string,
    query: DesktopGitHunksQuery,
  ) => Promise<DesktopGitHunksResult>;
  saveDesktopGitIgnore: (
    workspaceId: string,
    input: DesktopGitSaveIgnoreInput,
  ) => Promise<DesktopGitOperationResult>;
  initDesktopGitRepository: (workspaceId: string) => Promise<DesktopGitOperationResult>;
  stageDesktopGitChanges: (
    workspaceId: string,
    input: DesktopGitStageChangesInput,
  ) => Promise<DesktopGitOperationResult>;
  unstageDesktopGitChanges: (
    workspaceId: string,
    input: DesktopGitUnstageChangesInput,
  ) => Promise<DesktopGitOperationResult>;
  discardDesktopGitChanges: (
    workspaceId: string,
    input: DesktopGitDiscardChangesInput,
  ) => Promise<DesktopGitOperationResult>;
  commitDesktopGitChanges: (
    workspaceId: string,
    input: DesktopGitCommitChangesInput,
  ) => Promise<DesktopGitOperationResult>;
  generateDesktopGitCommitMessage: (
    workspaceId: string,
    query?: DesktopGitCommitMessageSuggestionsQuery,
  ) => Promise<DesktopGitCommitMessageSuggestionsResult>;
  createDesktopGitStash: (
    workspaceId: string,
    input?: DesktopGitCreateStashInput,
  ) => Promise<DesktopGitOperationResult>;
  applyDesktopGitStash: (
    workspaceId: string,
    input: DesktopGitStashRefInput,
  ) => Promise<DesktopGitOperationResult>;
  popDesktopGitStash: (
    workspaceId: string,
    input: DesktopGitStashRefInput,
  ) => Promise<DesktopGitOperationResult>;
  dropDesktopGitStash: (
    workspaceId: string,
    input: DesktopGitStashRefInput,
  ) => Promise<DesktopGitOperationResult>;
  createDesktopGitBranch: (
    workspaceId: string,
    input: DesktopGitCreateBranchInput,
  ) => Promise<DesktopGitOperationResult>;
  createDesktopGitTag: (
    workspaceId: string,
    input: DesktopGitCreateTagInput,
  ) => Promise<DesktopGitOperationResult>;
  checkoutDesktopGitBranch: (
    workspaceId: string,
    input: DesktopGitCheckoutBranchInput,
  ) => Promise<DesktopGitOperationResult>;
  mergeDesktopGitBranchIntoCurrent: (
    workspaceId: string,
    input: DesktopGitBranchNameInput,
  ) => Promise<DesktopGitOperationResult>;
  rebaseDesktopGitBranchIntoCurrent: (
    workspaceId: string,
    input: DesktopGitBranchNameInput,
  ) => Promise<DesktopGitOperationResult>;
  renameDesktopGitBranch: (
    workspaceId: string,
    input: DesktopGitRenameBranchInput,
  ) => Promise<DesktopGitOperationResult>;
  deleteDesktopGitBranch: (
    workspaceId: string,
    input: DesktopGitDeleteBranchInput,
  ) => Promise<DesktopGitOperationResult>;
  fetchDesktopGitRemote: (workspaceId: string) => Promise<DesktopGitOperationResult>;
  pullDesktopGitRemote: (workspaceId: string) => Promise<DesktopGitOperationResult>;
  pushDesktopGitRemote: (
    workspaceId: string,
    input?: DesktopGitPushRemoteInput,
  ) => Promise<DesktopGitOperationResult>;
  revertDesktopGitCommit: (
    workspaceId: string,
    input: DesktopGitCommitHashInput,
  ) => Promise<DesktopGitOperationResult>;
  cherryPickDesktopGitCommit: (
    workspaceId: string,
    input: DesktopGitCommitHashInput,
  ) => Promise<DesktopGitOperationResult>;
  resetDesktopGitCommit: (
    workspaceId: string,
    input: DesktopGitResetCommitInput,
  ) => Promise<DesktopGitOperationResult>;
  stageDesktopGitHunks: (
    workspaceId: string,
    input: DesktopGitHunkMutationInput,
  ) => Promise<DesktopGitOperationResult>;
  unstageDesktopGitHunks: (
    workspaceId: string,
    input: DesktopGitHunkMutationInput,
  ) => Promise<DesktopGitOperationResult>;
  discardDesktopGitHunks: (
    workspaceId: string,
    input: DesktopGitHunkMutationInput,
  ) => Promise<DesktopGitOperationResult>;
};

declare global {
  interface Window {
    maomiDesktopGit?: DesktopGitBridge;
  }
}

export const DESKTOP_GIT_BRIDGE_READY_EVENT = DESKTOP_WINDOW_BRIDGE_READY_EVENT;

function getDesktopGitBridge(): DesktopGitBridge {
  const bridge = window.maomiDesktopGit;
  if (!bridge) {
    throw new Error("Desktop git bridge is unavailable.");
  }

  return bridge;
}

export function hasDesktopGitBridge(): boolean {
  return Boolean(window.maomiDesktopGit);
}

export function getDesktopGitIgnore(
  workspaceId: string,
): Promise<DesktopGitIgnoreResult> {
  return getDesktopGitBridge().getDesktopGitIgnore(workspaceId);
}

export function getDesktopGitChanges(
  workspaceId: string,
): Promise<DesktopGitChangesResult> {
  return getDesktopGitBridge().getDesktopGitChanges(workspaceId);
}

export function getDesktopGitReview(
  workspaceId: string,
): Promise<DesktopGitReviewResult> {
  return getDesktopGitBridge().getDesktopGitReview(workspaceId);
}

export function getDesktopGitReviewDetail(
  workspaceId: string,
  query: DesktopGitReviewDetailQuery,
): Promise<DesktopGitReviewDetailResult> {
  return getDesktopGitBridge().getDesktopGitReviewDetail(workspaceId, query);
}

export function compareDesktopGitRefs(
  workspaceId: string,
  query: DesktopGitCompareQuery,
): Promise<DesktopGitCompareResult> {
  return getDesktopGitBridge().compareDesktopGitRefs(workspaceId, query);
}

export function getDesktopGitBranches(
  workspaceId: string,
): Promise<DesktopGitBranchesResult> {
  return getDesktopGitBridge().getDesktopGitBranches(workspaceId);
}

export function getDesktopGitStashes(
  workspaceId: string,
): Promise<DesktopGitStashesResult> {
  return getDesktopGitBridge().getDesktopGitStashes(workspaceId);
}

export function getDesktopGitHistory(
  workspaceId: string,
  query: DesktopGitHistoryQuery = {},
): Promise<DesktopGitHistoryResult> {
  return getDesktopGitBridge().getDesktopGitHistory(workspaceId, query);
}

export function getDesktopGitHistoryDetail(
  workspaceId: string,
  hash: string,
): Promise<DesktopGitHistoryDetailResult> {
  return getDesktopGitBridge().getDesktopGitHistoryDetail(workspaceId, hash);
}

export function getDesktopGitModuleSnapshot(
  workspaceId: string,
  query: DesktopGitModuleSnapshotQuery = {},
): Promise<DesktopGitModuleSnapshotResult> {
  return getDesktopGitBridge().getDesktopGitModuleSnapshot(workspaceId, query);
}

export function getDesktopGitHunks(
  workspaceId: string,
  query: DesktopGitHunksQuery,
): Promise<DesktopGitHunksResult> {
  return getDesktopGitBridge().getDesktopGitHunks(workspaceId, query);
}

export function saveDesktopGitIgnore(
  workspaceId: string,
  input: DesktopGitSaveIgnoreInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().saveDesktopGitIgnore(workspaceId, input);
}

export function initDesktopGitRepository(
  workspaceId: string,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().initDesktopGitRepository(workspaceId);
}

export function stageDesktopGitChanges(
  workspaceId: string,
  input: DesktopGitStageChangesInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().stageDesktopGitChanges(workspaceId, input);
}

export function unstageDesktopGitChanges(
  workspaceId: string,
  input: DesktopGitUnstageChangesInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().unstageDesktopGitChanges(workspaceId, input);
}

export function discardDesktopGitChanges(
  workspaceId: string,
  input: DesktopGitDiscardChangesInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().discardDesktopGitChanges(workspaceId, input);
}

export function commitDesktopGitChanges(
  workspaceId: string,
  input: DesktopGitCommitChangesInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().commitDesktopGitChanges(workspaceId, input);
}

export function generateDesktopGitCommitMessage(
  workspaceId: string,
  query: DesktopGitCommitMessageSuggestionsQuery = {},
): Promise<DesktopGitCommitMessageSuggestionsResult> {
  return getDesktopGitBridge().generateDesktopGitCommitMessage(workspaceId, query);
}

export function createDesktopGitStash(
  workspaceId: string,
  input: DesktopGitCreateStashInput = {},
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().createDesktopGitStash(workspaceId, input);
}

export function applyDesktopGitStash(
  workspaceId: string,
  input: DesktopGitStashRefInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().applyDesktopGitStash(workspaceId, input);
}

export function popDesktopGitStash(
  workspaceId: string,
  input: DesktopGitStashRefInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().popDesktopGitStash(workspaceId, input);
}

export function dropDesktopGitStash(
  workspaceId: string,
  input: DesktopGitStashRefInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().dropDesktopGitStash(workspaceId, input);
}

export function createDesktopGitBranch(
  workspaceId: string,
  input: DesktopGitCreateBranchInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().createDesktopGitBranch(workspaceId, input);
}

export function createDesktopGitTag(
  workspaceId: string,
  input: DesktopGitCreateTagInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().createDesktopGitTag(workspaceId, input);
}

export function checkoutDesktopGitBranch(
  workspaceId: string,
  input: DesktopGitCheckoutBranchInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().checkoutDesktopGitBranch(workspaceId, input);
}

export function mergeDesktopGitBranchIntoCurrent(
  workspaceId: string,
  input: DesktopGitBranchNameInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().mergeDesktopGitBranchIntoCurrent(workspaceId, input);
}

export function rebaseDesktopGitBranchIntoCurrent(
  workspaceId: string,
  input: DesktopGitBranchNameInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().rebaseDesktopGitBranchIntoCurrent(workspaceId, input);
}

export function renameDesktopGitBranch(
  workspaceId: string,
  input: DesktopGitRenameBranchInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().renameDesktopGitBranch(workspaceId, input);
}

export function deleteDesktopGitBranch(
  workspaceId: string,
  input: DesktopGitDeleteBranchInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().deleteDesktopGitBranch(workspaceId, input);
}

export function fetchDesktopGitRemote(
  workspaceId: string,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().fetchDesktopGitRemote(workspaceId);
}

export function pullDesktopGitRemote(
  workspaceId: string,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().pullDesktopGitRemote(workspaceId);
}

export function pushDesktopGitRemote(
  workspaceId: string,
  input: DesktopGitPushRemoteInput = {},
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().pushDesktopGitRemote(workspaceId, input);
}

export function revertDesktopGitCommit(
  workspaceId: string,
  input: DesktopGitCommitHashInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().revertDesktopGitCommit(workspaceId, input);
}

export function cherryPickDesktopGitCommit(
  workspaceId: string,
  input: DesktopGitCommitHashInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().cherryPickDesktopGitCommit(workspaceId, input);
}

export function resetDesktopGitCommit(
  workspaceId: string,
  input: DesktopGitResetCommitInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().resetDesktopGitCommit(workspaceId, input);
}

export function stageDesktopGitHunks(
  workspaceId: string,
  input: DesktopGitHunkMutationInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().stageDesktopGitHunks(workspaceId, input);
}

export function unstageDesktopGitHunks(
  workspaceId: string,
  input: DesktopGitHunkMutationInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().unstageDesktopGitHunks(workspaceId, input);
}

export function discardDesktopGitHunks(
  workspaceId: string,
  input: DesktopGitHunkMutationInput,
): Promise<DesktopGitOperationResult> {
  return getDesktopGitBridge().discardDesktopGitHunks(workspaceId, input);
}
