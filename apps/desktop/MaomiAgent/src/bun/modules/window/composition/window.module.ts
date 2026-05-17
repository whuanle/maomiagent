import {
  DependencyModuleBase,
  type DependencyModuleContext,
} from "../../../shared/ioc";

import { DESKTOP_STARTUP_TRACE } from "../../foundation/abstraction/tokens";
import { DesktopFoundationModule } from "../../foundation/composition/foundation.module";
import { DESKTOP_RUNTIME_CONTEXT } from "../../foundation";
import { RUNTIME_LOGGER_FACTORY_PORT } from "../../logs/abstraction/tokens/runtime-logs.tokens";
import { DesktopObservabilityModule } from "../../observability/composition/observability.module";
import { DESKTOP_TRACE_PORT } from "../../observability/abstraction/tokens";
import { DESKTOP_MAIN_WINDOW_SERVICE } from "../abstraction/tokens";
import { DesktopMainWindowService } from "../implementation/services/desktop-main-window-service";

export class DesktopWindowModule extends DependencyModuleBase {
  static moduleId = "desktop.window";
  static dependencies = [DesktopFoundationModule, DesktopObservabilityModule] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_MAIN_WINDOW_SERVICE, {
      useFactory: (services) => {
        return new DesktopMainWindowService(
          services.resolve(DESKTOP_RUNTIME_CONTEXT),
          services.resolve(DESKTOP_STARTUP_TRACE),
          services.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
            source: "desktop",
            module: "desktop.window",
          }),
          services.resolve(DESKTOP_TRACE_PORT),
        );
      },
      source: context.module.moduleId,
    });
  }
}