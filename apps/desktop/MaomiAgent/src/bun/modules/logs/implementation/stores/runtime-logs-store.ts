import type { DesktopDatabaseConnection } from "../../../database";

import type {
  RuntimeLogRecord,
  RuntimeLogsListResponse,
  RuntimeLogsQuery,
  RuntimeLogsSummary,
  RuntimeLogWriteInput,
} from "../../abstraction/models/runtime-log.models";

type SqlFilter = {
  sql: string[];
  args: unknown[];
};

function nowIso() {
  return new Date().toISOString();
}

function nextLogId() {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeText(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeLimit(value?: number): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return 100;
  }
  return Math.min(Math.floor(numberValue), 500);
}

function normalizeOffset(value?: number): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return 0;
  }
  return Math.floor(numberValue);
}

function buildFilter(query: RuntimeLogsQuery): SqlFilter {
  const sql: string[] = [];
  const args: unknown[] = [];

  const requestedLevels =
    Array.isArray(query.levels) && query.levels.length > 0
      ? Array.from(new Set(query.levels))
      : query.level
        ? [query.level]
        : [];

  if (requestedLevels.length === 1) {
    sql.push("level = ?");
    args.push(requestedLevels[0]);
  } else if (requestedLevels.length > 1) {
    sql.push(`level IN (${requestedLevels.map(() => "?").join(", ")})`);
    args.push(...requestedLevels);
  }

  const source = normalizeText(query.source);
  if (source) {
    sql.push("source = ?");
    args.push(source);
  }

  const moduleName = normalizeText(query.module);
  if (moduleName) {
    sql.push("module = ?");
    args.push(moduleName);
  }

  const from = normalizeText(query.from);
  if (from) {
    sql.push("at >= ?");
    args.push(from);
  }

  const to = normalizeText(query.to);
  if (to) {
    sql.push("at <= ?");
    args.push(to);
  }

  const workspaceId = normalizeText(query.workspaceId);
  if (workspaceId) {
    sql.push("workspace_id = ?");
    args.push(workspaceId);
  }

  const runId = normalizeText(query.runId);
  if (runId) {
    sql.push("run_id = ?");
    args.push(runId);
  }

  const taskId = normalizeText(query.taskId);
  if (taskId) {
    sql.push("task_id = ?");
    args.push(taskId);
  }

  const traceId = normalizeText(query.traceId);
  if (traceId) {
    sql.push("trace_id = ?");
    args.push(traceId);
  }

  const keyword = normalizeText(query.q);
  if (keyword) {
    sql.push(
      "(message LIKE ? OR module LIKE ? OR source LIKE ? OR trace_id LIKE ? OR run_id LIKE ? OR task_id LIKE ?)",
    );
    const like = `%${keyword}%`;
    args.push(like, like, like, like, like, like);
  }

  return { sql, args };
}

function buildWhereClause(input: RuntimeLogsQuery) {
  const { sql, args } = buildFilter(input);
  return {
    where: sql.length > 0 ? `WHERE ${sql.join(" AND ")}` : "",
    args,
  };
}

function parseContext(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string" || !value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

const LOG_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    at TEXT NOT NULL,
    level TEXT NOT NULL,
    source TEXT NOT NULL,
    module TEXT NOT NULL,
    message TEXT NOT NULL,
    stack TEXT,
    context_json TEXT,
    workspace_id TEXT,
    run_id TEXT,
    task_id TEXT,
    trace_id TEXT
  );
`;

const LOG_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_logs_at ON logs(at DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_level_at ON logs(level, at DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_source_at ON logs(source, at DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_module_at ON logs(module, at DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_workspace_at ON logs(workspace_id, at DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_run_at ON logs(run_id, at DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_task_at ON logs(task_id, at DESC);
  CREATE INDEX IF NOT EXISTS idx_logs_trace_at ON logs(trace_id, at DESC);
`;

export class RuntimeLogsStore {
  constructor(private readonly db: DesktopDatabaseConnection) {
    this.db.execute(`${LOG_TABLE_SQL}\n${LOG_INDEX_SQL}`);
  }

