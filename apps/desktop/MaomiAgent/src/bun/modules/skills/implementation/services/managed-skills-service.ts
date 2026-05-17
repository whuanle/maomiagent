import { existsSync, promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type {
  DesktopSkillsCommandPort,
  DesktopSkillsQueryPort,
} from "../../abstraction/ports/desktop-skills.ports";
import {
  DesktopSkillsError,
  type DesktopDiscoveredSkillItem,
  type DesktopSkillItem,
  type DesktopSkillsAdoptResponse,
  type DesktopSkillsDiscoveryConflictType,
  type DesktopSkillsDiscoveryResponse,
  type DesktopSkillsDiscoveryState,
  type DesktopSkillsListMeta,
  type DesktopSkillsListQuery,
  type DesktopSkillsListResponse,
  type DesktopSkillsRuntimeEffectiveResult,
  type DesktopSkillsStorage,
} from "../../abstraction/models/desktop-skills.models";
import type { RuntimeLogger } from "../../../logs";
import { createSkillsDiscoveryDefinitions } from "./skills-discovery-definitions";

type DiscoveryWorkItem = DesktopDiscoveredSkillItem & {
  normalizedSourcePathKey: string;
};

type SkillsEnvironment = {
  maomiConfigDir: string;
  managedSkillRoots: string[];
  preferredSkillsRoot: string;
  disabledSkillsDir: string;
  skillsStateFile: string;
  discoveryDefinitions: ReturnType<typeof createSkillsDiscoveryDefinitions>;
};

type PaginationResult<T> = {
  items: T[];
  meta: DesktopSkillsListMeta;
};

type SkillRuntimeDecision = DesktopSkillsRuntimeEffectiveResult["items"][number]["decision"];

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function createEmptyStorage(): DesktopSkillsStorage {
  return {
    items: [],
    version: "1.0",
    updatedAt: new Date().toISOString(),
  };
}

function cloneStorage(storage: DesktopSkillsStorage): DesktopSkillsStorage {
  return JSON.parse(JSON.stringify(storage)) as DesktopSkillsStorage;
}

function normalizeOptionalSkillId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
}

function normalizeSkillId(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "-");
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(normalized)) {
    throw new DesktopSkillsError("INVALID_ARGUMENT", "invalid skillId format", {
      field: "skillId",
    });
  }
  return normalized;
}

function normalizeStorage(raw: unknown): DesktopSkillsStorage {
  if (!raw || typeof raw !== "object") {
    return createEmptyStorage();
  }

  const record = raw as Partial<DesktopSkillsStorage>;
  const items = Array.isArray(record.items) ? record.items : [];
  return {
    items: items.filter((item): item is DesktopSkillItem => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const candidate = item as Partial<DesktopSkillItem>;
      return typeof candidate.skillId === "string"
        && typeof candidate.managedPath === "string"
        && typeof candidate.name === "string"
        && typeof candidate.scope === "string"
        && typeof candidate.enabled === "boolean"
        && typeof candidate.createdAt === "string"
        && typeof candidate.updatedAt === "string";
    }),
    version: typeof record.version === "string" && record.version.trim()
      ? record.version
      : "1.0",
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt.trim()
      ? record.updatedAt
      : new Date().toISOString(),
  };
}

function paginate<T>(items: T[], limit = 20, offset = 0): PaginationResult<T> {
  const boundedLimit = Number.isFinite(limit) && limit > 0
    ? Math.min(Math.floor(limit), 1000)
    : 20;
  const boundedOffset = Number.isFinite(offset) && offset >= 0
    ? Math.floor(offset)
    : 0;

  return {
    items: items.slice(boundedOffset, boundedOffset + boundedLimit),
    meta: {
      total: items.length,
      limit: boundedLimit,
      offset: boundedOffset,
      hasMore: boundedOffset + boundedLimit < items.length,
    },
  };
}

function uniqPaths(paths: string[]): string[] {
  return [...new Set(paths.map((path) => resolve(path)))];
}

