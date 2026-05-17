import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DesktopConfigurationService } from "../../configuration";
import type { DesktopRuntimeContext } from "../../foundation";
import { DesktopDatabaseService } from "../implementation/services/desktop-database-service";

function createRuntimeContext(dbPath: string): DesktopRuntimeContext {
  return {
    appIdentifier: "com.maomiagent.desktop.test",
    appName: "MaomiAgent Test",
    channel: "test",
    mainViewUrl: "views://mainview/index.html",
    singleInstance: {} as DesktopRuntimeContext["singleInstance"],
    logger: console,
    configuration: {
      values: {
        database: {
          connections: {
            runtimeLogs: {
              path: dbPath,
              pragmas: ["PRAGMA journal_mode = WAL;"],
            },
            workspace: {
              path: join(dbPath, "..", "workspace.sqlite"),
              pragmas: ["PRAGMA foreign_keys = ON;"],
            },
          },
        },
      },
    },
    window: {
      title: "MaomiAgent Test",
      frame: {
        width: 100,
        height: 100,
        x: 0,
        y: 0,
      },
    },
    createWindow: (() => ({
      focus() {},
      isMinimized: () => false,
      on() {},
      show() {},
      unminimize() {},
    })) as DesktopRuntimeContext["createWindow"],
    installProcessHandlers: false,
  };
}

describe("DesktopDatabaseService", () => {
  test("exposes SQL and transaction access without leaking concrete sqlite ownership", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-db-"));
    const dbPath = join(tempRoot, "runtime.sqlite");

    try {
      const configuration = new DesktopConfigurationService(createRuntimeContext(dbPath));
      const database = new DesktopDatabaseService(configuration);
      const connection = database.getConnection("runtimeLogs");

      try {
        database.registerEntity({
          name: "runtimeLog",
          tableName: "logs",
          connectionName: "runtimeLogs",
          primaryKey: "id",
        });
        connection.execute("CREATE TABLE logs (id TEXT PRIMARY KEY, message TEXT NOT NULL);");
        connection.transaction((transaction) => {
          transaction.run("INSERT INTO logs (id, message) VALUES (?, ?)", "log-1", "ready");
        });

        expect(connection.get<{ message: string }>("SELECT message FROM logs WHERE id = ?", "log-1")).toEqual({
          message: "ready",
        });
        expect(database.listEntities()).toEqual([
          {
            name: "runtimeLog",
            tableName: "logs",
            connectionName: "runtimeLogs",
            primaryKey: "id",
          },
        ]);
        expect(database.snapshot().connections[0]?.path).toBe(dbPath);
        expect(database.snapshot().connections.map((item) => item.name).sort()).toEqual([
          "runtimeLogs",
          "workspace",
        ]);
      } finally {
        database.dispose();
      }
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});