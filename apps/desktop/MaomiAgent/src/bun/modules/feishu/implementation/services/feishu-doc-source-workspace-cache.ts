import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

import type { FeishuRawDocBlock } from "./feishu-doc-ir-normalizer";

const DOCUMENT_SOURCE_FILE = "document.source.json";
const BASE_SOURCE_FILE = "base.source.json";

function sanitizePathPart(value: string, fallback: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized || fallback;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return !!error && typeof error === "object" && "code" in error;
}

function createSourceChecksum(snapshot: FeishuDocSourceSnapshot): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")}`;
}

export type FeishuDocSourceSnapshot = {
  requestedDocId: string;
  resolvedDocId: string;
  documentIdType: "document_id" | "wiki_node_token";
  fetchedAt: string;
  sourceKind: "docx_remote_raw";
  document: {
    document_id?: string;
    title?: string;
    revision_id?: string | number;
  };
  blocks: FeishuRawDocBlock[];
};

export type FeishuDocSourceWorkspaceEntry = {
  relativePath: string;
  absolutePath: string;
  snapshot: FeishuDocSourceSnapshot;
  checksum: string;
};

export class FeishuDocSourceWorkspaceCache {
  constructor(private readonly workspaceRoot: string) {}

  async readDocument(docId: string): Promise<FeishuDocSourceWorkspaceEntry | null> {
    return this.readSource(docId, DOCUMENT_SOURCE_FILE);
  }

  async readBase(docId: string): Promise<FeishuDocSourceWorkspaceEntry | null> {
    return this.readSource(docId, BASE_SOURCE_FILE);
  }

  async writeDocument(docId: string, snapshot: FeishuDocSourceSnapshot): Promise<FeishuDocSourceWorkspaceEntry> {
    return this.writeSource(docId, DOCUMENT_SOURCE_FILE, snapshot);
  }

  async writeBase(docId: string, snapshot: FeishuDocSourceSnapshot): Promise<FeishuDocSourceWorkspaceEntry> {
    return this.writeSource(docId, BASE_SOURCE_FILE, snapshot);
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

  private async readSource(docId: string, fileName: string): Promise<FeishuDocSourceWorkspaceEntry | null> {
    const absolutePath = this.absolutePath(docId, fileName);
    const relativePath = this.relativePath(docId, fileName);
    let content: string;

    try {
      content = await readFile(absolutePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }

    try {
      const snapshot = JSON.parse(content) as FeishuDocSourceSnapshot;
      if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.blocks)) {
        return null;
      }

      return {
        relativePath,
        absolutePath,
        snapshot,
        checksum: createSourceChecksum(snapshot),
      };
    } catch {
      return null;
    }
  }

  private async writeSource(
    docId: string,
    fileName: string,
    snapshot: FeishuDocSourceSnapshot,
  ): Promise<FeishuDocSourceWorkspaceEntry> {
    const absolutePath = this.absolutePath(docId, fileName);
    const relativePath = this.relativePath(docId, fileName);
    const tempPath = `${absolutePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    await rename(tempPath, absolutePath);

    return {
      relativePath,
      absolutePath,
      snapshot,
      checksum: createSourceChecksum(snapshot),
    };
  }
}