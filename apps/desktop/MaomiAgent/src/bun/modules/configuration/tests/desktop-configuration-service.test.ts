import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DesktopRuntimeContext } from "../../foundation";
import { DesktopConfigurationService } from "../implementation/services/desktop-configuration-service";

function createRuntimeContext(input: {
  configFile: string;
  logDbPath: string;
}): DesktopRuntimeContext {
  return {
    appIdentifier: "com.maomiagent.desktop.test",
    appName: "MaomiAgent Test",
    channel: "test",
    mainViewUrl: "views://mainview/index.html",
    singleInstance: {} as DesktopRuntimeContext["singleInstance"],
    logger: console,
    configuration: {
      files: [input.configFile],
      environment: {
        MAOMI_DESKTOP_LOG_DB_PATH: input.logDbPath,
        MAOMI_OTEL_CONSOLE_EXPORTER: "1",
      },
      values: {
        observability: {
          serviceNamespace: "maomiagent.test",
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

describe("DesktopConfigurationService", () => {
  test("merges runtime defaults, files, environment and bootstrap values", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-config-"));
    const configFile = join(tempRoot, "desktop.config.json");
    const logDbPath = join(tempRoot, "logs.sqlite");

    try {
      await writeFile(configFile, JSON.stringify({
        observability: {
          serviceName: "Config File Service",
        },
        database: {
          connections: {
            runtimeLogs: {
              pragmas: ["PRAGMA journal_mode = WAL;", "PRAGMA foreign_keys = ON;"],
            },
          },
        },
      }), "utf-8");

      const configuration = new DesktopConfigurationService(createRuntimeContext({
        configFile,
        logDbPath,
      }));

      expect(configuration.getString("app.channel")).toBe("test");
      expect(configuration.getString("observability.serviceName")).toBe("Config File Service");
      expect(configuration.getString("observability.serviceNamespace")).toBe("maomiagent.test");
      expect(configuration.getBoolean("observability.tracing.consoleExporter")).toBe(true);
      expect(configuration.getString("database.connections.runtimeLogs.path")).toBe(logDbPath);
      expect(configuration.get<string[]>("database.connections.runtimeLogs.pragmas")).toEqual([
        "PRAGMA journal_mode = WAL;",
        "PRAGMA foreign_keys = ON;",
      ]);
      expect(configuration.snapshot().sources.map((item) => item.name)).toEqual([
        "runtime",
        "file",
        "environment",
        "bootstrap",
      ]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});