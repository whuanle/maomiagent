import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

describe("git review tabs contracts", () => {
  test("page.tsx exposes commit-review as the only git AI review top-level tab", async () => {
    const pageSource = await source("./page.tsx");

    expect(pageSource).toContain('key: "commit-review"');
    expect(pageSource).toContain("copy.commitReviewTab");
    expect(pageSource).not.toContain('key: "code-review"');
    expect(pageSource).not.toContain("copy.codeReviewTab");
    expect(pageSource).not.toContain('key: "ai-review"');
  });

  test("page.tsx imports the new workbench entry points", async () => {
    const pageSource = await source("./page.tsx");

    expect(pageSource).toContain('from "./components/git-commit-review-workbench"');
    expect(pageSource).not.toContain('from "./components/git-code-review-workbench"');
    expect(pageSource).not.toContain("GitAiReviewWorkbenchNext");
  });

  test("page.tsx restores only commit review state", async () => {
    const pageSource = await source("./page.tsx");

    expect(pageSource).toContain("initialCommitTargetId={commitReviewState?.selectedTargetId}");
    expect(pageSource).toContain("onCommitTargetIdChange={(selectedTargetId) => {");
    expect(pageSource).not.toContain("initialCodeReviewScopePath=");
    expect(pageSource).not.toContain("codeReviewState?.");
  });

  test("page.tsx keeps git tabs mounted so review results do not reset on tab switch", async () => {
    const pageSource = await source("./page.tsx");

    expect(pageSource).toContain("destroyOnHidden={false}");
  });

  test("git page exposes a leave confirmation handle backed by cached review results", async () => {
    const pageSource = await source("./page.tsx");

    expect(pageSource).toContain("export type GitPageHandle");
    expect(pageSource).toContain("confirmLeavePage: () => Promise<boolean>;");
    expect(pageSource).toContain("hasGitReviewWorkbenchCachedResults(workspaceId)");
    expect(pageSource).toContain('title: props.language === "en-US" ? "Leave Git page?" : "确认离开 Git 页面？"');
  });

  test("i18n.ts exposes dedicated review tab labels instead of aiReviewTab", async () => {
    const i18nSource = await source("./i18n.ts");

    expect(i18nSource).toContain("commitReviewTab: string;");
    expect(i18nSource).not.toContain("codeReviewTab:");
    expect(i18nSource).not.toContain("aiReviewTab:");
  });
});
