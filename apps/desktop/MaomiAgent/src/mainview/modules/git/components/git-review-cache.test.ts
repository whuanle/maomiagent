import { describe, expect, test } from "bun:test";

import {
  buildGitReviewCacheRelativePath,
  isGitReviewCacheStale,
  parseGitReviewCachePayload,
} from "./git-review-cache";

describe("git-review-cache", () => {
  test("builds a stable hashed cache file path for commit review", () => {
    const path = buildGitReviewCacheRelativePath({
      surface: "commit",
      cacheKey: "commit::commit::abc123",
    });

    expect(path).toMatch(/^\.maomi\/git-review\/commit\/[a-f0-9]+\.json$/);
  });

  test("marks cache stale when signature content changes", () => {
    expect(isGitReviewCacheStale({
      saved: {
        scopeType: "project",
        fileCount: 10,
        pathsDigest: "aaa",
      },
      current: {
        scopeType: "project",
        fileCount: 11,
        pathsDigest: "bbb",
      },
    })).toBe(true);
  });

  test("treats reordered signature keys as equivalent", () => {
    expect(isGitReviewCacheStale({
      saved: {
        fileCount: 10,
        pathsDigest: "aaa",
      },
      current: {
        pathsDigest: "aaa",
        fileCount: 10,
      },
    })).toBe(false);
  });

  test("parses and normalizes a valid cache payload", () => {
    expect(parseGitReviewCachePayload(JSON.stringify({
      version: 1,
      surface: "code",
      workspaceId: "workspace-a",
      cacheKey: "code::project",
      savedAt: "2026-06-01T12:00:00.000Z",
      signature: { fileCount: 2 },
      selection: { scopeType: "project" },
      results: { reviewedPaths: ["a.ts"] },
    }))).toEqual({
      version: 1,
      surface: "code",
      workspaceId: "workspace-a",
      cacheKey: "code::project",
      savedAt: "2026-06-01T12:00:00.000Z",
      stale: undefined,
      signature: { fileCount: 2 },
      selection: { scopeType: "project" },
      results: { reviewedPaths: ["a.ts"] },
    });
  });

  test("returns null for malformed cache payloads", () => {
    expect(parseGitReviewCachePayload("{not-json")).toBeNull();
    expect(parseGitReviewCachePayload(JSON.stringify({
      version: 2,
      surface: "code",
    }))).toBeNull();
  });
});
