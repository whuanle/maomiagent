import type { LanguageCode } from "../../config/titlebar";

export type GitBranchCopy = {
  noBranchLabel: string;
  syncUpToDateLabel: string;
  renamedFromLabel: (path: string) => string;
  fileCountLabel: (count: number) => string;
  parentCountLabel: (count: number) => string;
  branchTypeLocal: string;
  branchTypeRemote: string;
  branchCurrentTag: string;
  noMatchingBranches: string;
  branchSearchPlaceholder: string;
  branchFilterAll: string;
  branchFilterLocal: string;
  branchFilterRemote: string;
  createBranchToolbarLabel: string;
  branchNamePlaceholder: string;
  branchCreateFromHereButton: string;
  branchCreateLocalFromRemote: string;
  createBranchModalTitle: (startPoint?: string) => string;
  createBranchConfirmButton: string;
  createBranchCheckoutLabel: string;
  renameBranchModalTitle: (name: string) => string;
  renameBranchConfirmButton: string;
  checkoutButton: string;
  branchCheckoutDetachedButton: string;
  branchViewHistoryButton: string;
  branchMergeIntoCurrentButton: string;
  branchRebaseCurrentButton: string;
  branchRenameButton: string;
  branchForceDeleteButton: string;
  deleteButton: string;
  detailsButton: string;
  confirmDelete: string;
  confirmCancel: string;
  mergeBranchTitle: (name: string) => string;
  mergeBranchDescription: string;
  rebaseBranchTitle: (name: string) => string;
  rebaseBranchDescription: string;
  deleteBranchTitle: (name: string) => string;
  deleteBranchDescription: string;
  deleteBranchForceTitle: (name: string) => string;
  deleteBranchForceDescription: string;
  fetchRemoteTitle: string;
  pullNowButton: string;
  publishBranchButton: string;
  pushNowButton: string;
  historySearchPlaceholder: string;
  noHistory: string;
  noMatchingHistory: string;
  historyLoadFailed: string;
  historyDetailLoadFailed: string;
  historyDetailTitle: (shortHash?: string) => string;
  historyOpenDiffButton: string;
  historyCreateBranchButton: string;
  historyCheckoutDetachedButton: string;
  historyRevertButton: string;
  historyCherryPickButton: string;
  historyResetMixedButton: string;
  historyResetHardButton: string;
  historyRevertTitle: (hash: string) => string;
  historyRevertDescription: string;
  historyCherryPickTitle: (hash: string) => string;
  historyCherryPickDescription: string;
  historyResetMixedTitle: (hash: string) => string;
  historyResetMixedDescription: string;
  historyResetHardTitle: (hash: string) => string;
  historyResetHardDescription: string;
  copyMessageButton: string;
  copyHashButton: string;
  copiedCommitMessageNotice: string;
  copiedCommitHashNotice: string;
  changedFilesTitle: string;
  noChangedFilesInCommit: string;
  selectCommitToView: string;
  manageButton: string;
};

