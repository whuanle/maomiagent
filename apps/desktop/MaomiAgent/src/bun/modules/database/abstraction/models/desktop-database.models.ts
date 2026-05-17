export type DesktopDatabaseConnectionName = string;

export type DesktopDatabaseConnectionOptions = {
  name: DesktopDatabaseConnectionName;
  path: string;
  pragmas?: string[];
};

export type DesktopDatabaseEntityDefinition = {
  name: string;
  tableName: string;
  connectionName?: DesktopDatabaseConnectionName;
  primaryKey?: string;
  columns?: Record<string, string>;
};

export type DesktopDatabaseRunResult = {
  changes: number;
  lastInsertRowid: number | bigint;
};

export type DesktopDatabaseConnection = {
  readonly name: DesktopDatabaseConnectionName;
  readonly path: string;
  execute(sql: string): void;
  run(sql: string, ...bindings: unknown[]): DesktopDatabaseRunResult;
  all<TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    ...bindings: unknown[]
  ): TRow[];
  get<TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    ...bindings: unknown[]
  ): TRow | null;
  transaction<TResult>(callback: (connection: DesktopDatabaseConnection) => TResult): TResult;
};

export type DesktopDatabaseSnapshot = {
  connections: DesktopDatabaseConnectionOptions[];
  entities: DesktopDatabaseEntityDefinition[];
};