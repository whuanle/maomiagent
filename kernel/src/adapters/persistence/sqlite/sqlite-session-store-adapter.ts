import type { Database } from "bun:sqlite"
import {
  asSessionId,
  type SessionRecord,
  type SessionStatus,
  type SessionStorePort,
} from "../../../core"
import { parseKernelMetadataJson, serializeKernelMetadataJson } from "./metadata-json"
import { applySqliteKernelSchema } from "./schema"

type SqliteSessionRow = {
  session_id: string
  title: string
  parent_session_id: string | null
  status: SessionStatus
  created_at: number
  updated_at: number
  archived_at: number | null
  metadata_json: string | null
}

function mapSessionRow(row: SqliteSessionRow): SessionRecord {
  return {
    id: asSessionId(row.session_id),
    title: row.title,
    parentSessionId: row.parent_session_id ? asSessionId(row.parent_session_id) : undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? undefined,
    metadata: parseKernelMetadataJson(row.metadata_json, row.session_id),
  }
}

export class SqliteSessionStoreAdapter implements SessionStorePort {
  constructor(private readonly db: Database) {
    applySqliteKernelSchema(db)
  }

  async get(id: SessionRecord["id"]): Promise<SessionRecord> {
    const row = this.db.query(
      `
        SELECT
          session_id,
          title,
          parent_session_id,
          status,
          created_at,
          updated_at,
          archived_at,
          metadata_json
        FROM kernel_sessions
        WHERE session_id = ?
        LIMIT 1
      `,
    ).get(id) as SqliteSessionRow | null

    if (!row) {
      throw new Error(`Kernel session not found: ${id}`)
    }

    return mapSessionRow(row)
  }

  async save(session: SessionRecord): Promise<void> {
    this.db.query(
      `
        INSERT INTO kernel_sessions (
          session_id,
          title,
          parent_session_id,
          status,
          created_at,
          updated_at,
          archived_at,
          metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          title = excluded.title,
          parent_session_id = excluded.parent_session_id,
          status = excluded.status,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          archived_at = excluded.archived_at,
          metadata_json = excluded.metadata_json
      `,
    ).run(
      session.id,
      session.title,
      session.parentSessionId ?? null,
      session.status,
      session.createdAt,
      session.updatedAt,
      session.archivedAt ?? null,
      serializeKernelMetadataJson(session.metadata),
    )
  }
}
