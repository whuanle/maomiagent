import { Database, type SQLQueryBindings } from "bun:sqlite";
import { promises as fs } from "node:fs";
import { resolve } from "node:path";

import type { RuntimeLogger } from "../../../logs";
import type {
  DesktopMemoryAgentMemoryPack,
  DesktopMemoryAppendInput,
  DesktopMemoryDeleteResponse,
  DesktopMemoryDomain,
  DesktopMemoryKind,
  DesktopMemoryListQuery,
  DesktopMemoryListResponse,
  DesktopMemoryMaintenanceApply,
  DesktopMemoryMaintenancePreview,
  DesktopMemoryPatchInput,
  DesktopMemoryProjection,
  DesktopMemoryRuntimeContext,
  DesktopMemorySearchItem,
  DesktopMemorySearchQuery,
  DesktopMemorySearchResponse,
  DesktopMemoryScopeFilter,
  DesktopMemoryStatus,
  DesktopMemoryTier,
  DesktopMemoryTrace,
  DesktopMemoryTraceListQuery,
  DesktopMemoryUnit,
  DesktopMemoryWorkingSetPullResult,
  DesktopMemoryWorkingSetPushInput,
  DesktopMemoryWorkingSetPushResult,
} from "../../abstraction/models/desktop-memory.models";
import type { DesktopMemoryPort } from "../../abstraction/ports/desktop-memory.ports";
import {
  GLOBAL_MEMORY_CONTEXT_ID,
  ensureDesktopMemoryLayout,
  pathExists,
  resolveDesktopMemoryPaths,
  type DesktopMemoryPaths,
} from "./memory-paths";

type MemoryDb = Database;
type DbBinding = SQLQueryBindings;

type DbUnitRow = {
  unit_id: string;
  scope: "workspace" | "global";
  workspace_id: string | null;
  tier: DesktopMemoryTier;
  kind: DesktopMemoryKind;
  raw_content: string;
  summary: string | null;
  canonical_slots_json: string | null;
  evidence_refs_json: string | null;
  confidence: number | null;
  status: DesktopMemoryStatus;
  memory_domain: DesktopMemoryDomain | null;
  created_at: string;
  updated_at: string;
};

type TraceRow = {
  trace_id: string;
  workspace_id: string;
  query_text: string;
  selected_json: string;
  explain_json: string;
  created_at: string;
};

type MaintenanceRunRow = {
  mode: string;
  status: string;
  selected_json: string | null;
};

type WorkingFrameRow = {
  frame_version: number;
  delta_json: string;
};

type VersionRow = {
  max_version: number | null;
};

type UnitFilterInput = {
  workspaceId?: string;
  q?: string;
  tiers?: DesktopMemoryTier[];
  kinds?: DesktopMemoryKind[];
  status?: DesktopMemoryStatus;
};

type ProjectionInput = {
  workspaceId?: string;
  units?: {
    scopeFilter?: DesktopMemoryScopeFilter;
    q?: string;
    tiers?: DesktopMemoryTier[];
    kinds?: DesktopMemoryKind[];
    status?: DesktopMemoryStatus;
    includeGlobal?: boolean;
    limit?: number;
    offset?: number;
  };
  traces?: {
    limit?: number;
    queryLike?: string;
    unitId?: string;
    from?: string;
    to?: string;
  };
  runtimeContextQuery?: string;
};

type SearchInput = {
  workspaceId?: string;
  scopeFilter?: DesktopMemoryScopeFilter;
  query: string;
  topK?: number;
  tiers?: DesktopMemoryTier[];
  kinds?: DesktopMemoryKind[];
  includeGlobalFallback?: boolean;
};

type RetrievalTraceInput = {
  workspaceId?: string;
  limit?: number;
  queryLike?: string;
  unitId?: string;
  from?: string;
  to?: string;
};

type WorkingSetPullInput = {
  workspaceId: string;
  runId: string;
  agentId?: string;
  topK?: number;
};

type WorkingSetPushDeltaItem = DesktopMemoryWorkingSetPushInput["delta"][number];

type WorkingSetPushPayload = {
  workspaceId: string;
  runId: string;
  agentId: string;
  frameVersion?: number;
  delta: WorkingSetPushDeltaItem[];
};

type MaintenancePreviewInput = {
  workspaceId?: string;
  scopeFilter?: DesktopMemoryScopeFilter;
  action?: string;
  criteria?: Record<string, unknown>;
};

type MaintenanceApplyInput = {
  workspaceId?: string;
  runId: string;
};

const MEMORY_KINDS: DesktopMemoryKind[] = [
  "fact",
  "preference",
  "constraint",
  "procedure",
  "decision",
  "note",
  "habit",
  "emotion",
  "setting",
  "agent_handoff",
];

const MEMORY_TIERS: DesktopMemoryTier[] = ["short", "mid", "long"];
const MEMORY_STATUSES: DesktopMemoryStatus[] = ["active", "conflicted", "archived", "deleted"];
const MEMORY_DOMAINS: DesktopMemoryDomain[] = [
  "user_profile",
  "project_context",
  "agent_collaboration",
];

const USER_PROFILE_KINDS = new Set<DesktopMemoryKind>(["preference", "habit", "emotion", "setting"]);
const AGENT_COLLAB_KINDS = new Set<DesktopMemoryKind>(["agent_handoff"]);
const DEFAULT_RUNTIME_CONTEXT_QUERY = "用户偏好 习惯 设置 情绪 交接 决策 约束";

export class DesktopMemoryServiceError extends Error {
  readonly data?: Record<string, unknown>;

  constructor(readonly code: string, message: string, data?: Record<string, unknown>) {
    super(message);
    this.name = "DesktopMemoryServiceError";
    this.data = data;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function inSet<T extends string>(value: unknown, items: readonly T[]): value is T {
  return typeof value === "string" && items.includes(value as T);
}

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  const normalized = Number.isFinite(value) ? Math.trunc(value as number) : fallback;
  return Math.max(min, Math.min(max, normalized));
}

function parseJson<T>(value: string | null): T | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.min(1, value));
}

function normalizeKind(value: unknown, fallback: DesktopMemoryKind = "note"): DesktopMemoryKind {
  return inSet(value, MEMORY_KINDS) ? value : fallback;
}

function normalizeTier(value: unknown, fallback: DesktopMemoryTier = "short"): DesktopMemoryTier {
  return inSet(value, MEMORY_TIERS) ? value : fallback;
}

function normalizeStatus(value: unknown, fallback: DesktopMemoryStatus = "active"): DesktopMemoryStatus {
  return inSet(value, MEMORY_STATUSES) ? value : fallback;
}

function normalizeDomain(value: unknown): DesktopMemoryDomain | undefined {
  return inSet(value, MEMORY_DOMAINS) ? value : undefined;
}

function inferKindFromContent(content: string): DesktopMemoryKind | undefined {
  const text = content.toLowerCase();
  if (/偏好|喜欢|prefer/.test(text)) {
    return "preference";
  }
  if (/习惯|经常|always|usually/.test(text)) {
    return "habit";
  }
  if (/设置|配置|setting|config/.test(text)) {
    return "setting";
  }
  if (/情绪|焦虑|开心|sad|happy|anxious/.test(text)) {
    return "emotion";
  }
  if (/约束|必须|constraint/.test(text)) {
    return "constraint";
  }
  if (/决策|决定|decision/.test(text)) {
    return "decision";
  }
  if (/步骤|流程|procedure/.test(text)) {
    return "procedure";
  }
  if (/交接|handoff/.test(text)) {
    return "agent_handoff";
  }
  return undefined;
}

function resolveDomain(input: {
  kind: DesktopMemoryKind;
  requested?: DesktopMemoryDomain;
  source?: unknown;
}): DesktopMemoryDomain {
  if (input.requested) {
    return input.requested;
  }

  if (input.source && typeof input.source === "object" && !Array.isArray(input.source)) {
    const source = input.source as Record<string, unknown>;
    if (source.kind === "working_set_push") {
      return "agent_collaboration";
    }
  }

  if (AGENT_COLLAB_KINDS.has(input.kind)) {
    return "agent_collaboration";
  }
  if (USER_PROFILE_KINDS.has(input.kind)) {
    return "user_profile";
  }
  return "project_context";
}

function resolveTier(input: {
  domain: DesktopMemoryDomain;
  requested?: DesktopMemoryTier;
}): DesktopMemoryTier {
  if (input.domain === "agent_collaboration") {
    return "short";
  }
  if (input.domain === "user_profile") {
    if (input.requested === "mid" || input.requested === "long") {
      return input.requested;
    }
    return "long";
  }
  if (input.requested === "long") {
    return "mid";
  }
  return input.requested ?? "short";
}

