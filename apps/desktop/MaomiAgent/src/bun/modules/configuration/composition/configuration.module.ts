import {
  DependencyModuleBase,
  type DependencyModuleContext,
} from "../../../shared/ioc";

import { DESKTOP_RUNTIME_CONTEXT } from "../../foundation";
import { DESKTOP_CONFIGURATION_PORT } from "../abstraction/tokens";
import { DesktopConfigurationService } from "../implementation/services/desktop-configuration-service";

export class DesktopConfigurationModule extends DependencyModuleBase {
  static moduleId = "desktop.configuration";

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_CONFIGURATION_PORT, {
      useFactory: (services) => new DesktopConfigurationService(
        services.resolve(DESKTOP_RUNTIME_CONTEXT),
      ),
      source: context.module.moduleId,
    });
  }
}