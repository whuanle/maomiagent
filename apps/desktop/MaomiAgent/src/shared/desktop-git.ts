export const DESKTOP_GIT_CHANGE_STATUS_VALUES = [
  "added",
  "modified",
  "deleted",
  "renamed",
  "untracked",
  "conflict",
] as const;

export const DESKTOP_GIT_HUNK_SECTION_VALUES = ["staged", "unstaged"] as const;

export const DESKTOP_GIT_REVIEW_SCOPE_VALUES = ["changed", "staged"] as const;

export const DESKTOP_GIT_HISTORY_SCOPE_VALUES = ["workspace", "repository"] as const;

export const DESKTOP_GIT_COMMIT_RESET_MODE_VALUES = ["mixed", "hard"] as const;

export type DesktopGitChangeStatus =
  (typeof DESKTOP_GIT_CHANGE_STATUS_VALUES)[number];

export type DesktopGitHunkSection =
  (typeof DESKTOP_GIT_HUNK_SECTION_VALUES)[number];

export type DesktopGitReviewScope =
  (typeof DESKTOP_GIT_REVIEW_SCOPE_VALUES)[number];

export type DesktopGitHistoryScope =
  (typeof DESKTOP_GIT_HISTORY_SCOPE_VALUES)[number];

export type DesktopGitCommitResetMode =
  (typeof DESKTOP_GIT_COMMIT_RESET_MODE_VALUES)[number];

export type DesktopGitIgnoreResult = {
  workspaceId: string;
  rootPath: string;
  isGitRepo: boolean;
  path: ".gitignore";
  absolutePath: string;
  exists: boolean;
  content: string;
};

export type DesktopGitGlobalSettings = {
  userName?: string;
  userEmail?: string;
  defaultBranch?: string;
  autocrlf?: string;
  pullRebase?: string;
  pushDefault?: string;
  fetchPrune?: string;
};

export type DesktopGitRemoteSetting = {
  name: string;
  url: string;
};

export type DesktopGitRepositorySettings = DesktopGitGlobalSettings & {
  remotes?: DesktopGitRemoteSetting[];
  originUrl?: string;
};

export type DesktopGitSettingsResult = {
  workspaceId: string;
  rootPath: string;
  isGitRepo: boolean;
  global: DesktopGitGlobalSettings;
  repository: DesktopGitRepositorySettings;
};

export type DesktopGitChangeItem = {
  path: string;
  previousPath?: string;
  status: DesktopGitChangeStatus;
  stagedStatus?: string;
  unstagedStatus?: string;
  additions: number;
  deletions: number;
  stagedAdditions?: number;
  stagedDeletions?: number;
  unstagedAdditions?: number;
  unstagedDeletions?: number;
};

export type DesktopGitChangesSummary = {
  files: number;
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
  untracked: number;
  conflict: number;
  additions: number;
  deletions: number;
};

export type DesktopGitChangesResult = {
  workspaceId: string;
  rootPath: string;
  isGitRepo: boolean;
  clean: boolean;
  branch?: string;
  upstream?: string;
  detached: boolean;
  ahead: number;
  behind: number;
  lastCommitHash?: string;
  lastCommitSubject?: string;
  stagedSummary: DesktopGitChangesSummary;
  unstagedSummary: DesktopGitChangesSummary;
  items: DesktopGitChangeItem[];
  summary: DesktopGitChangesSummary;
};

export type DesktopGitReviewItem = DesktopGitChangeItem & {
  before: string;
  after: string;
  patch: string;
};

export type DesktopGitReviewResult = Omit<DesktopGitChangesResult, "items"> & {
  items: DesktopGitReviewItem[];
};

export type DesktopGitReviewDetailQuery = {
  path: string;
  scope?: DesktopGitReviewScope;
  baseRef?: string;
  headRef?: string;
};

export type DesktopGitReviewDetailResult = {
  workspaceId: string;
  rootPath: string;
  isGitRepo: boolean;
  path: string;
  scope?: DesktopGitReviewScope;
  baseRef?: string;
  headRef?: string;
  item: DesktopGitReviewItem | null;
};

export type DesktopGitBranchItem = {
  name: string;
  fullName: string;
  kind: "local" | "remote";
  current: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
  detached: boolean;
  lastCommitHash?: string;
  lastCommitSubject?: string;
};

export type DesktopGitBranchesResult = {
  workspaceId: string;
  rootPath: string;
  isGitRepo: boolean;
  currentBranch?: string;
  detached: boolean;
  items: DesktopGitBranchItem[];
};

export type DesktopGitStashItem = {
  ref: string;
  index: number;
  message: string;
  createdRelative?: string;
};

export type DesktopGitStashesResult = {
  workspaceId: string;
  rootPath: string;
  isGitRepo: boolean;
  items: DesktopGitStashItem[];
};

export type DesktopGitWorktreeItem = {
  path: string;
  branch?: string;
  head?: string;
  bare: boolean;
  detached: boolean;
  locked: boolean;
  lockedReason?: string;
  prunable: boolean;
  prunableReason?: string;
  current: boolean;
};

export type DesktopGitWorktreesResult = {
  workspaceId: string;
  rootPath: string;
  isGitRepo: boolean;
  items: DesktopGitWorktreeItem[];
};

