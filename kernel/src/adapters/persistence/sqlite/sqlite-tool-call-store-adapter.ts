import type { Database } from "bun:sqlite"
import {
  asInteractionId,
  asMessageId,
  asRunId,
  asSessionId,
  asToolCallId,
  asTurnId,
  type ToolCallRecord,
  type ToolCallStatus,
  type ToolCallStorePort,
} from "../../../core"
import { parseOptionalJsonValue, parseRequiredJsonValue, serializeOptionalJsonValue, serializeRequiredJsonValue } from "./json-value"
import { parseKernelErrorValue, serializeKernelErrorValue } from "./kernel-error-json"
import { parseKernelMetadataJson, serializeKernelMetadataJson } from "./metadata-json"
import { applySqliteKernelSchema } from "./schema"

type SqliteToolCallRow = {
  tool_call_id: string
  session_id: string
  run_id: string
  turn_id: string
  message_id: string
  tool_name: string
  status: ToolCallStatus
  input_json: string
  output_json: string | null
  error_json: string | null
  interaction_id: string | null
  started_at: number
  updated_at: number
  completed_at: number | null
  metadata_json: string | null
}

function mapToolCallRow(row: SqliteToolCallRow): ToolCallRecord {
  return {
    id: asToolCallId(row.tool_call_id),
    sessionId: asSessionId(row.session_id),
    runId: asRunId(row.run_id),
    turnId: asTurnId(row.turn_id),
    messageId: asMessageId(row.message_id),
    toolName: row.tool_name,
    input: parseRequiredJsonValue(row.input_json, `${row.tool_call_id}.input`),
    status: row.status,
    output: parseOptionalJsonValue(row.output_json, `${row.tool_call_id}.output`),
    error: row.error_json ? parseKernelErrorValue(parseRequiredJsonValue(row.error_json, `${row.tool_call_id}.error`), `${row.tool_call_id}.error`) : undefined,
    interactionId: row.interaction_id ? asInteractionId(row.interaction_id) : undefined,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    metadata: parseKernelMetadataJson(row.metadata_json, row.tool_call_id),
  }
}

export class SqliteToolCallStoreAdapter implements ToolCallStorePort {
  constructor(private readonly db: Database) {
    applySqliteKernelSchema(db)
  }

  async save(call: ToolCallRecord): Promise<void> {
    this.db.query(
      `
        INSERT INTO kernel_tool_calls (
          tool_call_id,
          session_id,
          run_id,
          turn_id,
          message_id,
          tool_name,
          status,
          input_json,
          output_json,
          error_json,
          interaction_id,
          started_at,
          updated_at,
          completed_at,
          metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      call.id,
      call.sessionId,
      call.runId,
      call.turnId,
      call.messageId,
      call.toolName,
      call.status,
      serializeRequiredJsonValue(call.input, `${call.id}.input`),
      serializeOptionalJsonValue(call.output, `${call.id}.output`),
      call.error ? serializeKernelErrorValue(call.error, `${call.id}.error`) : null,
      call.interactionId ?? null,
      call.startedAt,
      call.updatedAt,
      call.completedAt ?? null,
      serializeKernelMetadataJson(call.metadata),
    )
  }

  async patch(call: ToolCallRecord): Promise<void> {
    const result = this.db.query(
      `
        UPDATE kernel_tool_calls
        SET
          session_id = ?,
          run_id = ?,
          turn_id = ?,
          message_id = ?,
          tool_name = ?,
          status = ?,
          input_json = ?,
          output_json = ?,
          error_json = ?,
          interaction_id = ?,
          started_at = ?,
          updated_at = ?,
          completed_at = ?,
          metadata_json = ?
        WHERE tool_call_id = ?
      `,
    ).run(
      call.sessionId,
      call.runId,
      call.turnId,
      call.messageId,
      call.toolName,
      call.status,
      serializeRequiredJsonValue(call.input, `${call.id}.input`),
      serializeOptionalJsonValue(call.output, `${call.id}.output`),
      call.error ? serializeKernelErrorValue(call.error, `${call.id}.error`) : null,
      call.interactionId ?? null,
      call.startedAt,
      call.updatedAt,
      call.completedAt ?? null,
      serializeKernelMetadataJson(call.metadata),
      call.id,
    ) as { changes?: number }

    if ((result.changes ?? 0) === 0) {
      throw new Error(`Kernel tool call not found: ${call.id}`)
    }
  }

  async listByRun(runId: ToolCallRecord["runId"]): Promise<readonly ToolCallRecord[]> {
    const rows = this.db.query(
      `
        SELECT
          tool_call_id,
          session_id,
          run_id,
          turn_id,
          message_id,
          tool_name,
          status,
          input_json,
          output_json,
          error_json,
          interaction_id,
          started_at,
          updated_at,
          completed_at,
          metadata_json
        FROM kernel_tool_calls
        WHERE run_id = ?
        ORDER BY started_at ASC, tool_call_id ASC
      `,
    ).all(runId) as SqliteToolCallRow[]

    return rows.map(mapToolCallRow)
  }

  async listByTurn(turnId: ToolCallRecord["turnId"]): Promise<readonly ToolCallRecord[]> {
    const rows = this.db.query(
      `
        SELECT
          tool_call_id,
          session_id,
          run_id,
          turn_id,
          message_id,
          tool_name,
          status,
          input_json,
          output_json,
          error_json,
          interaction_id,
          started_at,
          updated_at,
          completed_at,
          metadata_json
        FROM kernel_tool_calls
        WHERE turn_id = ?
        ORDER BY started_at ASC, tool_call_id ASC
      `,
    ).all(turnId) as SqliteToolCallRow[]

    return rows.map(mapToolCallRow)
  }
}
