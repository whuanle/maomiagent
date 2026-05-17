import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RuntimeLogExtra, RuntimeLogLevel, RuntimeLogRecord, RuntimeLogger } from "../../../../shared/runtime-logs";
import { DesktopMemoryService } from "./desktop-memory-service";

function createRuntimeLoggerStub(): RuntimeLogger {
  const write = async (level: RuntimeLogLevel, message: string): Promise<RuntimeLogRecord> => ({
    id: `${level}-${message}`,
    at: new Date().toISOString(),
    level,
    source: "memory-test",
    module: "desktop.memory.test",
    message,
  });

  return {
    write: (level: RuntimeLogLevel, message: string, _extra?: RuntimeLogExtra) => write(level, message),
    debug: (message: string, _extra?: RuntimeLogExtra) => write("debug", message),
    info: (message: string, _extra?: RuntimeLogExtra) => write("info", message),
    warn: (message: string, _extra?: RuntimeLogExtra) => write("warn", message),
    error: (message: string, _extra?: RuntimeLogExtra) => write("error", message),
  };
}

function sanitizeWorkspaceId(workspaceId: string): string {
  return workspaceId.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 128);
}

function globalDbPath(root: string): string {
  return join(root, "memory", "global.sqlite");
}

function workspaceDbPath(root: string, workspaceId: string): string {
  return join(root, "memory", `workspace-${sanitizeWorkspaceId(workspaceId)}.sqlite`);
}

async function setUnitUpdatedAt(dbPath: string, unitId: string, updatedAt: string) {
  const db = new Database(dbPath);

  try {
    db.query("UPDATE memory_units SET updated_at = ? WHERE unit_id = ?").run(updatedAt, unitId);
  } finally {
    db.close(false);
  }
}

describe("DesktopMemoryService scopeFilter", () => {
  const originalConfigDir = process.env.MAOMI_CONFIG_DIR;
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "maomi-memory-"));
    process.env.MAOMI_CONFIG_DIR = tempRoot;
  });

  afterEach(async () => {
    if (originalConfigDir === undefined) {
      delete process.env.MAOMI_CONFIG_DIR;
    } else {
      process.env.MAOMI_CONFIG_DIR = originalConfigDir;
    }

    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = "";
    }
  });

  test("projection defaults to all persistent memories when scopeFilter is all", async () => {
    const service = new DesktopMemoryService(createRuntimeLoggerStub());

    try {
      await service.append({ scope: "global", rawContent: "全局偏好", kind: "preference" });
      await service.append({ scope: "workspace", workspaceId: "ws-a", rawContent: "工作区决策 A", kind: "decision" });

      const projection = await service.getProjection({
        units: {
          scopeFilter: "all",
          limit: 20,
          offset: 0,
        },
      });

      expect(projection.units.items).toHaveLength(2);
      expect(projection.units.items.map((item) => item.scope).sort()).toEqual(["global", "workspace"]);
    } finally {
      await service.dispose();
    }
  });

  test("workspace scope without workspaceId aggregates all workspace memories only", async () => {
    const service = new DesktopMemoryService(createRuntimeLoggerStub());

    try {
      await service.append({ scope: "global", rawContent: "全局设定", kind: "setting" });
      await service.append({ scope: "workspace", workspaceId: "ws-a", rawContent: "工作区约束 A", kind: "constraint" });
      await service.append({ scope: "workspace", workspaceId: "ws-b", rawContent: "工作区约束 B", kind: "constraint" });

      const units = await service.listUnits({
        scopeFilter: "workspace",
        limit: 20,
        offset: 0,
      });

      expect(units.items).toHaveLength(2);
      expect(units.items.every((item) => item.scope === "workspace")).toBe(true);
      expect(units.items.map((item) => item.workspaceId).sort()).toEqual(["ws-a", "ws-b"]);
    } finally {
      await service.dispose();
    }
  });

  test("search with scopeFilter all recalls global and workspace memories together", async () => {
    const service = new DesktopMemoryService(createRuntimeLoggerStub());

    try {
      await service.append({ scope: "global", rawContent: "用户偏好简洁回答", kind: "preference" });
      await service.append({ scope: "workspace", workspaceId: "ws-a", rawContent: "项目偏好使用 Bun", kind: "decision" });

      const result = await service.search({
        scopeFilter: "all",
        query: "偏好",
        topK: 10,
      });

      expect(result.items).toHaveLength(2);
      expect(result.items.map((item) => item.scope).sort()).toEqual(["global", "workspace"]);
    } finally {
      await service.dispose();
    }
  });

  test("maintenance preview with scopeFilter all selects global and workspace memories", async () => {
    const service = new DesktopMemoryService(createRuntimeLoggerStub());

    try {
      const globalUnit = await service.append({
        scope: "global",
        rawContent: "全局决策需要整理",
        kind: "decision",
        tier: "short",
      });
      const workspaceUnit = await service.append({
        scope: "workspace",
        workspaceId: "ws-a",
        rawContent: "工作区约束需要整理",
        kind: "constraint",
        tier: "mid",
      });
      const staleAt = "2020-01-01T00:00:00.000Z";

      await setUnitUpdatedAt(globalDbPath(tempRoot), globalUnit.unitId, staleAt);
      await setUnitUpdatedAt(workspaceDbPath(tempRoot, "ws-a"), workspaceUnit.unitId, staleAt);

      const preview = await service.previewMaintenance({
        scopeFilter: "all",
        criteria: { olderThanDays: 30 },
      });

      expect(preview.summary.selected).toBe(2);
      expect(preview.selected.sort()).toEqual([globalUnit.unitId, workspaceUnit.unitId].sort());
    } finally {
      await service.dispose();
    }
  });
});
