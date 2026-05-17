export const DESKTOP_MEMORY_SCOPE_VALUES = ["workspace", "global"] as const;

export type DesktopMemoryScope = (typeof DESKTOP_MEMORY_SCOPE_VALUES)[number];

export const DESKTOP_MEMORY_SCOPE_FILTER_VALUES = ["all", "global", "workspace"] as const;

export type DesktopMemoryScopeFilter = (typeof DESKTOP_MEMORY_SCOPE_FILTER_VALUES)[number];

export const DESKTOP_MEMORY_TIER_VALUES = ["short", "mid", "long"] as const;

export type DesktopMemoryTier = (typeof DESKTOP_MEMORY_TIER_VALUES)[number];

export const DESKTOP_MEMORY_KIND_VALUES = [
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
] as const;

export type DesktopMemoryKind = (typeof DESKTOP_MEMORY_KIND_VALUES)[number];

export const DESKTOP_MEMORY_STATUS_VALUES = [
  "active",
  "conflicted",
  "archived",
  "deleted",
] as const;

export type DesktopMemoryStatus = (typeof DESKTOP_MEMORY_STATUS_VALUES)[number];

export const DESKTOP_MEMORY_DOMAIN_VALUES = [
  "user_profile",
  "project_context",
  "agent_collaboration",
] as const;

export type DesktopMemoryDomain = (typeof DESKTOP_MEMORY_DOMAIN_VALUES)[number];

export type DesktopMemoryUnit = {
  unitId: string;
  scope: DesktopMemoryScope;
  workspaceId?: string;
  tier: DesktopMemoryTier;
  kind: DesktopMemoryKind;
  rawContent: string;
  summary?: string;
  canonicalSlots?: Record<string, unknown>;
  evidenceRefs?: Array<Record<string, unknown>>;
  confidence?: number;
  status: DesktopMemoryStatus;
  memoryDomain?: DesktopMemoryDomain;
  createdAt: string;
  updatedAt: string;
};

export type DesktopMemoryListQuery = {
  scopeFilter?: DesktopMemoryScopeFilter;
  q?: string;
  tiers?: DesktopMemoryTier[];
  kinds?: DesktopMemoryKind[];
  status?: DesktopMemoryStatus;
  includeGlobal?: boolean;
  limit?: number;
  offset?: number;
};

export type DesktopMemoryTraceListQuery = {
  limit?: number;
  queryLike?: string;
  unitId?: string;
  from?: string;
  to?: string;
};

export type DesktopMemoryProjectionQuery = DesktopMemoryListQuery & {
  unitsLimit?: number;
  unitsOffset?: number;
  traceLimit?: number;
  traceQueryLike?: string;
  traceUnitId?: string;
  traceFrom?: string;
  traceTo?: string;
  runtimeQuery?: string;
};

export type DesktopMemorySearchQuery = {
  scopeFilter?: DesktopMemoryScopeFilter;
  query: string;
  topK?: number;
  tiers?: DesktopMemoryTier[];
  kinds?: DesktopMemoryKind[];
  includeGlobalFallback?: boolean;
};