export type DesktopGitHistoryItem = {
  hash: string;
  shortHash: string;
  subject: string;
  authorName?: string;
  authorEmail?: string;
  authoredAt?: string;
  authoredRelative?: string;
  parentHashes: string[];
  refs: string[];
  filesChanged: number;
  additions: number;
  deletions: number;
};

export type DesktopGitHistoryQuery = {
  limit?: number;
  offset?: number;
  ref?: string;
  refs?: string[];
  includeStats?: boolean;
  scope?: DesktopGitHistoryScope;
};

export type DesktopGitHistoryResult = {
  workspaceId: string;
  rootPath: string;
  isGitRepo: boolean;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
  items: DesktopGitHistoryItem[];
};

export type DesktopGitHistoryDetailFile = {
  path: string;
  previousPath?: string;
  status: DesktopGitChangeStatus;
  statusCode: string;
  additions: number;
  deletions: number;
};

export type DesktopGitHistoryDetailResult = {
  workspaceId: string;
  rootPath: string;
  isGitRepo: boolean;
  hash: string;
  shortHash: string;
  subject: string;
  body?: string;
  authorName?: string;
  authorEmail?: string;
  authoredAt?: string;
  authoredRelative?: string;
  refs: string[];
  parentHashes: string[];
  filesChanged: number;
  additions: number;
  deletions: number;
  files: DesktopGitHistoryDetailFile[];
};

export type DesktopGitHunkItem = {
  index: number;
  header: string;
  patch: string;
  additions: number;
  deletions: number;
};

export type DesktopGitHunksQuery = {
  path: string;
  section: DesktopGitHunkSection;
};

export type DesktopGitHunksResult = {
  workspaceId: string;
  rootPath: string;
  isGitRepo: boolean;
  path: string;
  section: DesktopGitHunkSection;
  supported: boolean;
  reason?: string;
  items: DesktopGitHunkItem[];
};

export type DesktopGitOperationResult = {
  workspaceId: string;
  rootPath: string;
  ok: true;
  message: string;
  branch?: string;
  commitHash?: string;
};

export type DesktopGitCommitMessageSuggestionsQuery = {
  scope?: DesktopGitReviewScope;
  channelId?: string;
  modelId?: string;
};

export type DesktopGitCommitMessageSuggestionsResult = {
  workspaceId: string;
  strategy: "upstream" | "heuristic";
  scope: DesktopGitReviewScope;
  summary: string;
  suggestions: string[];
  resolvedChannelId?: string;
  resolvedModelId?: string;
  failureReason?: string;
};

export type DesktopGitModuleSnapshotQuery = {
  historyLimit?: number;
};

export type DesktopGitModuleSnapshotResult = {
  workspaceId: string;
  rootPath: string;
  isGitRepo: boolean;
  fetchedAt: string;
  historyLimit: number;
  changes: DesktopGitChangesResult;
  branches: DesktopGitBranchesResult;
  stashes: DesktopGitStashesResult;
  worktrees: DesktopGitWorktreesResult;
  history: DesktopGitHistoryResult;
};

export type DesktopGitCompareQuery = {
  baseRef: string;
  headRef: string;
};

export type DesktopGitCompareResult = {
  workspaceId: string;
  rootPath: string;
  isGitRepo: boolean;
  clean: boolean;
  baseRef: string;
  headRef: string;
  comparisonLabel: string;
  summary: DesktopGitChangesSummary;
  items: DesktopGitReviewItem[];
};

export type DesktopGitStageChangesInput = {
  all?: boolean;
  paths?: string[];
};

export type DesktopGitUnstageChangesInput = {
  all?: boolean;
  paths?: string[];
};

export type DesktopGitDiscardChangesInput = {
  all?: boolean;
  paths?: string[];
};

export type DesktopGitCommitChangesInput = {
  message: string;
  amend?: boolean;
  stageAll?: boolean;
};

export type DesktopGitSaveIgnoreInput = {
  content: string;
};

export type DesktopGitSaveSettingsInput = {
  global?: DesktopGitGlobalSettings;
  repository?: DesktopGitRepositorySettings;
};

export type DesktopGitCreateStashInput = {
  message?: string;
  includeUntracked?: boolean;
};

export type DesktopGitStashRefInput = {
  ref: string;
};

export type DesktopGitCreateBranchInput = {
  name: string;
  startPoint?: string;
  checkout?: boolean;
};

export type DesktopGitCreateTagInput = {
  name: string;
  message?: string;
  ref?: string;
  push?: boolean;
};

export type DesktopGitCheckoutBranchInput = {
  name: string;
  detach?: boolean;
};

export type DesktopGitBranchNameInput = {
  name: string;
};

export type DesktopGitRenameBranchInput = {
  name: string;
  nextName: string;
};

export type DesktopGitDeleteBranchInput = {
  name: string;
  force?: boolean;
};

export type DesktopGitCreateWorktreeInput = {
  path: string;
  branchName?: string;
  startPoint?: string;
  detach?: boolean;
  force?: boolean;
};

export type DesktopGitRemoveWorktreeInput = {
  path: string;
  force?: boolean;
};

export type DesktopGitPushRemoteInput = {
  setUpstream?: boolean;
};

export type DesktopGitCommitHashInput = {
  hash: string;
};

export type DesktopGitResetCommitInput = {
  hash: string;
  mode?: DesktopGitCommitResetMode;
};

export type DesktopGitHunkMutationInput = {
  path: string;
  hunkIndices: number[];
};
