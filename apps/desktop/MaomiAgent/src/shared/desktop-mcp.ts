export const DESKTOP_MCP_SCOPE_VALUES = ["global", "workspace"] as const;
export type DesktopMcpScope = (typeof DESKTOP_MCP_SCOPE_VALUES)[number];

export const DESKTOP_MCP_TRANSPORT_VALUES = ["stdio", "http-streamable", "sse"] as const;
export type DesktopMcpTransport = (typeof DESKTOP_MCP_TRANSPORT_VALUES)[number];

export const DESKTOP_MCP_HEALTH_STATUS_VALUES = ["healthy", "warning", "down"] as const;
export type DesktopMcpHealthStatus = (typeof DESKTOP_MCP_HEALTH_STATUS_VALUES)[number];

export const DESKTOP_MCP_LIST_STATUS_VALUES = [
  ...DESKTOP_MCP_HEALTH_STATUS_VALUES,
  "disabled",
] as const;
export type DesktopMcpListStatus = (typeof DESKTOP_MCP_LIST_STATUS_VALUES)[number];

export const DESKTOP_MCP_AUTH_MODE_VALUES = ["none", "token", "basic", "custom"] as const;
export type DesktopMcpAuthMode = (typeof DESKTOP_MCP_AUTH_MODE_VALUES)[number];

export const DESKTOP_MCP_RUNTIME_SOURCE_VALUES = ["managed", "builtin", "extension"] as const;
export type DesktopMcpRuntimeSource = (typeof DESKTOP_MCP_RUNTIME_SOURCE_VALUES)[number];

export const MIN_DESKTOP_MCP_REQUEST_TIMEOUT_MS = 1_000;
export const DEFAULT_DESKTOP_MCP_REQUEST_TIMEOUT_MS = 30_000;
export const MAX_DESKTOP_MCP_REQUEST_TIMEOUT_MS = 120_000;

export function clampDesktopMcpRequestTimeoutMs(timeoutMs?: number): number {
  return Math.min(
    Math.max(
      timeoutMs ?? DEFAULT_DESKTOP_MCP_REQUEST_TIMEOUT_MS,
      MIN_DESKTOP_MCP_REQUEST_TIMEOUT_MS,
    ),
    MAX_DESKTOP_MCP_REQUEST_TIMEOUT_MS,
  );
}

export type DesktopMcpRuntimeLocalEntry = {
  type: "local";
  command: string[];
  environment?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
};

export type DesktopMcpRuntimeRemoteEntry = {
  type: "remote";
  url: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
};

export type DesktopMcpRuntimeEntry = DesktopMcpRuntimeLocalEntry | DesktopMcpRuntimeRemoteEntry;
export type DesktopMcpRuntimeConfig = Record<string, DesktopMcpRuntimeEntry>;

export type DesktopMcpAuth = {
  mode: DesktopMcpAuthMode;
  token?: string;
  username?: string;
  password?: string;
  custom?: Record<string, unknown>;
};

export type DesktopMcpRetry = {
  maxAttempts?: number;
  backoffMs?: number;
};

