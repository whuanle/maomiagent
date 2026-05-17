import {
  DependencyModuleBase,
  createServiceToken,
  type DependencyModuleContext,
  type DependencyModuleRuntimeContext,
} from "../../../shared/ioc";

import { DESKTOP_DATABASE_PORT, DesktopDatabaseModule } from "../../database";
import { RUNTIME_LOGGER_FACTORY_PORT, DesktopLogsModule } from "../../logs";
import type { DesktopWorkspacePort } from "../abstraction/ports/desktop-workspace.ports";
import {
  DESKTOP_WORKSPACE_COMMAND_PORT,
  DESKTOP_WORKSPACE_PORT,
  DESKTOP_WORKSPACE_QUERY_PORT,
} from "../abstraction/tokens/desktop-workspace.tokens";
import { DesktopWorkspaceService } from "../implementation/services/desktop-workspace-service";
import { DesktopWorkspaceStore } from "../implementation/stores/desktop-workspace-store";

export const DESKTOP_WORKSPACE_SERVICE_TOKEN =
  createServiceToken<DesktopWorkspacePort>("desktop.workspace.service");

export class DesktopWorkspaceModule extends DependencyModuleBase {
  static moduleId = "desktop.workspace";
  static dependencies = [DesktopDatabaseModule, DesktopLogsModule] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_WORKSPACE_SERVICE_TOKEN, {
      useFactory: (services) => {
        const database = services.resolve(DESKTOP_DATABASE_PORT);
        database.registerEntity({
          name: "DesktopWorkspace",
          tableName: "desktop_workspaces",
          connectionName: "workspace",
          primaryKey: "workspace_id",
        });
        return new DesktopWorkspaceService(
          new DesktopWorkspaceStore(database.getConnection("workspace")),
          services.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
            source: "desktop",
            module: "desktop.workspace",
          }),
        );
      },
      source: context.module.moduleId,
    });

    context.addAlias(DESKTOP_WORKSPACE_PORT, DESKTOP_WORKSPACE_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_WORKSPACE_QUERY_PORT, DESKTOP_WORKSPACE_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_WORKSPACE_COMMAND_PORT, DESKTOP_WORKSPACE_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
  }

  override async onStart(context: DependencyModuleRuntimeContext): Promise<void> {
    const logger = context.container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
      source: "desktop",
      module: "desktop.workspace",
    });
    const workspace = context.container.resolve(DESKTOP_WORKSPACE_PORT);
    const list = await workspace.list({ limit: 1 });
    await logger.info("Desktop workspace module started", {
      context: { total: list.meta.total },
    });
  }
}