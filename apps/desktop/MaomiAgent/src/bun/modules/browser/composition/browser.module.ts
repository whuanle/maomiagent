import {
  DependencyModuleBase,
  createServiceToken,
  type DependencyModuleContext,
  type DependencyModuleRuntimeContext,
} from "../../../shared/ioc";

import { RUNTIME_LOGGER_FACTORY_PORT, DesktopLogsModule } from "../../logs";
import type { DesktopBrowserServicePort } from "../abstraction/ports/desktop-browser-service.port";
import {
  DESKTOP_BROWSER_COMMAND_PORT,
  DESKTOP_BROWSER_PORT,
  DESKTOP_BROWSER_QUERY_PORT,
} from "../abstraction/tokens/desktop-browser.tokens";
import { DesktopBrowserService } from "../implementation/services/desktop-browser-service";

export const DESKTOP_BROWSER_SERVICE_TOKEN =
  createServiceToken<DesktopBrowserServicePort>("desktop.browser.service");

export class DesktopBrowserModule extends DependencyModuleBase {
  static moduleId = "desktop.browser";
  static dependencies = [DesktopLogsModule] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_BROWSER_SERVICE_TOKEN, {
      useFactory: () => new DesktopBrowserService(),
      source: context.module.moduleId,
    });

    context.addAlias(DESKTOP_BROWSER_PORT, DESKTOP_BROWSER_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_BROWSER_QUERY_PORT, DESKTOP_BROWSER_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_BROWSER_COMMAND_PORT, DESKTOP_BROWSER_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
  }

  override async onStart(context: DependencyModuleRuntimeContext): Promise<void> {
    const logger = context.container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
      source: "desktop",
      module: "desktop.browser",
    });
    const browser = context.container.resolve(DESKTOP_BROWSER_PORT);
    const snapshot = await browser.getSnapshot();

    await logger.info("Desktop browser module started", {
      context: {
        tabCount: snapshot.tabs.length,
        activeTabId: snapshot.activeTabId,
      },
    });
  }
}
