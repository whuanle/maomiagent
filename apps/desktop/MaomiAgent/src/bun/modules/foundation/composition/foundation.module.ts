import {
  DependencyModuleBase,
  type DependencyModuleContext,
} from "../../../shared/ioc";

import { DESKTOP_RUNTIME_CONTEXT } from "../abstraction/tokens";
import type { DesktopAppInfo } from "../abstraction/models/desktop-app-info";
import {
  DESKTOP_APP_INFO,
  DESKTOP_STARTUP_TRACE,
} from "../abstraction/tokens";

export class DesktopFoundationModule extends DependencyModuleBase {
  static moduleId = "desktop.foundation";

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_STARTUP_TRACE, {
      useValue: [],
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_APP_INFO, {
      useFactory: (services) => {
        const runtimeContext = services.resolve(DESKTOP_RUNTIME_CONTEXT);
        return {
          appIdentifier: runtimeContext.appIdentifier,
          appName: runtimeContext.appName,
          channel: runtimeContext.channel,
          mainViewUrl: runtimeContext.mainViewUrl,
          windowTitle: runtimeContext.window.title,
        } satisfies DesktopAppInfo;
      },
      source: context.module.moduleId,
    });
  }
}