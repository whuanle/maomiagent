export type {
  DesktopBrowserWindow,
  DesktopWindowFrame,
  DesktopWindowOptions,
} from "./abstraction/models/desktop-window";
export type { DesktopMainWindowServicePort } from "./abstraction/ports/desktop-main-window-service.port";
export { DESKTOP_MAIN_WINDOW_SERVICE } from "./abstraction/tokens";
export { DesktopWindowModule } from "./composition/window.module";
export { DesktopMainWindowService } from "./implementation/services/desktop-main-window-service";