  append(input: RuntimeLogWriteInput): RuntimeLogRecord {
    const record: RuntimeLogRecord = {
      id: nextLogId(),
      at: nowIso(),
      level: input.level,
      source: normalizeText(input.source) || "unknown",
      module: normalizeText(input.module) || "general",
      message: normalizeText(input.message) || "-",
      stack: normalizeText(input.stack),
      context: input.context,
      workspaceId: normalizeText(input.workspaceId),
      runId: normalizeText(input.runId),
      taskId: normalizeText(input.taskId),
      traceId: normalizeText(input.traceId),
    };

    this.db.run(`
      INSERT INTO logs (
        id, at, level, source, module, message, stack, context_json, workspace_id, run_id, task_id, trace_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      record.id,
      record.at,
      record.level,
      record.source,
      record.module,
      record.message,
      record.stack ?? null,
      record.context ? JSON.stringify(record.context) : null,
      record.workspaceId ?? null,
      record.runId ?? null,
      record.taskId ?? null,
      record.traceId ?? null,
    );

    return record;
  }

  query(input: RuntimeLogsQuery = {}): RuntimeLogsListResponse {
    const { where, args } = buildWhereClause(input);
    const limit = normalizeLimit(input.limit);
    const offset = normalizeOffset(input.offset);

    const totalRow = this.db.get(`SELECT COUNT(1) AS total FROM logs ${where}`, ...args) as { total?: number } | null;
    const total = Number(totalRow?.total || 0);

    const rows = this.db.all(`
      SELECT
        id, at, level, source, module, message, stack, context_json, workspace_id, run_id, task_id, trace_id
      FROM logs
      ${where}
      ORDER BY at DESC
      LIMIT ?
      OFFSET ?
    `, ...args, limit, offset) as Array<Record<string, unknown>>;

    return {
      items: rows.map((row) => ({
        id: String(row.id || ""),
        at: String(row.at || ""),
        level: String(row.level || "info") as RuntimeLogRecord["level"],
        source: String(row.source || "unknown"),
        module: String(row.module || "general"),
        message: String(row.message || ""),
        stack: typeof row.stack === "string" ? row.stack : undefined,
        context: parseContext(row.context_json),
        workspaceId: typeof row.workspace_id === "string" ? row.workspace_id : undefined,
        runId: typeof row.run_id === "string" ? row.run_id : undefined,
        taskId: typeof row.task_id === "string" ? row.task_id : undefined,
        traceId: typeof row.trace_id === "string" ? row.trace_id : undefined,
      })),
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + rows.length < total,
      },
    };
  }

  summary(input: RuntimeLogsQuery = {}): RuntimeLogsSummary {
    const { where, args } = buildWhereClause(input);

    const totalRow = this.db.get(`SELECT COUNT(1) AS total FROM logs ${where}`, ...args) as { total?: number } | null;
    const total = Number(totalRow?.total || 0);

    const byLevelRows = this.db.all(
      `SELECT level, COUNT(1) AS count FROM logs ${where} GROUP BY level`,
      ...args,
    ) as Array<{ level: string; count: number }>;
    const bySourceRows = this.db.all(
      `SELECT source, COUNT(1) AS count FROM logs ${where} GROUP BY source`,
      ...args,
    ) as Array<{ source: string; count: number }>;
    const byModuleRows = this.db.all(
      `SELECT module, COUNT(1) AS count FROM logs ${where} GROUP BY module`,
      ...args,
    ) as Array<{ module: string; count: number }>;

    return {
      total,
      byLevel: Object.fromEntries(byLevelRows.map((row) => [row.level, Number(row.count || 0)])),
      bySource: Object.fromEntries(bySourceRows.map((row) => [row.source, Number(row.count || 0)])),
      byModule: Object.fromEntries(byModuleRows.map((row) => [row.module, Number(row.count || 0)])),
    };
  }

  clear() {
    const total = this.count();
    this.db.run("DELETE FROM logs");
    return total;
  }

  deleteByQuery(input: RuntimeLogsQuery = {}) {
    const total = this.count(input);
    if (total === 0) {
      return 0;
    }

    const { where, args } = buildWhereClause(input);
    this.db.run(`DELETE FROM logs ${where}`, ...args);
    return total;
  }

  close() {}

  dispose() {
    this.close();
  }

  private count(input: RuntimeLogsQuery = {}) {
    const { where, args } = buildWhereClause(input);
    const totalRow = this.db.get(`SELECT COUNT(1) AS total FROM logs ${where}`, ...args) as { total?: number } | null;
    return Number(totalRow?.total || 0);
  }
}