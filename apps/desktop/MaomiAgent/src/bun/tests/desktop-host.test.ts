import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DESKTOP_FEISHU_OAUTH_CALLBACK_PATH } from "../../shared/desktop-feishu-oauth";

import {
  DESKTOP_APP_INFO,
  DESKTOP_CONFIGURATION_PORT,
  DESKTOP_DATABASE_PORT,
  DESKTOP_HEALTH_CHECK_PORT,
  DESKTOP_OBSERVABILITY_CONFIG,
  DESKTOP_STARTUP_TRACE,
  DESKTOP_WORKSPACE_PORT,
  startDesktopApplication,
  type DesktopBrowserWindow,
  type DesktopWindowOptions,
} from "../desktop-host";
import { RUNTIME_LOGS_QUERY_PORT } from "../modules/logs";
import type { SingleInstanceController, SingleInstanceHttpRoute } from "../single-instance";

type FakeSingleInstanceController = SingleInstanceController & {
  triggerActivation: () => Promise<void>;
  isDisposed: () => boolean;
  routes: SingleInstanceHttpRoute[];
};

function createFakeSingleInstanceController(): FakeSingleInstanceController {
  let activationHandler: (() => void | Promise<void>) | null = null;
  let disposed = false;
  const routes: SingleInstanceHttpRoute[] = [];

  return {
    kind: "primary",
    routes,
    setActivationHandler(handler) {
      activationHandler = handler;
    },
    registerHttpRoute(route) {
      routes.push(route);
      return () => {
        const index = routes.indexOf(route);
        if (index >= 0) {
          routes.splice(index, 1);
        }
      };
    },
    async dispose() {
      disposed = true;
    },
    async triggerActivation() {
      await activationHandler?.();
    },
    isDisposed() {
      return disposed;
    },
  };
}

function createFakeWindow(input?: { minimized?: boolean }): {
  window: DesktopBrowserWindow;
  metrics: {
    focusCalls: number;
    showCalls: number;
    unminimizeCalls: number;
  };
} {
  const metrics = {
    focusCalls: 0,
    showCalls: 0,
    unminimizeCalls: 0,
  };

  let minimized = input?.minimized ?? false;

  return {
    window: {
      focus() {
        metrics.focusCalls += 1;
      },
      isMinimized() {
        return minimized;
      },
      on() {},
      show() {
        metrics.showCalls += 1;
      },
      unminimize() {
        minimized = false;
        metrics.unminimizeCalls += 1;
      },
    },
    metrics,
  };
}

