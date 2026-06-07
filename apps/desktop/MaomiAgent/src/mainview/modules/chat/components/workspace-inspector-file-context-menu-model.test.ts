import { describe, expect, test } from "bun:test";

import {
  hasWorkspaceInspectorStagedChange,
  hasWorkspaceInspectorUnstagedChange,
  resolveWorkspaceInspectorFileManagerTargetPath,
  resolveWorkspaceInspectorGitActionState,
} from "./workspace-inspector-file-context-menu-model";

describe("workspace inspector file context menu model", () => {
  test("treats dash status codes as no staged or unstaged change", () => {
    expect(hasWorkspaceInspectorStagedChange({ stagedStatus: "-" })).toBe(false);
    expect(hasWorkspaceInspectorUnstagedChange({ unstagedStatus: "-" })).toBe(false);
  });

  test("detects staged and unstaged changes from git status codes", () => {
    expect(hasWorkspaceInspectorStagedChange({ stagedStatus: "M" })).toBe(true);
    expect(hasWorkspaceInspectorUnstagedChange({ unstagedStatus: "??" })).toBe(true);
  });

  test("disables git actions when the current workspace is not a git repository", () => {
    expect(resolveWorkspaceInspectorGitActionState({
      isGitRepo: false,
      nodeType: "file",
      change: {
        path: "src/app.ts",
        status: "modified",
        additions: 3,
        deletions: 1,
        stagedStatus: "M",
        unstagedStatus: "M",
      },
    })).toEqual({
      canViewDiff: false,
      canStage: false,
      canUnstage: false,
    });
  });

  test("enables diff and stage actions for unstaged files", () => {
    expect(resolveWorkspaceInspectorGitActionState({
      isGitRepo: true,
      nodeType: "file",
      change: {
        path: "src/app.ts",
        status: "modified",
        additions: 8,
        deletions: 2,
        stagedStatus: "-",
        unstagedStatus: "M",
      },
    })).toEqual({
      canViewDiff: true,
      canStage: true,
      canUnstage: false,
    });
  });

  test("enables diff and unstage actions for staged files", () => {
    expect(resolveWorkspaceInspectorGitActionState({
      isGitRepo: true,
      nodeType: "file",
      change: {
        path: "src/app.ts",
        status: "modified",
        additions: 8,
        deletions: 2,
        stagedStatus: "M",
        unstagedStatus: "-",
      },
    })).toEqual({
      canViewDiff: true,
      canStage: false,
      canUnstage: true,
    });
  });

  test("skips git actions for directory nodes", () => {
    expect(resolveWorkspaceInspectorGitActionState({
      isGitRepo: true,
      nodeType: "directory",
      change: {
        path: "src",
        status: "modified",
        additions: 8,
        deletions: 2,
        stagedStatus: "M",
        unstagedStatus: "M",
      },
    })).toEqual({
      canViewDiff: false,
      canStage: false,
      canUnstage: false,
    });
  });
});

describe("resolveWorkspaceInspectorFileManagerTargetPath", () => {
  test("opens the containing directory for files", () => {
    expect(resolveWorkspaceInspectorFileManagerTargetPath({
      absolutePath: "E:\\workspace\\MaomiAgent\\src\\app.ts",
      nodeType: "file",
    })).toBe("E:\\workspace\\MaomiAgent\\src");
  });

  test("opens the directory itself for directory nodes", () => {
    expect(resolveWorkspaceInspectorFileManagerTargetPath({
      absolutePath: "E:\\workspace\\MaomiAgent\\src",
      nodeType: "directory",
    })).toBe("E:\\workspace\\MaomiAgent\\src");
  });
});
