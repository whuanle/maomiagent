import {
  DependencyModuleBase,
  createServiceToken,
  type DependencyModuleContext,
  type DependencyModuleRuntimeContext,
} from "../../../shared/ioc";

import { DESKTOP_DATABASE_PORT, DesktopDatabaseModule } from "../../database";
import { RUNTIME_LOGGER_FACTORY_PORT, DesktopLogsModule } from "../../logs";
import type { DesktopAgentsPort } from "../abstraction/ports/desktop-agents.ports";
import {
  DESKTOP_AGENTS_COMMAND_PORT,
  DESKTOP_AGENTS_PORT,
  DESKTOP_AGENTS_QUERY_PORT,
} from "../abstraction/tokens/desktop-agents.tokens";
import { DesktopAgentsService } from "../implementation/services/desktop-agents-service";
import { DesktopAgentsStore } from "../implementation/stores/desktop-agents-store";

export const DESKTOP_AGENTS_SERVICE_TOKEN =
  createServiceToken<DesktopAgentsPort>("desktop.agents.service");

export class DesktopAgentsModule extends DependencyModuleBase {
  static moduleId = "desktop.agents";
  static dependencies = [DesktopDatabaseModule, DesktopLogsModule] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_AGENTS_SERVICE_TOKEN, {
      useFactory: (services) => {
        const database = services.resolve(DESKTOP_DATABASE_PORT);
        database.registerEntity({
          name: "DesktopAgent",
          tableName: "desktop_agents",
          connectionName: "workspace",
          primaryKey: "agent_id",
        });
        return new DesktopAgentsService(
          new DesktopAgentsStore(database.getConnection("workspace")),
          services.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
            source: "desktop",
            module: "desktop.agents",
          }),
        );
      },
      source: context.module.moduleId,
    });

    context.addAlias(DESKTOP_AGENTS_PORT, DESKTOP_AGENTS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_AGENTS_QUERY_PORT, DESKTOP_AGENTS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_AGENTS_COMMAND_PORT, DESKTOP_AGENTS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
  }

  override async onStart(context: DependencyModuleRuntimeContext): Promise<void> {
    const logger = context.container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
      source: "desktop",
      module: "desktop.agents",
    });
    const agents = context.container.resolve(DESKTOP_AGENTS_PORT);
    const list = await agents.list();
    await logger.info("Desktop agents module started", {
      context: { total: list.meta.total },
    });
  }
}