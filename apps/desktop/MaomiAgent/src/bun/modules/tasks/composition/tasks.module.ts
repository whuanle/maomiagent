import {
  DependencyModuleBase,
  createServiceToken,
  type DependencyModuleContext,
  type DependencyModuleRuntimeContext,
} from "../../../shared/ioc";

import { DESKTOP_DATABASE_PORT, DesktopDatabaseModule } from "../../database";
import { RUNTIME_LOGGER_FACTORY_PORT, DesktopLogsModule } from "../../logs";
import {
  DESKTOP_WORKSPACE_QUERY_PORT,
  DesktopWorkspaceModule,
} from "../../workspace";
import type { DesktopTasksPort } from "../abstraction/ports/desktop-tasks.ports";
import {
  DESKTOP_CONVERSATION_TASK_BRIDGE_PORT,
  DESKTOP_SCHEDULED_TASK_HANDLER,
  DESKTOP_SCHEDULED_TASK_REGISTRY_PORT,
  DESKTOP_TASKS_COMMAND_PORT,
  DESKTOP_TASKS_PORT,
  DESKTOP_TASKS_QUERY_PORT,
} from "../abstraction/tokens/desktop-tasks.tokens";
import { DesktopTasksService } from "../implementation/services/desktop-tasks-service";
import { DesktopTasksStore } from "../implementation/stores/desktop-tasks-store";

export const DESKTOP_TASKS_SERVICE_TOKEN =
  createServiceToken<DesktopTasksService>("desktop.tasks.service");

export class DesktopTasksModule extends DependencyModuleBase {
  static moduleId = "desktop.tasks";
  static dependencies = [
    DesktopDatabaseModule,
    DesktopLogsModule,
    DesktopWorkspaceModule,
  ] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_TASKS_SERVICE_TOKEN, {
      useFactory: (services) => {
        const database = services.resolve(DESKTOP_DATABASE_PORT);
        database.registerEntity({
          name: "DesktopTask",
          tableName: "desktop_tasks",
          connectionName: "workspace",
          primaryKey: "workspace_id,task_id",
        });
        database.registerEntity({
          name: "DesktopTaskRun",
          tableName: "desktop_task_runs",
          connectionName: "workspace",
          primaryKey: "run_id",
        });
        database.registerEntity({
          name: "DesktopTaskWorkspace",
          tableName: "desktop_task_workspaces",
          connectionName: "workspace",
          primaryKey: "workspace_id",
        });
        return new DesktopTasksService(
          new DesktopTasksStore(database.getConnection("workspace")),
          services.resolve(DESKTOP_WORKSPACE_QUERY_PORT),
          services.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
            source: "desktop",
            module: "desktop.tasks",
          }),
        );
      },
      source: context.module.moduleId,
    });

    context.addAlias(DESKTOP_TASKS_PORT, DESKTOP_TASKS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_TASKS_QUERY_PORT, DESKTOP_TASKS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_TASKS_COMMAND_PORT, DESKTOP_TASKS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_CONVERSATION_TASK_BRIDGE_PORT, DESKTOP_TASKS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_SCHEDULED_TASK_REGISTRY_PORT, DESKTOP_TASKS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
  }

  override async onStart(context: DependencyModuleRuntimeContext): Promise<void> {
    const logger = context.container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
      source: "desktop",
      module: "desktop.tasks",
    });
    const tasks = context.container.resolve(DESKTOP_TASKS_SERVICE_TOKEN);
    const handlers = context.container.resolveAll(DESKTOP_SCHEDULED_TASK_HANDLER);
    for (const handler of handlers) {
      tasks.register(handler);
    }
    await tasks.syncManagedTasks();
    tasks.startScheduler();
    const list = await tasks.list({ limit: 1 });
    await logger.info("Desktop tasks module started", {
      context: {
        total: list.meta.total,
        handlerCount: handlers.length,
      },
    });
  }

  override async onStop(context: DependencyModuleRuntimeContext): Promise<void> {
    const tasks = context.container.resolve(DESKTOP_TASKS_SERVICE_TOKEN);
    tasks.stopScheduler();
    for (const handler of context.container.resolveAll(DESKTOP_SCHEDULED_TASK_HANDLER)) {
      tasks.unregister(handler.handlerId);
    }
  }
}