import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createServiceToken,
  createServiceCollection,
  DependencyModuleBase,
  type DependencyModuleContext,
  type DependencyModuleRuntimeContext,
} from "../../../shared/ioc";
import { DesktopTasksModule } from "../composition/tasks.module";
import {
  DESKTOP_SCHEDULED_TASK_HANDLER,
  DESKTOP_TASKS_QUERY_PORT,
  type DesktopScheduledTaskHandler,
} from "../index";
import type { DesktopRuntimeContext } from "../../foundation";
import { DESKTOP_RUNTIME_CONTEXT } from "../../foundation";

const TEST_HANDLER_TOKEN = createServiceToken<DesktopScheduledTaskHandler>(
  "desktop.tasks.test.handler",
);

function createRuntimeContext(tempRoot: string): DesktopRuntimeContext {
  return {
    appIdentifier: "com.maomiagent.desktop.test",
    appName: "MaomiAgent Test",
    channel: "test",
    mainViewUrl: "views://mainview/index.html",
    singleInstance: {
      kind: "primary",
      setActivationHandler() {},
      registerHttpRoute() {
        return () => {};
      },
      async dispose() {},
    },
    logger: {
      log() {},
      warn() {},
      error() {},
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
    configuration: {
      values: {
        database: {
          connections: {
            runtimeLogs: {
              path: join(tempRoot, "logs.sqlite"),
            },
            workspace: {
              path: join(tempRoot, "workspace.sqlite"),
            },
          },
        },
      },
    },
    createWindow() {
      throw new Error("not needed");
    },
    installProcessHandlers: false,
  };
}

class DesktopTasksHandlerFixtureModule extends DependencyModuleBase {
  static moduleId = "desktop.tasks-handler-fixture";
  static dependencies = [DesktopTasksModule] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(TEST_HANDLER_TOKEN, {
      useValue: {
        handlerId: "desktop.fixture.handler",
        moduleId: "desktop.fixture",
        displayName: "Desktop Fixture Handler",
        listDefinitions() {
          return [{
            taskKey: "fixture-task",
            workspaceId: "alpha",
            title: "Fixture Task",
            goal: "Verify desktop task handler auto registration",
            schedule: {
              kind: "interval",
              intervalMinutes: 30,
              nextRunAt: new Date(Date.now() + 30 * 60_000).toISOString(),
              enabled: true,
            },
            metadata: {
              owner: "fixture",
            },
          }];
        },
        async execute() {
          return {
            summary: "fixture completed",
          };
        },
      },
      source: context.module.moduleId,
    });

    context.addAlias(DESKTOP_SCHEDULED_TASK_HANDLER, TEST_HANDLER_TOKEN, {
      source: context.module.moduleId,
    });
  }

  override async onStart(_context: DependencyModuleRuntimeContext): Promise<void> {}
}

describe("DesktopTasksModule", () => {
  test("registers scheduled task handlers declared by dependent modules on start", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "maomi-desktop-tasks-module-"));
    const previousConfigDir = process.env.MAOMI_CONFIG_DIR;
    process.env.MAOMI_CONFIG_DIR = tempRoot;

    const services = createServiceCollection();
    services.addSingleton(DESKTOP_RUNTIME_CONTEXT, {
      useValue: createRuntimeContext(tempRoot),
      source: "desktop.tasks.test",
    });
    services.addModule(DesktopTasksHandlerFixtureModule);

    const host = services.buildModuleHost();

    try {
      await host.start();

      const list = await host.container.resolve(DESKTOP_TASKS_QUERY_PORT).list({
        workspaceId: "alpha",
        limit: 10,
        offset: 0,
      });

      expect(list.items).toHaveLength(1);
      expect(list.items[0]).toMatchObject({
        workspaceId: "alpha",
        title: "Fixture Task",
        goal: "Verify desktop task handler auto registration",
        taskType: "automation",
      });
      expect(list.items[0]?.handler).toMatchObject({
        handlerId: "desktop.fixture.handler",
        moduleId: "desktop.fixture",
        taskKey: "fixture-task",
      });
    } finally {
      await host.dispose().catch(() => undefined);
      if (previousConfigDir === undefined) {
        delete process.env.MAOMI_CONFIG_DIR;
      } else {
        process.env.MAOMI_CONFIG_DIR = previousConfigDir;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
