import type { LanguageCode } from "../../config/titlebar";

export type GitSettingsCopy = {
  globalTab: string;
  repositoryTab: string;
  gitignoreTab: string;
  sectionGlobal: string;
  sectionRepository: string;
  sectionGitignore: string;
  sectionGlobalDescription: string;
  sectionRepositoryDescription: string;
  sectionGitignoreDescription: string;
  userName: string;
  userEmail: string;
  defaultBranch: string;
  autocrlf: string;
  autocrlfHelp: string;
  autocrlfOptionFalse: string;
  autocrlfOptionTrue: string;
  autocrlfOptionInput: string;
  pullRebase: string;
  pullRebaseHelp: string;
  pushDefault: string;
  pushDefaultHelp: string;
  fetchPrune: string;
  fetchPruneHelp: string;
  remotes: string;
  remotesHelp: string;
  remoteName: string;
  remoteUrl: string;
  addRemoteButton: string;
  removeRemoteButton: string;
  saveButton: string;
  reloadButton: string;
  loadFailed: string;
  saveFailed: string;
  gitIgnoreButton: string;
  gitIgnoreSavedNotice: string;
  gitIgnoreLoadFailed: string;
};

const ZH_CN: GitSettingsCopy = {
  globalTab: "全局设置",
  repositoryTab: "当前仓库",
  gitignoreTab: ".gitignore",
  sectionGlobal: "Git 全局配置",
  sectionRepository: "当前仓库配置",
  sectionGitignore: ".gitignore 管理",
  sectionGlobalDescription: "作用于当前机器上的所有仓库，适合设置默认身份与通用策略。",
  sectionRepositoryDescription: "仅影响当前工作目录，优先级高于全局配置。",
  sectionGitignoreDescription: "编辑当前仓库的 .gitignore，支持语法高亮与实时修改。",
  userName: "用户名 user.name",
  userEmail: "邮箱 user.email",
  defaultBranch: "默认分支 init.defaultBranch",
  autocrlf: "换行策略 core.autocrlf",
  autocrlfHelp: "控制提交/检出时的换行转换，跨平台协作建议统一团队约定。",
  autocrlfOptionFalse: "false - 不自动转换换行",
  autocrlfOptionTrue: "true - 检出 CRLF，提交时转 LF",
  autocrlfOptionInput: "input - 仅提交时转 LF",
  pullRebase: "拉取策略 pull.rebase",
  pullRebaseHelp: "决定 pull 时使用 merge 还是 rebase，会影响提交历史形态。",
  pushDefault: "推送策略 push.default",
  pushDefaultHelp: "决定直接执行 git push 时默认推送到哪个远端分支。",
  fetchPrune: "抓取清理 fetch.prune",
  fetchPruneHelp: "开启后会在抓取时清理远端已删除的追踪分支。",
  remotes: "远程仓库 remote.*.url",
  remotesHelp: "可为空，也可配置多个远程仓库；保存时会按当前列表重建远程配置。",
  remoteName: "远程名称",
  remoteUrl: "远程地址",
  addRemoteButton: "新增远程",
  removeRemoteButton: "移除",
  saveButton: "保存设置",
  reloadButton: "重新读取",
  loadFailed: "读取 Git 设置失败",
  saveFailed: "保存 Git 设置失败",
  gitIgnoreButton: "管理 .gitignore",
  gitIgnoreSavedNotice: ".gitignore 已保存",
  gitIgnoreLoadFailed: "读取 .gitignore 失败",
};

const EN_US: GitSettingsCopy = {
  globalTab: "Global",
  repositoryTab: "Repository",
  gitignoreTab: ".gitignore",
  sectionGlobal: "Global Git Settings",
  sectionRepository: "Repository Git Settings",
  sectionGitignore: ".gitignore",
  sectionGlobalDescription: "Applies to all repositories on this machine for identity and default behavior.",
  sectionRepositoryDescription: "Applies only to the current workspace and overrides global values.",
  sectionGitignoreDescription: "Edit the current repository .gitignore with syntax highlighting.",
  userName: "User name user.name",
  userEmail: "Email user.email",
  defaultBranch: "Default branch init.defaultBranch",
  autocrlf: "Line endings core.autocrlf",
  autocrlfHelp: "Controls line-ending conversion on checkout/commit across platforms.",
  autocrlfOptionFalse: "false - no line-ending conversion",
  autocrlfOptionTrue: "true - checkout CRLF, commit LF",
  autocrlfOptionInput: "input - convert to LF on commit only",
  pullRebase: "Pull mode pull.rebase",
  pullRebaseHelp: "Defines whether pull uses merge or rebase by default.",
  pushDefault: "Push mode push.default",
  pushDefaultHelp: "Defines the default remote branch target for git push.",
  fetchPrune: "Fetch prune fetch.prune",
  fetchPruneHelp: "Removes stale remote-tracking branches during fetch.",
  remotes: "Remotes remote.*.url",
  remotesHelp: "Can be empty or multiple remotes; save will rebuild remotes from this list.",
  remoteName: "Remote name",
  remoteUrl: "Remote URL",
  addRemoteButton: "Add Remote",
  removeRemoteButton: "Remove",
  saveButton: "Save Settings",
  reloadButton: "Reload",
  loadFailed: "Failed to load git settings",
  saveFailed: "Failed to save git settings",
  gitIgnoreButton: "Manage .gitignore",
  gitIgnoreSavedNotice: ".gitignore saved",
  gitIgnoreLoadFailed: "Failed to load .gitignore",
};

export function createGitSettingsCopy(language: LanguageCode): GitSettingsCopy {
  return language === "en-US" ? EN_US : ZH_CN;
}
