import { beforeEach, describe, expect, test } from "bun:test";

import {
  readGitPageUiState,
  writeGitPageUiState,
  type GitPageUiState,
} from "./git-page-ui-state";

const STORAGE_KEY = "maomi.desktop.git-page-ui-state";

function installWindowStorage() {
  const storage = new Map<string, string>();
  const sessionStorage = {
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
    removeItem(key: string) {
      storage.delete(key);
    },
    clear() {
      storage.clear();
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage,
      location: { hash: "" },
    },
  });

  return sessionStorage;
}

describe("git-page-ui-state", () => {
  beforeEach(() => {
    const sessionStorage = installWindowStorage();
    sessionStorage.removeItem(STORAGE_KEY);
  });

  test("persists the new top-level review tabs and per-surface selection memory", () => {
    const state: GitPageUiState = {
      workspaceId: "workspace-1",
      activeTab: "commit-review",
      commitReview: {
        targetType: "pr",
        selectedTargetId: "pr-101",
        selectedFilePath: "apps/desktop/MaomiAgent/src/mainview/modules/git/page.tsx",
        selectedFindingId: "finding-1",
      },
      codeReview: {
        scopeType: "directory",
        selectedScopePath: "apps/desktop/MaomiAgent/src/mainview/modules/git",
        selectedFilePath: "apps/desktop/MaomiAgent/src/mainview/modules/git/page.tsx",
        selectedIssueId: "issue-1",
      },
    };

    writeGitPageUiState(state);

    expect(readGitPageUiState()).toEqual(state);
  });

  test("drops unknown legacy tab values and keeps a safe fallback shape", () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      workspaceId: "workspace-1",
      activeTab: "ai-review",
      selectedReviewFilePath: "legacy.tsx",
    }));

    expect(readGitPageUiState()).toEqual({
      workspaceId: "workspace-1",
      activeTab: undefined,
      commitReview: undefined,
      codeReview: undefined,
    });
  });
});
