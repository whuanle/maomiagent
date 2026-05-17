import {
  DependencyModuleBase,
  createServiceToken,
  type DependencyModuleContext,
  type DependencyModuleRuntimeContext,
} from "../../../shared/ioc";

import {
  DESKTOP_CONFIGURATION_PORT,
  DesktopConfigurationModule,
} from "../../configuration";
import { RUNTIME_LOGGER_FACTORY_PORT, DesktopLogsModule } from "../../logs";
import type { DesktopModelsPort } from "../abstraction/ports/desktop-models.ports";
import {
  DESKTOP_MODELS_COMMAND_PORT,
  DESKTOP_MODELS_PORT,
  DESKTOP_MODELS_QUERY_PORT,
} from "../abstraction/tokens/desktop-models.tokens";
import { DesktopModelsService } from "../implementation/services/desktop-models-service";

export const DESKTOP_MODELS_SERVICE_TOKEN =
  createServiceToken<DesktopModelsPort>("desktop.models.service");

export class DesktopModelsModule extends DependencyModuleBase {
  static moduleId = "desktop.models";
  static dependencies = [DesktopConfigurationModule, DesktopLogsModule] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_MODELS_SERVICE_TOKEN, {
      useFactory: (services) => new DesktopModelsService(
        services.resolve(DESKTOP_CONFIGURATION_PORT),
        services.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
          source: "desktop",
          module: "desktop.models",
        }),
      ),
      source: context.module.moduleId,
    });

    context.addAlias(DESKTOP_MODELS_PORT, DESKTOP_MODELS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_MODELS_QUERY_PORT, DESKTOP_MODELS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_MODELS_COMMAND_PORT, DESKTOP_MODELS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
  }

  override async onStart(context: DependencyModuleRuntimeContext): Promise<void> {
    const logger = context.container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
      source: "desktop",
      module: "desktop.models",
    });
    const models = context.container.resolve(DESKTOP_MODELS_PORT);
    const snapshot = await models.getSnapshot();
    await logger.info("Desktop models module started", {
      context: {
        providers: snapshot.providers.length,
        channels: snapshot.channels.length,
      },
    });
  }
}