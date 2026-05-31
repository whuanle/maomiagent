import { createServiceNamespace } from "../../../../shared/ioc";

import type { DesktopBrowserServicePort } from "../ports/desktop-browser-service.port";

const desktopBrowser = createServiceNamespace("desktop.browser");

export const DESKTOP_BROWSER_PORT =
  desktopBrowser.token<DesktopBrowserServicePort>("browser");
export const DESKTOP_BROWSER_QUERY_PORT =
  desktopBrowser.token<DesktopBrowserServicePort>("browser-query");
export const DESKTOP_BROWSER_COMMAND_PORT =
  desktopBrowser.token<DesktopBrowserServicePort>("browser-command");
