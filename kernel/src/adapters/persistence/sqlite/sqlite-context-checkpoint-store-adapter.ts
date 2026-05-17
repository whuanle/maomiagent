import type { Database } from "bun:sqlite"
import {
  asContextCheckpointId,
  asMessageId,
  asSessionId,
  type ContextCheckpointRecord,
  type ContextCheckpointStorePort,
} from "../../../core"
import { parseKernelMetadataJson, serializeKernelMetadataJson } from "./metadata-json"
import { applySqliteKernelSchema } from "./schema"

type SqliteContextCheckpointRow = {
  checkpoint_id: string
  session_id: string
  checkpoint_kind: ContextCheckpointRecord["kind"]
  replaces_through_message_id: string
  summary_message_id: string
  created_at: number
  metadata_json: string | null
}

function mapContextCheckpointRow(row: SqliteContextCheckpointRow): ContextCheckpointRecord {
  return {
    id: asContextCheckpointId(row.checkpoint_id),
    sessionId: asSessionId(row.session_id),
    kind: row.checkpoint_kind,
    replacesThroughMessageId: asMessageId(row.replaces_through_message_id),
    summaryMessageId: asMessageId(row.summary_message_id),
    createdAt: row.created_at,
    metadata: parseKernelMetadataJson(row.metadata_json, row.checkpoint_id),
  }
}

export class SqliteContextCheckpointStoreAdapter implements ContextCheckpointStorePort {
  constructor(private readonly db: Database) {
    applySqliteKernelSchema(db)
  }

  async save(checkpoint: ContextCheckpointRecord): Promise<void> {
    this.db.query(
      `
        INSERT INTO kernel_context_checkpoints (
          checkpoint_id,
          session_id,
          checkpoint_kind,
          replaces_through_message_id,
          summary_message_id,
          created_at,
          metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(checkpoint_id) DO UPDATE SET
          session_id = excluded.session_id,
          checkpoint_kind = excluded.checkpoint_kind,
          replaces_through_message_id = excluded.replaces_through_message_id,
          summary_message_id = excluded.summary_message_id,
          created_at = excluded.created_at,
          metadata_json = excluded.metadata_json
      `,
    ).run(
      checkpoint.id,
      checkpoint.sessionId,
      checkpoint.kind,
      checkpoint.replacesThroughMessageId,
      checkpoint.summaryMessageId,
      checkpoint.createdAt,
      serializeKernelMetadataJson(checkpoint.metadata),
    )
  }

  async listBySession(
    sessionId: ContextCheckpointRecord["sessionId"],
  ): Promise<readonly ContextCheckpointRecord[]> {
    const rows = this.db.query(
      `
        SELECT
          checkpoint_id,
          session_id,
          checkpoint_kind,
          replaces_through_message_id,
          summary_message_id,
          created_at,
          metadata_json
        FROM kernel_context_checkpoints
        WHERE session_id = ?
        ORDER BY created_at DESC, checkpoint_id ASC
      `,
    ).all(sessionId) as SqliteContextCheckpointRow[]

    return rows.map(mapContextCheckpointRow)
  }
}
