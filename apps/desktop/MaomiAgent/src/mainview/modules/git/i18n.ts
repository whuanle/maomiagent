import type { DesktopGitChangeStatus } from "../../../shared/desktop-git";
import type { LanguageCode } from "../../config/titlebar";

export type GitPageCopy = {
  pageTitle: string;
  workspacePlaceholder: string;
  refresh: string;
  changesTab: string;
  branchesTab: string;
  aiReviewTab: string;
  loading: string;
  emptyNoWorkspace: string;
  emptyNoBridge: string;
  emptyNotGitRepo: string;
  emptyChanges: string;
  emptyBranches: string;
  emptyHistory: string;
  branchLabel: string;
  upstreamLabel: string;
  aheadLabel: string;
  behindLabel: string;
  filesLabel: string;
  branchListTitle: string;
  historyListTitle: string;
  columnPath: string;
  columnStatus: string;
  columnStaged: string;
  columnUnstaged: string;
  columnAdditions: string;
  columnDeletions: string;
  columnBranch: string;
  columnKind: string;
  columnUpstream: string;
  columnSync: string;
  columnCommit: string;
  columnSubject: string;
  columnAuthor: string;
  columnWhen: string;
  columnFilesChanged: string;
  localBranch: string;
  remoteBranch: string;
  currentBranch: string;
  loadFailed: string;
  previewLoadFailed: string;
  saveFailed: string;
  reviewPatch: string;
  gitStagedSectionTitle: string;
  gitUnstagedSectionTitle: string;
  initializeRepositoryButton: string;
  gitIgnoreButton: string;
  gitIgnoreModalTitle: string;
  gitIgnoreEditorPlaceholder: string;
  gitIgnoreSaveAction: string;
  gitIgnoreSavedNotice: string;
  generateCommitMessageButton: string;
  commitMessageGeneratedNotice: string;
  commitMessagePlaceholder: string;
  stageAllBeforeCommit: string;
  amendLatestCommit: string;
  stagedSectionTitle: string;
  unstagedSectionTitle: string;
  stageAction: string;
  stageAllAction: string;
  unstageAction: string;
  unstageAllAction: string;
  discardAction: string;
  discardAllAction: string;
  commitActionStageAndAmend: string;
  commitActionAll: string;
  commitActionAmend: string;
  commitActionCommit: string;
  fetchRemoteTitle: string;
  pullNowButton: string;
  pushNowButton: string;
  publishBranchButton: string;
  discardAllChangesTitle: string;
  discardChangesTitle: (path: string) => string;
  discardChangesDescription: string;
  confirmDiscard: string;
  confirmCancel: string;
  noPreviewSelected: string;
  reviewDrawerEmpty: string;
  reviewNoDiffPlaceholder: string;
  reviewEmptyContent: string;
  unifiedView: string;
  splitView: string;
  beforeLabel: string;
  afterLabel: string;
  renamedFrom: (path: string) => string;
  statusText: (status: DesktopGitChangeStatus) => string;
};

const ZH_CN: GitPageCopy = {
  pageTitle: "Git",
  workspacePlaceholder: "选择工作区",
  refresh: "刷新",
  changesTab: "变更",
  branchesTab: "分支",
  aiReviewTab: "AI审查代码",
  loading: "正在加载",
  emptyNoWorkspace: "暂无工作区",
  emptyNoBridge: "桌面 Git 通道不可用",
  emptyNotGitRepo: "当前工作区不是 Git 仓库",
  emptyChanges: "暂无变更",
  emptyBranches: "暂无分支",
  emptyHistory: "暂无提交历史",
  branchLabel: "分支",
  upstreamLabel: "上游",
  aheadLabel: "领先",
  behindLabel: "落后",
  filesLabel: "文件",
  branchListTitle: "分支列表",
  historyListTitle: "提交历史",
  columnPath: "路径",
  columnStatus: "状态",
  columnStaged: "暂存",
  columnUnstaged: "未暂存",
  columnAdditions: "+",
  columnDeletions: "-",
  columnBranch: "分支",
  columnKind: "类型",
  columnUpstream: "上游",
  columnSync: "同步",
  columnCommit: "提交",
  columnSubject: "标题",
  columnAuthor: "作者",
  columnWhen: "时间",
  columnFilesChanged: "文件数",
  localBranch: "本地",
  remoteBranch: "远程",
  currentBranch: "当前",
  loadFailed: "加载失败",
  previewLoadFailed: "预览加载失败",
  saveFailed: "保存失败",
  reviewPatch: "补丁",
  gitStagedSectionTitle: "已暂存",
  gitUnstagedSectionTitle: "未暂存",
  initializeRepositoryButton: "初始化 Git 仓库",
  gitIgnoreButton: ".gitignore",
  gitIgnoreModalTitle: "编辑 .gitignore",
  gitIgnoreEditorPlaceholder: "每行一条忽略规则",
  gitIgnoreSaveAction: "保存",
  gitIgnoreSavedNotice: ".gitignore 已保存",
  generateCommitMessageButton: "生成提交消息",
  commitMessageGeneratedNotice: "已生成提交消息",
  commitMessagePlaceholder: "输入提交消息，必填",
  stageAllBeforeCommit: "提交前暂存全部更改",
  amendLatestCommit: "修订最新提交",
  stagedSectionTitle: "已暂存",
  unstagedSectionTitle: "未暂存",
  stageAction: "暂存",
  stageAllAction: "全部暂存",
  unstageAction: "撤回暂存",
  unstageAllAction: "全部撤回暂存",
  discardAction: "丢弃",
  discardAllAction: "全部丢弃",
  commitActionStageAndAmend: "暂存后修订",
  commitActionAll: "全部提交",
  commitActionAmend: "修订提交",
  commitActionCommit: "提交",
  fetchRemoteTitle: "抓取远端更新",
  pullNowButton: "直接拉取",
  pushNowButton: "立即推送",
  publishBranchButton: "发布分支",
  discardAllChangesTitle: "丢弃全部未暂存更改",
  discardChangesTitle: (path: string) => `丢弃 ${path}`,
  discardChangesDescription: "这会回退工作区中的未暂存更改，操作后无法恢复。",
  confirmDiscard: "丢弃",
  confirmCancel: "取消",
  noPreviewSelected: "选择一个文件查看差异",
  reviewDrawerEmpty: "暂无可预览内容",
  reviewNoDiffPlaceholder: "当前文件没有可显示的差异。",
  reviewEmptyContent: "没有可显示的内容",
  unifiedView: "统一",
  splitView: "分栏",
  beforeLabel: "变更前",
  afterLabel: "变更后",
  renamedFrom: (path: string) => `从 ${path} 重命名`,
  statusText: (status: DesktopGitChangeStatus) => {
    if (status === "added" || status === "untracked") {
      return "新增";
    }
    if (status === "deleted") {
      return "删除";
    }
    if (status === "renamed") {
      return "重命名";
    }
    if (status === "conflict") {
      return "冲突";
    }
    return "修改";
  },
};

