import {
  CONTEXT_CHECKPOINT_KIND_VALUES,
  INTERACTION_KIND_VALUES,
  INTERACTION_STATUS_VALUES,
  KERNEL_FINISH_REASON_VALUES,
  MESSAGE_PART_TYPE_VALUES,
  MESSAGE_ROLE_VALUES,
  RUN_STATUS_VALUES,
  RUN_TRIGGER_KIND_VALUES,
  SESSION_STATUS_VALUES,
  TOOL_CALL_STATUS_VALUES,
  TURN_STATUS_VALUES,
} from "../../../core"
import { SQLITE_KERNEL_TABLE_NAMES } from "./table-names"

export interface SqliteExecTarget {
  exec(sql: string): unknown
}

export const SQLITE_KERNEL_SCHEMA_VERSION = 2

function quoteSqlString(value: string) {
  return `'${value.replaceAll(`'`, `''`)}'`
}

function buildInList(values: readonly string[]) {
  return values.map((value) => quoteSqlString(value)).join(", ")
}

function buildRequiredCheck(column: string, values: readonly string[]) {
  return `CHECK (${column} IN (${buildInList(values)}))`
}

function buildOptionalCheck(column: string, values: readonly string[]) {
  return `CHECK (${column} IS NULL OR ${column} IN (${buildInList(values)}))`
}

export const SQLITE_KERNEL_SCHEMA_PRAGMA_STATEMENTS = [
  "PRAGMA foreign_keys = ON;",
  "PRAGMA journal_mode = WAL;",
] as const

export const SQLITE_KERNEL_SCHEMA_INDEX_NAMES = [
  "idx_kernel_sessions_parent",
  "idx_kernel_sessions_status_updated",
  "idx_kernel_runs_session_started",
  "idx_kernel_runs_status_updated",
  "idx_kernel_turns_session_started",
  "idx_kernel_messages_session_created",
  "idx_kernel_messages_run_created",
  "idx_kernel_messages_turn_created",
  "idx_kernel_message_parts_type",
  "idx_kernel_tool_calls_turn_started",
  "idx_kernel_tool_calls_message",
  "idx_kernel_tool_calls_status_updated",
  "idx_kernel_tool_calls_interaction",
  "idx_kernel_interactions_run_status",
  "idx_kernel_interactions_tool_call",
  "idx_kernel_interactions_kind_created",
  "idx_kernel_context_checkpoints_session_created",
  "idx_kernel_context_checkpoints_summary_message",
  "idx_kernel_events_type_occurred",
  "idx_kernel_events_session_occurred",
  "idx_kernel_events_run_occurred",
] as const

export type SqliteKernelSchemaIndexName = (typeof SQLITE_KERNEL_SCHEMA_INDEX_NAMES)[number]

export const SQLITE_KERNEL_SCHEMA_DDL_STATEMENTS = [
  `
  CREATE TABLE IF NOT EXISTS kernel_sessions (
    session_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    parent_session_id TEXT REFERENCES kernel_sessions(session_id) ON DELETE SET NULL,
    status TEXT NOT NULL ${buildRequiredCheck("status", SESSION_STATUS_VALUES)},
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    archived_at INTEGER,
    metadata_json TEXT
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS kernel_runs (
    run_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES kernel_sessions(session_id) ON DELETE CASCADE,
    status TEXT NOT NULL ${buildRequiredCheck("status", RUN_STATUS_VALUES)},
    trigger_kind TEXT NOT NULL ${buildRequiredCheck("trigger_kind", RUN_TRIGGER_KIND_VALUES)},
    trigger_ref_id TEXT,
    started_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER,
    current_turn_id TEXT,
    metadata_json TEXT
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS kernel_turns (
    turn_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES kernel_runs(run_id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES kernel_sessions(session_id) ON DELETE CASCADE,
    status TEXT NOT NULL ${buildRequiredCheck("status", TURN_STATUS_VALUES)},
    sequence INTEGER NOT NULL,
    agent_id TEXT NOT NULL,
    execution_profile_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    finish_reason TEXT ${buildOptionalCheck("finish_reason", KERNEL_FINISH_REASON_VALUES)},
    usage_input_tokens INTEGER,
    usage_output_tokens INTEGER,
    usage_reasoning_tokens INTEGER,
    usage_cached_input_tokens INTEGER,
    metadata_json TEXT,
    UNIQUE(run_id, sequence)
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS kernel_messages (
    message_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES kernel_sessions(session_id) ON DELETE CASCADE,
    run_id TEXT REFERENCES kernel_runs(run_id) ON DELETE SET NULL,
    turn_id TEXT REFERENCES kernel_turns(turn_id) ON DELETE SET NULL,
    role TEXT NOT NULL ${buildRequiredCheck("role", MESSAGE_ROLE_VALUES)},
    created_at INTEGER NOT NULL,
    metadata_json TEXT
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS kernel_tool_calls (
    tool_call_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES kernel_sessions(session_id) ON DELETE CASCADE,
    run_id TEXT NOT NULL REFERENCES kernel_runs(run_id) ON DELETE CASCADE,
    turn_id TEXT NOT NULL REFERENCES kernel_turns(turn_id) ON DELETE CASCADE,
    message_id TEXT NOT NULL REFERENCES kernel_messages(message_id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    status TEXT NOT NULL ${buildRequiredCheck("status", TOOL_CALL_STATUS_VALUES)},
    input_json TEXT NOT NULL,
    output_json TEXT,
    error_json TEXT,
    interaction_id TEXT,
    started_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER,
    metadata_json TEXT
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS kernel_interactions (
    interaction_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES kernel_sessions(session_id) ON DELETE CASCADE,
    run_id TEXT NOT NULL REFERENCES kernel_runs(run_id) ON DELETE CASCADE,
    tool_call_id TEXT REFERENCES kernel_tool_calls(tool_call_id) ON DELETE SET NULL,
    kind TEXT NOT NULL ${buildRequiredCheck("kind", INTERACTION_KIND_VALUES)},
    status TEXT NOT NULL ${buildRequiredCheck("status", INTERACTION_STATUS_VALUES)},
    request_json TEXT NOT NULL,
    response_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    metadata_json TEXT
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS kernel_message_parts (
    part_id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES kernel_messages(message_id) ON DELETE CASCADE,
    part_order INTEGER NOT NULL,
    part_type TEXT NOT NULL ${buildRequiredCheck("part_type", MESSAGE_PART_TYPE_VALUES)},
    payload_json TEXT NOT NULL,
    UNIQUE(message_id, part_order)
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS kernel_context_checkpoints (
    checkpoint_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES kernel_sessions(session_id) ON DELETE CASCADE,
    checkpoint_kind TEXT NOT NULL ${buildRequiredCheck("checkpoint_kind", CONTEXT_CHECKPOINT_KIND_VALUES)},
    replaces_through_message_id TEXT NOT NULL REFERENCES kernel_messages(message_id) ON DELETE CASCADE,
    summary_message_id TEXT NOT NULL REFERENCES kernel_messages(message_id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    metadata_json TEXT
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS kernel_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    session_id TEXT REFERENCES kernel_sessions(session_id) ON DELETE SET NULL,
    run_id TEXT REFERENCES kernel_runs(run_id) ON DELETE SET NULL,
    turn_id TEXT REFERENCES kernel_turns(turn_id) ON DELETE SET NULL,
    occurred_at INTEGER NOT NULL,
    payload_json TEXT NOT NULL
  );
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_sessions_parent
    ON kernel_sessions(parent_session_id);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_sessions_status_updated
    ON kernel_sessions(status, updated_at DESC);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_runs_session_started
    ON kernel_runs(session_id, started_at DESC);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_runs_status_updated
    ON kernel_runs(status, updated_at DESC);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_turns_session_started
    ON kernel_turns(session_id, started_at DESC);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_messages_session_created
    ON kernel_messages(session_id, created_at ASC);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_messages_run_created
    ON kernel_messages(run_id, created_at ASC);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_messages_turn_created
    ON kernel_messages(turn_id, created_at ASC);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_message_parts_type
    ON kernel_message_parts(part_type);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_tool_calls_turn_started
    ON kernel_tool_calls(turn_id, started_at ASC);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_tool_calls_message
    ON kernel_tool_calls(message_id);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_tool_calls_status_updated
    ON kernel_tool_calls(status, updated_at DESC);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_tool_calls_interaction
    ON kernel_tool_calls(interaction_id);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_interactions_run_status
    ON kernel_interactions(run_id, status, updated_at DESC);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_interactions_tool_call
    ON kernel_interactions(tool_call_id);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_interactions_kind_created
    ON kernel_interactions(kind, created_at DESC);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_context_checkpoints_session_created
    ON kernel_context_checkpoints(session_id, created_at DESC);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_context_checkpoints_summary_message
    ON kernel_context_checkpoints(summary_message_id);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_events_type_occurred
    ON kernel_events(event_type, occurred_at DESC);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_events_session_occurred
    ON kernel_events(session_id, occurred_at DESC);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_kernel_events_run_occurred
    ON kernel_events(run_id, occurred_at DESC);
  `,
] as const

export function buildSqliteKernelSchemaSql(): string {
  return [...SQLITE_KERNEL_SCHEMA_PRAGMA_STATEMENTS, ...SQLITE_KERNEL_SCHEMA_DDL_STATEMENTS].join("\n")
}

export function applySqliteKernelSchema(target: SqliteExecTarget): void {
  for (const statement of SQLITE_KERNEL_SCHEMA_PRAGMA_STATEMENTS) {
    target.exec(statement)
  }

  for (const statement of SQLITE_KERNEL_SCHEMA_DDL_STATEMENTS) {
    target.exec(statement)
  }
}

export function listSqliteKernelTables(): readonly string[] {
  return SQLITE_KERNEL_TABLE_NAMES
}
