import { describe, expect, test } from "bun:test";

import {
  hasWorkspaceInspectorStagedChange,
  hasWorkspaceInspectorUnstagedChange,
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
});
