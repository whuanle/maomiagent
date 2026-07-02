import type { DesktopDatabaseConnection } from "../../../database";
import type { DesktopConversationSessionItem } from "../../abstraction/models/desktop-conversation.models";

type ConversationSessionRow = {
  session_id: string;
  workspace_id: string;
  title: string;
  status: DesktopConversationSessionItem["status"];
  parent_session_id: string | null;
  archived_at: string | null;
  last_run_id: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
};

const CONVERSATION_SESSIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS desktop_conversation_sessions (
  session_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  parent_session_id TEXT,
  archived_at TEXT,
  last_run_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const CONVERSATION_SESSIONS_WORKSPACE_UPDATED_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_desktop_conversation_sessions_workspace_updated
ON desktop_conversation_sessions(workspace_id, updated_at DESC);
`;

const CONVERSATION_SESSIONS_STATUS_UPDATED_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_desktop_conversation_sessions_status_updated
ON desktop_conversation_sessions(status, updated_at DESC);
`;

function parseJson<TValue>(value: string | null | undefined, fallback: TValue): TValue {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as TValue;
  } catch {
    return fallback;
  }
}

function mapConversationSessionRow(row: ConversationSessionRow): DesktopConversationSessionItem {
  return {
    sessionId: row.session_id,
    workspaceId: row.workspace_id,
    title: row.title,
    status: row.status,
    parentSessionId: row.parent_session_id ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    lastRunId: row.last_run_id ?? undefined,
    metadata: parseJson<Record<string, unknown> | undefined>(row.metadata_json, undefined),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class DesktopConversationStore {
  constructor(private readonly connection: DesktopDatabaseConnection) {
    this.connection.execute(CONVERSATION_SESSIONS_TABLE_SQL);
    this.connection.execute(CONVERSATION_SESSIONS_WORKSPACE_UPDATED_INDEX_SQL);
    this.connection.execute(CONVERSATION_SESSIONS_STATUS_UPDATED_INDEX_SQL);
  }

  listSessions(): DesktopConversationSessionItem[] {
    return this.connection
      .all<ConversationSessionRow>(
        "SELECT * FROM desktop_conversation_sessions ORDER BY created_at DESC, session_id ASC",
      )
      .map(mapConversationSessionRow);
  }

  getSession(sessionId: string): DesktopConversationSessionItem | null {
    const row = this.connection.get<ConversationSessionRow>(
      "SELECT * FROM desktop_conversation_sessions WHERE session_id = ?",
      sessionId,
    );
    return row ? mapConversationSessionRow(row) : null;
  }

  upsertSession(item: DesktopConversationSessionItem): void {
    this.connection.run(
      `INSERT INTO desktop_conversation_sessions (
        session_id, workspace_id, title, status, parent_session_id, archived_at, last_run_id, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        title = excluded.title,
        status = excluded.status,
        parent_session_id = excluded.parent_session_id,
        archived_at = excluded.archived_at,
        last_run_id = excluded.last_run_id,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at`,
      item.sessionId,
      item.workspaceId,
      item.title,
      item.status,
      item.parentSessionId ?? null,
      item.archivedAt ?? null,
      item.lastRunId ?? null,
      item.metadata ? JSON.stringify(item.metadata) : null,
      item.createdAt,
      item.updatedAt,
    );
  }
}