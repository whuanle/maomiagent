import { createServiceNamespace } from "../../../shared/ioc";

import type { DesktopMainWindowServicePort } from "./ports/desktop-main-window-service.port";

const desktopWindowNamespace = createServiceNamespace("desktop.window");

export const DESKTOP_MAIN_WINDOW_SERVICE =
  desktopWindowNamespace.token<DesktopMainWindowServicePort>("main-window-service");