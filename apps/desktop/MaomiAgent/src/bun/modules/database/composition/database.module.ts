import {
  DependencyModuleBase,
  type DependencyModuleContext,
  type DependencyModuleRuntimeContext,
} from "../../../shared/ioc";

import { DESKTOP_CONFIGURATION_PORT, DesktopConfigurationModule } from "../../configuration";
import { DESKTOP_DATABASE_PORT } from "../abstraction/tokens";
import { DesktopDatabaseService } from "../implementation/services/desktop-database-service";

export class DesktopDatabaseModule extends DependencyModuleBase {
  static moduleId = "desktop.database";
  static dependencies = [DesktopConfigurationModule] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_DATABASE_PORT, {
      useFactory: (services) => new DesktopDatabaseService(
        services.resolve(DESKTOP_CONFIGURATION_PORT),
      ),
      source: context.module.moduleId,
    });
  }

  override async onStop(context: DependencyModuleRuntimeContext): Promise<void> {
    context.container.resolve(DESKTOP_DATABASE_PORT).dispose();
  }
}