export type DesktopMemoryListResponse = {
  items: DesktopMemoryUnit[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

export type DesktopMemoryDeleteResponse = {
  deleted: boolean;
  unitId: string;
};

export type DesktopMemorySearchItem = DesktopMemoryUnit & {
  sourceScope: DesktopMemoryScope;
  usedAs: "primary" | "fallback";
  score: number;
  explain: string;
};

export type DesktopMemorySearchResponse = {
  traceId: string;
  items: DesktopMemorySearchItem[];
};

export type DesktopMemoryWorkingSetPullQuery = {
  runId: string;
  agentId?: string;
  topK?: number;
};

export type DesktopMemoryWorkingSetDeltaItem = {
  kind?: DesktopMemoryKind;
  content: string;
  confidence?: number;
  canonicalSlots?: Record<string, unknown>;
};

export type DesktopMemoryWorkingSetPushInput = {
  runId: string;
  agentId: string;
  frameVersion?: number;
  delta: DesktopMemoryWorkingSetDeltaItem[];
};

export type DesktopMemoryWorkingSetPullResult = {
  frameVersion: number;
  frameSnapshot: Array<Record<string, unknown>>;
  items: DesktopMemoryUnit[];
};

export type DesktopMemoryWorkingSetPushResult = {
  frameId: string;
  frameVersion: number;
  accepted: number;
  ackTraceId: string;
};

export type DesktopMemoryTraceExplainItem = {
  unitId: string;
  score: number;
  memoryDomain?: DesktopMemoryDomain;
};

export type DesktopMemoryTrace = {
  traceId: string;
  workspaceId: string;
  queryText: string;
  selected: string[];
  explain: DesktopMemoryTraceExplainItem[];
  createdAt: string;
};

export type DesktopMemoryRuntimeContextItem = {
  unitId: string;
  summary: string;
  kind?: string;
  tier?: string;
  sourceScope?: string;
  memoryDomain?: DesktopMemoryDomain;
  score?: number;
};

export type DesktopMemoryRuntimeContext = {
  workspaceId?: string;
  query: string;
  traceId?: string;
  items: DesktopMemoryRuntimeContextItem[];
};

export type DesktopMemoryProjection = {
  workspaceId?: string;
  units: DesktopMemoryListResponse;
  traces: {
    items: DesktopMemoryTrace[];
    limit: number;
  };
  runtimeContext: DesktopMemoryRuntimeContext;
  summary: {
    unitTotal: number;
    traceCount: number;
    runtimeItems: number;
  };
};

export type DesktopMemoryAppendInput = {
  scope?: DesktopMemoryScope;
  workspaceId?: string;
  content?: string;
  rawContent?: string;
  summary?: string;
  tier?: DesktopMemoryTier;
  kind?: DesktopMemoryKind;
  memoryDomain?: DesktopMemoryDomain;
  confidence?: number;
  status?: DesktopMemoryStatus;
  canonicalSlots?: Record<string, unknown>;
  evidenceRefs?: Array<Record<string, unknown>>;
};

export type DesktopMemoryPatchInput = {
  content?: string;
  rawContent?: string;
  summary?: string | null;
  tier?: DesktopMemoryTier;
  kind?: DesktopMemoryKind;
  memoryDomain?: DesktopMemoryDomain;
  confidence?: number | null;
  status?: DesktopMemoryStatus;
  canonicalSlots?: Record<string, unknown> | null;
  evidenceRefs?: Array<Record<string, unknown>> | null;
};

export type DesktopMemoryMaintenanceRequest = {
  scopeFilter?: DesktopMemoryScopeFilter;
  action?: string;
  criteria?: Record<string, unknown>;
};

export type DesktopMemoryMaintenancePreview = {
  runId: string;
  mode: string;
  action: string;
  summary: {
    scanned: number;
    selected: number;
    action: string;
    olderThanDays: number;
  };
  selected: string[];
};

export type DesktopMemoryMaintenanceApply = {
  runId: string;
  applied: number;
  status: string;
};

export type DesktopMemoryAgentMemoryPack = {
  workspaceId?: string;
  runId?: string;
  agentId?: string;
  query: string;
  promptContext: string;
  retrieval: {
    workspaceId?: string;
    query: string;
    items: DesktopMemoryRuntimeContextItem[];
  };
  workingSet: {
    frameVersion: number;
    items: DesktopMemoryUnit[];
  };
};

export type DesktopMemoryErrorResponse = {
  ok: false;
  code: string;
  message: string;
  data?: Record<string, unknown>;
};

export const DESKTOP_BUILTIN_MEMORY_MCP_PROVIDER_ID = "desktop.builtin.memory";
export const DESKTOP_BUILTIN_MEMORY_MCP_OWNER_ID = "maomiagent.desktop.memory";
export const DESKTOP_BUILTIN_MEMORY_MCP_NAME = "maomi_memory";