import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { SQLQueryBindings } from "bun:sqlite";

import type { DesktopConfigurationPort } from "../../../configuration";
import type {
  DesktopDatabaseConnection,
  DesktopDatabaseConnectionName,
  DesktopDatabaseConnectionOptions,
  DesktopDatabaseEntityDefinition,
  DesktopDatabaseRunResult,
  DesktopDatabaseSnapshot,
} from "../../abstraction/models/desktop-database.models";
import type { DesktopDatabasePort } from "../../abstraction/ports/desktop-database.port";

type SqliteRunResult = {
  changes: number;
  lastInsertRowid: number | bigint;
};

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeBindings(bindings: unknown[]): SQLQueryBindings[] {
  return bindings as SQLQueryBindings[];
}

function normalizeConnectionOptions(
  configuration: DesktopConfigurationPort,
): DesktopDatabaseConnectionOptions[] {
  const configuredConnections = configuration.getRecord("database.connections") ?? {};
  const connections = Object.entries(configuredConnections)
    .flatMap(([name, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return [];
      }

      const path = trimText((value as { path?: string }).path);
      if (!path) {
        return [];
      }

      const pragmasValue = (value as { pragmas?: unknown }).pragmas;
      const pragmas = Array.isArray(pragmasValue)
        ? pragmasValue.filter((item): item is string => typeof item === "string")
        : undefined;

      return [{
        name,
        path,
        pragmas,
      }];
    });

  if (connections.length > 0) {
    return connections;
  }

  return [{
    name: "runtimeLogs",
    path: configuration.requireString("database.connections.runtimeLogs.path"),
    pragmas: ["PRAGMA journal_mode = WAL;"],
  }];
}

class BunSqliteDesktopConnection implements DesktopDatabaseConnection {
  private readonly db: Database;
  private closed = false;

  constructor(readonly name: DesktopDatabaseConnectionName, readonly path: string, pragmas: string[]) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }

    this.db = new Database(path);
    pragmas.forEach((pragma) => {
      const trimmed = trimText(pragma);
      if (trimmed) {
        this.db.exec(trimmed);
      }
    });
  }

  execute(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, ...bindings: unknown[]): DesktopDatabaseRunResult {
    return this.db.query(sql).run(...normalizeBindings(bindings)) as SqliteRunResult;
  }

  all<TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    ...bindings: unknown[]
  ): TRow[] {
    return this.db.query(sql).all(...normalizeBindings(bindings)) as TRow[];
  }

  get<TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    ...bindings: unknown[]
  ): TRow | null {
    return this.db.query(sql).get(...normalizeBindings(bindings)) as TRow | null;
  }

  transaction<TResult>(callback: (connection: DesktopDatabaseConnection) => TResult): TResult {
    return this.db.transaction(() => callback(this))();
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    const database = this.db as Database & {
      close?: () => void;
    };
    database.close?.();
  }
}

export class DesktopDatabaseService implements DesktopDatabasePort {
  private readonly connectionOptions: DesktopDatabaseConnectionOptions[];
  private readonly connections = new Map<DesktopDatabaseConnectionName, BunSqliteDesktopConnection>();
  private readonly entities = new Map<string, DesktopDatabaseEntityDefinition>();

  constructor(configuration: DesktopConfigurationPort) {
    this.connectionOptions = normalizeConnectionOptions(configuration);
  }

  getConnection(name: DesktopDatabaseConnectionName = "runtimeLogs"): DesktopDatabaseConnection {
    const existing = this.connections.get(name);
    if (existing) {
      return existing;
    }

    const options = this.connectionOptions.find((item) => item.name === name);
    if (!options) {
      throw new Error(`Desktop database connection is not configured: ${name}`);
    }

    const connection = new BunSqliteDesktopConnection(
      options.name,
      options.path,
      options.pragmas ?? [],
    );
    this.connections.set(name, connection);
    return connection;
  }

  registerEntity(entity: DesktopDatabaseEntityDefinition): void {
    this.entities.set(entity.name, { ...entity });
  }

  listEntities(): DesktopDatabaseEntityDefinition[] {
    return Array.from(this.entities.values()).map((entity) => ({ ...entity }));
  }

  snapshot(): DesktopDatabaseSnapshot {
    return {
      connections: this.connectionOptions.map((item) => ({ ...item, pragmas: [...(item.pragmas ?? [])] })),
      entities: this.listEntities(),
    };
  }

  dispose(): void {
    for (const connection of this.connections.values()) {
      connection.close();
    }
    this.connections.clear();
  }
}