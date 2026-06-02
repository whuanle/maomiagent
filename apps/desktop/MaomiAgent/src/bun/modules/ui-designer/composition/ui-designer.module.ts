import {
  DependencyModuleBase,
  createServiceToken,
  type DependencyModuleContext,
  type DependencyModuleRuntimeContext,
} from "../../../shared/ioc";
import { RUNTIME_LOGGER_FACTORY_PORT, DesktopLogsModule } from "../../logs";
import { DESKTOP_WORKSPACE_QUERY_PORT, DesktopWorkspaceModule } from "../../workspace";
import type { DesktopUiDesignerPort } from "../abstraction/ports/desktop-ui-designer.ports";
import {
  DESKTOP_UI_DESIGNER_COMMAND_PORT,
  DESKTOP_UI_DESIGNER_PORT,
  DESKTOP_UI_DESIGNER_QUERY_PORT,
} from "../abstraction/tokens/desktop-ui-designer.tokens";
import { DesktopUiDesignerService } from "../implementation/services/desktop-ui-designer-service";

export const DESKTOP_UI_DESIGNER_SERVICE_TOKEN =
  createServiceToken<DesktopUiDesignerPort>("desktop.ui-designer.service");

export class DesktopUiDesignerModule extends DependencyModuleBase {
  static moduleId = "desktop.ui-designer";
  static dependencies = [DesktopWorkspaceModule, DesktopLogsModule] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_UI_DESIGNER_SERVICE_TOKEN, {
      useFactory: (services) => new DesktopUiDesignerService(
        services.resolve(DESKTOP_WORKSPACE_QUERY_PORT),
        services.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
          source: "desktop",
          module: "desktop.ui-designer",
        }),
      ),
      source: context.module.moduleId,
    });

    context.addAlias(DESKTOP_UI_DESIGNER_PORT, DESKTOP_UI_DESIGNER_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_UI_DESIGNER_QUERY_PORT, DESKTOP_UI_DESIGNER_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_UI_DESIGNER_COMMAND_PORT, DESKTOP_UI_DESIGNER_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
  }

  override async onStart(context: DependencyModuleRuntimeContext): Promise<void> {
    const logger = context.container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
      source: "desktop",
      module: "desktop.ui-designer",
    });
    await logger.info("Desktop UI designer module started");
  }
}
