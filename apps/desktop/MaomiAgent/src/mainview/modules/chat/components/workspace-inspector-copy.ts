import type { LanguageCode } from "../../../config/titlebar";

export type WorkspaceInspectorCopy = {
  loading: string;
  noFiles: string;
  noChanges: string;
  notGitRepo: string;
  filesTitle: string;
  changesTitle: string;
};

export function resolveWorkspaceInspectorCopy(language: LanguageCode): WorkspaceInspectorCopy {
  if (language === "en-US") {
    return {
      loading: "Loading...",
      noFiles: "No files in the current workspace",
      noChanges: "No code changes in the current workspace",
      notGitRepo: "The current workspace is not a Git repository",
      filesTitle: "Workspace files",
      changesTitle: "Changes",
    };
  }

  return {
    loading: "加载中...",
    noFiles: "当前工作区没有文件",
    noChanges: "当前没有代码更改",
    notGitRepo: "当前工作区不是 Git 仓库",
    filesTitle: "工作区文件",
    changesTitle: "代码改动",
  };
}