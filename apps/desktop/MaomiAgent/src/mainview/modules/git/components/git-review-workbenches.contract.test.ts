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

  test("code review workbench pins the shared base to code surface", async () => {
    const sourceText = await source("./git-code-review-workbench.tsx");

    expect(sourceText).toContain('surface="code"');
    expect(sourceText).toContain("GitAiReviewWorkbenchNext");
  });
});
