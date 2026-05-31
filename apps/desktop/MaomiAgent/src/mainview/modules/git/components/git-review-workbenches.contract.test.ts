import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

describe("git review workbenches contracts", () => {
  test("commit review workbench pins the shared base to commit surface", async () => {
    const sourceText = await source("./git-commit-review-workbench.tsx");

    expect(sourceText).toContain('surface="commit"');
    expect(sourceText).toContain("GitAiReviewWorkbenchNext");
  });

  test("shared review workbench removes commit target mode toggles and keeps in-memory review cache", async () => {
    const sourceText = await source("./git-ai-review-workbench-next.tsx");

    expect(sourceText).toContain("const reviewWorkbenchSessionCache = new Map");
    expect(sourceText).toContain("hasGitReviewWorkbenchCachedResults");
    expect(sourceText).toContain('className="git-ai-review-run-button"');
    expect(sourceText).not.toContain('className="git-ai-review-commit-stage-copy"');
  });
});
