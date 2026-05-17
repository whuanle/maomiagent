export type {
  DesktopDatabaseConnection,
  DesktopDatabaseConnectionName,
  DesktopDatabaseConnectionOptions,
  DesktopDatabaseEntityDefinition,
  DesktopDatabaseRunResult,
  DesktopDatabaseSnapshot,
} from "./abstraction/models/desktop-database.models";
export type { DesktopDatabasePort } from "./abstraction/ports/desktop-database.port";
export { DESKTOP_DATABASE_PORT } from "./abstraction/tokens";
export { DesktopDatabaseModule } from "./composition/database.module";
export { DesktopDatabaseService } from "./implementation/services/desktop-database-service";