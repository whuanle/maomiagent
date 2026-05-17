import type { DesktopDatabaseConnection } from "../../../database";
import type {
  DesktopTaskRecord,
  DesktopTaskRunRecord,
} from "../../abstraction/models/desktop-tasks.models";

type TaskRow = {
  task_id: string;
  workspace_id: string;
  title: string;
  goal: string;
  status: string;
  priority: string;
  task_type: string;
  execution_mode: string;
  run_mode: string;
  origin: string;
  linked_session_id: string | null;
  agent_id: string | null;
  progress: number;
  run_count: number;
  last_run_id: string | null;
  root_task_id: string | null;
  handler_id: string | null;
  handler_module_id: string | null;
  handler_task_key: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  payload_json: string;
};

type TaskRunRow = {
  run_id: string;
  task_id: string;
  workspace_id: string;
  status: string;
  executor: string;
  trigger: string;
  started_at: string;
  finished_at: string | null;
  payload_json: string;
};

type WorkspaceNameRow = {
  workspace_id: string;
  name: string;
  updated_at: string;
};

const TASK_WORKSPACES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS desktop_task_workspaces (
  workspace_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const TASKS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS desktop_tasks (
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  task_type TEXT NOT NULL,
  execution_mode TEXT NOT NULL,
  run_mode TEXT NOT NULL,
  origin TEXT NOT NULL,
  linked_session_id TEXT,
  agent_id TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_run_id TEXT,
  root_task_id TEXT,
  handler_id TEXT,
  handler_module_id TEXT,
  handler_task_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (workspace_id, task_id)
);
`;

const TASK_RUNS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS desktop_task_runs (
  run_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL,
  executor TEXT NOT NULL,
  trigger TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  payload_json TEXT NOT NULL
);
`;

const TASKS_UPDATED_AT_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_desktop_tasks_updated_at
ON desktop_tasks(updated_at DESC);
`;

const TASKS_STATUS_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_desktop_tasks_workspace_status
ON desktop_tasks(workspace_id, status, updated_at DESC);
`;

const TASK_RUNS_TASK_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_desktop_task_runs_task
ON desktop_task_runs(workspace_id, task_id, started_at DESC);
`;

function trimText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJson<TValue>(value: string | null | undefined): TValue | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as TValue;
  } catch {
    return undefined;
  }
}

function resolveTaskRootTaskId(item: DesktopTaskRecord): string | undefined {
  const metadata = isRecord(item.metadata) ? item.metadata : undefined;
  const rootTaskId = trimText(metadata?.rootTaskId);
  if (rootTaskId) {
    return rootTaskId;
  }
  return metadata?.rootTask === true ? item.taskId : undefined;
}

function mapTaskRow(row: TaskRow): DesktopTaskRecord {
  const parsed = parseJson<DesktopTaskRecord>(row.payload_json);
  if (parsed) {
    return parsed;
  }

  return {
    taskId: row.task_id,
    workspaceId: row.workspace_id,
    title: row.title,
    goal: row.goal,
    taskType: row.task_type as DesktopTaskRecord["taskType"],
    executionMode: row.execution_mode as DesktopTaskRecord["executionMode"],
    runMode: row.run_mode as DesktopTaskRecord["runMode"],
    origin: row.origin as DesktopTaskRecord["origin"],
    linkedSessionId: row.linked_session_id ?? undefined,
    agentId: row.agent_id ?? undefined,
    priority: row.priority as DesktopTaskRecord["priority"],
    status: row.status as DesktopTaskRecord["status"],
    progress: row.progress,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    runCount: row.run_count,
    lastRunId: row.last_run_id ?? undefined,
    steps: [],
  };
}

function mapTaskRunRow(row: TaskRunRow): DesktopTaskRunRecord {
  const parsed = parseJson<DesktopTaskRunRecord>(row.payload_json);
  if (parsed) {
    return parsed;
  }

  return {
    runId: row.run_id,
    taskId: row.task_id,
    workspaceId: row.workspace_id,
    status: row.status as DesktopTaskRunRecord["status"],
    executor: row.executor,
    trigger: row.trigger as DesktopTaskRunRecord["trigger"],
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
  };
}

function sortWorkspaceRows(rows: WorkspaceNameRow[]): WorkspaceNameRow[] {
  return rows.sort((left, right) => {
    if (left.updated_at !== right.updated_at) {
      return right.updated_at.localeCompare(left.updated_at);
    }
    return left.name.localeCompare(right.name, "zh-CN", { sensitivity: "base" });
  });
}

export class DesktopTasksStore {
  constructor(private readonly connection: DesktopDatabaseConnection) {
    this.connection.execute(TASK_WORKSPACES_TABLE_SQL);
    this.connection.execute(TASKS_TABLE_SQL);
    this.connection.execute(TASK_RUNS_TABLE_SQL);
    this.connection.execute(TASKS_UPDATED_AT_INDEX_SQL);
    this.connection.execute(TASKS_STATUS_INDEX_SQL);
    this.connection.execute(TASK_RUNS_TASK_INDEX_SQL);
  }

  isEmpty(): boolean {
    const row = this.connection.get<{ total: number }>(
      "SELECT COUNT(*) AS total FROM desktop_tasks",
    );
    return !row || row.total === 0;
  }

  listTasks(): DesktopTaskRecord[] {
    return this.connection
      .all<TaskRow>("SELECT * FROM desktop_tasks ORDER BY updated_at DESC, created_at DESC, task_id ASC")
      .map(mapTaskRow);
  }

  getTask(workspaceId: string, taskId: string): DesktopTaskRecord | null {
    const row = this.connection.get<TaskRow>(
      "SELECT * FROM desktop_tasks WHERE workspace_id = ? AND task_id = ?",
      workspaceId,
      taskId,
    );
    return row ? mapTaskRow(row) : null;
  }

  listTaskRuns(workspaceId?: string, taskId?: string): DesktopTaskRunRecord[] {
    if (workspaceId && taskId) {
      return this.connection
        .all<TaskRunRow>(
          "SELECT * FROM desktop_task_runs WHERE workspace_id = ? AND task_id = ? ORDER BY started_at DESC, run_id DESC",
          workspaceId,
          taskId,
        )
        .map(mapTaskRunRow);
    }

    return this.connection
      .all<TaskRunRow>("SELECT * FROM desktop_task_runs ORDER BY started_at DESC, run_id DESC")
      .map(mapTaskRunRow);
  }

  listWorkspaceNames(): Array<{ workspaceId: string; name: string; updatedAt: string }> {
    return sortWorkspaceRows(
      this.connection.all<WorkspaceNameRow>(
        "SELECT * FROM desktop_task_workspaces ORDER BY updated_at DESC, workspace_id ASC",
      ),
    ).map((row) => ({
      workspaceId: row.workspace_id,
      name: row.name,
      updatedAt: row.updated_at,
    }));
  }

  upsertTask(item: DesktopTaskRecord): void {
    this.connection.run(
      `INSERT INTO desktop_tasks (
        workspace_id, task_id, title, goal, status, priority, task_type, execution_mode,
        run_mode, origin, linked_session_id, agent_id, progress, run_count, last_run_id,
        root_task_id, handler_id, handler_module_id, handler_task_key, created_at, updated_at,
        started_at, finished_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, task_id) DO UPDATE SET
        title = excluded.title,
        goal = excluded.goal,
        status = excluded.status,
        priority = excluded.priority,
        task_type = excluded.task_type,
        execution_mode = excluded.execution_mode,
        run_mode = excluded.run_mode,
        origin = excluded.origin,
        linked_session_id = excluded.linked_session_id,
        agent_id = excluded.agent_id,
        progress = excluded.progress,
        run_count = excluded.run_count,
        last_run_id = excluded.last_run_id,
        root_task_id = excluded.root_task_id,
        handler_id = excluded.handler_id,
        handler_module_id = excluded.handler_module_id,
        handler_task_key = excluded.handler_task_key,
        updated_at = excluded.updated_at,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        payload_json = excluded.payload_json`,
      item.workspaceId,
      item.taskId,
      item.title,
      item.goal,
      item.status,
      item.priority,
      item.taskType,
      item.executionMode,
      item.runMode,
      item.origin,
      item.linkedSessionId ?? null,
      item.agentId ?? null,
      item.progress,
      item.runCount,
      item.lastRunId ?? null,
      resolveTaskRootTaskId(item) ?? null,
      item.handler?.handlerId ?? null,
      item.handler?.moduleId ?? null,
      item.handler?.taskKey ?? null,
      item.createdAt,
      item.updatedAt,
      item.startedAt ?? null,
      item.finishedAt ?? null,
      JSON.stringify(item),
    );
  }

  upsertTaskRun(item: DesktopTaskRunRecord): void {
    this.connection.run(
      `INSERT INTO desktop_task_runs (
        run_id, workspace_id, task_id, status, executor, trigger, started_at, finished_at, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        task_id = excluded.task_id,
        status = excluded.status,
        executor = excluded.executor,
        trigger = excluded.trigger,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        payload_json = excluded.payload_json`,
      item.runId,
      item.workspaceId,
      item.taskId,
      item.status,
      item.executor,
      item.trigger,
      item.startedAt,
      item.finishedAt ?? null,
      JSON.stringify(item),
    );
  }

  upsertWorkspaceName(workspaceId: string, name: string, updatedAt: string): void {
    this.connection.run(
      `INSERT INTO desktop_task_workspaces (workspace_id, name, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        name = excluded.name,
        updated_at = excluded.updated_at`,
      workspaceId,
      name,
      updatedAt,
    );
  }

  replaceAll(input: {
    tasks: DesktopTaskRecord[];
    runs: DesktopTaskRunRecord[];
    workspaces: Array<{ workspaceId: string; name: string; updatedAt: string }>;
  }): void {
    this.connection.transaction(() => {
      this.connection.run("DELETE FROM desktop_task_runs");
      this.connection.run("DELETE FROM desktop_tasks");
      this.connection.run("DELETE FROM desktop_task_workspaces");
      input.workspaces.forEach((workspace) => {
        this.upsertWorkspaceName(workspace.workspaceId, workspace.name, workspace.updatedAt);
      });
      input.tasks.forEach((item) => {
        this.upsertTask(item);
      });
      input.runs.forEach((item) => {
        this.upsertTaskRun(item);
      });
    });
  }
}