describe("startDesktopApplication", () => {
  test("boots a kernel IOC module host and wires single-instance activation", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-logs-"));
    const previousLogDbPath = process.env.MAOMI_DESKTOP_LOG_DB_PATH;
    const previousWorkspaceDbPath = process.env.MAOMI_DESKTOP_WORKSPACE_DB_PATH;
    const previousConversationDbPath = process.env.MAOMI_DESKTOP_CONVERSATION_DB_PATH;
    const previousConfigDir = process.env.MAOMI_CONFIG_DIR;
    process.env.MAOMI_DESKTOP_LOG_DB_PATH = join(tempRoot, "logs.sqlite");
    process.env.MAOMI_DESKTOP_WORKSPACE_DB_PATH = join(tempRoot, "workspace.sqlite");
    process.env.MAOMI_DESKTOP_CONVERSATION_DB_PATH = join(tempRoot, "conversation.sqlite");
    process.env.MAOMI_CONFIG_DIR = tempRoot;

    const singleInstance = createFakeSingleInstanceController();
    const createdWindowOptions: DesktopWindowOptions[] = [];
    const fakeWindow = createFakeWindow({ minimized: true });
    let host: Awaited<ReturnType<typeof startDesktopApplication>> | null = null;

    try {
      host = await startDesktopApplication({
        appIdentifier: "com.maomiagent.desktop",
        appName: "MaomiAgent",
        channel: "dev",
        mainViewUrl: "views://mainview/index.html",
        singleInstance,
        window: {
          title: "MaomiAgent",
          frame: {
            width: 1240,
            height: 840,
            x: 160,
            y: 80,
          },
        },
        createWindow(options) {
          createdWindowOptions.push(options);
          return fakeWindow.window;
        },
        installProcessHandlers: false,
        logger: {
          log() {},
          warn() {},
          error() {},
        },
      });

      expect(host.listModules().map((item) => item.moduleId)).toEqual([
        "desktop.foundation",
        "desktop.configuration",
        "desktop.database",
        "desktop.logs",
        "desktop.observability",
        "desktop.window",
        "desktop.workspace",
        "desktop.git",
        "desktop.models",
        "desktop.agents",
        "desktop.ai",
        "desktop.terminals",
        "desktop.tasks",
        "desktop.conversation",
        "desktop.memory",
        "desktop.skills",
        "desktop.mcp",
        "desktop.wechat",
        "desktop.feishu",
        "desktop.shell",
      ]);
      expect(createdWindowOptions).toEqual([
        {
          title: "MaomiAgent",
          url: "views://mainview/index.html",
          frame: {
            width: 1240,
            height: 840,
            x: 160,
            y: 80,
          },
        },
      ]);

      expect(host.container.resolve(DESKTOP_APP_INFO)).toEqual({
        appIdentifier: "com.maomiagent.desktop",
        appName: "MaomiAgent",
        channel: "dev",
        mainViewUrl: "views://mainview/index.html",
        windowTitle: "MaomiAgent",
      });
      const startupTrace = host.container.resolve(DESKTOP_STARTUP_TRACE);
      const configuration = host.container.resolve(DESKTOP_CONFIGURATION_PORT);
      const database = host.container.resolve(DESKTOP_DATABASE_PORT);
      const observabilityConfig = host.container.resolve(DESKTOP_OBSERVABILITY_CONFIG);

      expect(configuration.getString("logs.database.path")).toBe(join(tempRoot, "logs.sqlite"));
      expect(database.snapshot().connections).toContainEqual({
        name: "runtimeLogs",
        path: join(tempRoot, "logs.sqlite"),
        pragmas: ["PRAGMA journal_mode = WAL;"],
      });
      expect(database.snapshot().connections.map((item) => item.name)).toContain("workspace");

      expect(observabilityConfig).toMatchObject({
        serviceName: "MaomiAgent",
        serviceNamespace: "maomiagent.desktop",
        tracing: {
          enabled: false,
          consoleExporter: false,
        },
      });

      expect(startupTrace).toEqual([
        "start:desktop.shell",
        "window:created",
      ]);

      const startupLogs = host.container.resolve(RUNTIME_LOGS_QUERY_PORT).query({
        module: "desktop.shell",
      });
      expect(startupLogs.items).toHaveLength(1);
      expect(startupLogs.items[0]?.message).toBe("Desktop shell module starting");
      expect(typeof startupLogs.items[0]?.traceId).toBe("string");
      expect(startupLogs.items[0]?.context).toMatchObject({
        channel: "dev",
        location: "desktop.shell",
      });

      const observabilityLogs = host.container.resolve(RUNTIME_LOGS_QUERY_PORT).query({
        module: "desktop.observability",
      });
      expect(observabilityLogs.items.map((item) => item.message)).toContain(
        "Desktop observability module started",
      );

      const windowLogs = host.container.resolve(RUNTIME_LOGS_QUERY_PORT).query({
        module: "desktop.window",
      });
      expect(windowLogs.items.map((item) => item.message)).toContain(
        "Desktop main window created",
      );

      const workspaceLogs = host.container.resolve(RUNTIME_LOGS_QUERY_PORT).query({
        module: "desktop.workspace",
      });
      expect(workspaceLogs.items.map((item) => item.message)).toContain(
        "Desktop workspace module started",
      );

      const wechatLogs = host.container.resolve(RUNTIME_LOGS_QUERY_PORT).query({
        module: "desktop.wechat",
      });
      expect(wechatLogs.items.map((item) => item.message)).toContain(
        "Desktop wechat module started",
      );
      expect(singleInstance.routes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "GET",
            path: DESKTOP_FEISHU_OAUTH_CALLBACK_PATH,
          }),
        ]),
      );
      expect((await host.container.resolve(DESKTOP_WORKSPACE_PORT).list()).items).toEqual([]);

      const healthReport = await host.container.resolve(DESKTOP_HEALTH_CHECK_PORT).check();
      expect(healthReport.status).toBe("healthy");
      expect(healthReport.checks.map((item) => item.name)).toContain("desktop.shell");

      await singleInstance.triggerActivation();

      expect(fakeWindow.metrics.showCalls).toBe(1);
      expect(fakeWindow.metrics.unminimizeCalls).toBe(1);
      expect(fakeWindow.metrics.focusCalls).toBe(1);
      expect(startupTrace).toEqual([
        "start:desktop.shell",
        "window:created",
        "window:activated",
      ]);

      await host.dispose();
      host = null;

      expect(singleInstance.isDisposed()).toBe(true);
      expect(startupTrace).toEqual([
        "start:desktop.shell",
        "window:created",
        "window:activated",
        "stop:desktop.shell",
      ]);
    } finally {
      await host?.dispose().catch(() => undefined);
      if (previousLogDbPath === undefined) {
        delete process.env.MAOMI_DESKTOP_LOG_DB_PATH;
      } else {
        process.env.MAOMI_DESKTOP_LOG_DB_PATH = previousLogDbPath;
      }
      if (previousWorkspaceDbPath === undefined) {
        delete process.env.MAOMI_DESKTOP_WORKSPACE_DB_PATH;
      } else {
        process.env.MAOMI_DESKTOP_WORKSPACE_DB_PATH = previousWorkspaceDbPath;
      }
      if (previousConversationDbPath === undefined) {
        delete process.env.MAOMI_DESKTOP_CONVERSATION_DB_PATH;
      } else {
        process.env.MAOMI_DESKTOP_CONVERSATION_DB_PATH = previousConversationDbPath;
      }
      if (previousConfigDir === undefined) {
        delete process.env.MAOMI_CONFIG_DIR;
      } else {
        process.env.MAOMI_CONFIG_DIR = previousConfigDir;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
