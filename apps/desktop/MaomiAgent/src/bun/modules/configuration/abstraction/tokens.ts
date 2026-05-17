import { createServiceToken } from "../../../shared/ioc";

import type { DesktopConfigurationPort } from "./ports/desktop-configuration.port";

export const DESKTOP_CONFIGURATION_PORT =
  createServiceToken<DesktopConfigurationPort>("desktop.configuration.port");