const EN_US: GitPageCopy = {
  pageTitle: "Git",
  workspacePlaceholder: "Select workspace",
  refresh: "Refresh",
  changesTab: "Changes",
  branchesTab: "Branches",
  aiReviewTab: "AI Code Review",
  loading: "Loading",
  emptyNoWorkspace: "No workspace",
  emptyNoBridge: "Desktop Git bridge is unavailable",
  emptyNotGitRepo: "The current workspace is not a Git repository",
  emptyChanges: "No changes",
  emptyBranches: "No branches",
  emptyHistory: "No commit history",
  branchLabel: "Branch",
  upstreamLabel: "Upstream",
  aheadLabel: "Ahead",
  behindLabel: "Behind",
  filesLabel: "Files",
  branchListTitle: "Branches",
  historyListTitle: "History",
  columnPath: "Path",
  columnStatus: "Status",
  columnStaged: "Staged",
  columnUnstaged: "Unstaged",
  columnAdditions: "+",
  columnDeletions: "-",
  columnBranch: "Branch",
  columnKind: "Kind",
  columnUpstream: "Upstream",
  columnSync: "Sync",
  columnCommit: "Commit",
  columnSubject: "Subject",
  columnAuthor: "Author",
  columnWhen: "When",
  columnFilesChanged: "Files",
  localBranch: "Local",
  remoteBranch: "Remote",
  currentBranch: "Current",
  loadFailed: "Load failed",
  previewLoadFailed: "Preview load failed",
  saveFailed: "Save failed",
  reviewPatch: "Patch",
  gitStagedSectionTitle: "Staged",
  gitUnstagedSectionTitle: "Unstaged",
  initializeRepositoryButton: "Initialize Git Repository",
  gitIgnoreButton: ".gitignore",
  gitIgnoreModalTitle: "Edit .gitignore",
  gitIgnoreEditorPlaceholder: "Enter ignore rules, one per line",
  gitIgnoreSaveAction: "Save",
  gitIgnoreSavedNotice: ".gitignore saved",
  generateCommitMessageButton: "Generate commit message",
  commitMessageGeneratedNotice: "Commit message generated",
  commitMessagePlaceholder: "Enter a commit message",
  stageAllBeforeCommit: "Stage all changes before commit",
  amendLatestCommit: "Amend latest commit",
  stagedSectionTitle: "Staged",
  unstagedSectionTitle: "Unstaged",
  stageAction: "Stage",
  stageAllAction: "Stage All",
  unstageAction: "Unstage",
  unstageAllAction: "Unstage All",
  discardAction: "Discard",
  discardAllAction: "Discard All",
  commitActionStageAndAmend: "Stage & Amend",
  commitActionAll: "Commit All",
  commitActionAmend: "Amend",
  commitActionCommit: "Commit",
  fetchRemoteTitle: "Fetch remote updates",
  pullNowButton: "Pull Now",
  pushNowButton: "Push Now",
  publishBranchButton: "Publish Branch",
  discardAllChangesTitle: "Discard all unstaged changes",
  discardChangesTitle: (path: string) => `Discard ${path}`,
  discardChangesDescription: "This will revert unstaged changes in the working tree and cannot be undone.",
  confirmDiscard: "Discard",
  confirmCancel: "Cancel",
  noPreviewSelected: "Select a file to preview the diff",
  reviewDrawerEmpty: "Nothing to preview",
  reviewNoDiffPlaceholder: "No diff is available for this file.",
  reviewEmptyContent: "No preview content",
  unifiedView: "Unified",
  splitView: "Split",
  beforeLabel: "Before",
  afterLabel: "After",
  renamedFrom: (path: string) => `Renamed from ${path}`,
  statusText: (status: DesktopGitChangeStatus) => {
    if (status === "added" || status === "untracked") {
      return "Added";
    }
    if (status === "deleted") {
      return "Deleted";
    }
    if (status === "renamed") {
      return "Renamed";
    }
    if (status === "conflict") {
      return "Conflict";
    }
    return "Modified";
  },
};

export function createGitTranslator(language: LanguageCode): GitPageCopy {
  return language === "en-US" ? EN_US : ZH_CN;
}