import {
  DependencyModuleBase,
  createServiceToken,
  type DependencyModuleContext,
  type DependencyModuleRuntimeContext,
} from "../../../shared/ioc";

import { RUNTIME_LOGGER_FACTORY_PORT, DesktopLogsModule } from "../../logs";
import {
  DESKTOP_WORKSPACE_QUERY_PORT,
  DesktopWorkspaceModule,
} from "../../workspace";
import { DesktopTerminalsService } from "../implementation/services/desktop-terminals-service";
import {
  DESKTOP_TERMINALS_COMMAND_PORT,
  DESKTOP_TERMINALS_PORT,
  DESKTOP_TERMINALS_QUERY_PORT,
} from "../abstraction/tokens/desktop-terminals.tokens";
import { DesktopShellProfileService } from "../implementation/services/desktop-shell-profile-service";

export const DESKTOP_TERMINALS_SERVICE_TOKEN =
  createServiceToken<DesktopTerminalsService>("desktop.terminals.service");

export class DesktopTerminalsModule extends DependencyModuleBase {
  static moduleId = "desktop.terminals";
  static dependencies = [
    DesktopLogsModule,
    DesktopWorkspaceModule,
  ] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_TERMINALS_SERVICE_TOKEN, {
      useFactory: (services) => {
        return new DesktopTerminalsService(
          services.resolve(DESKTOP_WORKSPACE_QUERY_PORT),
          services.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
            source: "desktop",
            module: "desktop.terminals",
          }),
          new DesktopShellProfileService(),
        );
      },
      source: context.module.moduleId,
    });

    context.addAlias(DESKTOP_TERMINALS_PORT, DESKTOP_TERMINALS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_TERMINALS_QUERY_PORT, DESKTOP_TERMINALS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_TERMINALS_COMMAND_PORT, DESKTOP_TERMINALS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
  }

  override async onStart(context: DependencyModuleRuntimeContext): Promise<void> {
    const logger = context.container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
      source: "desktop",
      module: "desktop.terminals",
    });
    await logger.info("Desktop terminals module started");
  }
}