const EN_US: GitBranchCopy = {
  noBranchLabel: "No branch",
  syncUpToDateLabel: "Up to date",
  renamedFromLabel: (path: string) => `Renamed from ${path}`,
  fileCountLabel: (count: number) => `Files ${count}`,
  parentCountLabel: (count: number) => `Parents ${count}`,
  branchTypeLocal: "Local",
  branchTypeRemote: "Remote",
  branchCurrentTag: "Current",
  noMatchingBranches: "No matching branches",
  branchSearchPlaceholder: "Search branches",
  branchFilterAll: "All",
  branchFilterLocal: "Local",
  branchFilterRemote: "Remote",
  createBranchToolbarLabel: "Create Branch",
  branchNamePlaceholder: "Enter new branch name",
  branchCreateFromHereButton: "Create Branch Here...",
  branchCreateLocalFromRemote: "Create Local Branch",
  createBranchModalTitle: (startPoint?: string) =>
    startPoint ? `Create Local Branch from ${startPoint}` : "Create Local Branch",
  createBranchConfirmButton: "Create Branch",
  createBranchCheckoutLabel: "Checkout after create",
  renameBranchModalTitle: (name: string) => `Rename branch ${name}`,
  renameBranchConfirmButton: "Rename Branch",
  checkoutButton: "Checkout",
  branchCheckoutDetachedButton: "Checkout Detached",
  branchViewHistoryButton: "View History",
  branchMergeIntoCurrentButton: "Merge Into Current Branch",
  branchRebaseCurrentButton: "Rebase Current Branch Onto This",
  branchRenameButton: "Rename Branch",
  branchForceDeleteButton: "Force Delete",
  deleteButton: "Delete",
  detailsButton: "Details",
  confirmDelete: "Delete",
  confirmCancel: "Cancel",
  mergeBranchTitle: (name: string) => `Merge ${name} into the current branch`,
  mergeBranchDescription: "Git will use the default merge strategy. Resolve conflicts manually if they occur.",
  rebaseBranchTitle: (name: string) => `Rebase current branch onto ${name}`,
  rebaseBranchDescription: "This rewrites the current branch onto the selected branch tip. Resolve conflicts before continuing if Git stops.",
  deleteBranchTitle: (name: string) => `Delete branch ${name}`,
  deleteBranchDescription: "This only deletes the local branch and does not affect the remote branch.",
  deleteBranchForceTitle: (name: string) => `Force delete branch ${name}`,
  deleteBranchForceDescription: "This will delete the local branch even if it has unmerged commits.",
  fetchRemoteTitle: "Fetch remote updates",
  pullNowButton: "Pull Now",
  publishBranchButton: "Publish Branch",
  pushNowButton: "Push Now",
  historySearchPlaceholder: "Search hash, author, or subject",
  noHistory: "No commits yet on this branch",
  noMatchingHistory: "No matching commits",
  historyLoadFailed: "Failed to load commit history",
  historyDetailLoadFailed: "Failed to load commit details",
  historyDetailTitle: (shortHash?: string) => (shortHash ? `Commit ${shortHash}` : "Commit Details"),
  historyOpenDiffButton: "Open Diff",
  historyCreateBranchButton: "Create Branch Here...",
  historyCheckoutDetachedButton: "Checkout Detached",
  historyRevertButton: "Revert Commit",
  historyCherryPickButton: "Cherry-pick Commit",
  historyResetMixedButton: "Reset to Here (Mixed)",
  historyResetHardButton: "Reset to Here (Hard)",
  historyRevertTitle: (hash: string) => `Revert commit ${hash}`,
  historyRevertDescription: "Git will create a new commit that reverts the selected commit.",
  historyCherryPickTitle: (hash: string) => `Cherry-pick commit ${hash}`,
  historyCherryPickDescription: "Apply the selected commit onto the current branch.",
  historyResetMixedTitle: (hash: string) => `Reset current branch to ${hash} (mixed)`,
  historyResetMixedDescription: "Move HEAD and index to this commit while keeping working tree changes.",
  historyResetHardTitle: (hash: string) => `Reset current branch to ${hash} (hard)`,
  historyResetHardDescription: "Move HEAD and discard index and working tree changes after this commit.",
  copyMessageButton: "Copy Message",
  copyHashButton: "Copy Hash",
  copiedCommitMessageNotice: "Commit message copied",
  copiedCommitHashNotice: "Commit hash copied",
  changedFilesTitle: "Changed Files",
  noChangedFilesInCommit: "No file changes available for this commit",
  selectCommitToView: "Select a commit to view details",
  manageButton: "Manage",
};

