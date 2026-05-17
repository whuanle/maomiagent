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
import type { DesktopGitPort } from "../abstraction/ports/desktop-git.ports";
import {
  DESKTOP_GIT_COMMAND_PORT,
  DESKTOP_GIT_PORT,
  DESKTOP_GIT_QUERY_PORT,
} from "../abstraction/tokens/desktop-git.tokens";
import { DesktopGitService } from "../implementation/services/desktop-git-service";

export const DESKTOP_GIT_SERVICE_TOKEN =
  createServiceToken<DesktopGitPort>("desktop.git.service");

export class DesktopGitModule extends DependencyModuleBase {
  static moduleId = "desktop.git";
  static dependencies = [DesktopWorkspaceModule, DesktopLogsModule] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_GIT_SERVICE_TOKEN, {
      useFactory: (services) => new DesktopGitService(
        services.resolve(DESKTOP_WORKSPACE_QUERY_PORT),
        services.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
          source: "desktop",
          module: "desktop.git",
        }),
      ),
      source: context.module.moduleId,
    });

    context.addAlias(DESKTOP_GIT_PORT, DESKTOP_GIT_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_GIT_QUERY_PORT, DESKTOP_GIT_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_GIT_COMMAND_PORT, DESKTOP_GIT_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
  }

  override async onStart(context: DependencyModuleRuntimeContext): Promise<void> {
    const logger = context.container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
      source: "desktop",
      module: "desktop.git",
    });
    await logger.info("Desktop git module started");
  }
}