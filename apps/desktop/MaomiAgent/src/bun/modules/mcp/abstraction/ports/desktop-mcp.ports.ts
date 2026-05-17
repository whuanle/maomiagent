import type {
  DesktopMcpCapabilityProbeResult,
  DesktopMcpCreateResponse,
  DesktopMcpDeleteResponse,
  DesktopMcpDraftInput,
  DesktopMcpEffectiveResponse,
  DesktopMcpHealthHistoryResponse,
  DesktopMcpListParams,
  DesktopMcpListResponse,
  DesktopMcpMarketAutoInstallInput,
  DesktopMcpMarketAutoInstallResponse,
  DesktopMcpMarketInstallInput,
  DesktopMcpMarketInstallResponse,
  DesktopMcpMarketProvidersResponse,
  DesktopMcpMarketRequirementQuery,
  DesktopMcpMarketSearchByRequirementResponse,
  DesktopMcpMarketSearchQuery,
  DesktopMcpMarketSearchResponse,
  DesktopMcpRecommendedItem,
  DesktopMcpRuntimeConfig,
  DesktopMcpTestConnectionResult,
  DesktopMcpView,
} from "../models/desktop-mcp.models";

export type DesktopMcpRuntimeTool = {
  mcpId: string;
  mcpName: string;
  toolName: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  timeoutMs: number;
};

export type DesktopMcpQueryPort = {
  list(params?: DesktopMcpListParams): Promise<DesktopMcpListResponse>;
  effective(params: { workspaceId: string; q?: string; status?: string }): Promise<DesktopMcpEffectiveResponse>;
  recommended(): Promise<DesktopMcpRecommendedItem[]>;
  healthHistory(params: { mcpId: string; limit?: number; offset?: number }): Promise<DesktopMcpHealthHistoryResponse>;
  runtimeConfig(params?: { workspaceId?: string }): Promise<DesktopMcpRuntimeConfig>;
  runtimeTools(params?: { workspaceId?: string }): Promise<DesktopMcpRuntimeTool[]>;
};

export type DesktopMcpCommandPort = {
  create(input: DesktopMcpDraftInput): Promise<DesktopMcpCreateResponse>;
  patch(mcpId: string, input: DesktopMcpDraftInput): Promise<DesktopMcpView>;
  delete(mcpId: string): Promise<DesktopMcpDeleteResponse>;
  testConnection(mcpId: string): Promise<DesktopMcpTestConnectionResult>;
  healthCheck(mcpId: string): Promise<DesktopMcpTestConnectionResult>;
  capabilities(mcpId: string): Promise<DesktopMcpCapabilityProbeResult>;
  executeRuntimeTool(input: {
    workspaceId?: string;
    mcpName: string;
    toolName: string;
    arguments?: Record<string, unknown>;
    timeoutMs?: number;
  }): Promise<unknown>;
  installRecommended(id: string, input?: { scope?: string; workspaceId?: string }): Promise<DesktopMcpCreateResponse>;
};

export type DesktopMcpMarketPort = {
  providers(): Promise<DesktopMcpMarketProvidersResponse>;
  search(input?: DesktopMcpMarketSearchQuery): Promise<DesktopMcpMarketSearchResponse>;
  searchByRequirement(input?: DesktopMcpMarketRequirementQuery): Promise<DesktopMcpMarketSearchByRequirementResponse>;
  install(input: DesktopMcpMarketInstallInput): Promise<DesktopMcpMarketInstallResponse>;
  autoInstallByRequirement(input: DesktopMcpMarketAutoInstallInput): Promise<DesktopMcpMarketAutoInstallResponse>;
};

export type DesktopMcpPort = DesktopMcpQueryPort & DesktopMcpCommandPort & DesktopMcpMarketPort;
