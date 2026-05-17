import type { Database } from "bun:sqlite"
import { asAiExecutionProfileId } from "../../../../ai/contracts"
import {
  asRunId,
  asSessionId,
  asTurnId,
  type FinishReason,
  type TokenUsage,
  type TurnRecord,
  type TurnStatus,
  type TurnStorePort,
} from "../../../core"
import { parseKernelMetadataJson, serializeKernelMetadataJson } from "./metadata-json"
import { applySqliteKernelSchema } from "./schema"

type SqliteTurnRow = {
  turn_id: string
  run_id: string
  session_id: string
  status: TurnStatus
  sequence: number
  agent_id: string
  execution_profile_id: string
  started_at: number
  finished_at: number | null
  finish_reason: FinishReason | null
  usage_input_tokens: number | null
  usage_output_tokens: number | null
  usage_reasoning_tokens: number | null
  usage_cached_input_tokens: number | null
  metadata_json: string | null
}

function mapTurnUsage(row: SqliteTurnRow): TokenUsage | undefined {
  const hasAnyUsage =
    row.usage_input_tokens !== null
    || row.usage_output_tokens !== null
    || row.usage_reasoning_tokens !== null
    || row.usage_cached_input_tokens !== null

  if (!hasAnyUsage) {
    return undefined
  }

  if (row.usage_input_tokens === null || row.usage_output_tokens === null) {
    throw new Error(`Kernel turn usage is incomplete: ${row.turn_id}`)
  }

  return {
    inputTokens: row.usage_input_tokens,
    outputTokens: row.usage_output_tokens,
    reasoningTokens: row.usage_reasoning_tokens ?? undefined,
    cachedInputTokens: row.usage_cached_input_tokens ?? undefined,
  }
}

function mapTurnRow(row: SqliteTurnRow): TurnRecord {
  return {
    id: asTurnId(row.turn_id),
    runId: asRunId(row.run_id),
    sessionId: asSessionId(row.session_id),
    status: row.status,
    sequence: row.sequence,
    agentId: row.agent_id,
    executionProfile: {
      id: asAiExecutionProfileId(row.execution_profile_id),
    },
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    finishReason: row.finish_reason ?? undefined,
    usage: mapTurnUsage(row),
    metadata: parseKernelMetadataJson(row.metadata_json, row.turn_id),
  }
}

export class SqliteTurnStoreAdapter implements TurnStorePort {
  constructor(private readonly db: Database) {
    applySqliteKernelSchema(db)
  }

  async save(turn: TurnRecord): Promise<void> {
    this.db.query(
      `
        INSERT INTO kernel_turns (
          turn_id,
          run_id,
          session_id,
          status,
          sequence,
          agent_id,
          execution_profile_id,
          started_at,
          finished_at,
          finish_reason,
          usage_input_tokens,
          usage_output_tokens,
          usage_reasoning_tokens,
          usage_cached_input_tokens,
          metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(turn_id) DO UPDATE SET
          run_id = excluded.run_id,
          session_id = excluded.session_id,
          status = excluded.status,
          sequence = excluded.sequence,
          agent_id = excluded.agent_id,
          execution_profile_id = excluded.execution_profile_id,
          started_at = excluded.started_at,
          finished_at = excluded.finished_at,
          finish_reason = excluded.finish_reason,
          usage_input_tokens = excluded.usage_input_tokens,
          usage_output_tokens = excluded.usage_output_tokens,
          usage_reasoning_tokens = excluded.usage_reasoning_tokens,
          usage_cached_input_tokens = excluded.usage_cached_input_tokens,
          metadata_json = excluded.metadata_json
      `,
    ).run(
      turn.id,
      turn.runId,
      turn.sessionId,
      turn.status,
      turn.sequence,
      turn.agentId,
      turn.executionProfile.id,
      turn.startedAt,
      turn.finishedAt ?? null,
      turn.finishReason ?? null,
      turn.usage?.inputTokens ?? null,
      turn.usage?.outputTokens ?? null,
      turn.usage?.reasoningTokens ?? null,
      turn.usage?.cachedInputTokens ?? null,
      serializeKernelMetadataJson(turn.metadata),
    )
  }

  async listByRun(runId: TurnRecord["runId"]): Promise<readonly TurnRecord[]> {
    const rows = this.db.query(
      `
        SELECT
          turn_id,
          run_id,
          session_id,
          status,
          sequence,
          agent_id,
          execution_profile_id,
          started_at,
          finished_at,
          finish_reason,
          usage_input_tokens,
          usage_output_tokens,
          usage_reasoning_tokens,
          usage_cached_input_tokens,
          metadata_json
        FROM kernel_turns
        WHERE run_id = ?
        ORDER BY sequence ASC, turn_id ASC
      `,
    ).all(runId) as SqliteTurnRow[]

    return rows.map(mapTurnRow)
  }

  async getLastByRun(runId: TurnRecord["runId"]): Promise<TurnRecord | undefined> {
    const row = this.db.query(
      `
        SELECT
          turn_id,
          run_id,
          session_id,
          status,
          sequence,
          agent_id,
          execution_profile_id,
          started_at,
          finished_at,
          finish_reason,
          usage_input_tokens,
          usage_output_tokens,
          usage_reasoning_tokens,
          usage_cached_input_tokens,
          metadata_json
        FROM kernel_turns
        WHERE run_id = ?
        ORDER BY sequence DESC, turn_id DESC
        LIMIT 1
      `,
    ).get(runId) as SqliteTurnRow | null

    return row ? mapTurnRow(row) : undefined
  }
}
