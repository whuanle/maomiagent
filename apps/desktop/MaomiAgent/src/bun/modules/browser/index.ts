export type { DesktopBrowserServicePort } from "./abstraction/ports/desktop-browser-service.port";

export {
  DESKTOP_BROWSER_COMMAND_PORT,
  DESKTOP_BROWSER_PORT,
  DESKTOP_BROWSER_QUERY_PORT,
} from "./abstraction/tokens/desktop-browser.tokens";

export {
  DesktopBrowserModule,
  DESKTOP_BROWSER_SERVICE_TOKEN,
} from "./composition/browser.module";

export { DesktopBrowserService } from "./implementation/services/desktop-browser-service";