function isInsidePath(basePath: string, targetPath: string): boolean {
  const relativePath = relative(basePath, targetPath);
  if (!relativePath) {
    return true;
  }
  return !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function normalizeEnvSkillPath(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  const normalized = resolve(trimmed);
  if (normalized.toLowerCase().endsWith("\\skills") || normalized.toLowerCase().endsWith("/skills")) {
    return [normalized];
  }
  return [normalized, join(normalized, "skills")];
}

function normalizeManagedSkillRoot(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalized = resolve(trimmed);
  if (normalized.toLowerCase().endsWith("\\skills") || normalized.toLowerCase().endsWith("/skills")) {
    return normalized;
  }
  return join(normalized, "skills");
}

function normalizePathForCompare(pathname: string): string {
  return resolve(pathname)
    .replace(/[/\\]+/g, "\\")
    .replace(/[\\]+$/, "")
    .toLowerCase();
}

function resolveCandidateSkillPaths(
  definition: ReturnType<typeof createSkillsDiscoveryDefinitions>[number],
): string[] {
  const envPaths = definition.envCandidates
    .map((envName) => process.env[envName])
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .flatMap((value) => normalizeEnvSkillPath(value));

  return uniqPaths([...envPaths, ...definition.fallbackPaths]);
}

function resolveManagedSkillRoots(userHomeDir: string): string[] {
  const envRoots = [
    process.env.AGENTS_SKILLS_DIR,
    process.env.AGENT_SKILLS_DIR,
    process.env.AGENTS_HOME,
    process.env.AGENT_HOME,
  ]
    .map((value) => (typeof value === "string" ? normalizeManagedSkillRoot(value) : undefined))
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));

  if (envRoots.length > 0) {
    return uniqPaths(envRoots);
  }

  return uniqPaths([
    join(userHomeDir, ".agents", "skills"),
    join(userHomeDir, ".agent", "skills"),
  ]);
}

function selectPreferredSkillsRoot(paths: string[]): string {
  return paths.find((pathname) => existsSync(pathname)) ?? paths[0];
}

function isInsideAnyPath(basePaths: string[], targetPath: string): boolean {
  return basePaths.some((basePath) => isInsidePath(basePath, targetPath));
}

