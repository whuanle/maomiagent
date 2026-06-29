import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FeishuDocDraftWorkspaceCache } from "./feishu-doc-draft-workspace-cache";
import { FeishuDocMarkdownWorkspaceCache } from "./feishu-doc-markdown-workspace-cache";

function createLatin1Mojibake(value: string): string {
  return Buffer.from(value, "utf8").toString("latin1");
}

async function withWorkspace(run: (workspaceRoot: string) => Promise<void>): Promise<void> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-markdown-"));
  try {
    await run(workspaceRoot);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

describe("Feishu doc workspace cache encoding recovery", () => {
  test("repairs garbled original markdown on read and rewrites utf8", async () => {
    await withWorkspace(async (workspaceRoot) => {
      const cache = new FeishuDocMarkdownWorkspaceCache(workspaceRoot);
      const expectedMarkdown = "# 飞书文档\n\n这里是正常中文。";
      const absolutePath = join(workspaceRoot, ".maomi", "feishu-docs", "doc_1.md");

      await mkdir(join(workspaceRoot, ".maomi", "feishu-docs"), { recursive: true });
      await writeFile(absolutePath, createLatin1Mojibake(expectedMarkdown), "utf8");

      const entry = await cache.readDocument("doc_1");

      expect(entry?.markdown).toBe(expectedMarkdown);
      expect(await readFile(absolutePath, "utf8")).toBe(expectedMarkdown);
    });
  });

  test("repairs garbled draft markdown on read and rewrites utf8", async () => {
    await withWorkspace(async (workspaceRoot) => {
      const cache = new FeishuDocDraftWorkspaceCache(workspaceRoot);
      const expectedMarkdown = "# 飞书文档\n\n这里是正常中文。";
      const absolutePath = join(workspaceRoot, ".maomi", "feishu-docs", "drafts", "doc_2.draft.md");

      await mkdir(join(workspaceRoot, ".maomi", "feishu-docs", "drafts"), { recursive: true });
      await writeFile(absolutePath, createLatin1Mojibake(expectedMarkdown), "utf8");

      const entry = await cache.readDocument("doc_2");

      expect(entry?.markdown).toBe(expectedMarkdown);
      expect(await readFile(absolutePath, "utf8")).toBe(expectedMarkdown);
    });
  });
});
