import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

import { recoverFeishuDocMarkdownFromGarbledText } from "./feishu-doc-markdown-garbled-recovery";

const FEISHU_DOC_DRAFT_CACHE_DIR = ".maomi/feishu-docs/drafts";

function sanitizePathPart(value: string, fallback: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized || fallback;
}

function createMarkdownChecksum(markdown: string): string {
  return `sha256:${createHash("sha256").update(markdown).digest("hex")}`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return !!error && typeof error === "object" && "code" in error;
}

export type FeishuDocDraftWorkspaceEntry = {
  relativePath: string;
  absolutePath: string;
  markdown: string;
  checksum: string;
};

export class FeishuDocDraftWorkspaceCache {
  constructor(private readonly workspaceRoot: string) {}

  async readDocument(docId: string): Promise<FeishuDocDraftWorkspaceEntry | null> {
    return this.readMarkdown(this.documentRelativePath(docId));
  }

  async writeDocument(docId: string, markdown: string): Promise<FeishuDocDraftWorkspaceEntry> {
    return this.writeMarkdown(this.documentRelativePath(docId), markdown);
  }

  private documentRelativePath(docId: string): string {
    const safeDocId = sanitizePathPart(docId, "untitled-doc");
    return posix.join(FEISHU_DOC_DRAFT_CACHE_DIR, `${safeDocId}.draft.md`);
  }

  private absolutePath(relativePath: string): string {
    return join(this.workspaceRoot, ...relativePath.split("/"));
  }

  private async readMarkdown(relativePath: string): Promise<FeishuDocDraftWorkspaceEntry | null> {
    const absolutePath = this.absolutePath(relativePath);
    let markdown: string;

    try {
      markdown = await readFile(absolutePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }

    const recovered = recoverFeishuDocMarkdownFromGarbledText(markdown);
    if (recovered && recovered !== markdown) {
      return this.writeMarkdown(relativePath, recovered);
    }

    return {
      relativePath,
      absolutePath,
      markdown,
      checksum: createMarkdownChecksum(markdown),
    };
  }

  private async writeMarkdown(relativePath: string, markdown: string): Promise<FeishuDocDraftWorkspaceEntry> {
    const absolutePath = this.absolutePath(relativePath);
    const tempPath = `${absolutePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(tempPath, markdown, "utf8");
    await rename(tempPath, absolutePath);

    return {
      relativePath,
      absolutePath,
      markdown,
      checksum: createMarkdownChecksum(markdown),
    };
  }
}
