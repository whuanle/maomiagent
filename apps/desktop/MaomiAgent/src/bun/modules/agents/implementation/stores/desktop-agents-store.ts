import type { DesktopDatabaseConnection } from "../../../database";
import type { AgentItem } from "../../abstraction/models/desktop-agents.models";

type AgentRow = {
  agent_id: string;
  name: string;
  description: string | null;
  mode: string;
  enabled: number;
  version: string;
  source: string;
  hidden: number;
  prompt: string | null;
  model: string | null;
  model_strategy_json: string | null;
  identity_json: string | null;
  tools_json: string | null;
  skills_json: string | null;
  workflow_json: string | null;
  temperature: number | null;
  top_p: number | null;
  steps: number | null;
  permission_json: string | null;
  sub_agent_policy_json: string | null;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
};

const AGENTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS desktop_agents (
  agent_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  mode TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  version TEXT NOT NULL,
  source TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  prompt TEXT,
  model TEXT,
  model_strategy_json TEXT,
  identity_json TEXT,
  tools_json TEXT,
  skills_json TEXT,
  workflow_json TEXT,
  temperature REAL,
  top_p REAL,
  steps INTEGER,
  permission_json TEXT,
  sub_agent_policy_json TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

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

function mapAgentRow(row: AgentRow): AgentItem {
  const modelStrategy = parseJson<AgentItem["modelStrategy"]>(row.model_strategy_json);
  const identity = parseJson<AgentItem["identity"]>(row.identity_json);
  const tools = parseJson<Record<string, unknown>>(row.tools_json);
  const skills = parseJson<AgentItem["skills"]>(row.skills_json);
  const workflow = parseJson<AgentItem["workflow"]>(row.workflow_json);
  const permission = parseJson<Record<string, unknown>>(row.permission_json);
  const subAgentPolicy = parseJson<AgentItem["subAgentPolicy"]>(row.sub_agent_policy_json);
  const metadata = parseJson<Record<string, unknown>>(row.metadata_json);

  return {
    agentId: row.agent_id,
    name: row.name,
    description: row.description ?? undefined,
    mode: row.mode as AgentItem["mode"],
    enabled: row.enabled === 1,
    version: row.version,
    source: row.source as AgentItem["source"],
    hidden: row.hidden === 1 ? true : undefined,
    prompt: row.prompt ?? undefined,
    model: row.model ?? undefined,
    modelStrategy,
    identity,
    tools: isRecord(tools) ? tools : undefined,
    skills,
    workflow,
    temperature: typeof row.temperature === "number" ? row.temperature : undefined,
    topP: typeof row.top_p === "number" ? row.top_p : undefined,
    steps: typeof row.steps === "number" ? row.steps : undefined,
    permission: isRecord(permission) ? permission : undefined,
    subAgentPolicy,
    metadata: isRecord(metadata) ? metadata : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stringifyJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

export class DesktopAgentsStore {
  constructor(private readonly connection: DesktopDatabaseConnection) {
    this.connection.execute(AGENTS_TABLE_SQL);
  }

  list(): AgentItem[] {
    return this.connection
      .all<AgentRow>("SELECT * FROM desktop_agents ORDER BY updated_at DESC, name ASC")
      .map(mapAgentRow);
  }

  get(agentId: string): AgentItem | null {
    const row = this.connection.get<AgentRow>(
      "SELECT * FROM desktop_agents WHERE agent_id = ?",
      agentId,
    );
    return row ? mapAgentRow(row) : null;
  }

  upsert(item: AgentItem): void {
    this.connection.run(
      `INSERT INTO desktop_agents (
        agent_id, name, description, mode, enabled, version, source, hidden,
        prompt, model, model_strategy_json, identity_json, tools_json, skills_json,
        workflow_json, temperature, top_p, steps, permission_json,
        sub_agent_policy_json, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(agent_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        mode = excluded.mode,
        enabled = excluded.enabled,
        version = excluded.version,
        source = excluded.source,
        hidden = excluded.hidden,
        prompt = excluded.prompt,
        model = excluded.model,
        model_strategy_json = excluded.model_strategy_json,
        identity_json = excluded.identity_json,
        tools_json = excluded.tools_json,
        skills_json = excluded.skills_json,
        workflow_json = excluded.workflow_json,
        temperature = excluded.temperature,
        top_p = excluded.top_p,
        steps = excluded.steps,
        permission_json = excluded.permission_json,
        sub_agent_policy_json = excluded.sub_agent_policy_json,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at`,
      item.agentId,
      item.name,
      item.description ?? null,
      item.mode,
      item.enabled ? 1 : 0,
      item.version,
      item.source,
      item.hidden === true ? 1 : 0,
      item.prompt ?? null,
      item.model ?? null,
      stringifyJson(item.modelStrategy),
      stringifyJson(item.identity),
      stringifyJson(item.tools),
      stringifyJson(item.skills),
      stringifyJson(item.workflow),
      item.temperature ?? null,
      item.topP ?? null,
      item.steps ?? null,
      stringifyJson(item.permission),
      stringifyJson(item.subAgentPolicy),
      stringifyJson(item.metadata),
      item.createdAt,
      item.updatedAt,
    );
  }

  remove(agentId: string): boolean {
    const result = this.connection.run(
      "DELETE FROM desktop_agents WHERE agent_id = ?",
      agentId,
    );
    return result.changes > 0;
  }
}