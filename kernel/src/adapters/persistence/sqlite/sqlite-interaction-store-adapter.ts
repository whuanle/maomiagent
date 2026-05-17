import type { Database } from "bun:sqlite"
import {
  asInteractionId,
  asRunId,
  asSessionId,
  asToolCallId,
  type InteractionKind,
  type InteractionRecord,
  type InteractionStatus,
  type InteractionStorePort,
} from "../../../core"
import {
  parseOptionalJsonValue,
  parseRequiredJsonValue,
  serializeOptionalJsonValue,
  serializeRequiredJsonValue,
} from "./json-value"
import { parseKernelMetadataJson, serializeKernelMetadataJson } from "./metadata-json"
import { applySqliteKernelSchema } from "./schema"

type SqliteInteractionRow = {
  interaction_id: string
  session_id: string
  run_id: string
  tool_call_id: string | null
  kind: InteractionKind
  status: InteractionStatus
  request_json: string
  response_json: string | null
  created_at: number
  updated_at: number
  metadata_json: string | null
}

function mapInteractionRow(row: SqliteInteractionRow): InteractionRecord {
  return {
    id: asInteractionId(row.interaction_id),
    sessionId: asSessionId(row.session_id),
    runId: asRunId(row.run_id),
    toolCallId: row.tool_call_id ? asToolCallId(row.tool_call_id) : undefined,
    kind: row.kind,
    status: row.status,
    request: parseRequiredJsonValue(row.request_json, row.interaction_id),
    response: parseOptionalJsonValue(row.response_json, row.interaction_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: parseKernelMetadataJson(row.metadata_json, row.interaction_id),
  }
}

export class SqliteInteractionStoreAdapter implements InteractionStorePort {
  constructor(private readonly db: Database) {
    applySqliteKernelSchema(db)
  }

  async save(interaction: InteractionRecord): Promise<void> {
    this.db.query(
      `
        INSERT INTO kernel_interactions (
          interaction_id,
          session_id,
          run_id,
          tool_call_id,
          kind,
          status,
          request_json,
          response_json,
          created_at,
          updated_at,
          metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(interaction_id) DO UPDATE SET
          session_id = excluded.session_id,
          run_id = excluded.run_id,
          tool_call_id = excluded.tool_call_id,
          kind = excluded.kind,
          status = excluded.status,
          request_json = excluded.request_json,
          response_json = excluded.response_json,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          metadata_json = excluded.metadata_json
      `,
    ).run(
      interaction.id,
      interaction.sessionId,
      interaction.runId,
      interaction.toolCallId ?? null,
      interaction.kind,
      interaction.status,
      serializeRequiredJsonValue(interaction.request, interaction.id),
      serializeOptionalJsonValue(interaction.response, interaction.id),
      interaction.createdAt,
      interaction.updatedAt,
      serializeKernelMetadataJson(interaction.metadata),
    )
  }

  async get(id: InteractionRecord["id"]): Promise<InteractionRecord> {
    const row = this.db.query(
      `
        SELECT
          interaction_id,
          session_id,
          run_id,
          tool_call_id,
          kind,
          status,
          request_json,
          response_json,
          created_at,
          updated_at,
          metadata_json
        FROM kernel_interactions
        WHERE interaction_id = ?
        LIMIT 1
      `,
    ).get(id) as SqliteInteractionRow | null

    if (!row) {
      throw new Error(`Kernel interaction not found: ${id}`)
    }

    return mapInteractionRow(row)
  }

  async listByRun(runId: InteractionRecord["runId"]): Promise<readonly InteractionRecord[]> {
    const rows = this.db.query(
      `
        SELECT
          interaction_id,
          session_id,
          run_id,
          tool_call_id,
          kind,
          status,
          request_json,
          response_json,
          created_at,
          updated_at,
          metadata_json
        FROM kernel_interactions
        WHERE run_id = ?
        ORDER BY created_at ASC, interaction_id ASC
      `,
    ).all(runId) as SqliteInteractionRow[]

    return rows.map(mapInteractionRow)
  }

  async listPendingBySession(
    sessionId: InteractionRecord["sessionId"],
  ): Promise<readonly InteractionRecord[]> {
    const rows = this.db.query(
      `
        SELECT
          interaction_id,
          session_id,
          run_id,
          tool_call_id,
          kind,
          status,
          request_json,
          response_json,
          created_at,
          updated_at,
          metadata_json
        FROM kernel_interactions
        WHERE session_id = ?
          AND status = 'pending'
        ORDER BY updated_at DESC, interaction_id ASC
      `,
    ).all(sessionId) as SqliteInteractionRow[]

    return rows.map(mapInteractionRow)
  }

  async listPendingByRun(runId: InteractionRecord["runId"]): Promise<readonly InteractionRecord[]> {
    const rows = this.db.query(
      `
        SELECT
          interaction_id,
          session_id,
          run_id,
          tool_call_id,
          kind,
          status,
          request_json,
          response_json,
          created_at,
          updated_at,
          metadata_json
        FROM kernel_interactions
        WHERE run_id = ?
          AND status = 'pending'
        ORDER BY updated_at DESC, interaction_id ASC
      `,
    ).all(runId) as SqliteInteractionRow[]

    return rows.map(mapInteractionRow)
  }
}