export class ManagedSkillsService implements DesktopSkillsQueryPort, DesktopSkillsCommandPort {
  private inMemoryStorage: DesktopSkillsStorage | null = null;
  private inMemoryStorageMtimeMs: number | null = null;
  private loadStoragePromise: Promise<DesktopSkillsStorage> | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly logger: RuntimeLogger) {}

  async list(params?: DesktopSkillsListQuery): Promise<DesktopSkillsListResponse> {
    let items = await this.listManagedItems();

    if (typeof params?.enabled === "boolean") {
      items = items.filter((item) => item.enabled === params.enabled);
    }

    if (params?.scope) {
      items = items.filter((item) => item.scope === params.scope);
    }

    void params?.workspaceId;

    if (params?.q) {
      const keyword = params.q.toLowerCase();
      items = items.filter((item) =>
        item.skillId.toLowerCase().includes(keyword)
        || item.name.toLowerCase().includes(keyword)
        || (item.label ?? "").toLowerCase().includes(keyword),
      );
    }

    return paginate(items, params?.limit ?? 20, params?.offset ?? 0);
  }

  async get(skillId: string): Promise<DesktopSkillItem | null> {
    const items = await this.listManagedItems();
    return items.find((item) => item.skillId === skillId) ?? null;
  }

  async discover(params?: { q?: string }): Promise<DesktopSkillsDiscoveryResponse> {
    return this.listDiscoveredItems(params?.q);
  }

  async adopt(input: Record<string, unknown>): Promise<DesktopSkillsAdoptResponse> {
    const requestedSkillId = normalizeOptionalSkillId(
      typeof input.skillId === "string"
        ? input.skillId
        : typeof input.id === "string"
          ? input.id
          : undefined,
    );
    const requestedEnabled = typeof input.enabled === "boolean" ? input.enabled : true;

    try {
      const result = await this.runMutation(async () => {
        const storage = await this.loadStorage();
        const rawSkillId =
          typeof input.skillId === "string"
            ? input.skillId
            : typeof input.id === "string"
              ? input.id
              : undefined;

        if (!rawSkillId) {
          throw new DesktopSkillsError("INVALID_ARGUMENT", "skillId is required", {
            field: "skillId",
          });
        }

        const skillId = normalizeSkillId(rawSkillId);
        const existingIndex = storage.items.findIndex((item) => item.skillId === skillId);
        const sourcePath = await this.resolveSourcePath(
          skillId,
          typeof input.sourcePath === "string" ? input.sourcePath : undefined,
        );
        const managedPath = await this.copySkillToLibrary(skillId, sourcePath);
        await this.removeDuplicateManagedCopies(skillId, managedPath);
        const now = new Date().toISOString();

        if (existingIndex >= 0) {
          const previous = storage.items[existingIndex];
          const updated: DesktopSkillItem = {
            ...previous,
            name:
              typeof input.name === "string" && input.name.trim()
                ? input.name.trim()
                : previous.name,
            label: typeof input.label === "string" ? input.label : previous.label,
            scope: "global",
            workspaceId: undefined,
            enabled: requestedEnabled,
            sourcePath,
            managedPath,
            tags: Array.isArray(input.tags)
              ? input.tags.filter((tag): tag is string => typeof tag === "string")
              : previous.tags,
            description:
              typeof input.description === "string"
                ? input.description
                : previous.description,
            metadata:
              input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
                ? input.metadata as Record<string, unknown>
                : previous.metadata,
            updatedAt: now,
          };

          storage.items[existingIndex] = updated;
          await this.persistStorage(storage);
          if (!requestedEnabled) {
            await this.moveManagedSkillToDisabled(updated.skillId, managedPath, updated.sourcePath);
            const disabledItem = {
              ...updated,
              enabled: false,
              managedPath: resolve(join(this.resolveEnvironment().disabledSkillsDir, updated.skillId)),
              updatedAt: new Date().toISOString(),
            } satisfies DesktopSkillItem;
            storage.items[existingIndex] = disabledItem;
            await this.persistStorage(storage);
            return {
              item: disabledItem,
              created: false,
            };
          }
          return {
            item: updated,
            created: false,
          };
        }

        const created: DesktopSkillItem = {
          skillId,
          name:
            typeof input.name === "string" && input.name.trim()
              ? input.name.trim()
              : basename(skillId),
          label: typeof input.label === "string" ? input.label : undefined,
          scope: "global",
          workspaceId: undefined,
          enabled: requestedEnabled,
          sourcePath,
          managedPath,
          tags: Array.isArray(input.tags)
            ? input.tags.filter((tag): tag is string => typeof tag === "string")
            : undefined,
          description: typeof input.description === "string" ? input.description : undefined,
          metadata:
            input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
              ? input.metadata as Record<string, unknown>
              : undefined,
          createdAt: now,
          updatedAt: now,
        };

        storage.items.push(created);
        await this.persistStorage(storage);
        if (!requestedEnabled) {
          await this.moveManagedSkillToDisabled(created.skillId, managedPath, created.sourcePath);
          const disabledItem = {
            ...created,
            enabled: false,
            managedPath: resolve(join(this.resolveEnvironment().disabledSkillsDir, created.skillId)),
            updatedAt: new Date().toISOString(),
          } satisfies DesktopSkillItem;
          storage.items[storage.items.length - 1] = disabledItem;
          await this.persistStorage(storage);
          return {
            item: disabledItem,
            created: true,
          };
        }
        return {
          item: created,
          created: true,
        };
      });

      await this.writeLog(
        "info",
        result.created ? "Skill adopted" : "Skill adoption refreshed",
        {
          skillId: result.item.skillId,
          enabled: result.item.enabled,
          sourcePath: result.item.sourcePath,
        },
      );

      return result;
    } catch (error) {
      await this.writeLog("error", "Skill adoption failed", {
        skillId: requestedSkillId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async moveManagedSkillToDisabled(
    skillId: string,
    managedPath: string,
    sourcePath: string | undefined,
  ): Promise<void> {
    const environment = this.resolveEnvironment();
    const currentPath = resolve(managedPath);
    const disabledPath = resolve(join(environment.disabledSkillsDir, skillId));

    if (await this.pathExists(currentPath) && this.isManagedRuntimePath(currentPath, environment)) {
      await fs.rm(disabledPath, { recursive: true, force: true });
      await fs.cp(currentPath, disabledPath, { recursive: true, force: true });
      await fs.rm(currentPath, { recursive: true, force: true });
      return;
    }

    if (sourcePath) {
      await fs.rm(disabledPath, { recursive: true, force: true });
      await fs.cp(sourcePath, disabledPath, { recursive: true, force: true });
    }
  }

  async patch(skillId: string, input: Record<string, unknown>): Promise<DesktopSkillItem | null> {
    try {
      const result = await this.runMutation(async () => {
        const storage = await this.loadStorage();
        const current = await this.get(skillId);
        if (!current) {
          return null;
        }

        const next: DesktopSkillItem = {
          ...current,
          name:
            typeof input.name === "string" && input.name.trim()
              ? input.name.trim()
              : current.name,
          label: typeof input.label === "string" ? input.label : current.label,
          scope: "global",
          workspaceId: undefined,
          enabled: current.enabled,
          tags: Array.isArray(input.tags)
            ? input.tags.filter((tag): tag is string => typeof tag === "string")
            : current.tags,
          description:
            typeof input.description === "string"
              ? input.description
              : current.description,
          metadata:
            input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
              ? input.metadata as Record<string, unknown>
              : current.metadata,
          updatedAt: new Date().toISOString(),
        };

        this.upsertStorageItem(storage, next);
        await this.persistStorage(storage);
        return next;
      });

      if (result) {
        await this.writeLog("info", "Skill patched", {
          skillId: result.skillId,
          enabled: result.enabled,
        });
      }

      return result;
    } catch (error) {
      await this.writeLog("error", "Skill patch failed", {
        skillId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async setEnabled(skillId: string, enabled: boolean): Promise<DesktopSkillItem | null> {
    try {
      const result = await this.runMutation(async () => {
        const environment = this.resolveEnvironment();
        const storage = await this.loadStorage();
        const current = await this.get(skillId);
        if (!current) {
          return null;
        }

        if (enabled) {
          const currentPath = resolve(current.managedPath);
          const currentValidation = await this.classifyManagedSkillPath(currentPath);
          if (current.enabled && this.isManagedRuntimePath(currentPath, environment) && currentValidation === "effective") {
            return current;
          }

          const fallbackDisabledPath = resolve(join(environment.disabledSkillsDir, skillId));
          const restoreSource =
            currentValidation === "effective"
              ? currentPath
              : await this.pathExists(fallbackDisabledPath)
                ? fallbackDisabledPath
                : current.sourcePath;

          if (!restoreSource) {
            throw new DesktopSkillsError(
              "INVALID_ARGUMENT",
              "skill cannot be enabled because no restore source is available",
              { skillId },
            );
          }

          const managedPath = await this.copySkillToLibrary(skillId, restoreSource);
          await this.removeDuplicateManagedCopies(skillId, managedPath);
          await fs.rm(fallbackDisabledPath, { recursive: true, force: true });

          const next: DesktopSkillItem = {
            ...current,
            enabled: true,
            managedPath,
            updatedAt: new Date().toISOString(),
          };
          this.upsertStorageItem(storage, next);
          await this.persistStorage(storage);
          return next;
        }

        if (!current.enabled) {
          return current;
        }

        const currentPath = resolve(current.managedPath);
        const disabledPath = resolve(join(environment.disabledSkillsDir, skillId));
        if (await this.pathExists(currentPath) && this.isManagedRuntimePath(currentPath, environment)) {
          await fs.rm(disabledPath, { recursive: true, force: true });
          await fs.cp(currentPath, disabledPath, { recursive: true, force: true });
          await fs.rm(currentPath, { recursive: true, force: true });
        }

        const next: DesktopSkillItem = {
          ...current,
          enabled: false,
          managedPath: disabledPath,
          updatedAt: new Date().toISOString(),
        };
        this.upsertStorageItem(storage, next);
        await this.persistStorage(storage);
        return next;
      });

      if (result) {
        await this.writeLog("info", "Skill enabled state updated", {
          skillId: result.skillId,
          enabled: result.enabled,
        });
      }

      return result;
    } catch (error) {
      await this.writeLog("error", "Skill enabled state update failed", {
        skillId,
        enabled,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async remove(skillId: string): Promise<boolean> {
    try {
      const deleted = await this.runMutation(async () => {
        const storage = await this.loadStorage();
        const index = storage.items.findIndex((item) => item.skillId === skillId);
        const current = await this.get(skillId);
        if (index < 0 && !current) {
          return false;
        }

        const environment = this.resolveEnvironment();
        if (index >= 0) {
          storage.items.splice(index, 1);
        }

        const removablePaths = uniqPaths([
          ...environment.managedSkillRoots.map((root) => join(root, skillId)),
          join(environment.disabledSkillsDir, skillId),
          ...(current ? [current.managedPath] : []),
        ]);

        for (const candidate of removablePaths) {
          const resolvedCandidate = resolve(candidate);
          if (!isInsideAnyPath([...environment.managedSkillRoots, environment.disabledSkillsDir], resolvedCandidate)) {
            continue;
          }
          await fs.rm(resolvedCandidate, { recursive: true, force: true });
        }

        await this.persistStorage(storage);
        return true;
      });

      if (deleted) {
        await this.writeLog("warn", "Skill removed", { skillId });
      }

      return deleted;
    } catch (error) {
      await this.writeLog("error", "Skill remove failed", {
        skillId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getEffective(workspaceId?: string, q?: string): Promise<DesktopSkillsRuntimeEffectiveResult> {
    return this.buildRuntimeEffectiveResult(workspaceId, q);
  }

  private resolveEnvironment(): SkillsEnvironment {
    const userHomeDir = homedir();
    const maomiConfigDir = trimText(process.env.MAOMI_CONFIG_DIR) ?? join(userHomeDir, ".maomiagent");
    const managedSkillRoots = resolveManagedSkillRoots(userHomeDir);
    const preferredSkillsRoot = selectPreferredSkillsRoot(managedSkillRoots);

    return {
      maomiConfigDir,
      managedSkillRoots,
      preferredSkillsRoot,
      disabledSkillsDir: join(maomiConfigDir, "skills-disabled"),
      skillsStateFile: join(maomiConfigDir, "skills-state.json"),
      discoveryDefinitions: createSkillsDiscoveryDefinitions(userHomeDir),
    };
  }

  private async writeLog(
    level: "info" | "warn" | "error",
    message: string,
    context?: Record<string, unknown>,
  ) {
    try {
      await this.logger[level](message, { context });
    } catch {
      // Ignore runtime log failures for skills mutations.
    }
  }

  private runMutation<T>(work: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(work, work);
    this.mutationQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async ensureDirs() {
    const environment = this.resolveEnvironment();
    await fs.mkdir(environment.maomiConfigDir, { recursive: true });
    await fs.mkdir(environment.preferredSkillsRoot, { recursive: true });
    await fs.mkdir(environment.disabledSkillsDir, { recursive: true });
  }

  private async getStateFileMtimeMs(): Promise<number | null> {
    try {
      const environment = this.resolveEnvironment();
      const stat = await fs.stat(environment.skillsStateFile);
      return stat.mtimeMs;
    } catch {
      return null;
    }
  }

  private async loadStorageFromDisk(): Promise<DesktopSkillsStorage> {
    await this.ensureDirs();

    try {
      const environment = this.resolveEnvironment();
      const raw = await fs.readFile(environment.skillsStateFile, "utf-8");
      return normalizeStorage(JSON.parse(raw) as unknown);
    } catch {
      return createEmptyStorage();
    }
  }

  private async persistStorage(storage: DesktopSkillsStorage) {
    const environment = this.resolveEnvironment();
    const next: DesktopSkillsStorage = {
      ...cloneStorage(storage),
      updatedAt: new Date().toISOString(),
    };

    this.inMemoryStorage = next;
    await fs.writeFile(environment.skillsStateFile, JSON.stringify(next, null, 2), "utf-8");
    this.inMemoryStorageMtimeMs = await this.getStateFileMtimeMs();
  }

  private async loadStorage(): Promise<DesktopSkillsStorage> {
    if (this.inMemoryStorage) {
      const diskMtimeMs = await this.getStateFileMtimeMs();
      if (diskMtimeMs !== null && diskMtimeMs !== this.inMemoryStorageMtimeMs) {
        this.inMemoryStorage = null;
        this.inMemoryStorageMtimeMs = null;
      } else {
        return this.inMemoryStorage;
      }
    }

    if (this.loadStoragePromise) {
      return this.loadStoragePromise;
    }

    this.loadStoragePromise = (async () => {
      const loaded = await this.loadStorageFromDisk();
      this.inMemoryStorage = loaded;
      this.inMemoryStorageMtimeMs = await this.getStateFileMtimeMs();
      return loaded;
    })();

    try {
      return await this.loadStoragePromise;
    } finally {
      this.loadStoragePromise = null;
    }
  }

  private async pathExists(pathname: string): Promise<boolean> {
    try {
      await fs.access(pathname);
      return true;
    } catch {
      return false;
    }
  }

  private upsertStorageItem(storage: DesktopSkillsStorage, item: DesktopSkillItem) {
    const index = storage.items.findIndex((candidate) => candidate.skillId === item.skillId);
    if (index >= 0) {
      storage.items[index] = item;
      return;
    }
    storage.items.push(item);
  }

  private isManagedRuntimePath(pathname: string, environment: SkillsEnvironment): boolean {
    return isInsideAnyPath(environment.managedSkillRoots, pathname);
  }

  private async listManagedItems(): Promise<DesktopSkillItem[]> {
    const storage = await this.loadStorage();
    const scannedItems = await this.scanInstalledManagedItems();
    const itemsById = new Map<string, DesktopSkillItem>();

    for (const item of storage.items.filter((entry) => entry.scope === "global")) {
      itemsById.set(item.skillId, {
        ...item,
        scope: "global",
        workspaceId: undefined,
      });
    }

    for (const scanned of scannedItems) {
      const current = itemsById.get(scanned.skillId);
      itemsById.set(scanned.skillId, {
        skillId: scanned.skillId,
        name: current?.name || basename(scanned.skillId),
        label: current?.label,
        scope: "global",
        workspaceId: undefined,
        enabled: true,
        sourcePath: current?.sourcePath,
        managedPath: scanned.managedPath,
        tags: current?.tags,
        description: current?.description,
        metadata: current?.metadata,
        createdAt: current?.createdAt || scanned.createdAt,
        updatedAt: current?.updatedAt || scanned.updatedAt,
      });
    }

    return [...itemsById.values()].sort((left, right) =>
      left.skillId.localeCompare(right.skillId, "en", {
        sensitivity: "base",
        numeric: true,
      }),
    );
  }

  private async scanInstalledManagedItems(): Promise<Array<{
    skillId: string;
    managedPath: string;
    createdAt: string;
    updatedAt: string;
  }>> {
    const environment = this.resolveEnvironment();
    const seenSkillIds = new Set<string>();
    const result: Array<{
      skillId: string;
      managedPath: string;
      createdAt: string;
      updatedAt: string;
    }> = [];

    for (const root of environment.managedSkillRoots) {
      if (!await this.pathExists(root)) {
        continue;
      }

      let entries: Dirent[] = [];
      try {
        entries = await fs.readdir(root, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const rawSkillId = entry.name.trim();
        if (!rawSkillId || rawSkillId.startsWith(".")) {
          continue;
        }

        let skillId: string;
        try {
          skillId = normalizeSkillId(rawSkillId);
        } catch {
          continue;
        }

        if (seenSkillIds.has(skillId)) {
          continue;
        }

        const managedPath = resolve(join(root, entry.name));
        if (!await this.pathExists(join(managedPath, "SKILL.md"))) {
          continue;
        }

        const stat = await fs.stat(managedPath).catch(() => null);
        const createdAt =
          stat && !Number.isNaN(stat.birthtime.getTime())
            ? stat.birthtime.toISOString()
            : stat && !Number.isNaN(stat.mtime.getTime())
              ? stat.mtime.toISOString()
              : new Date().toISOString();
        const updatedAt =
          stat && !Number.isNaN(stat.mtime.getTime())
            ? stat.mtime.toISOString()
            : createdAt;

        seenSkillIds.add(skillId);
        result.push({
          skillId,
          managedPath,
          createdAt,
          updatedAt,
        });
      }
    }

    return result;
  }

  private async removeDuplicateManagedCopies(skillId: string, activeManagedPath: string) {
    const environment = this.resolveEnvironment();
    const normalizedActivePath = resolve(activeManagedPath);

    for (const root of environment.managedSkillRoots) {
      const candidate = resolve(join(root, skillId));
      if (normalizePathForCompare(candidate) === normalizePathForCompare(normalizedActivePath)) {
        continue;
      }
      await fs.rm(candidate, { recursive: true, force: true });
    }
  }

  private async ensureSkillDirectory(pathname: string) {
    const resolvedPath = resolve(pathname);
    let stat;

    try {
      stat = await fs.stat(resolvedPath);
    } catch {
      throw new DesktopSkillsError("INVALID_ARGUMENT", "skill source path does not exist", {
        sourcePath: pathname,
      });
    }

    if (!stat.isDirectory()) {
      throw new DesktopSkillsError("INVALID_ARGUMENT", "skill source path must be a directory", {
        sourcePath: pathname,
      });
    }

    const skillFile = join(resolvedPath, "SKILL.md");
    if (!await this.pathExists(skillFile)) {
      throw new DesktopSkillsError("INVALID_ARGUMENT", "skill source path must contain SKILL.md", {
        sourcePath: pathname,
      });
    }
  }

  private shouldHideDiscoveryDirectory(pathname: string, managedSkillRoots: string[]) {
    return managedSkillRoots.some((root) =>
      normalizePathForCompare(pathname) === normalizePathForCompare(root),
    );
  }

  private async resolveSourcePath(skillId: string, preferred?: string): Promise<string | undefined> {
    const environment = this.resolveEnvironment();

    if (preferred && await this.pathExists(preferred)) {
      const resolvedPath = resolve(preferred);
      await this.ensureSkillDirectory(resolvedPath);
      return resolvedPath;
    }

    for (const definition of environment.discoveryDefinitions) {
      const candidatePaths = resolveCandidateSkillPaths(definition);
      for (const dirPath of candidatePaths) {
        const candidate = join(dirPath, skillId);
        if (await this.pathExists(candidate)) {
          const resolvedPath = resolve(candidate);
          await this.ensureSkillDirectory(resolvedPath);
          return resolvedPath;
        }
      }
    }

    return undefined;
  }

  private async listDiscoveredItems(q?: string): Promise<DesktopSkillsDiscoveryResponse> {
    const environment = this.resolveEnvironment();
    const managedItems = await this.listManagedItems();
    const managedMap = new Map(managedItems.map((item) => [item.skillId, item]));
    const keyword = q?.trim().toLowerCase();
    const items: DiscoveryWorkItem[] = [];
    const sources: DesktopSkillsDiscoveryResponse["sources"] = [];

    for (const definition of environment.discoveryDefinitions) {
      const candidatePaths = resolveCandidateSkillPaths(definition)
        .filter((dirPath) => !this.shouldHideDiscoveryDirectory(dirPath, environment.managedSkillRoots));
      const existingPaths: string[] = [];
      let sourceItemsCount = 0;

      for (const dirPath of candidatePaths) {
        if (!await this.pathExists(dirPath)) {
          continue;
        }

        existingPaths.push(dirPath);

        let entries: Dirent[] = [];
        try {
          entries = await fs.readdir(dirPath, { withFileTypes: true });
        } catch {
          continue;
        }

        for (const entry of entries) {
          if (!entry.isDirectory()) {
            continue;
          }

          const rawSkillId = entry.name.trim();
          if (!rawSkillId || rawSkillId.startsWith(".")) {
            continue;
          }

          const sourcePath = resolve(join(dirPath, entry.name));
          if (keyword) {
            const haystack = `${rawSkillId} ${definition.source} ${sourcePath}`.toLowerCase();
            if (!haystack.includes(keyword)) {
              continue;
            }
          }

          const normalizedSkillId = rawSkillId.toLowerCase();
          const managed = managedMap.get(normalizedSkillId) ?? managedMap.get(rawSkillId);
          const hasSkillMarkdown = await this.pathExists(join(sourcePath, "SKILL.md"));
          const sourcePathKey = normalizePathForCompare(sourcePath);
          const managedSourcePathKey = managed?.sourcePath
            ? normalizePathForCompare(managed.sourcePath)
            : undefined;

          let state: DesktopSkillsDiscoveryState;
          let conflictType: DesktopSkillsDiscoveryConflictType | undefined;
          let explain = "";

          if (!hasSkillMarkdown) {
            state = "conflicted";
            conflictType = "MANIFEST_INVALID";
            explain = "missing SKILL.md in discovered source path";
          } else if (managed) {
            if (managedSourcePathKey && managedSourcePathKey !== sourcePathKey) {
              state = "changed";
              explain = "discovered source path differs from managed sourcePath";
            } else {
              state = "adopted";
              explain = "already adopted into managed skills";
            }
          } else {
            state = "new";
            explain = "discovered but not yet adopted";
          }

          items.push({
            skillId: normalizedSkillId,
            source: definition.source,
            sourcePath,
            hasSkillMarkdown,
            managed: Boolean(managed),
            enabled: managed?.enabled,
            scope: managed?.scope,
            workspaceId: managed?.workspaceId,
            state,
            conflictType,
            explain,
            normalizedSourcePathKey: sourcePathKey,
          });
          sourceItemsCount += 1;
        }
      }

      sources.push({
        source: definition.source,
        label: definition.label,
        strategy: definition.strategy,
        candidatePaths,
        existingPaths,
        itemsCount: sourceItemsCount,
      });
    }

    const groupedBySkillId = new Map<string, DiscoveryWorkItem[]>();
    for (const item of items) {
      const group = groupedBySkillId.get(item.skillId) ?? [];
      group.push(item);
      groupedBySkillId.set(item.skillId, group);
    }

    for (const group of groupedBySkillId.values()) {
      const distinctPaths = new Set(group.map((item) => item.normalizedSourcePathKey));
      if (distinctPaths.size <= 1) {
        continue;
      }

      for (const item of group) {
        if (item.conflictType === "MANIFEST_INVALID") {
          continue;
        }

        item.state = "conflicted";
        item.conflictType = "ID_CONFLICT";
        item.explain = "same skillId discovered in multiple source paths";
      }
    }

    const dedupedItems = [...new Map(
      items.map((item) => [`${item.skillId}:${item.normalizedSourcePathKey}`, item] as const),
    ).values()]
      .sort((left, right) => {
        const sourceCompare = left.source.localeCompare(right.source, "en", {
          sensitivity: "base",
        });
        if (sourceCompare !== 0) {
          return sourceCompare;
        }

        const skillCompare = left.skillId.localeCompare(right.skillId, "en", {
          sensitivity: "base",
          numeric: true,
        });
        if (skillCompare !== 0) {
          return skillCompare;
        }

        return left.sourcePath.localeCompare(right.sourcePath, "en", {
          sensitivity: "base",
        });
      })
      .map(({ normalizedSourcePathKey: _normalizedSourcePathKey, ...item }) => item);

    return {
      items: dedupedItems,
      sources,
    };
  }

  private async copySkillToLibrary(skillId: string, sourcePath?: string): Promise<string> {
    await this.ensureDirs();

    const environment = this.resolveEnvironment();
    const managedPath = resolve(join(environment.preferredSkillsRoot, skillId));
    const libraryRoot = resolve(environment.preferredSkillsRoot);
    if (!isInsidePath(libraryRoot, managedPath)) {
      throw new DesktopSkillsError("INVALID_ARGUMENT", "managed skill path escapes skills directory", {
        skillId,
      });
    }

    if (sourcePath) {
      const resolvedSource = resolve(sourcePath);
      await this.ensureSkillDirectory(resolvedSource);
      if (resolvedSource === managedPath) {
        return managedPath;
      }

      await fs.rm(managedPath, { recursive: true, force: true });
      await fs.cp(resolvedSource, managedPath, { recursive: true, force: true });
      return managedPath;
    }

    await fs.rm(managedPath, { recursive: true, force: true });
    await fs.mkdir(managedPath, { recursive: true });
    return managedPath;
  }

  private async classifyManagedSkillPath(
    managedPath: string,
  ): Promise<"effective" | "missing_path" | "missing_skill_markdown"> {
    try {
      const stat = await fs.stat(managedPath);
      if (!stat.isDirectory()) {
        return "missing_path";
      }
    } catch {
      return "missing_path";
    }

    if (!await this.pathExists(join(managedPath, "SKILL.md"))) {
      return "missing_skill_markdown";
    }

    return "effective";
  }

  private async buildRuntimeEffectiveResult(
    workspaceId?: string,
    q?: string,
  ): Promise<DesktopSkillsRuntimeEffectiveResult> {
    void workspaceId;

    const environment = this.resolveEnvironment();
    const managed = await this.listManagedItems();

    const paths: string[] = [];
    const rows: DesktopSkillsRuntimeEffectiveResult["items"] = [];
    const injectedRootSet = new Set<string>();
    const keyword = typeof q === "string" && q.trim() ? q.trim().toLowerCase() : "";

    let enabledManaged = 0;
    let skippedDisabled = 0;
    let skippedMissingPath = 0;
    let skippedMissingSkillMarkdown = 0;
    let skippedDuplicatePath = 0;

    for (const item of managed) {
      const normalizedManagedPath = resolve(item.managedPath);
      let decision: SkillRuntimeDecision;
      let included = false;
      let explain = "";
      let shadowedSkillId: string | undefined;

      if (!item.enabled) {
        decision = "disabled";
        explain = "managed skill is disabled and excluded from runtime paths";
        skippedDisabled += 1;
      } else if (!this.isManagedRuntimePath(normalizedManagedPath, environment)) {
        enabledManaged += 1;
        decision = "missing_path";
        explain = "enabled skill is not located under a community skills directory";
        skippedMissingPath += 1;
      } else {
        enabledManaged += 1;
        const validation = await this.classifyManagedSkillPath(normalizedManagedPath);
        if (validation === "missing_path") {
          decision = "missing_path";
          explain = "managed skill path is missing or not a directory";
          skippedMissingPath += 1;
        } else if (validation === "missing_skill_markdown") {
          decision = "missing_skill_markdown";
          explain = "managed skill path does not contain SKILL.md";
          skippedMissingSkillMarkdown += 1;
        } else {
          const runtimeRoot = dirname(normalizedManagedPath);
          const normalizedRuntimeRoot = resolve(runtimeRoot);
          decision = "effective";
          included = true;
          explain = "managed skill will be discovered from the community skills directory";
          if (!injectedRootSet.has(normalizedRuntimeRoot)) {
            injectedRootSet.add(normalizedRuntimeRoot);
            paths.push(normalizedRuntimeRoot);
          } else {
            skippedDuplicatePath += 1;
          }
        }
      }

      const row = {
        effectiveId: `global:${item.skillId}`,
        winnerScope: item.scope,
        winnerSkillId: item.skillId,
        shadowedSkillId,
        decision,
        included,
        explain,
        item: {
          ...item,
          managedPath: normalizedManagedPath,
        },
      };

      if (keyword) {
        const haystack = [
          row.item.skillId,
          row.item.name,
          row.item.label ?? "",
          row.item.managedPath,
          row.item.sourcePath ?? "",
          row.explain,
          row.decision,
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(keyword)) {
          continue;
        }
      }

      rows.push(row);
    }

    return {
      workspaceId: workspaceId?.trim() || undefined,
      paths,
      items: rows,
      diagnostics: {
        totalManaged: managed.length,
        enabledManaged,
        effectivePaths: paths.length,
        skippedDisabled,
        skippedMissingPath,
        skippedMissingSkillMarkdown,
        skippedDuplicatePath,
      },
    };
  }
}