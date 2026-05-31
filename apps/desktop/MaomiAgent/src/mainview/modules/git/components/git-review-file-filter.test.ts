import { describe, expect, test } from "bun:test";

import {
  filterReviewableGitItems,
  filterReviewableHistoryFiles,
  filterReviewableWorkspacePaths,
  isLikelyBinaryReviewItem,
  isLikelyBinaryReviewPath,
} from "./git-review-file-filter";

describe("git-review-file-filter", () => {
  test("treats common binary asset paths as non-reviewable", () => {
    expect(isLikelyBinaryReviewPath("assets/logo.png")).toBe(true);
    expect(isLikelyBinaryReviewPath("assets/Hero.WEBP")).toBe(true);
    expect(isLikelyBinaryReviewPath("docs/spec.pdf")).toBe(true);
    expect(isLikelyBinaryReviewPath("src/app.ts")).toBe(false);
    expect(isLikelyBinaryReviewPath("icons/logo.svg")).toBe(false);
  });

  test("treats binary diff markers as non-reviewable", () => {
    expect(isLikelyBinaryReviewItem({
      path: "assets/banner.dat",
      patch: "Binary files a/assets/banner.dat and b/assets/banner.dat differ",
      before: "",
      after: "",
    } as never)).toBe(true);
  });

  test("filters binary candidates from workspace, commit, and compare inputs", () => {
    expect(filterReviewableWorkspacePaths([
      "src/app.ts",
      "assets/logo.png",
      "docs/guide.md",
    ])).toEqual([
      "src/app.ts",
      "docs/guide.md",
    ]);

    expect(filterReviewableHistoryFiles([
      {
        path: "assets/logo.png",
        status: "modified",
        statusCode: "M",
        additions: 0,
        deletions: 0,
      },
      {
        path: "src/app.ts",
        status: "modified",
        statusCode: "M",
        additions: 12,
        deletions: 3,
      },
    ])).toEqual([
      {
        path: "src/app.ts",
        status: "modified",
        statusCode: "M",
        additions: 12,
        deletions: 3,
      },
    ]);

    expect(filterReviewableGitItems([
      {
        path: "assets/logo.png",
        patch: "",
        before: "",
        after: "",
      },
      {
        path: "src/app.ts",
        patch: "@@ -1 +1 @@",
        before: "a",
        after: "b",
      },
    ] as never)).toEqual([
      {
        path: "src/app.ts",
        patch: "@@ -1 +1 @@",
        before: "a",
        after: "b",
      },
    ]);
  });
});
