import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import { DesktopConversationStore } from "../index";
import type { DesktopDatabaseConnection } from "../../database";

function createInMemoryConnection(): {
  connection: DesktopDatabaseConnection;
  close(): void;
} {
  const db = new Database(":memory:");

  const connection: DesktopDatabaseConnection = {
    name: "conversation",
    path: ":memory:",
    execute(sql) {
      db.exec(sql);
    },
    run(sql, ...bindings) {
      return db.query(sql).run(...bindings as never[]);
    },
    all<TRow extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      ...bindings: unknown[]
    ) {
      return db.query(sql).all(...bindings as never[]) as TRow[];
    },
    get<TRow extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      ...bindings: unknown[]
    ) {
      return db.query(sql).get(...bindings as never[]) as TRow | null;
    },
    transaction<TResult>(callback: (connection: DesktopDatabaseConnection) => TResult): TResult {
      return db.transaction(() => callback(connection))();
    },
  };

  return {
    connection,
    close() {
      db.close(false);
    },
  };
}

describe("DesktopConversationStore", () => {
  test("persists and loads desktop conversation sessions", () => {
    const fixture = createInMemoryConnection();
    const store = new DesktopConversationStore(fixture.connection);

    try {
      store.upsertSession({
        sessionId: "session-1",
        workspaceId: "workspace-1",
        title: "First conversation",
        status: "idle",
        metadata: {
          source: "test",
        },
        createdAt: "2026-05-02T08:00:00.000Z",
        updatedAt: "2026-05-02T08:00:00.000Z",
      });

      expect(store.getSession("session-1")).toMatchObject({
        sessionId: "session-1",
        workspaceId: "workspace-1",
        title: "First conversation",
        status: "idle",
        metadata: {
          source: "test",
        },
      });
      expect(store.listSessions()).toHaveLength(1);
    } finally {
      fixture.close();
    }
  });
});