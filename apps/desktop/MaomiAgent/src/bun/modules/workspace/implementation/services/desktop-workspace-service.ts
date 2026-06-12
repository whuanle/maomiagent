import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";

import type { RuntimeLogger } from "../../../logs";
import type {
  DesktopWorkspaceCreateInput,
  DesktopWorkspaceFileContentResult,
  DesktopWorkspaceFileTreeNode,
  DesktopWorkspaceFileTreeResult,
  DesktopWorkspaceItem,
  DesktopWorkspaceListQuery,
  DesktopWorkspaceListResponse,
  DesktopWorkspaceUpdateInput,
} from "../../abstraction/models/desktop-workspace.models";
import type { DesktopWorkspacePort } from "../../abstraction/ports/desktop-workspace.ports";
import type { DesktopWorkspaceStore } from "../stores/desktop-workspace-store";

const WORKSPACE_ID_RE = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const TEXT_FILE_MAX_BYTES = 512 * 1024;
const TEXT_FILE_PREVIEW_EDGE_BYTES = TEXT_FILE_MAX_BYTES / 2;
const IMAGE_PREVIEW_MAX_BYTES = 4 * 1024 * 1024;
const TEXT_MIME_PREFIXES = ["text/"];
const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/ld+json",
  "application/javascript",
  "application/x-javascript",
  "application/typescript",
  "application/x-typescript",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "image/svg+xml",
]);
const TEXT_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".css",
  ".csv",
  ".go",
  ".h",
  ".html",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".md",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
  ".zig",
]);

function nowIso(): string {
  return new Date().toISOString();
}

function buildTextFilePreviewContent(buffer: Buffer): Pick<
  DesktopWorkspaceFileContentResult,
  "content" | "truncated" | "previewHeadContent" | "previewTailContent"
> {
  const truncated = buffer.length > TEXT_FILE_MAX_BYTES;
  if (!truncated) {
    return {
      content: buffer.toString("utf-8"),
      truncated: false,
    };
  }

  return {
    content: buffer.subarray(0, TEXT_FILE_MAX_BYTES).toString("utf-8"),
    truncated: true,
    previewHeadContent: buffer.subarray(0, TEXT_FILE_PREVIEW_EDGE_BYTES).toString("utf-8"),
    previewTailContent: buffer.subarray(buffer.length - TEXT_FILE_PREVIEW_EDGE_BYTES).toString("utf-8"),
  };
}

function normalizeWorkspaceId(input: unknown): string {
  if (typeof input !== "string") {
    throw new Error("workspaceId is required");
  }
  const normalized = input.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  if (!WORKSPACE_ID_RE.test(normalized)) {
    throw new Error("invalid workspaceId format");
  }
  return normalized;
}

function normalizeName(input: unknown, fallback: string): string {
  return typeof input === "string" && input.trim() ? input.trim() : fallback;
}

function normalizeNote(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? input.trim() : undefined;
}

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return [...new Set(input
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean))];
}

function normalizeDirectoryPath(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? resolve(input.trim()) : undefined;
}

function normalizeWorkspaceRelativePath(input: unknown): string | undefined {
  if (typeof input !== "string") {
    return undefined;
  }

  const normalized = input.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
  return normalized || undefined;
}

function requireDirectoryPath(input: unknown): string {
  const directoryPath = normalizeDirectoryPath(input);
  if (!directoryPath) {
    throw new Error("workspace directoryPath is required");
  }
  return directoryPath;
}

function normalizePathForCompare(input: string): string {
  const normalized = resolve(input).replace(/[\/]+/g, "\\").replace(/[\\]+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function ensureInsideWorkspace(rootPath: string, relativePath?: string): { absolutePath: string; normalizedPath: string } {
  const normalizedPath = normalizeWorkspaceRelativePath(relativePath) ?? "";
  const absolutePath = resolve(rootPath, normalizedPath || ".");
  const normalizedRoot = normalizePathForCompare(rootPath);
  const normalizedAbsolute = normalizePathForCompare(absolutePath);

  if (normalizedAbsolute !== normalizedRoot && !normalizedAbsolute.startsWith(`${normalizedRoot}\\`)) {
    throw new Error("workspace path escapes root directory");
  }

  return {
    absolutePath,
    normalizedPath,
  };
}

function toWorkspacePath(rootPath: string, absolutePath: string): string {
  const rawRelative = relative(rootPath, absolutePath);
  if (!rawRelative) {
    return "";
  }

  return rawRelative.replace(/\\/g, "/");
}

function detectMimeType(absolutePath: string): string | undefined {
  const mimeType = Bun.file(absolutePath).type.split(";")[0]?.trim().toLowerCase();
  return mimeType || undefined;
}

function isProbablyTextFile(absolutePath: string, mimeType: string | undefined, buffer: Buffer): boolean {
  if (mimeType && (TEXT_MIME_TYPES.has(mimeType) || TEXT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix)))) {
    return true;
  }

  const extension = basename(absolutePath).includes(".")
    ? absolutePath.slice(absolutePath.lastIndexOf(".")).toLowerCase()
    : "";
  if (TEXT_EXTENSIONS.has(extension)) {
    return true;
  }

  const probe = buffer.subarray(0, Math.min(buffer.length, 1024));
  return !probe.includes(0);
}