function ensureTierDomainPolicy(domain: DesktopMemoryDomain, tier: DesktopMemoryTier): void {
  if (domain !== "user_profile" && tier === "long") {
    throw new DesktopMemoryServiceError(
      "POLICY_DENIED",
      "non user_profile memory cannot use long tier",
      {
        field: "tier",
        domain,
        tier,
      },
    );
  }
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function lexicalScore(unit: DesktopMemoryUnit, query: string): number {
  const terms = tokenize(query);
  if (terms.length === 0) {
    return 0;
  }

  const text = `${unit.summary ?? ""} ${unit.rawContent}`.toLowerCase();
  const hitCount = terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
  const lexical = hitCount / terms.length;
  const domain = unit.memoryDomain ?? "project_context";
  const domainBoost =
    domain === "user_profile"
      ? 0.16
      : domain === "agent_collaboration"
        ? 0.12
        : 0.03;
  const tierBoost = unit.tier === "long" ? 0.1 : unit.tier === "mid" ? 0.05 : 0.03;
  const confidenceBoost = unit.confidence ? Math.min(Math.max(unit.confidence, 0), 1) * 0.1 : 0;

  return lexical + domainBoost + tierBoost + confidenceBoost;
}

function toMemoryUnit(row: DbUnitRow): DesktopMemoryUnit {
  return {
    unitId: row.unit_id,
    scope: row.scope,
    workspaceId: row.workspace_id ?? undefined,
    tier: row.tier,
    kind: row.kind,
    rawContent: row.raw_content,
    summary: row.summary ?? undefined,
    canonicalSlots: parseJson<Record<string, unknown>>(row.canonical_slots_json),
    evidenceRefs: parseJson<Array<Record<string, unknown>>>(row.evidence_refs_json),
    confidence: row.confidence ?? undefined,
    status: row.status,
    memoryDomain: row.memory_domain ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function dbAll<T>(db: MemoryDb, sql: string, ...params: DbBinding[]): T[] {
  return db.query(sql).all(...params) as T[];
}

function dbGet<T>(db: MemoryDb, sql: string, ...params: DbBinding[]): T | undefined {
  return db.query(sql).get(...params) as T | undefined;
}

function dbRun(db: MemoryDb, sql: string, ...params: DbBinding[]): void {
  db.query(sql).run(...params);
}

function closeDatabase(db: MemoryDb): void {
  const candidate = db as MemoryDb & {
    close?: (throwOnError?: boolean) => void;
  };
  candidate.close?.(false);
}

function initSchema(db: MemoryDb): void {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS memory_units (
      unit_id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      workspace_id TEXT,
      tier TEXT NOT NULL,
      kind TEXT NOT NULL,
      raw_content TEXT NOT NULL,
      summary TEXT,
      canonical_slots_json TEXT,
      evidence_refs_json TEXT,
      confidence REAL,
      status TEXT NOT NULL DEFAULT 'active',
      memory_domain TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS working_memory_frames (
      frame_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      agent_id TEXT,
      frame_version INTEGER NOT NULL,
      delta_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS retrieval_traces (
      trace_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      query_text TEXT NOT NULL,
      selected_json TEXT NOT NULL,
      explain_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS maintenance_runs (
      run_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      action TEXT NOT NULL,
      mode TEXT NOT NULL,
      criteria_json TEXT,
      summary_json TEXT,
      selected_json TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memory_units_scope_workspace ON memory_units(scope, workspace_id);
    CREATE INDEX IF NOT EXISTS idx_memory_units_status_tier ON memory_units(status, tier);
    CREATE INDEX IF NOT EXISTS idx_working_frames_run ON working_memory_frames(workspace_id, run_id, frame_version);
    CREATE INDEX IF NOT EXISTS idx_retrieval_traces_workspace ON retrieval_traces(workspace_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_maintenance_runs_workspace ON maintenance_runs(workspace_id, created_at);
  `);
}

function buildUnitFilter(input: UnitFilterInput): {
  where: string;
  args: DbBinding[];
} {
  const clauses: string[] = [];
  const args: DbBinding[] = [];

  if (input.workspaceId !== undefined) {
    clauses.push("workspace_id = ?");
    args.push(input.workspaceId);
  }

  if (input.status) {
    clauses.push("status = ?");
    args.push(input.status);
  }

  if (input.tiers && input.tiers.length > 0) {
    clauses.push(`tier IN (${input.tiers.map(() => "?").join(",")})`);
    args.push(...input.tiers);
  }

  if (input.kinds && input.kinds.length > 0) {
    clauses.push(`kind IN (${input.kinds.map(() => "?").join(",")})`);
    args.push(...input.kinds);
  }

  if (input.q && input.q.trim()) {
    const q = `%${input.q.trim()}%`;
    clauses.push("(raw_content LIKE ? OR summary LIKE ?)");
    args.push(q, q);
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    args,
  };
}

function mergeWhereClauses(baseClauses: string[], filterWhere: string): string {
  const clauses = [...baseClauses];
  if (filterWhere.startsWith("WHERE ")) {
    clauses.push(filterWhere.slice(6));
  }
  return clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
}

function renderPromptContext(
  items: Array<{
    summary: string;
    kind?: string;
    sourceScope?: string;
  }>,
): string {
  if (items.length === 0) {
    return "";
  }

  return items
    .slice(0, 12)
    .map(
      (item, index) =>
        `${index + 1}. [${item.sourceScope ?? "workspace"}|${item.kind ?? "note"}] ${item.summary}`,
    )
    .join("\n");
}

export class DesktopMemoryService implements DesktopMemoryPort {
  private readonly paths: DesktopMemoryPaths;
  private globalDb: MemoryDb | null = null;
  private readonly workspaceDbCache = new Map<string, MemoryDb>();
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly logger: RuntimeLogger) {
    this.paths = resolveDesktopMemoryPaths();
  }

  async dispose(): Promise<void> {
    for (const db of this.workspaceDbCache.values()) {
      closeDatabase(db);
    }
    this.workspaceDbCache.clear();

    if (this.globalDb) {
      closeDatabase(this.globalDb);
      this.globalDb = null;
    }
  }

  async listUnits(input?: {
    workspaceId?: string;
  } & DesktopMemoryListQuery): Promise<DesktopMemoryListResponse> {
    if (input?.scopeFilter === "global") {
      return this.listGlobalUnits({
        q: input.q,
        tiers: input.tiers,
        kinds: input.kinds,
        status: input.status,
        limit: input.limit,
        offset: input.offset,
      });
    }

    if (input?.scopeFilter === "workspace") {
      if (input.workspaceId?.trim()) {
        return this.listWorkspaceUnits({
          workspaceId: input.workspaceId,
          q: input.q,
          tiers: input.tiers,
          kinds: input.kinds,
          status: input.status,
          includeGlobal: false,
          limit: input.limit,
          offset: input.offset,
        });
      }

      return this.listAllWorkspaceUnits({
        q: input.q,
        tiers: input.tiers,
        kinds: input.kinds,
        status: input.status,
        limit: input.limit,
        offset: input.offset,
      });
    }

    if (input?.scopeFilter === "all") {
      if (input.workspaceId?.trim()) {
        return this.listWorkspaceUnits({
          workspaceId: input.workspaceId,
          q: input.q,
          tiers: input.tiers,
          kinds: input.kinds,
          status: input.status,
          includeGlobal: true,
          limit: input.limit,
          offset: input.offset,
        });
      }

      return this.listAggregateUnits({
        q: input.q,
        tiers: input.tiers,
        kinds: input.kinds,
        status: input.status,
        limit: input.limit,
        offset: input.offset,
      });
    }

    if (input?.workspaceId?.trim()) {
      return this.listWorkspaceUnits({
        workspaceId: input.workspaceId,
        q: input.q,
        tiers: input.tiers,
        kinds: input.kinds,
        status: input.status,
        includeGlobal: input.includeGlobal,
        limit: input.limit,
        offset: input.offset,
      });
    }

    return this.listGlobalUnits({
      q: input?.q,
      tiers: input?.tiers,
      kinds: input?.kinds,
      status: input?.status,
      limit: input?.limit,
      offset: input?.offset,
    });
  }

  async getProjection(input?: ProjectionInput): Promise<DesktopMemoryProjection> {
    const traceLimit = clamp(input?.traces?.limit, 20, 1, 200);

    if (input?.units?.scopeFilter === "global") {
      const [units, traces, runtimeContext] = await Promise.all([
        this.listGlobalUnits({
          q: input.units.q,
          tiers: input.units.tiers,
          kinds: input.units.kinds,
          status: input.units.status,
          limit: input.units.limit,
          offset: input.units.offset,
        }),
        this.listGlobalRetrievalTraces({
          limit: traceLimit,
          queryLike: input.traces?.queryLike,
          unitId: input.traces?.unitId,
          from: input.traces?.from,
          to: input.traces?.to,
        }),
        this.getGlobalRuntimeContext({
          query: input.runtimeContextQuery,
        }),
      ]);

      return {
        units,
        traces: {
          items: traces,
          limit: traceLimit,
        },
        runtimeContext,
        summary: {
          unitTotal: units.meta.total,
          traceCount: traces.length,
          runtimeItems: runtimeContext.items.length,
        },
      };
    }

    if (input?.units?.scopeFilter === "workspace") {
      if (input.workspaceId?.trim()) {
        const workspaceId = this.sanitizeWorkspaceId(input.workspaceId);
        const [units, traces, runtimeContext] = await Promise.all([
          this.listWorkspaceUnits({
            workspaceId,
            q: input.units.q,
            tiers: input.units.tiers,
            kinds: input.units.kinds,
            status: input.units.status,
            includeGlobal: false,
            limit: input.units.limit,
            offset: input.units.offset,
          }),
          this.listWorkspaceRetrievalTraces({
            workspaceId,
            limit: traceLimit,
            queryLike: input.traces?.queryLike,
            unitId: input.traces?.unitId,
            from: input.traces?.from,
            to: input.traces?.to,
          }),
          this.getWorkspaceRuntimeContext({
            workspaceId,
            query: input.runtimeContextQuery,
          }),
        ]);

        return {
          workspaceId,
          units,
          traces: {
            items: traces,
            limit: traceLimit,
          },
          runtimeContext,
          summary: {
            unitTotal: units.meta.total,
            traceCount: traces.length,
            runtimeItems: runtimeContext.items.length,
          },
        };
      }

      const [units, traces, runtimeContext] = await Promise.all([
        this.listAllWorkspaceUnits({
          q: input.units.q,
          tiers: input.units.tiers,
          kinds: input.units.kinds,
          status: input.units.status,
          limit: input.units.limit,
          offset: input.units.offset,
        }),
        this.listAllWorkspaceRetrievalTraces({
          limit: traceLimit,
          queryLike: input.traces?.queryLike,
          unitId: input.traces?.unitId,
          from: input.traces?.from,
          to: input.traces?.to,
        }),
        this.getAllWorkspaceRuntimeContext({
          query: input.runtimeContextQuery,
        }),
      ]);

      return {
        units,
        traces: {
          items: traces,
          limit: traceLimit,
        },
        runtimeContext,
        summary: {
          unitTotal: units.meta.total,
          traceCount: traces.length,
          runtimeItems: runtimeContext.items.length,
        },
      };
    }

    if (input?.units?.scopeFilter === "all") {
      if (input.workspaceId?.trim()) {
        const workspaceId = this.sanitizeWorkspaceId(input.workspaceId);
        const [units, traces, runtimeContext] = await Promise.all([
          this.listWorkspaceUnits({
            workspaceId,
            q: input.units.q,
            tiers: input.units.tiers,
            kinds: input.units.kinds,
            status: input.units.status,
            includeGlobal: true,
            limit: input.units.limit,
            offset: input.units.offset,
          }),
          this.listAggregateRetrievalTraces({
            workspaceId,
            limit: traceLimit,
            queryLike: input.traces?.queryLike,
            unitId: input.traces?.unitId,
            from: input.traces?.from,
            to: input.traces?.to,
          }),
          this.getWorkspaceRuntimeContext({
            workspaceId,
            query: input.runtimeContextQuery,
          }),
        ]);

        return {
          workspaceId,
          units,
          traces: {
            items: traces,
            limit: traceLimit,
          },
          runtimeContext,
          summary: {
            unitTotal: units.meta.total,
            traceCount: traces.length,
            runtimeItems: runtimeContext.items.length,
          },
        };
      }

      const [units, traces, runtimeContext] = await Promise.all([
        this.listAggregateUnits({
          q: input.units.q,
          tiers: input.units.tiers,
          kinds: input.units.kinds,
          status: input.units.status,
          limit: input.units.limit,
          offset: input.units.offset,
        }),
        this.listAggregateRetrievalTraces({
          limit: traceLimit,
          queryLike: input.traces?.queryLike,
          unitId: input.traces?.unitId,
          from: input.traces?.from,
          to: input.traces?.to,
        }),
        this.getAggregateRuntimeContext({
          query: input.runtimeContextQuery,
        }),
      ]);

      return {
        units,
        traces: {
          items: traces,
          limit: traceLimit,
        },
        runtimeContext,
        summary: {
          unitTotal: units.meta.total,
          traceCount: traces.length,
          runtimeItems: runtimeContext.items.length,
        },
      };
    }

    if (input?.workspaceId?.trim()) {
      const workspaceId = this.sanitizeWorkspaceId(input.workspaceId);
      const [units, traces, runtimeContext] = await Promise.all([
        this.listWorkspaceUnits({
          workspaceId,
          q: input.units?.q,
          tiers: input.units?.tiers,
          kinds: input.units?.kinds,
          status: input.units?.status,
          includeGlobal: input.units?.includeGlobal,
          limit: input.units?.limit,
          offset: input.units?.offset,
        }),
        this.listWorkspaceRetrievalTraces({
          workspaceId,
          limit: traceLimit,
          queryLike: input.traces?.queryLike,
          unitId: input.traces?.unitId,
          from: input.traces?.from,
          to: input.traces?.to,
        }),
        this.getWorkspaceRuntimeContext({
          workspaceId,
          query: input.runtimeContextQuery,
        }),
      ]);

      return {
        workspaceId,
        units,
        traces: {
          items: traces,
          limit: traceLimit,
        },
        runtimeContext,
        summary: {
          unitTotal: units.meta.total,
          traceCount: traces.length,
          runtimeItems: runtimeContext.items.length,
        },
      };
    }

    const [units, traces, runtimeContext] = await Promise.all([
      this.listGlobalUnits({
        q: input?.units?.q,
        tiers: input?.units?.tiers,
        kinds: input?.units?.kinds,
        status: input?.units?.status,
        limit: input?.units?.limit,
        offset: input?.units?.offset,
      }),
      this.listGlobalRetrievalTraces({
        limit: traceLimit,
        queryLike: input?.traces?.queryLike,
        unitId: input?.traces?.unitId,
        from: input?.traces?.from,
        to: input?.traces?.to,
      }),
      this.getGlobalRuntimeContext({
        query: input?.runtimeContextQuery,
      }),
    ]);

    return {
      units,
      traces: {
        items: traces,
        limit: traceLimit,
      },
      runtimeContext,
      summary: {
        unitTotal: units.meta.total,
        traceCount: traces.length,
        runtimeItems: runtimeContext.items.length,
      },
    };
  }

  async search(input: SearchInput): Promise<DesktopMemorySearchResponse> {
    if (input.scopeFilter === "global") {
      return this.searchGlobal({
        query: input.query,
        topK: input.topK,
        tiers: input.tiers,
        kinds: input.kinds,
      });
    }

    if (input.scopeFilter === "workspace") {
      if (input.workspaceId?.trim()) {
        return this.searchWorkspace({
          workspaceId: input.workspaceId,
          query: input.query,
          topK: input.topK,
          tiers: input.tiers,
          kinds: input.kinds,
          includeGlobalFallback: false,
        });
      }

      return this.searchAllWorkspaces({
        query: input.query,
        topK: input.topK,
        tiers: input.tiers,
        kinds: input.kinds,
      });
    }

    if (input.scopeFilter === "all") {
      if (input.workspaceId?.trim()) {
        return this.searchWorkspace({
          workspaceId: input.workspaceId,
          query: input.query,
          topK: input.topK,
          tiers: input.tiers,
          kinds: input.kinds,
          includeGlobalFallback: true,
        });
      }

      return this.searchAggregate({
        query: input.query,
        topK: input.topK,
        tiers: input.tiers,
        kinds: input.kinds,
      });
    }

    if (input.workspaceId?.trim()) {
      return this.searchWorkspace({
        workspaceId: input.workspaceId,
        query: input.query,
        topK: input.topK,
        tiers: input.tiers,
        kinds: input.kinds,
        includeGlobalFallback: input.includeGlobalFallback,
      });
    }

    return this.searchGlobal({
      query: input.query,
      topK: input.topK,
      tiers: input.tiers,
      kinds: input.kinds,
    });
  }

  async listRetrievalTraces(input?: RetrievalTraceInput): Promise<DesktopMemoryTrace[]> {
    if (input?.workspaceId?.trim()) {
      return this.listWorkspaceRetrievalTraces({
        workspaceId: input.workspaceId,
        limit: input.limit,
        queryLike: input.queryLike,
        unitId: input.unitId,
        from: input.from,
        to: input.to,
      });
    }

    return this.listGlobalRetrievalTraces({
      limit: input?.limit,
      queryLike: input?.queryLike,
      unitId: input?.unitId,
      from: input?.from,
      to: input?.to,
    });
  }

  async getRuntimeContext(input?: {
    workspaceId?: string;
    query?: string;
  }): Promise<DesktopMemoryRuntimeContext> {
    if (input?.workspaceId?.trim()) {
      return this.getWorkspaceRuntimeContext({
        workspaceId: input.workspaceId,
        query: input.query,
      });
    }

    return this.getGlobalRuntimeContext({
      query: input?.query,
    });
  }

  async pullWorkingSet(input: WorkingSetPullInput): Promise<DesktopMemoryWorkingSetPullResult> {
    const workspaceId = this.sanitizeWorkspaceId(input.workspaceId);
    const runId = input.runId.trim();
    if (!runId) {
      throw new DesktopMemoryServiceError("INVALID_ARGUMENT", "runId is required", {
        field: "runId",
      });
    }

    const topK = clamp(input.topK, 20, 1, 100);
    const db = await this.openWorkspaceDb(workspaceId);
    const latestFrame = dbGet<WorkingFrameRow>(
      db,
      `
        SELECT frame_version, delta_json
        FROM working_memory_frames
        WHERE workspace_id = ? AND run_id = ?
        ORDER BY frame_version DESC
        LIMIT 1
      `,
      workspaceId,
      runId,
    );

    const items = dbAll<DbUnitRow>(
      db,
      `
        SELECT *
        FROM memory_units
        WHERE workspace_id = ?
          AND tier = 'short'
          AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT ?
      `,
      workspaceId,
      topK,
    ).map(toMemoryUnit);

    return {
      frameVersion: latestFrame?.frame_version ?? 0,
      frameSnapshot:
        latestFrame
          ? parseJson<Array<Record<string, unknown>>>(latestFrame.delta_json) ?? []
          : [],
      items,
    };
  }

  async append(input: DesktopMemoryAppendInput): Promise<DesktopMemoryUnit> {
    return this.runMutation(async () => {
      const scope = input.scope ?? (input.workspaceId?.trim() ? "workspace" : "global");
      const workspaceId =
        scope === "workspace"
          ? this.sanitizeWorkspaceId(input.workspaceId ?? "")
          : undefined;
      const content =
        typeof input.content === "string"
          ? input.content.trim()
          : typeof input.rawContent === "string"
            ? input.rawContent.trim()
            : "";

      if (!content) {
        throw new DesktopMemoryServiceError("INVALID_ARGUMENT", "content is required", {
          field: "content",
        });
      }

      const kind = normalizeKind(input.kind, inferKindFromContent(content) ?? "note");
      const domain = resolveDomain({
        kind,
        requested: normalizeDomain(input.memoryDomain),
      });
      const tier = resolveTier({
        domain,
        requested: normalizeTier(input.tier, domain === "user_profile" ? "long" : "short"),
      });
      ensureTierDomainPolicy(domain, tier);

      const summary =
        typeof input.summary === "string" && input.summary.trim()
          ? input.summary.trim()
          : content.length > 160
            ? `${content.slice(0, 157)}...`
            : content;
      const canonicalSlots =
        input.canonicalSlots && typeof input.canonicalSlots === "object" && !Array.isArray(input.canonicalSlots)
          ? input.canonicalSlots
          : undefined;
      const evidenceRefs = Array.isArray(input.evidenceRefs)
        ? input.evidenceRefs.filter(
            (item): item is Record<string, unknown> =>
              !!item && typeof item === "object" && !Array.isArray(item),
          )
        : undefined;
      const confidence = normalizeConfidence(input.confidence);
      const status = normalizeStatus(input.status, "active");
      const unitId = createId("mem");
      const createdAt = nowIso();
      const db = scope === "workspace"
        ? await this.openWorkspaceDb(workspaceId as string)
        : await this.openGlobalDb();

      dbRun(
        db,
        `
          INSERT INTO memory_units (
            unit_id, scope, workspace_id, tier, kind, raw_content, summary,
            canonical_slots_json, evidence_refs_json, confidence, status, memory_domain, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        unitId,
        scope,
        workspaceId ?? null,
        tier,
        kind,
        content,
        summary,
        canonicalSlots ? JSON.stringify(canonicalSlots) : null,
        evidenceRefs ? JSON.stringify(evidenceRefs) : null,
        confidence,
        status,
        domain,
        createdAt,
        createdAt,
      );

      const item: DesktopMemoryUnit = {
        unitId,
        scope,
        workspaceId,
        tier,
        kind,
        rawContent: content,
        summary,
        canonicalSlots,
        evidenceRefs,
        confidence: confidence ?? undefined,
        status,
        memoryDomain: domain,
        createdAt,
        updatedAt: createdAt,
      };

      await this.writeLog("info", "memory appended", {
        unitId,
        scope,
        workspaceId,
        kind,
        tier,
        domain,
      });

      return item;
    });
  }

  async patch(input: {
    workspaceId?: string;
    unitId: string;
    patch: DesktopMemoryPatchInput;
  }): Promise<DesktopMemoryUnit> {
    if (input.workspaceId?.trim()) {
      return this.patchWorkspaceUnit({
        workspaceId: input.workspaceId,
        unitId: input.unitId,
        patch: input.patch,
      });
    }

    return this.patchGlobalUnit({
      unitId: input.unitId,
      patch: input.patch,
    });
  }

  async remove(input: {
    workspaceId?: string;
    unitId: string;
  }): Promise<DesktopMemoryDeleteResponse> {
    if (input.workspaceId?.trim()) {
      return this.removeWorkspaceUnit({
        workspaceId: input.workspaceId,
        unitId: input.unitId,
      });
    }

    return this.removeGlobalUnit({
      unitId: input.unitId,
    });
  }

  async previewMaintenance(input: MaintenancePreviewInput): Promise<DesktopMemoryMaintenancePreview> {
    if (input.scopeFilter === "global") {
      return this.previewGlobalMaintenance({
        action: input.action,
        criteria: input.criteria,
      });
    }

    if (input.scopeFilter === "workspace") {
      if (input.workspaceId?.trim()) {
        return this.previewWorkspaceMaintenance({
          workspaceId: input.workspaceId,
          action: input.action,
          criteria: input.criteria,
        });
      }

      return this.previewAllWorkspaceMaintenance({
        action: input.action,
        criteria: input.criteria,
      });
    }

    if (input.scopeFilter === "all") {
      return this.previewAggregateMaintenance({
        workspaceId: input.workspaceId,
        action: input.action,
        criteria: input.criteria,
      });
    }

    if (input.workspaceId?.trim()) {
      return this.previewWorkspaceMaintenance({
        workspaceId: input.workspaceId,
        action: input.action,
        criteria: input.criteria,
      });
    }

    return this.previewGlobalMaintenance({
      action: input.action,
      criteria: input.criteria,
    });
  }

  async applyMaintenance(input: MaintenanceApplyInput): Promise<DesktopMemoryMaintenanceApply> {
    if (input.workspaceId?.trim()) {
      return this.applyWorkspaceMaintenance({
        workspaceId: input.workspaceId,
        runId: input.runId,
      });
    }

    return this.applyGlobalMaintenance({
      runId: input.runId,
    });
  }

  async pushWorkingSet(input: WorkingSetPushPayload): Promise<DesktopMemoryWorkingSetPushResult> {
    return this.runMutation(async () => {
      const workspaceId = this.sanitizeWorkspaceId(input.workspaceId);
      const runId = input.runId.trim();
      const agentId = input.agentId.trim();

      if (!runId) {
        throw new DesktopMemoryServiceError("INVALID_ARGUMENT", "runId is required", {
          field: "runId",
        });
      }
      if (!agentId) {
        throw new DesktopMemoryServiceError("INVALID_ARGUMENT", "agentId is required", {
          field: "agentId",
        });
      }
      if (!Array.isArray(input.delta) || input.delta.length === 0) {
        throw new DesktopMemoryServiceError("INVALID_ARGUMENT", "delta is required", {
          field: "delta",
        });
      }
      if (input.delta.length > 50) {
        throw new DesktopMemoryServiceError("INVALID_ARGUMENT", "delta size cannot exceed 50", {
          field: "delta",
        });
      }

      const db = await this.openWorkspaceDb(workspaceId);
      const current = dbGet<VersionRow>(
        db,
        `
          SELECT MAX(frame_version) AS max_version
          FROM working_memory_frames
          WHERE workspace_id = ? AND run_id = ?
        `,
        workspaceId,
        runId,
      );
      const currentVersion = current?.max_version ?? 0;
      if (typeof input.frameVersion === "number" && input.frameVersion !== currentVersion) {
        throw new DesktopMemoryServiceError("CONFLICT", "frameVersion conflict", {
          expected: currentVersion,
          received: input.frameVersion,
        });
      }

      const nextVersion = currentVersion + 1;
      const frameId = createId("frm");
      const createdAt = nowIso();
      dbRun(
        db,
        `
          INSERT INTO working_memory_frames (
            frame_id, workspace_id, run_id, agent_id, frame_version, delta_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        frameId,
        workspaceId,
        runId,
        agentId,
        nextVersion,
        JSON.stringify(input.delta),
        createdAt,
      );

      for (const delta of input.delta) {
        const content = delta.content.trim();
        if (!content) {
          continue;
        }

        const candidateKind = delta.kind
          ? normalizeKind(delta.kind, "agent_handoff")
          : inferKindFromContent(content) ?? "agent_handoff";
        const kind = USER_PROFILE_KINDS.has(candidateKind) ? "agent_handoff" : candidateKind;
        const summary = content.length > 160 ? `${content.slice(0, 157)}...` : content;
        const confidence = normalizeConfidence(delta.confidence);
        const canonicalSlots =
          delta.canonicalSlots && typeof delta.canonicalSlots === "object" && !Array.isArray(delta.canonicalSlots)
            ? delta.canonicalSlots
            : undefined;
        const evidenceRefs = [{ kind: "working_set_push", runId, agentId }];

        dbRun(
          db,
          `
            INSERT INTO memory_units (
              unit_id, scope, workspace_id, tier, kind, raw_content, summary,
              canonical_slots_json, evidence_refs_json, confidence, status, memory_domain, created_at, updated_at
            ) VALUES (?, 'workspace', ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
          `,
          createId("mem"),
          workspaceId,
          "short",
          kind,
          content,
          summary,
          canonicalSlots ? JSON.stringify(canonicalSlots) : null,
          JSON.stringify(evidenceRefs),
          confidence,
          "agent_collaboration",
          createdAt,
          createdAt,
        );
      }

      await this.writeLog("info", "working set pushed", {
        workspaceId,
        runId,
        agentId,
        frameVersion: nextVersion,
        accepted: input.delta.length,
      });

      return {
        frameId,
        frameVersion: nextVersion,
        accepted: input.delta.length,
        ackTraceId: createId("tr_mem"),
      };
    });
  }

  async buildAgentMemoryPack(input: {
    workspaceId?: string;
    runId?: string;
    agentId?: string;
    query?: string;
    topK?: number;
  }): Promise<DesktopMemoryAgentMemoryPack> {
    const workspaceId = input.workspaceId?.trim()
      ? this.sanitizeWorkspaceId(input.workspaceId)
      : undefined;

    if (!workspaceId) {
      return {
        workspaceId: undefined,
        runId: input.runId,
        agentId: input.agentId,
        query: input.query?.trim() || "",
        promptContext: "",
        retrieval: {
          workspaceId: undefined,
          query: "",
          items: [],
        },
        workingSet: {
          frameVersion: 0,
          items: [],
        },
      };
    }

    const retrieval = await this.getWorkspaceRuntimeContext({
      workspaceId,
      query: input.query,
    });
    const workingSet = input.runId?.trim()
      ? await this.pullWorkingSet({
          workspaceId,
          runId: input.runId,
          agentId: input.agentId,
          topK: input.topK,
        })
      : {
          frameVersion: 0,
          frameSnapshot: [],
          items: [],
        };

    return {
      workspaceId,
      runId: input.runId,
      agentId: input.agentId,
      query: retrieval.query,
      promptContext: renderPromptContext(retrieval.items),
      retrieval,
      workingSet: {
        frameVersion: workingSet.frameVersion,
        items: workingSet.items,
      },
    };
  }

  private sanitizeWorkspaceId(workspaceId: string): string {
    const normalized = workspaceId.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-");
    if (!normalized) {
      throw new DesktopMemoryServiceError("INVALID_ARGUMENT", "workspaceId is required", {
        field: "workspaceId",
      });
    }

    return normalized.slice(0, 128);
  }

  private resolveWorkspaceDbPath(workspaceId: string): string {
    return `${this.paths.memoryDir}/workspace-${workspaceId}.sqlite`;
  }

  private async hydrateDbFromLegacyIfNeeded(targetPath: string, fileName: string): Promise<void> {
    if (await pathExists(targetPath)) {
      return;
    }

    for (const legacyDir of this.paths.legacyMemoryDirs) {
      const candidate = resolve(legacyDir, fileName);
      if (candidate === resolve(targetPath)) {
        continue;
      }
      if (!await pathExists(candidate)) {
        continue;
      }

      try {
        await fs.copyFile(candidate, targetPath);
      } catch {
        return;
      }

      return;
    }
  }

  private async openWorkspaceDb(workspaceId: string): Promise<MemoryDb> {
    await ensureDesktopMemoryLayout(this.paths);
    const sanitizedWorkspaceId = this.sanitizeWorkspaceId(workspaceId);
    const cached = this.workspaceDbCache.get(sanitizedWorkspaceId);
    if (cached) {
      return cached;
    }

    const dbPath = this.resolveWorkspaceDbPath(sanitizedWorkspaceId);
    await this.hydrateDbFromLegacyIfNeeded(dbPath, `workspace-${sanitizedWorkspaceId}.sqlite`);
    const db = new Database(dbPath);
    initSchema(db);
    this.workspaceDbCache.set(sanitizedWorkspaceId, db);
    return db;
  }

  private async openGlobalDb(): Promise<MemoryDb> {
    await ensureDesktopMemoryLayout(this.paths);
    if (this.globalDb) {
      return this.globalDb;
    }

    await this.hydrateDbFromLegacyIfNeeded(this.paths.globalDbPath, "global.sqlite");
    this.globalDb = new Database(this.paths.globalDbPath);
    initSchema(this.globalDb);
    return this.globalDb;
  }

  private async writeLog(
    level: "info" | "warn" | "error",
    message: string,
    context?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.logger[level](message, { context });
    } catch {
      return;
    }
  }

  private runMutation<T>(work: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(work, work);
    this.mutationQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async listStoredWorkspaceIds(): Promise<string[]> {
    await ensureDesktopMemoryLayout(this.paths);

    const ids = new Set(this.workspaceDbCache.keys());
    const entries = await fs.readdir(this.paths.memoryDir).catch(() => [] as string[]);

    for (const entry of entries) {
      const match = /^workspace-(.+)\.sqlite$/i.exec(entry);
      if (!match?.[1]) {
        continue;
      }

      ids.add(match[1]);
    }

    return Array.from(ids).sort();
  }

  private async queryWorkspaceUnits(input: {
    workspaceId: string;
    q?: string;
    tiers?: DesktopMemoryTier[];
    kinds?: DesktopMemoryKind[];
    status?: DesktopMemoryStatus;
  }): Promise<DesktopMemoryUnit[]> {
    const workspaceId = this.sanitizeWorkspaceId(input.workspaceId);
    const workspaceDb = await this.openWorkspaceDb(workspaceId);
    const workspaceFilter = buildUnitFilter({
      workspaceId,
      q: input.q,
      tiers: input.tiers,
      kinds: input.kinds,
      status: input.status,
    });
    const where = mergeWhereClauses(["scope = 'workspace'"], workspaceFilter.where);

    return dbAll<DbUnitRow>(
      workspaceDb,
      `
        SELECT *
        FROM memory_units
        ${where}
        ORDER BY updated_at DESC
      `,
      ...workspaceFilter.args,
    ).map(toMemoryUnit);
  }

  private async queryGlobalUnits(input: {
    q?: string;
    tiers?: DesktopMemoryTier[];
    kinds?: DesktopMemoryKind[];
    status?: DesktopMemoryStatus;
  }): Promise<DesktopMemoryUnit[]> {
    const globalDb = await this.openGlobalDb();
    const globalFilter = buildUnitFilter({
      q: input.q,
      tiers: input.tiers,
      kinds: input.kinds,
      status: input.status,
    });
    const where = mergeWhereClauses(["scope = 'global'"], globalFilter.where);

    return dbAll<DbUnitRow>(
      globalDb,
      `
        SELECT *
        FROM memory_units
        ${where}
        ORDER BY updated_at DESC
      `,
      ...globalFilter.args,
    ).map(toMemoryUnit);
  }

  private sliceUnits(
    items: DesktopMemoryUnit[],
    limit?: number,
    offset?: number,
  ): DesktopMemoryListResponse {
    const resolvedLimit = clamp(limit, 50, 1, 500);
    const resolvedOffset = Math.max(offset ?? 0, 0);
    const sorted = items.sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1));
    const sliced = sorted.slice(resolvedOffset, resolvedOffset + resolvedLimit);

    return {
      items: sliced,
      meta: {
        total: sorted.length,
        limit: resolvedLimit,
        offset: resolvedOffset,
        hasMore: resolvedOffset + resolvedLimit < sorted.length,
      },
    };
  }

  private async listAllWorkspaceUnits(input: {
    q?: string;
    tiers?: DesktopMemoryTier[];
    kinds?: DesktopMemoryKind[];
    status?: DesktopMemoryStatus;
    limit?: number;
    offset?: number;
  }): Promise<DesktopMemoryListResponse> {
    const workspaceIds = await this.listStoredWorkspaceIds();
    const items = (
      await Promise.all(
        workspaceIds.map((workspaceId) => this.queryWorkspaceUnits({
          workspaceId,
          q: input.q,
          tiers: input.tiers,
          kinds: input.kinds,
          status: input.status,
        })),
      )
    ).flat();

    return this.sliceUnits(items, input.limit, input.offset);
  }

  private async listAggregateUnits(input: {
    q?: string;
    tiers?: DesktopMemoryTier[];
    kinds?: DesktopMemoryKind[];
    status?: DesktopMemoryStatus;
    limit?: number;
    offset?: number;
  }): Promise<DesktopMemoryListResponse> {
    const [globalItems, workspaceItems] = await Promise.all([
      this.queryGlobalUnits({
        q: input.q,
        tiers: input.tiers,
        kinds: input.kinds,
        status: input.status,
      }),
      this.listAllWorkspaceUnits({
        q: input.q,
        tiers: input.tiers,
        kinds: input.kinds,
        status: input.status,
        limit: 500,
        offset: 0,
      }).then((result) => result.items),
    ]);

    return this.sliceUnits([...globalItems, ...workspaceItems], input.limit, input.offset);
  }

  private async listWorkspaceUnits(input: {
    workspaceId: string;
    q?: string;
    tiers?: DesktopMemoryTier[];
    kinds?: DesktopMemoryKind[];
    status?: DesktopMemoryStatus;
    includeGlobal?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<DesktopMemoryListResponse> {
    const workspaceId = this.sanitizeWorkspaceId(input.workspaceId);
    const includeGlobal = input.includeGlobal === true;
    const [workspaceRows, globalRows] = await Promise.all([
      this.queryWorkspaceUnits({
        workspaceId,
        q: input.q,
        tiers: input.tiers,
        kinds: input.kinds,
        status: input.status,
      }),
      includeGlobal
        ? this.queryGlobalUnits({
            q: input.q,
            tiers: input.tiers,
            kinds: input.kinds,
            status: input.status,
          })
        : Promise.resolve([]),
    ]);

    return this.sliceUnits([...workspaceRows, ...globalRows], input.limit, input.offset);
  }

  private async listAllWorkspaceRetrievalTraces(input: {
    limit?: number;
    queryLike?: string;
    unitId?: string;
    from?: string;
    to?: string;
  }): Promise<DesktopMemoryTrace[]> {
    const limit = clamp(input.limit, 20, 1, 200);
    const workspaceIds = await this.listStoredWorkspaceIds();
    const traces = (
      await Promise.all(
        workspaceIds.map((workspaceId) => this.listWorkspaceRetrievalTraces({
          workspaceId,
          limit,
          queryLike: input.queryLike,
          unitId: input.unitId,
          from: input.from,
          to: input.to,
        })),
      )
    )
      .flat()
      .sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));

    return traces.slice(0, limit);
  }

  private async listAggregateRetrievalTraces(input: {
    workspaceId?: string;
    limit?: number;
    queryLike?: string;
    unitId?: string;
    from?: string;
    to?: string;
  }): Promise<DesktopMemoryTrace[]> {
    const limit = clamp(input.limit, 20, 1, 200);
    const [globalTraces, workspaceTraces] = await Promise.all([
      this.listGlobalRetrievalTraces({
        limit,
        queryLike: input.queryLike,
        unitId: input.unitId,
        from: input.from,
        to: input.to,
      }),
      input.workspaceId?.trim()
        ? this.listWorkspaceRetrievalTraces({
            workspaceId: input.workspaceId,
            limit,
            queryLike: input.queryLike,
            unitId: input.unitId,
            from: input.from,
            to: input.to,
          })
        : this.listAllWorkspaceRetrievalTraces({
            limit,
            queryLike: input.queryLike,
            unitId: input.unitId,
            from: input.from,
            to: input.to,
          }),
    ]);

    return [...globalTraces, ...workspaceTraces]
      .sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1))
      .slice(0, limit);
  }

  private async listGlobalUnits(input: {
    q?: string;
    tiers?: DesktopMemoryTier[];
    kinds?: DesktopMemoryKind[];
    status?: DesktopMemoryStatus;
    limit?: number;
    offset?: number;
  }): Promise<DesktopMemoryListResponse> {
    const items = await this.queryGlobalUnits({
      q: input.q,
      tiers: input.tiers,
      kinds: input.kinds,
      status: input.status,
    });

    return this.sliceUnits(items, input.limit, input.offset);
  }

  private async searchWorkspace(input: {
    workspaceId: string;
    query: string;
    topK?: number;
    tiers?: DesktopMemoryTier[];
    kinds?: DesktopMemoryKind[];
    includeGlobalFallback?: boolean;
  }): Promise<DesktopMemorySearchResponse> {
    const workspaceId = this.sanitizeWorkspaceId(input.workspaceId);
    const query = input.query.trim();
    if (!query) {
      throw new DesktopMemoryServiceError("INVALID_ARGUMENT", "query is required", {
        field: "query",
      });
    }

    const topK = clamp(input.topK, 20, 1, 100);
    const tiers = input.tiers?.length ? new Set(input.tiers) : undefined;
    const kinds = input.kinds?.length ? new Set(input.kinds) : undefined;
    const workspaceDb = await this.openWorkspaceDb(workspaceId);
    const globalDb = await this.openGlobalDb();
    const workspaceRows = dbAll<DbUnitRow>(
      workspaceDb,
      `
        SELECT *
        FROM memory_units
        WHERE workspace_id = ? AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 800
      `,
      workspaceId,
    ).map(toMemoryUnit);
    const globalRows = input.includeGlobalFallback === false
      ? []
      : dbAll<DbUnitRow>(
          globalDb,
          `
            SELECT *
            FROM memory_units
            WHERE scope = 'global' AND status = 'active'
            ORDER BY updated_at DESC
            LIMIT 400
          `,
        ).map(toMemoryUnit);

    const ranked = [...workspaceRows, ...globalRows]
      .filter((unit) => !tiers || tiers.has(unit.tier))
      .filter((unit) => !kinds || kinds.has(unit.kind))
      .map((unit) => ({
        unit,
        score: lexicalScore(unit, query),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);

    const items: DesktopMemorySearchItem[] = ranked.map((entry) => ({
      ...entry.unit,
      sourceScope: entry.unit.scope,
      usedAs: entry.unit.scope === "workspace" ? "primary" : "fallback",
      score: Number(entry.score.toFixed(6)),
      explain: `lexical+domain(${entry.unit.memoryDomain ?? "project_context"})+tier(${entry.unit.tier})+confidence(${entry.unit.confidence ?? 0})`,
    }));
    const traceId = createId("tr_mem");
    dbRun(
      workspaceDb,
      `
        INSERT INTO retrieval_traces (
          trace_id, workspace_id, query_text, selected_json, explain_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      traceId,
      workspaceId,
      query,
      JSON.stringify(items.map((item) => item.unitId)),
      JSON.stringify(
        items.map((item) => ({
          unitId: item.unitId,
          score: item.score,
          memoryDomain: item.memoryDomain,
        })),
      ),
      nowIso(),
    );

    return {
      traceId,
      items,
    };
  }

  private async searchGlobal(input: {
    query: string;
    topK?: number;
    tiers?: DesktopMemoryTier[];
    kinds?: DesktopMemoryKind[];
  }): Promise<DesktopMemorySearchResponse> {
    const query = input.query.trim();
    if (!query) {
      throw new DesktopMemoryServiceError("INVALID_ARGUMENT", "query is required", {
        field: "query",
      });
    }

    const topK = clamp(input.topK, 20, 1, 100);
    const tiers = input.tiers?.length ? new Set(input.tiers) : undefined;
    const kinds = input.kinds?.length ? new Set(input.kinds) : undefined;
    const db = await this.openGlobalDb();
    const globalRows = dbAll<DbUnitRow>(
      db,
      `
        SELECT *
        FROM memory_units
        WHERE scope = 'global' AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 800
      `,
    ).map(toMemoryUnit);

    const ranked = globalRows
      .filter((unit) => !tiers || tiers.has(unit.tier))
      .filter((unit) => !kinds || kinds.has(unit.kind))
      .map((unit) => ({
        unit,
        score: lexicalScore(unit, query),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);

    const items: DesktopMemorySearchItem[] = ranked.map((entry) => ({
      ...entry.unit,
      sourceScope: entry.unit.scope,
      usedAs: "primary",
      score: Number(entry.score.toFixed(6)),
      explain: `lexical+domain(${entry.unit.memoryDomain ?? "project_context"})+tier(${entry.unit.tier})+confidence(${entry.unit.confidence ?? 0})`,
    }));
    const traceId = createId("tr_mem");
    dbRun(
      db,
      `
        INSERT INTO retrieval_traces (
          trace_id, workspace_id, query_text, selected_json, explain_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      traceId,
      GLOBAL_MEMORY_CONTEXT_ID,
      query,
      JSON.stringify(items.map((item) => item.unitId)),
      JSON.stringify(
        items.map((item) => ({
          unitId: item.unitId,
          score: item.score,
          memoryDomain: item.memoryDomain,
        })),
      ),
      nowIso(),
    );

    return {
      traceId,
      items,
    };
  }

  private async searchAllWorkspaces(input: {
    query: string;
    topK?: number;
    tiers?: DesktopMemoryTier[];
    kinds?: DesktopMemoryKind[];
  }): Promise<DesktopMemorySearchResponse> {
    const query = input.query.trim();
    if (!query) {
      throw new DesktopMemoryServiceError("INVALID_ARGUMENT", "query is required", {
        field: "query",
      });
    }

    const topK = clamp(input.topK, 20, 1, 100);
    const tiers = input.tiers?.length ? new Set(input.tiers) : undefined;
    const kinds = input.kinds?.length ? new Set(input.kinds) : undefined;
    const workspaceIds = await this.listStoredWorkspaceIds();
    const workspaceRows = (
      await Promise.all(
        workspaceIds.map((workspaceId) => this.queryWorkspaceUnits({
          workspaceId,
          status: "active",
        })),
      )
    ).flat();

    const items: DesktopMemorySearchItem[] = workspaceRows
      .filter((unit) => !tiers || tiers.has(unit.tier))
      .filter((unit) => !kinds || kinds.has(unit.kind))
      .map((unit) => ({
        unit,
        score: lexicalScore(unit, query),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, topK)
      .map((entry) => ({
        ...entry.unit,
        sourceScope: entry.unit.scope,
        usedAs: "primary",
        score: Number(entry.score.toFixed(6)),
        explain: `lexical+domain(${entry.unit.memoryDomain ?? "project_context"})+tier(${entry.unit.tier})+confidence(${entry.unit.confidence ?? 0})`,
      }));

    return {
      traceId: createId("tr_mem"),
      items,
    };
  }

  private async searchAggregate(input: {
    query: string;
    topK?: number;
    tiers?: DesktopMemoryTier[];
    kinds?: DesktopMemoryKind[];
  }): Promise<DesktopMemorySearchResponse> {
    const query = input.query.trim();
    if (!query) {
      throw new DesktopMemoryServiceError("INVALID_ARGUMENT", "query is required", {
        field: "query",
      });
    }

    const topK = clamp(input.topK, 20, 1, 100);
    const tiers = input.tiers?.length ? new Set(input.tiers) : undefined;
    const kinds = input.kinds?.length ? new Set(input.kinds) : undefined;
    const [globalRows, workspaceRows] = await Promise.all([
      this.queryGlobalUnits({ status: "active" }),
      this.listAllWorkspaceUnits({ status: "active", limit: 500, offset: 0 }).then((result) => result.items),
    ]);

    const items: DesktopMemorySearchItem[] = [...globalRows, ...workspaceRows]
      .filter((unit) => !tiers || tiers.has(unit.tier))
      .filter((unit) => !kinds || kinds.has(unit.kind))
      .map((unit) => ({
        unit,
        score: lexicalScore(unit, query),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, topK)
      .map((entry) => ({
        ...entry.unit,
        sourceScope: entry.unit.scope,
        usedAs: "primary",
        score: Number(entry.score.toFixed(6)),
        explain: `lexical+domain(${entry.unit.memoryDomain ?? "project_context"})+tier(${entry.unit.tier})+confidence(${entry.unit.confidence ?? 0})`,
      }));

    return {
      traceId: createId("tr_mem"),
      items,
    };
  }

  private async patchWorkspaceUnit(input: {
    workspaceId: string;
    unitId: string;
    patch: DesktopMemoryPatchInput;
  }): Promise<DesktopMemoryUnit> {
    return this.runMutation(async () => {
      const workspaceId = this.sanitizeWorkspaceId(input.workspaceId);
      const unitId = input.unitId.trim();
      if (!unitId) {
        throw new DesktopMemoryServiceError("INVALID_ARGUMENT", "unitId is required", {
          field: "unitId",
        });
      }

      const db = await this.openWorkspaceDb(workspaceId);
      const current = dbGet<DbUnitRow>(
        db,
        `
          SELECT *
          FROM memory_units
          WHERE unit_id = ? AND workspace_id = ?
        `,
        unitId,
        workspaceId,
      );
      if (!current) {
        throw new DesktopMemoryServiceError("MEMORY_NOT_FOUND", "memory unit not found", {
          unitId,
          workspaceId,
        });
      }

      const currentUnit = toMemoryUnit(current);
      const kind =
        input.patch.kind !== undefined
          ? normalizeKind(input.patch.kind, currentUnit.kind)
          : currentUnit.kind;
      const domain =
        input.patch.memoryDomain !== undefined
          ? normalizeDomain(input.patch.memoryDomain)
            ?? currentUnit.memoryDomain
            ?? resolveDomain({ kind })
          : currentUnit.memoryDomain ?? resolveDomain({ kind });
      const tier =
        input.patch.tier !== undefined
          ? resolveTier({
              domain,
              requested: normalizeTier(input.patch.tier, currentUnit.tier),
            })
          : resolveTier({
              domain,
              requested: currentUnit.tier,
            });
      ensureTierDomainPolicy(domain, tier);

      const rawContent =
        typeof input.patch.rawContent === "string"
          ? input.patch.rawContent.trim()
          : typeof input.patch.content === "string"
            ? input.patch.content.trim()
            : currentUnit.rawContent;
      const summary =
        input.patch.summary === null
          ? undefined
          : typeof input.patch.summary === "string"
            ? input.patch.summary.trim() || undefined
            : currentUnit.summary;
      const status =
        input.patch.status !== undefined
          ? normalizeStatus(input.patch.status, currentUnit.status)
          : currentUnit.status;
      const confidence =
        input.patch.confidence !== undefined
          ? normalizeConfidence(input.patch.confidence)
          : currentUnit.confidence ?? null;
      const canonicalSlots =
        input.patch.canonicalSlots === null
          ? undefined
          : input.patch.canonicalSlots
            && typeof input.patch.canonicalSlots === "object"
            && !Array.isArray(input.patch.canonicalSlots)
              ? input.patch.canonicalSlots
              : currentUnit.canonicalSlots;
      const evidenceRefs =
        input.patch.evidenceRefs === null
          ? undefined
          : Array.isArray(input.patch.evidenceRefs)
            ? input.patch.evidenceRefs.filter(
                (item): item is Record<string, unknown> =>
                  !!item && typeof item === "object" && !Array.isArray(item),
              )
            : currentUnit.evidenceRefs;
      const updatedAt = nowIso();

      dbRun(
        db,
        `
          UPDATE memory_units
          SET tier = ?, kind = ?, raw_content = ?, summary = ?,
              canonical_slots_json = ?, evidence_refs_json = ?, confidence = ?,
              status = ?, memory_domain = ?, updated_at = ?
          WHERE unit_id = ? AND workspace_id = ?
        `,
        tier,
        kind,
        rawContent,
        summary ?? null,
        canonicalSlots ? JSON.stringify(canonicalSlots) : null,
        evidenceRefs ? JSON.stringify(evidenceRefs) : null,
        confidence,
        status,
        domain,
        updatedAt,
        unitId,
        workspaceId,
      );

      const next: DesktopMemoryUnit = {
        ...currentUnit,
        tier,
        kind,
        rawContent,
        summary,
        canonicalSlots,
        evidenceRefs,
        confidence: confidence ?? undefined,
        status,
        memoryDomain: domain,
        updatedAt,
      };

      await this.writeLog("info", "memory unit updated", {
        workspaceId,
        unitId,
      });

      return next;
    });
  }

  private async patchGlobalUnit(input: {
    unitId: string;
    patch: DesktopMemoryPatchInput;
  }): Promise<DesktopMemoryUnit> {
    return this.runMutation(async () => {
      const unitId = input.unitId.trim();
      if (!unitId) {
        throw new DesktopMemoryServiceError("INVALID_ARGUMENT", "unitId is required", {
          field: "unitId",
        });
      }

      const db = await this.openGlobalDb();
      const current = dbGet<DbUnitRow>(
        db,
        `
          SELECT *
          FROM memory_units
          WHERE unit_id = ? AND scope = 'global'
        `,
        unitId,
      );
      if (!current) {
        throw new DesktopMemoryServiceError("MEMORY_NOT_FOUND", "memory unit not found", {
          unitId,
          scope: "global",
        });
      }

      const currentUnit = toMemoryUnit(current);
      const kind =
        input.patch.kind !== undefined
          ? normalizeKind(input.patch.kind, currentUnit.kind)
          : currentUnit.kind;
      const domain =
        input.patch.memoryDomain !== undefined
          ? normalizeDomain(input.patch.memoryDomain)
            ?? currentUnit.memoryDomain
            ?? resolveDomain({ kind })
          : currentUnit.memoryDomain ?? resolveDomain({ kind });
      const tier =
        input.patch.tier !== undefined
          ? resolveTier({
              domain,
              requested: normalizeTier(input.patch.tier, currentUnit.tier),
            })
          : resolveTier({
              domain,
              requested: currentUnit.tier,
            });
      ensureTierDomainPolicy(domain, tier);

      const rawContent =
        typeof input.patch.rawContent === "string"
          ? input.patch.rawContent.trim()
          : typeof input.patch.content === "string"
            ? input.patch.content.trim()
            : currentUnit.rawContent;
      const summary =
        input.patch.summary === null
          ? undefined
          : typeof input.patch.summary === "string"
            ? input.patch.summary.trim() || undefined
            : currentUnit.summary;
      const status =
        input.patch.status !== undefined
          ? normalizeStatus(input.patch.status, currentUnit.status)
          : currentUnit.status;
      const confidence =
        input.patch.confidence !== undefined
          ? normalizeConfidence(input.patch.confidence)
          : currentUnit.confidence ?? null;
      const canonicalSlots =
        input.patch.canonicalSlots === null
          ? undefined
          : input.patch.canonicalSlots
            && typeof input.patch.canonicalSlots === "object"
            && !Array.isArray(input.patch.canonicalSlots)
              ? input.patch.canonicalSlots
              : currentUnit.canonicalSlots;
      const evidenceRefs =
        input.patch.evidenceRefs === null
          ? undefined
          : Array.isArray(input.patch.evidenceRefs)
            ? input.patch.evidenceRefs.filter(
                (item): item is Record<string, unknown> =>
                  !!item && typeof item === "object" && !Array.isArray(item),
              )
            : currentUnit.evidenceRefs;
      const updatedAt = nowIso();

      dbRun(
        db,
        `
          UPDATE memory_units
          SET tier = ?, kind = ?, raw_content = ?, summary = ?,
              canonical_slots_json = ?, evidence_refs_json = ?, confidence = ?,
              status = ?, memory_domain = ?, updated_at = ?
          WHERE unit_id = ? AND scope = 'global'
        `,
        tier,
        kind,
        rawContent,
        summary ?? null,
        canonicalSlots ? JSON.stringify(canonicalSlots) : null,
        evidenceRefs ? JSON.stringify(evidenceRefs) : null,
        confidence,
        status,
        domain,
        updatedAt,
        unitId,
      );

      const next: DesktopMemoryUnit = {
        ...currentUnit,
        tier,
        kind,
        rawContent,
        summary,
        canonicalSlots,
        evidenceRefs,
        confidence: confidence ?? undefined,
        status,
        memoryDomain: domain,
        updatedAt,
      };

      await this.writeLog("info", "global memory unit updated", {
        unitId,
        scope: "global",
      });

      return next;
    });
  }

  private async removeWorkspaceUnit(input: {
    workspaceId: string;
    unitId: string;
  }): Promise<DesktopMemoryDeleteResponse> {
    return this.runMutation(async () => {
      const workspaceId = this.sanitizeWorkspaceId(input.workspaceId);
      const unitId = input.unitId.trim();
      if (!unitId) {
        throw new DesktopMemoryServiceError("INVALID_ARGUMENT", "unitId is required", {
          field: "unitId",
        });
      }

      const db = await this.openWorkspaceDb(workspaceId);
      const row = dbGet<{ unit_id: string }>(
        db,
        `
          SELECT unit_id
          FROM memory_units
          WHERE unit_id = ? AND workspace_id = ?
        `,
        unitId,
        workspaceId,
      );
      if (!row) {
        throw new DesktopMemoryServiceError("MEMORY_NOT_FOUND", "memory unit not found", {
          unitId,
          workspaceId,
        });
      }

      dbRun(
        db,
        `
          UPDATE memory_units
          SET status = 'deleted', updated_at = ?
          WHERE unit_id = ? AND workspace_id = ?
        `,
        nowIso(),
        unitId,
        workspaceId,
      );

      await this.writeLog("warn", "memory unit deleted", {
        workspaceId,
        unitId,
      });

      return {
        deleted: true,
        unitId,
      };
    });
  }

  private async removeGlobalUnit(input: {
    unitId: string;
  }): Promise<DesktopMemoryDeleteResponse> {
    return this.runMutation(async () => {
      const unitId = input.unitId.trim();
      if (!unitId) {
        throw new DesktopMemoryServiceError("INVALID_ARGUMENT", "unitId is required", {
          field: "unitId",
        });
      }

      const db = await this.openGlobalDb();
      const row = dbGet<{ unit_id: string }>(
        db,
        `
          SELECT unit_id
          FROM memory_units
          WHERE unit_id = ? AND scope = 'global'
        `,
        unitId,
      );
      if (!row) {
        throw new DesktopMemoryServiceError("MEMORY_NOT_FOUND", "memory unit not found", {
          unitId,
          scope: "global",
        });
      }

      dbRun(
        db,
        `
          UPDATE memory_units
          SET status = 'deleted', updated_at = ?
          WHERE unit_id = ? AND scope = 'global'
        `,
        nowIso(),
        unitId,
      );

      await this.writeLog("warn", "global memory unit deleted", {
        unitId,
        scope: "global",
      });

      return {
        deleted: true,
        unitId,
      };
    });
  }

  private async previewWorkspaceMaintenance(input: {
    workspaceId: string;
    action?: string;
    criteria?: Record<string, unknown>;
  }): Promise<DesktopMemoryMaintenancePreview> {
    const workspaceId = this.sanitizeWorkspaceId(input.workspaceId);
    const action = input.action?.trim() || "cleanup";
    const criteria = input.criteria ?? {};
    const olderThanDays =
      typeof criteria.olderThanDays === "number"
        ? Math.max(1, criteria.olderThanDays)
        : 30;
    const boundary = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const db = await this.openWorkspaceDb(workspaceId);
    const selected = dbAll<{ unit_id: string }>(
      db,
      `
        SELECT unit_id
        FROM memory_units
        WHERE workspace_id = ?
          AND status = 'active'
          AND tier IN ('short', 'mid')
          AND kind NOT IN ('preference', 'habit', 'emotion', 'setting')
          AND updated_at < ?
        ORDER BY updated_at ASC
        LIMIT 500
      `,
      workspaceId,
      boundary,
    ).map((row) => row.unit_id);
    const runId = createId("mrn");
    const createdAt = nowIso();
    const summary = {
      scanned: selected.length,
      selected: selected.length,
      action,
      olderThanDays,
    };

    dbRun(
      db,
      `
        INSERT INTO maintenance_runs (
          run_id, workspace_id, action, mode, criteria_json, summary_json, selected_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, 'dry_run', ?, ?, ?, 'completed', ?, ?)
      `,
      runId,
      workspaceId,
      action,
      JSON.stringify(criteria),
      JSON.stringify(summary),
      JSON.stringify(selected),
      createdAt,
      createdAt,
    );

    await this.writeLog("info", "memory maintenance preview generated", {
      workspaceId,
      runId,
      selected: selected.length,
    });

    return {
      runId,
      mode: "dry_run",
      action,
      summary,
      selected,
    };
  }

  private async previewGlobalMaintenance(input: {
    action?: string;
    criteria?: Record<string, unknown>;
  }): Promise<DesktopMemoryMaintenancePreview> {
    const action = input.action?.trim() || "cleanup";
    const criteria = input.criteria ?? {};
    const olderThanDays =
      typeof criteria.olderThanDays === "number"
        ? Math.max(1, criteria.olderThanDays)
        : 30;
    const boundary = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const db = await this.openGlobalDb();
    const selected = dbAll<{ unit_id: string }>(
      db,
      `
        SELECT unit_id
        FROM memory_units
        WHERE scope = 'global'
          AND status = 'active'
          AND tier IN ('short', 'mid')
          AND kind NOT IN ('preference', 'habit', 'emotion', 'setting')
          AND updated_at < ?
        ORDER BY updated_at ASC
        LIMIT 500
      `,
      boundary,
    ).map((row) => row.unit_id);
    const runId = createId("mrn");
    const createdAt = nowIso();
    const summary = {
      scanned: selected.length,
      selected: selected.length,
      action,
      olderThanDays,
    };

    dbRun(
      db,
      `
        INSERT INTO maintenance_runs (
          run_id, workspace_id, action, mode, criteria_json, summary_json, selected_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, 'dry_run', ?, ?, ?, 'completed', ?, ?)
      `,
      runId,
      GLOBAL_MEMORY_CONTEXT_ID,
      action,
      JSON.stringify(criteria),
      JSON.stringify(summary),
      JSON.stringify(selected),
      createdAt,
      createdAt,
    );

    await this.writeLog("info", "global memory maintenance preview generated", {
      runId,
      selected: selected.length,
      scope: "global",
    });

    return {
      runId,
      mode: "dry_run",
      action,
      summary,
      selected,
    };
  }

  private async previewAllWorkspaceMaintenance(input: {
    action?: string;
    criteria?: Record<string, unknown>;
  }): Promise<DesktopMemoryMaintenancePreview> {
    const action = input.action?.trim() || "cleanup";
    const criteria = input.criteria ?? {};
    const olderThanDays =
      typeof criteria.olderThanDays === "number"
        ? Math.max(1, criteria.olderThanDays)
        : 30;
    const boundary = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const workspaceIds = await this.listStoredWorkspaceIds();
    const selected = (
      await Promise.all(
        workspaceIds.map((workspaceId) => this.selectWorkspaceMaintenanceUnitIds(workspaceId, boundary)),
      )
    ).flat();

    return {
      runId: createId("mrn"),
      mode: "dry_run",
      action,
      summary: {
        scanned: selected.length,
        selected: selected.length,
        action,
        olderThanDays,
      },
      selected,
    };
  }

  private async previewAggregateMaintenance(input: {
    workspaceId?: string;
    action?: string;
    criteria?: Record<string, unknown>;
  }): Promise<DesktopMemoryMaintenancePreview> {
    const action = input.action?.trim() || "cleanup";
    const criteria = input.criteria ?? {};
    const olderThanDays =
      typeof criteria.olderThanDays === "number"
        ? Math.max(1, criteria.olderThanDays)
        : 30;
    const boundary = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    const [globalSelected, workspaceSelected] = await Promise.all([
      this.selectGlobalMaintenanceUnitIds(boundary),
      input.workspaceId?.trim()
        ? this.selectWorkspaceMaintenanceUnitIds(input.workspaceId, boundary)
        : this.listStoredWorkspaceIds().then((workspaceIds) => Promise.all(
            workspaceIds.map((workspaceId) => this.selectWorkspaceMaintenanceUnitIds(workspaceId, boundary)),
          )).then((groups) => groups.flat()),
    ]);
    const selected = [...globalSelected, ...workspaceSelected];

    return {
      runId: createId("mrn"),
      mode: "dry_run",
      action,
      summary: {
        scanned: selected.length,
        selected: selected.length,
        action,
        olderThanDays,
      },
      selected,
    };
  }

  private async applyWorkspaceMaintenance(input: {
    workspaceId: string;
    runId: string;
  }): Promise<DesktopMemoryMaintenanceApply> {
    return this.runMutation(async () => {
      const workspaceId = this.sanitizeWorkspaceId(input.workspaceId);
      const runId = input.runId.trim();
      if (!runId) {
        throw new DesktopMemoryServiceError("INVALID_ARGUMENT", "runId is required", {
          field: "runId",
        });
      }

      const db = await this.openWorkspaceDb(workspaceId);
      const run = dbGet<MaintenanceRunRow>(
        db,
        `
          SELECT mode, status, selected_json
          FROM maintenance_runs
          WHERE run_id = ? AND workspace_id = ?
        `,
        runId,
        workspaceId,
      );
      if (!run) {
        throw new DesktopMemoryServiceError("MEMORY_NOT_FOUND", "maintenance run not found", {
          runId,
          workspaceId,
        });
      }
      if (run.mode !== "dry_run" || run.status !== "completed") {
        throw new DesktopMemoryServiceError(
          "MAINTENANCE_RUN_INVALID_STATE",
          "maintenance run is not applicable",
          {
            runId,
            mode: run.mode,
            status: run.status,
          },
        );
      }

      const selected = parseJson<string[]>(run.selected_json) ?? [];
      for (const unitId of selected) {
        dbRun(
          db,
          `
            UPDATE memory_units
            SET status = 'archived', updated_at = ?
            WHERE workspace_id = ? AND unit_id = ?
          `,
          nowIso(),
          workspaceId,
          unitId,
        );
      }

      dbRun(
        db,
        `
          UPDATE maintenance_runs
          SET mode = 'apply', status = 'completed', updated_at = ?
          WHERE run_id = ?
        `,
        nowIso(),
        runId,
      );

      await this.writeLog("warn", "memory maintenance applied", {
        workspaceId,
        runId,
        applied: selected.length,
      });

      return {
        runId,
        applied: selected.length,
        status: "completed",
      };
    });
  }

  private async applyGlobalMaintenance(input: {
    runId: string;
  }): Promise<DesktopMemoryMaintenanceApply> {
    return this.runMutation(async () => {
      const runId = input.runId.trim();
      if (!runId) {
        throw new DesktopMemoryServiceError("INVALID_ARGUMENT", "runId is required", {
          field: "runId",
        });
      }

      const db = await this.openGlobalDb();
      const run = dbGet<MaintenanceRunRow>(
        db,
        `
          SELECT mode, status, selected_json
          FROM maintenance_runs
          WHERE run_id = ? AND workspace_id = ?
        `,
        runId,
        GLOBAL_MEMORY_CONTEXT_ID,
      );
      if (!run) {
        throw new DesktopMemoryServiceError("MEMORY_NOT_FOUND", "maintenance run not found", {
          runId,
          scope: "global",
        });
      }
      if (run.mode !== "dry_run" || run.status !== "completed") {
        throw new DesktopMemoryServiceError(
          "MAINTENANCE_RUN_INVALID_STATE",
          "maintenance run is not applicable",
          {
            runId,
            mode: run.mode,
            status: run.status,
          },
        );
      }

      const selected = parseJson<string[]>(run.selected_json) ?? [];
      for (const unitId of selected) {
        dbRun(
          db,
          `
            UPDATE memory_units
            SET status = 'archived', updated_at = ?
            WHERE scope = 'global' AND unit_id = ?
          `,
          nowIso(),
          unitId,
        );
      }

      dbRun(
        db,
        `
          UPDATE maintenance_runs
          SET mode = 'apply', status = 'completed', updated_at = ?
          WHERE run_id = ?
        `,
        nowIso(),
        runId,
      );

      await this.writeLog("warn", "global memory maintenance applied", {
        runId,
        applied: selected.length,
        scope: "global",
      });

      return {
        runId,
        applied: selected.length,
        status: "completed",
      };
    });
  }

  private async listWorkspaceRetrievalTraces(input: {
    workspaceId: string;
    limit?: number;
    queryLike?: string;
    unitId?: string;
    from?: string;
    to?: string;
  }): Promise<DesktopMemoryTrace[]> {
    const workspaceId = this.sanitizeWorkspaceId(input.workspaceId);
    const limit = clamp(input.limit, 20, 1, 200);
    const db = await this.openWorkspaceDb(workspaceId);
    const clauses: string[] = ["workspace_id = ?"];
    const args: DbBinding[] = [workspaceId];

    if (input.queryLike?.trim()) {
      clauses.push("query_text LIKE ?");
      args.push(`%${input.queryLike.trim()}%`);
    }
    if (input.unitId?.trim()) {
      clauses.push("selected_json LIKE ?");
      args.push(`%${input.unitId.trim()}%`);
    }
    if (input.from?.trim()) {
      clauses.push("created_at >= ?");
      args.push(input.from.trim());
    }
    if (input.to?.trim()) {
      clauses.push("created_at <= ?");
      args.push(input.to.trim());
    }
    args.push(limit);

    const rows = dbAll<TraceRow>(
      db,
      `
        SELECT trace_id, workspace_id, query_text, selected_json, explain_json, created_at
        FROM retrieval_traces
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT ?
      `,
      ...args,
    );

    return rows.map((row) => ({
      traceId: row.trace_id,
      workspaceId: row.workspace_id,
      queryText: row.query_text,
      selected: parseJson<string[]>(row.selected_json) ?? [],
      explain:
        parseJson<Array<{ unitId: string; score: number; memoryDomain?: DesktopMemoryDomain }>>(
          row.explain_json,
        ) ?? [],
      createdAt: row.created_at,
    }));
  }

  private async listGlobalRetrievalTraces(input: {
    limit?: number;
    queryLike?: string;
    unitId?: string;
    from?: string;
    to?: string;
  }): Promise<DesktopMemoryTrace[]> {
    const limit = clamp(input.limit, 20, 1, 200);
    const db = await this.openGlobalDb();
    const clauses: string[] = ["workspace_id = ?"];
    const args: DbBinding[] = [GLOBAL_MEMORY_CONTEXT_ID];

    if (input.queryLike?.trim()) {
      clauses.push("query_text LIKE ?");
      args.push(`%${input.queryLike.trim()}%`);
    }
    if (input.unitId?.trim()) {
      clauses.push("selected_json LIKE ?");
      args.push(`%${input.unitId.trim()}%`);
    }
    if (input.from?.trim()) {
      clauses.push("created_at >= ?");
      args.push(input.from.trim());
    }
    if (input.to?.trim()) {
      clauses.push("created_at <= ?");
      args.push(input.to.trim());
    }
    args.push(limit);

    const rows = dbAll<TraceRow>(
      db,
      `
        SELECT trace_id, workspace_id, query_text, selected_json, explain_json, created_at
        FROM retrieval_traces
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT ?
      `,
      ...args,
    );

    return rows.map((row) => ({
      traceId: row.trace_id,
      workspaceId: row.workspace_id,
      queryText: row.query_text,
      selected: parseJson<string[]>(row.selected_json) ?? [],
      explain:
        parseJson<Array<{ unitId: string; score: number; memoryDomain?: DesktopMemoryDomain }>>(
          row.explain_json,
        ) ?? [],
      createdAt: row.created_at,
    }));
  }

  private async getWorkspaceRuntimeContext(input: {
    workspaceId: string;
    query?: string;
  }): Promise<DesktopMemoryRuntimeContext> {
    const workspaceId = this.sanitizeWorkspaceId(input.workspaceId);
    const query = input.query?.trim() || DEFAULT_RUNTIME_CONTEXT_QUERY;
    const result = await this.searchWorkspace({
      workspaceId,
      query,
      topK: 12,
      includeGlobalFallback: true,
      tiers: ["short", "mid", "long"],
      kinds: [
        "preference",
        "habit",
        "setting",
        "emotion",
        "agent_handoff",
        "decision",
        "constraint",
      ],
    });

    return {
      workspaceId,
      query,
      traceId: result.traceId,
      items: result.items.map((item) => ({
        unitId: item.unitId,
        summary: item.summary || item.rawContent.slice(0, 160),
        kind: item.kind,
        tier: item.tier,
        sourceScope: item.sourceScope,
        memoryDomain: item.memoryDomain,
        score: item.score,
      })),
    };
  }

  private async getGlobalRuntimeContext(input: {
    query?: string;
  }): Promise<DesktopMemoryRuntimeContext> {
    const query = input.query?.trim() || DEFAULT_RUNTIME_CONTEXT_QUERY;
    const result = await this.searchGlobal({
      query,
      topK: 12,
      tiers: ["short", "mid", "long"],
      kinds: [
        "preference",
        "habit",
        "setting",
        "emotion",
        "agent_handoff",
        "decision",
        "constraint",
      ],
    });

    return {
      workspaceId: undefined,
      query,
      traceId: result.traceId,
      items: result.items.map((item) => ({
        unitId: item.unitId,
        summary: item.summary || item.rawContent.slice(0, 160),
        kind: item.kind,
        tier: item.tier,
        sourceScope: item.sourceScope,
        memoryDomain: item.memoryDomain,
        score: item.score,
      })),
    };
  }

  private async getAllWorkspaceRuntimeContext(input: {
    query?: string;
  }): Promise<DesktopMemoryRuntimeContext> {
    const query = input.query?.trim() || DEFAULT_RUNTIME_CONTEXT_QUERY;
    const result = await this.searchAllWorkspaces({
      query,
      topK: 12,
      tiers: ["short", "mid", "long"],
      kinds: [
        "preference",
        "habit",
        "setting",
        "emotion",
        "agent_handoff",
        "decision",
        "constraint",
      ],
    });

    return {
      workspaceId: undefined,
      query,
      traceId: result.traceId,
      items: result.items.map((item) => ({
        unitId: item.unitId,
        summary: item.summary || item.rawContent.slice(0, 160),
        kind: item.kind,
        tier: item.tier,
        sourceScope: item.sourceScope,
        memoryDomain: item.memoryDomain,
        score: item.score,
      })),
    };
  }

  private async getAggregateRuntimeContext(input: {
    query?: string;
  }): Promise<DesktopMemoryRuntimeContext> {
    const query = input.query?.trim() || DEFAULT_RUNTIME_CONTEXT_QUERY;
    const result = await this.searchAggregate({
      query,
      topK: 12,
      tiers: ["short", "mid", "long"],
      kinds: [
        "preference",
        "habit",
        "setting",
        "emotion",
        "agent_handoff",
        "decision",
        "constraint",
      ],
    });

    return {
      workspaceId: undefined,
      query,
      traceId: result.traceId,
      items: result.items.map((item) => ({
        unitId: item.unitId,
        summary: item.summary || item.rawContent.slice(0, 160),
        kind: item.kind,
        tier: item.tier,
        sourceScope: item.sourceScope,
        memoryDomain: item.memoryDomain,
        score: item.score,
      })),
    };
  }

  private async selectWorkspaceMaintenanceUnitIds(workspaceId: string, boundary: string): Promise<string[]> {
    const sanitizedWorkspaceId = this.sanitizeWorkspaceId(workspaceId);
    const db = await this.openWorkspaceDb(sanitizedWorkspaceId);

    return dbAll<{ unit_id: string }>(
      db,
      `
        SELECT unit_id
        FROM memory_units
        WHERE workspace_id = ?
          AND status = 'active'
          AND tier IN ('short', 'mid')
          AND kind NOT IN ('preference', 'habit', 'emotion', 'setting')
          AND updated_at < ?
        ORDER BY updated_at ASC
        LIMIT 500
      `,
      sanitizedWorkspaceId,
      boundary,
    ).map((row) => row.unit_id);
  }

  private async selectGlobalMaintenanceUnitIds(boundary: string): Promise<string[]> {
    const db = await this.openGlobalDb();

    return dbAll<{ unit_id: string }>(
      db,
      `
        SELECT unit_id
        FROM memory_units
        WHERE scope = 'global'
          AND status = 'active'
          AND tier IN ('short', 'mid')
          AND kind NOT IN ('preference', 'habit', 'emotion', 'setting')
          AND updated_at < ?
        ORDER BY updated_at ASC
        LIMIT 500
      `,
      boundary,
    ).map((row) => row.unit_id);
  }
}