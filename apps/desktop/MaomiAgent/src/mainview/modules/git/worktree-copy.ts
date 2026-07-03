import type { LanguageCode } from "../../config/titlebar";

export type GitWorktreeCopy = {
  searchPlaceholder: string;
  addButton: string;
  pruneButton: string;
  openDirectoryButton: string;
  pathColumn: string;
  branchColumn: string;
  headColumn: string;
  statusColumn: string;
  actionsColumn: string;
  noBranchLabel: string;
  detachedLabel: string;
  currentLabel: string;
  lockedLabel: string;
  prunableLabel: string;
  bareLabel: string;
  removeButton: string;
  removeWorktreeTitle: (path: string) => string;
  removeWorktreeDescription: string;
  confirmDelete: string;
  confirmCancel: string;
  addModalTitle: string;
  addModalConfirm: string;
  addModeLabel: string;
  addModeNewBranch: string;
  addModeExistingRef: string;
  pathLabel: string;
  pathPlaceholder: string;
  branchNameLabel: string;
  branchNamePlaceholder: string;
  startPointLabel: string;
  startPointPlaceholder: string;
  forceLabel: string;
  detachLabel: string;
  loadFailed: string;
  emptyDescription: string;
};

const ZH_CN: GitWorktreeCopy = {
  searchPlaceholder: "搜索路径、分支或提交",
  addButton: "新建工作树",
  pruneButton: "清理记录",
  openDirectoryButton: "打开目录",
  pathColumn: "路径",
  branchColumn: "分支",
  headColumn: "HEAD",
  statusColumn: "状态",
  actionsColumn: "操作",
  noBranchLabel: "Detached",
  detachedLabel: "Detached",
  currentLabel: "当前",
  lockedLabel: "已锁定",
  prunableLabel: "可清理",
  bareLabel: "Bare",
  removeButton: "移除",
  removeWorktreeTitle: (path: string) => `移除工作树 ${path}`,
  removeWorktreeDescription: "会删除工作树目录并从 worktree 列表移除，操作后无法恢复。",
  confirmDelete: "移除",
  confirmCancel: "取消",
  addModalTitle: "新建工作树",
  addModalConfirm: "创建",
  addModeLabel: "创建方式",
  addModeNewBranch: "创建新分支 worktree",
  addModeExistingRef: "基于已有分支/提交",
  pathLabel: "目标路径",
  pathPlaceholder: "例如 ../repo-feature-a",
  branchNameLabel: "新分支名（可选）",
  branchNamePlaceholder: "例如 feature/worktree-a",
  startPointLabel: "起点（可选）",
  startPointPlaceholder: "默认为 HEAD，可填 main 或提交哈希",
  forceLabel: "强制创建",
  detachLabel: "Detached 模式",
  loadFailed: "工作树读取失败",
  emptyDescription: "暂无工作树",
};

const EN_US: GitWorktreeCopy = {
  searchPlaceholder: "Search by path, branch, or commit",
  addButton: "Add Worktree",
  pruneButton: "Prune",
  openDirectoryButton: "Open Directory",
  pathColumn: "Path",
  branchColumn: "Branch",
  headColumn: "HEAD",
  statusColumn: "Status",
  actionsColumn: "Actions",
  noBranchLabel: "Detached",
  detachedLabel: "Detached",
  currentLabel: "Current",
  lockedLabel: "Locked",
  prunableLabel: "Prunable",
  bareLabel: "Bare",
  removeButton: "Remove",
  removeWorktreeTitle: (path: string) => `Remove worktree ${path}`,
  removeWorktreeDescription: "This removes the worktree directory and unregisters it from git worktree list.",
  confirmDelete: "Remove",
  confirmCancel: "Cancel",
  addModalTitle: "Add Worktree",
  addModalConfirm: "Create",
  addModeLabel: "Mode",
  addModeNewBranch: "Create from a new branch",
  addModeExistingRef: "Create from existing branch/commit",
  pathLabel: "Target path",
  pathPlaceholder: "For example ../repo-feature-a",
  branchNameLabel: "Branch name (optional)",
  branchNamePlaceholder: "For example feature/worktree-a",
  startPointLabel: "Start point (optional)",
  startPointPlaceholder: "Defaults to HEAD, e.g. main or commit hash",
  forceLabel: "Force create",
  detachLabel: "Detached mode",
  loadFailed: "Failed to load worktrees",
  emptyDescription: "No worktrees",
};

export function createGitWorktreeCopy(language: LanguageCode): GitWorktreeCopy {
  return language === "en-US" ? EN_US : ZH_CN;
}
