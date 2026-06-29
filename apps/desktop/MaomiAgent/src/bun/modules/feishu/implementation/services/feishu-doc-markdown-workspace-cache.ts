import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

import { recoverFeishuDocMarkdownFromGarbledText } from "./feishu-doc-markdown-garbled-recovery";

const FEISHU_DOC_CACHE_DIR = ".maomi/feishu-docs";
const FEISHU_DOC_BASELINE_DIR = ".maomi/feishu-docs/baselines";

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

export type FeishuDocMarkdownWorkspaceEntry = {
  relativePath: string;
  absolutePath: string;
  markdown: string;
  checksum: string;
};

export class FeishuDocMarkdownWorkspaceCache {
  constructor(private readonly workspaceRoot: string) {}

  async readDocument(docId: string): Promise<FeishuDocMarkdownWorkspaceEntry | null> {
    return this.readMarkdown(this.documentRelativePath(docId));
  }

  async readBase(docId: string): Promise<FeishuDocMarkdownWorkspaceEntry | null> {
    return this.readMarkdown(this.baseRelativePath(docId));
  }

  async writeDocument(docId: string, markdown: string): Promise<FeishuDocMarkdownWorkspaceEntry> {
    return this.writeMarkdown(this.documentRelativePath(docId), markdown);
  }

  async writeBase(docId: string, markdown: string): Promise<FeishuDocMarkdownWorkspaceEntry> {
    return this.writeMarkdown(this.baseRelativePath(docId), markdown);
  }

  private documentRelativePath(docId: string): string {
    const safeDocId = sanitizePathPart(docId, "untitled-doc");
    return posix.join(FEISHU_DOC_CACHE_DIR, `${safeDocId}.md`);
  }

  private baseRelativePath(docId: string): string {
    const safeDocId = sanitizePathPart(docId, "untitled-doc");
    return posix.join(FEISHU_DOC_BASELINE_DIR, `${safeDocId}.base.md`);
  }

  private absolutePath(relativePath: string): string {
    return join(this.workspaceRoot, ...relativePath.split("/"));
  }

  private async readMarkdown(relativePath: string): Promise<FeishuDocMarkdownWorkspaceEntry | null> {
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

  private async writeMarkdown(relativePath: string, markdown: string): Promise<FeishuDocMarkdownWorkspaceEntry> {
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
