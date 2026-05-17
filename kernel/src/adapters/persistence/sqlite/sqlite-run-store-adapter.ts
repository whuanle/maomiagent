import type { Database } from "bun:sqlite"
import {
  asRunId,
  asSessionId,
  asTurnId,
  type RunRecord,
  type RunStatus,
  type RunStorePort,
  type RunTriggerKind,
} from "../../../core"
import { parseKernelMetadataJson, serializeKernelMetadataJson } from "./metadata-json"
import { applySqliteKernelSchema } from "./schema"

type SqliteRunRow = {
  run_id: string
  session_id: string
  status: RunStatus
  trigger_kind: RunTriggerKind
  trigger_ref_id: string | null
  started_at: number
  updated_at: number
  completed_at: number | null
  current_turn_id: string | null
  metadata_json: string | null
}

function mapRunRow(row: SqliteRunRow): RunRecord {
  return {
    id: asRunId(row.run_id),
    sessionId: asSessionId(row.session_id),
    status: row.status,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    currentTurnId: row.current_turn_id ? asTurnId(row.current_turn_id) : undefined,
    trigger: {
      kind: row.trigger_kind,
      refId: row.trigger_ref_id ?? undefined,
    },
    metadata: parseKernelMetadataJson(row.metadata_json, row.run_id),
  }
}

export class SqliteRunStoreAdapter implements RunStorePort {
  constructor(private readonly db: Database) {
    applySqliteKernelSchema(db)
  }

  async get(id: RunRecord["id"]): Promise<RunRecord> {
    const row = this.db.query(
      `
        SELECT
          run_id,
          session_id,
          status,
          trigger_kind,
          trigger_ref_id,
          started_at,
          updated_at,
          completed_at,
          current_turn_id,
          metadata_json
        FROM kernel_runs
        WHERE run_id = ?
        LIMIT 1
      `,
    ).get(id) as SqliteRunRow | null

    if (!row) {
      throw new Error(`Kernel run not found: ${id}`)
    }

    return mapRunRow(row)
  }

  async save(run: RunRecord): Promise<void> {
    this.db.query(
      `
        INSERT INTO kernel_runs (
          run_id,
          session_id,
          status,
          trigger_kind,
          trigger_ref_id,
          started_at,
          updated_at,
          completed_at,
          current_turn_id,
          metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET
          session_id = excluded.session_id,
          status = excluded.status,
          trigger_kind = excluded.trigger_kind,
          trigger_ref_id = excluded.trigger_ref_id,
          started_at = excluded.started_at,
          updated_at = excluded.updated_at,
          completed_at = excluded.completed_at,
          current_turn_id = excluded.current_turn_id,
          metadata_json = excluded.metadata_json
      `,
    ).run(
      run.id,
      run.sessionId,
      run.status,
      run.trigger.kind,
      run.trigger.refId ?? null,
      run.startedAt,
      run.updatedAt,
      run.completedAt ?? null,
      run.currentTurnId ?? null,
      serializeKernelMetadataJson(run.metadata),
    )
  }

  async listBySession(sessionId: RunRecord["sessionId"]): Promise<readonly RunRecord[]> {
    const rows = this.db.query(
      `
        SELECT
          run_id,
          session_id,
          status,
          trigger_kind,
          trigger_ref_id,
          started_at,
          updated_at,
          completed_at,
          current_turn_id,
          metadata_json
        FROM kernel_runs
        WHERE session_id = ?
        ORDER BY started_at DESC, run_id ASC
      `,
    ).all(sessionId) as SqliteRunRow[]

    return rows.map(mapRunRow)
  }
}
