import type {
  DesktopDatabaseConnection,
  DesktopDatabaseConnectionName,
  DesktopDatabaseEntityDefinition,
  DesktopDatabaseSnapshot,
} from "../models/desktop-database.models";

export type DesktopDatabasePort = {
  getConnection(name?: DesktopDatabaseConnectionName): DesktopDatabaseConnection;
  registerEntity(entity: DesktopDatabaseEntityDefinition): void;
  listEntities(): DesktopDatabaseEntityDefinition[];
  snapshot(): DesktopDatabaseSnapshot;
  dispose(): void;
};