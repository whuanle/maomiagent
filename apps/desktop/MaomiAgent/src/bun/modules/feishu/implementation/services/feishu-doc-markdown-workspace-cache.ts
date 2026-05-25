import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

const DOCUMENT_MARKDOWN_FILE = "document.md";
const BASE_MARKDOWN_FILE = "base.md";

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
    return this.readMarkdown(docId, DOCUMENT_MARKDOWN_FILE);
  }

  async readBase(docId: string): Promise<FeishuDocMarkdownWorkspaceEntry | null> {
    return this.readMarkdown(docId, BASE_MARKDOWN_FILE);
  }

  async writeDocument(docId: string, markdown: string): Promise<FeishuDocMarkdownWorkspaceEntry> {
    return this.writeMarkdown(docId, DOCUMENT_MARKDOWN_FILE, markdown);
  }

  async writeBase(docId: string, markdown: string): Promise<FeishuDocMarkdownWorkspaceEntry> {
    return this.writeMarkdown(docId, BASE_MARKDOWN_FILE, markdown);
  }

  private docPathParts(docId: string): string[] {
    return [".maomi", "feishu-docs", sanitizePathPart(docId, "untitled-doc")];
  }

  private relativePath(docId: string, fileName: string): string {
    return posix.join(...this.docPathParts(docId), fileName);
  }

  private absolutePath(docId: string, fileName: string): string {
    return join(this.workspaceRoot, ...this.docPathParts(docId), fileName);
  }

  private async readMarkdown(docId: string, fileName: string): Promise<FeishuDocMarkdownWorkspaceEntry | null> {
    const absolutePath = this.absolutePath(docId, fileName);
    const relativePath = this.relativePath(docId, fileName);
    let markdown: string;

    try {
      markdown = await readFile(absolutePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }

    return {
      relativePath,
      absolutePath,
      markdown,
      checksum: createMarkdownChecksum(markdown),
    };
  }

  private async writeMarkdown(docId: string, fileName: string, markdown: string): Promise<FeishuDocMarkdownWorkspaceEntry> {
    const absolutePath = this.absolutePath(docId, fileName);
    const relativePath = this.relativePath(docId, fileName);
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