const ZH_CN: GitBranchCopy = {
  noBranchLabel: "无分支",
  syncUpToDateLabel: "已同步",
  renamedFromLabel: (path: string) => `从 ${path} 重命名`,
  fileCountLabel: (count: number) => `文件 ${count}`,
  parentCountLabel: (count: number) => `父提交 ${count}`,
  branchTypeLocal: "本地",
  branchTypeRemote: "远端",
  branchCurrentTag: "当前",
  noMatchingBranches: "没有匹配的分支",
  branchSearchPlaceholder: "搜索分支",
  branchFilterAll: "全部",
  branchFilterLocal: "本地",
  branchFilterRemote: "远端",
  createBranchToolbarLabel: "创建分支",
  branchNamePlaceholder: "输入新分支名",
  branchCreateFromHereButton: "从此处分支新建...",
  branchCreateLocalFromRemote: "建立本地分支",
  createBranchModalTitle: (startPoint?: string) =>
    startPoint ? `从 ${startPoint} 新建本地分支` : "新建本地分支",
  createBranchConfirmButton: "创建分支",
  createBranchCheckoutLabel: "创建后立即切换",
  renameBranchModalTitle: (name: string) => `重命名分支 ${name}`,
  renameBranchConfirmButton: "重命名",
  checkoutButton: "切换",
  branchCheckoutDetachedButton: "Detached 签出",
  branchViewHistoryButton: "查看提交记录",
  branchMergeIntoCurrentButton: "合并到当前分支",
  branchRebaseCurrentButton: "将当前分支变基到此分支",
  branchRenameButton: "重命名分支",
  branchForceDeleteButton: "强制删除",
  deleteButton: "删除",
  detailsButton: "详情",
  confirmDelete: "删除",
  confirmCancel: "取消",
  mergeBranchTitle: (name: string) => `将 ${name} 合并到当前分支`,
  mergeBranchDescription: "会使用 Git 默认合并策略。如果出现冲突，需要你手动处理。",
  rebaseBranchTitle: (name: string) => `将当前分支变基到 ${name}`,
  rebaseBranchDescription: "这会把当前分支改写到所选分支最新提交之上。如果 Git 中途停止，需要先处理冲突再继续。",
  deleteBranchTitle: (name: string) => `删除分支 ${name}`,
  deleteBranchDescription: "仅删除本地分支，不会影响远端分支。",
  deleteBranchForceTitle: (name: string) => `强制删除分支 ${name}`,
  deleteBranchForceDescription: "即使该分支还有未合并提交，也会直接删除本地分支。",
  fetchRemoteTitle: "抓取远端更新",
  pullNowButton: "直接拉取",
  publishBranchButton: "发布分支",
  pushNowButton: "立即推送",
  historySearchPlaceholder: "搜索哈希、作者或提交说明",
  noHistory: "当前分支还没有提交记录",
  noMatchingHistory: "没有匹配的提交记录",
  historyLoadFailed: "提交记录读取失败",
  historyDetailLoadFailed: "提交详情读取失败",
  historyDetailTitle: (shortHash?: string) => (shortHash ? `提交详情 ${shortHash}` : "提交详情"),
  historyOpenDiffButton: "查看差异",
  historyCreateBranchButton: "从该提交新建分支...",
  historyCheckoutDetachedButton: "Detached 签出",
  historyRevertButton: "还原该提交",
  historyCherryPickButton: "拣选该提交",
  historyResetMixedButton: "重置到此处（Mixed）",
  historyResetHardButton: "重置到此处（Hard）",
  historyRevertTitle: (hash: string) => `还原提交 ${hash}`,
  historyRevertDescription: "Git 会新建一个提交，用来撤销这次提交带来的改动。",
  historyCherryPickTitle: (hash: string) => `拣选提交 ${hash}`,
  historyCherryPickDescription: "把这次提交应用到当前分支。",
  historyResetMixedTitle: (hash: string) => `将当前分支重置到 ${hash}（Mixed）`,
  historyResetMixedDescription: "会移动 HEAD 和暂存区，但保留工作区改动。",
  historyResetHardTitle: (hash: string) => `将当前分支重置到 ${hash}（Hard）`,
  historyResetHardDescription: "会移动 HEAD，并丢弃该提交之后的暂存区和工作区改动。",
  copyMessageButton: "复制说明",
  copyHashButton: "复制 Hash",
  copiedCommitMessageNotice: "提交说明已复制",
  copiedCommitHashNotice: "提交 Hash 已复制",
  changedFilesTitle: "变更文件",
  noChangedFilesInCommit: "该提交没有可展示的文件变更",
  selectCommitToView: "请选择一条提交记录查看详情",
  manageButton: "管理",
};

export function createGitBranchCopy(language: LanguageCode): GitBranchCopy {
  return language === "en-US" ? EN_US : ZH_CN;
}