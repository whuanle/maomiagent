import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import { isFeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";

const DOCUMENT_IR_FILE = "document.ir.json";
const BASE_IR_FILE = "base.ir.json";
const REMOTE_IR_FILE = "remote.ir.json";

function sanitizePathPart(value: string, fallback: string): string {
  const sanitized = value.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return sanitized || fallback;
}

export class FeishuDocIRWorkspaceCache {
  constructor(private readonly workspaceRoot: string) {}

  async readDocument(docId: string): Promise<FeishuDocIR | null> {
    return this.readIR(this.filePath(docId, DOCUMENT_IR_FILE));
  }

  async readBase(docId: string): Promise<FeishuDocIR | null> {
    return this.readIR(this.filePath(docId, BASE_IR_FILE));
  }

  async writeDocument(docId: string, ir: FeishuDocIR): Promise<void> {
    await this.writeIR(this.filePath(docId, DOCUMENT_IR_FILE), ir);
  }

  async writeBase(docId: string, ir: FeishuDocIR): Promise<void> {
    await this.writeIR(this.filePath(docId, BASE_IR_FILE), ir);
  }

  async writeRemote(docId: string, ir: FeishuDocIR): Promise<void> {
    await this.writeIR(this.filePath(docId, REMOTE_IR_FILE), ir);
  }

  async backupDocument(docId: string, timestamp: string): Promise<string> {
    const docDirectory = this.docDirectory(docId);
    const backupDirectory = join(docDirectory, "backups");
    const backupPath = join(backupDirectory, `${sanitizePathPart(timestamp, "backup")}.ir.json`);

    await mkdir(backupDirectory, { recursive: true });
    await copyFile(join(docDirectory, DOCUMENT_IR_FILE), backupPath);
    return backupPath;
  }

  private docDirectory(docId: string): string {
    return join(this.workspaceRoot, ".maomi", "feishu-docs", sanitizePathPart(docId, "untitled-doc"));
  }

  private filePath(docId: string, fileName: string): string {
    return join(this.docDirectory(docId), fileName);
  }

  private async readIR(filePath: string): Promise<FeishuDocIR | null> {
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }

    try {
      const parsed = JSON.parse(content);
      return isFeishuDocIR(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private async writeIR(filePath: string, ir: FeishuDocIR): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;

    await writeFile(tempPath, `${JSON.stringify(ir, null, 2)}\n`, "utf8");
    await rename(tempPath, filePath);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return !!error && typeof error === "object" && "code" in error;
}