export type DesktopMcpItem = {
  id: string;
  name: string;
  scope: DesktopMcpScope;
  workspaceId?: string;
  transport: DesktopMcpTransport;
  endpoint: string;
  enabled: boolean;
  auth: DesktopMcpAuth;
  timeoutMs?: number;
  retry?: DesktopMcpRetry;
  concurrencyHint?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type DesktopMcpHealthRecord = {
  recordId: string;
  mcpId: string;
  status: DesktopMcpHealthStatus;
  latencyMs: number;
  checkedAt: string;
  reasonCode?: string;
  message?: string;
};

export type DesktopMcpView = Omit<DesktopMcpItem, "auth"> & {
  auth: {
    mode: DesktopMcpAuthMode;
  };
  runtimeSource?: DesktopMcpRuntimeSource;
  runtimeOwnerId?: string;
  runtimeProviderId?: string;
  health?: {
    status: DesktopMcpHealthStatus;
    checkedAt: string;
    reasonCode?: string;
    message?: string;
    latencyMs?: number;
  };
};

export type DesktopMcpEffectiveRow = {
  effectiveId: string;
  winnerScope: DesktopMcpScope;
  winnerMcpId: string;
  shadowedMcpId?: string;
  explain: string;
  item: DesktopMcpView;
};

export type DesktopMcpToolDescriptor = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type DesktopMcpCapabilityProbeResult = {
  status: DesktopMcpHealthStatus;
  latencyMs: number;
  reasonCode?: string;
  message?: string;
  tools: string[];
  toolDetails: DesktopMcpToolDescriptor[];
  toolsReasonCode?: string;
  toolsMessage?: string;
};

export type DesktopMcpListParams = {
  scope?: "global" | "workspace" | "effective";
  workspaceId?: string;
  status?: DesktopMcpListStatus;
  q?: string;
  limit?: number;
  offset?: number;
};

export type DesktopMcpDraftInput = Partial<Omit<DesktopMcpItem, "id" | "createdAt" | "updatedAt">> & {
  auth?: Partial<DesktopMcpAuth>;
};

export type DesktopMcpListResponse = {
  items: DesktopMcpView[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

export type DesktopMcpEffectiveResponse = {
  items: DesktopMcpEffectiveRow[];
};

export type DesktopMcpCreateResponse = {
  item: DesktopMcpView;
  created: boolean;
};

export type DesktopMcpDeleteResponse = {
  deleted: boolean;
  mcpId: string;
};

export type DesktopMcpHealthHistoryResponse = {
  items: DesktopMcpHealthRecord[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

export type DesktopMcpTestConnectionResult = {
  status: DesktopMcpHealthStatus;
  latencyMs: number;
  reasonCode?: string;
  message?: string;
};

export type DesktopMcpRecommendedItem = {
  id: string;
  name: string;
  title: string;
  description: string;
  transport: DesktopMcpTransport;
  endpoint: string;
  enabled: boolean;
  timeoutMs?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  installed: boolean;
};

export const DESKTOP_MCP_MARKET_PROVIDER_VALUES = ["official", "smithery", "pulsemcp"] as const;
export type DesktopMcpMarketProviderId = (typeof DESKTOP_MCP_MARKET_PROVIDER_VALUES)[number];

export type DesktopMcpMarketProvider = {
  id: DesktopMcpMarketProviderId;
  label: string;
};

export const DESKTOP_MCP_MARKET_INSTALL_STRATEGY_VALUES = ["remote", "npm-stdio"] as const;
export type DesktopMcpMarketInstallStrategy = (typeof DESKTOP_MCP_MARKET_INSTALL_STRATEGY_VALUES)[number];

export type DesktopMcpMarketItem = {
  provider: DesktopMcpMarketProviderId;
  platform: DesktopMcpMarketProviderId;
  catalogId: string;
  serverName: string;
  version?: string;
  title: string;
  description?: string;
  repositoryUrl?: string;
  websiteUrl?: string;
  tags?: string[];
  transport: DesktopMcpTransport;
  endpoint: string;
  strategy: DesktopMcpMarketInstallStrategy;
};

export type DesktopMcpMarketIntentItem = DesktopMcpMarketItem & {
  score: number;
  matchedTerms: string[];
  reasons: string[];
};

export type DesktopMcpMarketSearchQuery = {
  provider?: DesktopMcpMarketProviderId;
  q?: string;
  limit?: number;
};

export type DesktopMcpMarketRequirementQuery = {
  provider?: DesktopMcpMarketProviderId;
  requirement?: string;
  limit?: number;
};

export type DesktopMcpMarketProvidersResponse = {
  items: DesktopMcpMarketProvider[];
};

export type DesktopMcpMarketSearchResponse = {
  provider: DesktopMcpMarketProviderId;
  items: DesktopMcpMarketItem[];
  providers: DesktopMcpMarketProvider[];
};

export type DesktopMcpMarketInstallInput = {
  provider?: DesktopMcpMarketProviderId;
  catalogId?: string;
  enabled?: boolean;
};

export type DesktopMcpMarketInstallResponse = {
  provider: DesktopMcpMarketProviderId;
  catalogId: string;
  item: DesktopMcpView;
  created: boolean;
};

export type DesktopMcpMarketSearchByRequirementResponse = {
  provider: DesktopMcpMarketProviderId;
  requirement: string;
  queries: string[];
  terms: string[];
  items: DesktopMcpMarketIntentItem[];
  providers: DesktopMcpMarketProvider[];
};

export type DesktopMcpMarketAutoInstallInput = {
  provider?: DesktopMcpMarketProviderId;
  requirement?: string;
  limit?: number;
  enabled?: boolean;
};

export type DesktopMcpMarketAutoInstallResponse = {
  provider: DesktopMcpMarketProviderId;
  requirement: string;
  queries: string[];
  terms: string[];
  selected: DesktopMcpMarketIntentItem;
  candidates: DesktopMcpMarketIntentItem[];
  installation: DesktopMcpMarketInstallResponse;
};

export type DesktopMcpErrorResponse = {
  ok: false;
  code: string;
  message: string;
  data?: Record<string, unknown>;
};