function buildFileTreeNode(rootPath: string, absolutePath: string, kind: DesktopWorkspaceFileTreeNode["type"]): DesktopWorkspaceFileTreeNode {
  const path = toWorkspacePath(rootPath, absolutePath);
  const name = basename(absolutePath);
  const extension = kind === "file" && name.includes(".")
    ? name.slice(name.lastIndexOf(".")).toLowerCase()
    : undefined;

  return {
    name,
    path,
    type: kind,
    absolutePath,
    extension,
    ignored: false,
  };
}

function buildWorkspaceIdFromPath(directoryPath: string): string {
  const name = basename(directoryPath).trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-") || "workspace";
  const digest = createHash("sha1").update(directoryPath).digest("hex").slice(0, 8);
  return normalizeWorkspaceId(`${name}-${digest}`.slice(0, 64));
}

function paginate<TItem>(items: TItem[], limit = 200, offset = 0) {
  const boundedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), 1000) : 200;
  const boundedOffset = Number.isFinite(offset) && offset >= 0 ? Math.trunc(offset) : 0;
  const paged = items.slice(boundedOffset, boundedOffset + boundedLimit);
  return {
    items: paged,
    total: items.length,
    limit: boundedLimit,
    offset: boundedOffset,
    hasMore: boundedOffset + boundedLimit < items.length,
  };
}

