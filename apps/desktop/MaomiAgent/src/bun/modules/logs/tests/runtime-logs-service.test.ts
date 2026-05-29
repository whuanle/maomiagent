import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DesktopConfigurationService } from "../../configuration";
import { DesktopDatabaseService } from "../../database";
import { RuntimeLogsService } from "../implementation/services/runtime-logs-service";
import { RuntimeLogsStore } from "../implementation/stores/runtime-logs-store";
import type { DesktopRuntimeContext } from "../../foundation";

async function withTempLogDb<T>(callback: () => T | Promise<T>): Promise<T> {
  const tempRoot = await mkdtemp(join(tmpdir(), "maomi-runtime-logs-"));
  const previousLogDbPath = process.env.MAOMI_DESKTOP_LOG_DB_PATH;
  process.env.MAOMI_DESKTOP_LOG_DB_PATH = join(tempRoot, "logs.sqlite");

  try {
    return await callback();
  } finally {
    if (previousLogDbPath === undefined) {
      delete process.env.MAOMI_DESKTOP_LOG_DB_PATH;
    } else {
      process.env.MAOMI_DESKTOP_LOG_DB_PATH = previousLogDbPath;
    }
    await rm(tempRoot, { recursive: true, force: true });
  }
}

describe("RuntimeLogsService", () => {
  test("writes, queries and summarizes desktop runtime logs", async () => {
    await withTempLogDb(async () => {
      const configuration = new DesktopConfigurationService({
        appIdentifier: "com.maomiagent.desktop.test",
        appName: "MaomiAgent Test",
        channel: "test",
        mainViewUrl: "views://mainview/index.html",
        singleInstance: {} as DesktopRuntimeContext["singleInstance"],
        logger: console,
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
      });
      const database = new DesktopDatabaseService(configuration);
      const service = new RuntimeLogsService(
        new RuntimeLogsStore(database.getConnection("runtimeLogs")),
      );

      try {
        const logger = service.createLogger({
          source: "desktop",
          module: "desktop.logs.test",
        });

        const infoRecord = await logger.info("Desktop log ready", {
          traceId: "trace-1",
          context: { channel: "test" },
        });
        const errorRecord = await logger.error("Desktop log failed", {
          error: new Error("boom"),
          location: "runtime-logs-service.test",
        });

        expect(infoRecord.level).toBe("info");
        expect(errorRecord.stack).toContain("boom");

        const queried = service.query({ module: "desktop.logs.test" });
        expect(queried.meta.total).toBe(2);
        expect(queried.items.map((item) => item.message)).toContain("Desktop log ready");
        expect(queried.items.map((item) => item.message)).toContain("Desktop log failed");

        const traceFiltered = service.query({ traceId: "trace-1" });
        expect(traceFiltered.items).toHaveLength(1);
        expect(traceFiltered.items[0]?.context).toMatchObject({
          channel: "test",
          location: "desktop.logs.test",
        });

        const summary = service.summary({ source: "desktop" });
        expect(summary.total).toBe(2);
        expect(summary.byLevel).toMatchObject({ info: 1, error: 1 });
        expect(summary.byModule).toMatchObject({ "desktop.logs.test": 2 });
      } finally {
        service.dispose();
        database.dispose();
      }
    });
  });
});