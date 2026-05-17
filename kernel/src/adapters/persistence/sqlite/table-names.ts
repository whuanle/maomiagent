export const SQLITE_KERNEL_TABLE_NAMES = [
  "kernel_sessions",
  "kernel_runs",
  "kernel_turns",
  "kernel_messages",
  "kernel_message_parts",
  "kernel_tool_calls",
  "kernel_interactions",
  "kernel_context_checkpoints",
  "kernel_events",
] as const

export type SqliteKernelTableName = (typeof SQLITE_KERNEL_TABLE_NAMES)[number]
