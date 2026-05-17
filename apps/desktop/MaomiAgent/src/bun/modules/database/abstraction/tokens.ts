import { createServiceToken } from "../../../shared/ioc";

import type { DesktopDatabasePort } from "./ports/desktop-database.port";

export const DESKTOP_DATABASE_PORT =
  createServiceToken<DesktopDatabasePort>("desktop.database.port");