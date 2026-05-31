import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

describe("git review tabs contracts", () => {
  test("page.tsx exposes separate commit-review and code-review top-level tabs", async () => {
    const pageSource = await source("./page.tsx");

    expect(pageSource).toContain('key: "commit-review"');
    expect(pageSource).toContain('key: "code-review"');
    expect(pageSource).toContain("copy.commitReviewTab");
    expect(pageSource).toContain("copy.codeReviewTab");
    expect(pageSource).not.toContain('key: "ai-review"');
  });

  test("page.tsx imports the new workbench entry points", async () => {
    const pageSource = await source("./page.tsx");

    expect(pageSource).toContain('from "./components/git-commit-review-workbench"');
    expect(pageSource).toContain('from "./components/git-code-review-workbench"');
    expect(pageSource).not.toContain('from "./components/git-ai-review-workbench-next"');
  });

  test("page.tsx restores split review state for commit targets and code scopes", async () => {
    const pageSource = await source("./page.tsx");

    expect(pageSource).toContain("initialCommitTargetId={commitReviewState?.selectedTargetId}");
    expect(pageSource).toContain("onCommitTargetIdChange={(selectedTargetId) => {");
    expect(pageSource).toContain("initialCodeReviewScopePath={codeReviewState?.selectedScopePath}");
    expect(pageSource).toContain("selectedReviewFilePath={codeReviewState?.selectedFilePath}");
  });

  test("i18n.ts exposes dedicated review tab labels instead of aiReviewTab", async () => {
    const i18nSource = await source("./i18n.ts");

    expect(i18nSource).toContain("commitReviewTab: string;");
    expect(i18nSource).toContain("codeReviewTab: string;");
    expect(i18nSource).not.toContain("aiReviewTab:");
  });
});
