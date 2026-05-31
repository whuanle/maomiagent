import { beforeEach, describe, expect, test } from "bun:test";

import {
  DEFAULT_GIT_REVIEW_COMMENTS_WIDTH,
  DEFAULT_GIT_REVIEW_SIDEBAR_WIDTH,
  buildGitReviewLayoutStorageKey,
  readGitReviewLayoutState,
  writeGitReviewLayoutState,
} from "./git-review-layout-state";

function installWindowStorage() {
  const storage = new Map<string, string>();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem(key: string) {
          return storage.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          storage.set(key, value);
        },
        removeItem(key: string) {
          storage.delete(key);
        },
      },
    },
  });
}

describe("git-review-layout-state", () => {
  beforeEach(() => {
    installWindowStorage();
  });

  test("restores a persisted sidebar width for a workspace surface key", () => {
    window.localStorage.setItem(
      buildGitReviewLayoutStorageKey("workspace-a", "commit"),
      JSON.stringify({ sidebarWidth: 420, commentsWidth: 460 }),
    );

    expect(readGitReviewLayoutState("workspace-a", "commit").sidebarWidth).toBe(420);
    expect(readGitReviewLayoutState("workspace-a", "commit").commentsWidth).toBe(460);
  });

  test("falls back when sidebar width is invalid", () => {
    window.localStorage.setItem(
      buildGitReviewLayoutStorageKey("workspace-a", "commit"),
      JSON.stringify({ sidebarWidth: 20, commentsWidth: 1200 }),
    );

    expect(readGitReviewLayoutState("workspace-a", "commit").sidebarWidth).toBe(DEFAULT_GIT_REVIEW_SIDEBAR_WIDTH);
    expect(readGitReviewLayoutState("workspace-a", "commit").commentsWidth).toBe(DEFAULT_GIT_REVIEW_COMMENTS_WIDTH);
  });

  test("writes normalized layout state back to storage", () => {
    expect(writeGitReviewLayoutState("workspace-a", "code", {
      sidebarWidth: 500,
      commentsWidth: 520,
    })).toEqual({
      sidebarWidth: 500,
      commentsWidth: 520,
    });
    expect(window.localStorage.getItem(buildGitReviewLayoutStorageKey("workspace-a", "code"))).toBe(
      JSON.stringify({ sidebarWidth: 500, commentsWidth: 520 }),
    );
  });
});
