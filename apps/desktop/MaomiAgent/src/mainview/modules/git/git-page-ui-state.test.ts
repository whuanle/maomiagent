import { beforeEach, describe, expect, test } from "bun:test";

import {
  readGitPageUiState,
  writeGitPageUiState,
  type GitPageUiState,
} from "./git-page-ui-state";

const STORAGE_KEY = "maomi.desktop.git-page-ui-state";

function installWindowStorage() {
  const createStorage = () => {
    const storage = new Map<string, string>();

    return {
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
  };

  const localStorage = createStorage();
  const sessionStorage = createStorage();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      sessionStorage,
      location: { hash: "" },
    },
  });

  return { localStorage, sessionStorage };
}

describe("git-page-ui-state", () => {
  beforeEach(() => {
    const { localStorage, sessionStorage } = installWindowStorage();
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  });

  test("persists git page ui state in localStorage", () => {
    const state: GitPageUiState = {
      workspaceId: "workspace-1",
      activeTab: "code-review",
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

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(state));
    expect(readGitPageUiState()).toEqual(state);
  });

  test("returns null for malformed stored data", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not-valid-json");

    expect(readGitPageUiState()).toBeNull();
  });

  test("migrates legacy sessionStorage state into localStorage on first read", () => {
    const state: GitPageUiState = {
      workspaceId: "workspace-legacy",
      activeTab: "code-review",
      commitReview: {
        targetType: "commit",
        selectedTargetId: "abc123",
      },
      codeReview: {
        scopeType: "file",
        selectedScopePath: "apps/desktop/MaomiAgent/src/mainview/modules/git/git-page-ui-state.ts",
        selectedIssueId: "issue-7",
      },
    };

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    expect(readGitPageUiState()).toEqual(state);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(state));
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("does not resurrect stale legacy sessionStorage data after a new local write", () => {
    const legacyState: GitPageUiState = {
      workspaceId: "workspace-legacy",
      activeTab: "changes",
    };
    const durableState: GitPageUiState = {
      workspaceId: "workspace-current",
      activeTab: "code-review",
      codeReview: {
        scopeType: "project",
      },
    };

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(legacyState));

    writeGitPageUiState(durableState);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    window.localStorage.removeItem(STORAGE_KEY);

    expect(readGitPageUiState()).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("prefers durable localStorage state and clears stale legacy sessionStorage on read", () => {
    const durableState: GitPageUiState = {
      workspaceId: "workspace-current",
      activeTab: "commit-review",
      commitReview: {
        targetType: "pr",
        selectedTargetId: "pr-202",
      },
    };
    const legacyState: GitPageUiState = {
      workspaceId: "workspace-stale",
      activeTab: "changes",
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(durableState));
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(legacyState));

    expect(readGitPageUiState()).toEqual(durableState);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    window.localStorage.removeItem(STORAGE_KEY);

    expect(readGitPageUiState()).toBeNull();
  });

  test("drops unknown legacy tab values and keeps a safe fallback shape", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
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

  test("clears malformed legacy sessionStorage data after a safe read failure", () => {
    window.sessionStorage.setItem(STORAGE_KEY, "{not-valid-json");

    expect(readGitPageUiState()).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("removes the storage entry when the normalized state is empty", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      workspaceId: "workspace-1",
    }));

    writeGitPageUiState({
      workspaceId: "   ",
      activeTab: "invalid" as GitPageUiState["activeTab"],
      commitReview: {
        selectedFilePath: "   ",
      },
      codeReview: {
        selectedFilePath: "   ",
      },
    });

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(readGitPageUiState()).toBeNull();
  });
});