export class DesktopWorkspaceService implements DesktopWorkspacePort {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: DesktopWorkspaceStore,
    private readonly logger: RuntimeLogger,
  ) {}

  async list(input: DesktopWorkspaceListQuery = {}): Promise<DesktopWorkspaceListResponse> {
    const queryText = typeof input.q === "string" ? input.q.trim().toLowerCase() : "";
    const filtered = this.store.list().filter((item) => {
      if (!queryText) {
        return true;
      }
      return [
        item.workspaceId,
        item.name,
        item.directoryPath ?? "",
        item.note ?? "",
        item.tags.join(" "),
      ].join(" ").toLowerCase().includes(queryText);
    });
    const sorted = filtered.sort((left, right) => {
      if (left.isPinned !== right.isPinned) {
        return left.isPinned ? -1 : 1;
      }
      return right.updatedAt.localeCompare(left.updatedAt) || left.name.localeCompare(right.name);
    });
    const { items, ...meta } = paginate(sorted, input.limit, input.offset);
    return {
      items,
      meta,
    };
  }

  async get(workspaceId: string): Promise<DesktopWorkspaceItem | null> {
    return this.store.get(normalizeWorkspaceId(workspaceId));
  }

  async getFileTree(workspaceId: string, path?: string): Promise<DesktopWorkspaceFileTreeResult> {
    const workspace = this.requireWorkspace(workspaceId);
    const rootPath = requireDirectoryPath(workspace.directoryPath);
    const { absolutePath, normalizedPath } = ensureInsideWorkspace(rootPath, path);
    const entries = await readdir(absolutePath, { withFileTypes: true });
    const nodes = entries
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .map((entry) => buildFileTreeNode(
        rootPath,
        resolve(absolutePath, entry.name),
        entry.isDirectory() ? "directory" : "file",
      ))
      .sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === "directory" ? -1 : 1;
        }

        return left.name.localeCompare(right.name, "zh-CN", { sensitivity: "base" });
      });

    return {
      workspaceId: workspace.workspaceId,
      rootPath,
      path: normalizedPath,
      nodes,
    };
  }

  async getFileContent(workspaceId: string, path: string): Promise<DesktopWorkspaceFileContentResult> {
    const workspace = this.requireWorkspace(workspaceId);
    const rootPath = requireDirectoryPath(workspace.directoryPath);
    const { absolutePath, normalizedPath } = ensureInsideWorkspace(rootPath, path);
    const buffer = await readFile(absolutePath);
    const mimeType = detectMimeType(absolutePath);
    const isImage = Boolean(mimeType?.startsWith("image/"));
    const isText = !isImage && isProbablyTextFile(absolutePath, mimeType, buffer);

    if (isText) {
      const preview = buildTextFilePreviewContent(buffer);
      return {
        workspaceId: workspace.workspaceId,
        rootPath,
        path: normalizedPath,
        absolutePath,
        binary: false,
        ...preview,
        mimeType,
      };
    }

    return {
      workspaceId: workspace.workspaceId,
      rootPath,
      path: normalizedPath,
      absolutePath,
      content: "",
      binary: true,
      truncated: false,
      mimeType,
      ...(isImage && buffer.length <= IMAGE_PREVIEW_MAX_BYTES
        ? { previewBase64: buffer.toString("base64") }
        : {}),
    };
  }

  async readTextFile(workspaceId: string, path: string): Promise<DesktopWorkspaceFileContentResult> {
    const workspace = this.requireWorkspace(workspaceId);
    const rootPath = requireDirectoryPath(workspace.directoryPath);
    const { absolutePath, normalizedPath } = ensureInsideWorkspace(rootPath, path);
    const buffer = await readFile(absolutePath);
    const mimeType = detectMimeType(absolutePath);
    const isImage = Boolean(mimeType?.startsWith("image/"));
    const isText = !isImage && isProbablyTextFile(absolutePath, mimeType, buffer);

    if (!isText) {
      return this.getFileContent(workspaceId, path);
    }

    return {
      workspaceId: workspace.workspaceId,
      rootPath,
      path: normalizedPath,
      absolutePath,
      content: buffer.toString("utf-8"),
      binary: false,
      truncated: false,
      mimeType,
    };
  }

  async writeTextFile(workspaceId: string, path: string, content: string): Promise<DesktopWorkspaceFileContentResult> {
    return this.runMutation(async () => {
      const workspace = this.requireWorkspace(workspaceId);
      const rootPath = requireDirectoryPath(workspace.directoryPath);
      const { absolutePath, normalizedPath } = ensureInsideWorkspace(rootPath, path);

      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, "utf-8");

      await this.logger.info("Desktop workspace text file written", {
        workspaceId: workspace.workspaceId,
        context: {
          path: normalizedPath,
        },
      });

      return this.getFileContent(workspace.workspaceId, normalizedPath);
    });
  }

  async create(input: DesktopWorkspaceCreateInput): Promise<{ item: DesktopWorkspaceItem; created: boolean }> {
    return this.runMutation(async () => {
      const directoryPath = requireDirectoryPath(input.directoryPath);
      this.enforceUniqueDirectory(directoryPath);
      const workspaceId = typeof input.workspaceId === "string" && input.workspaceId.trim()
        ? normalizeWorkspaceId(input.workspaceId)
        : buildWorkspaceIdFromPath(directoryPath);
      const existing = this.store.get(workspaceId);
      if (existing) {
        return { item: existing, created: false };
      }
      const now = nowIso();
      const item: DesktopWorkspaceItem = {
        workspaceId,
        name: normalizeName(input.name, workspaceId),
        directoryPath,
        note: normalizeNote(input.note),
        isPinned: input.isPinned === true,
        tags: normalizeTags(input.tags),
        createdAt: now,
        updatedAt: now,
      };
      this.store.upsert(item);
      await this.logger.info("Desktop workspace created", {
        workspaceId,
        context: { directoryPath },
      });
      return { item, created: true };
    });
  }

  async update(workspaceId: string, input: DesktopWorkspaceUpdateInput): Promise<DesktopWorkspaceItem | null> {
    const id = normalizeWorkspaceId(workspaceId);
    return this.runMutation(async () => {
      const current = this.store.get(id);
      if (!current) {
        return null;
      }
      const directoryPath = input.directoryPath !== undefined
        ? requireDirectoryPath(input.directoryPath)
        : current.directoryPath;
      if (directoryPath && directoryPath !== current.directoryPath) {
        this.enforceUniqueDirectory(directoryPath, id);
      }
      const next: DesktopWorkspaceItem = {
        ...current,
        name: input.name !== undefined ? normalizeName(input.name, current.workspaceId) : current.name,
        note: input.note === null ? undefined : input.note !== undefined ? normalizeNote(input.note) : current.note,
        directoryPath,
        isPinned: input.isPinned !== undefined ? input.isPinned === true : current.isPinned,
        tags: input.tags !== undefined ? normalizeTags(input.tags) : current.tags,
        updatedAt: nowIso(),
      };
      this.store.upsert(next);
      await this.logger.info("Desktop workspace updated", { workspaceId: id });
      return next;
    });
  }

  async remove(workspaceId: string): Promise<boolean> {
    const id = normalizeWorkspaceId(workspaceId);
    return this.runMutation(async () => {
      const removed = this.store.remove(id);
      if (removed) {
        await this.logger.warn("Desktop workspace removed", { workspaceId: id });
      }
      return removed;
    });
  }

  private async runMutation<TValue>(work: () => Promise<TValue>): Promise<TValue> {
    const next = this.mutationQueue.then(work, work);
    this.mutationQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private requireWorkspace(workspaceId: string): DesktopWorkspaceItem {
    const item = this.store.get(normalizeWorkspaceId(workspaceId));
    if (!item) {
      throw new Error(`workspace not found: ${workspaceId}`);
    }

    return item;
  }

  private enforceUniqueDirectory(directoryPath: string, currentWorkspaceId?: string): void {
    const normalized = normalizePathForCompare(directoryPath);
    const existing = this.store.list().find((item) =>
      item.workspaceId !== currentWorkspaceId
      && item.directoryPath
      && normalizePathForCompare(item.directoryPath) === normalized);
    if (existing) {
      throw new Error("workspace directory already registered");
    }
  }
}
