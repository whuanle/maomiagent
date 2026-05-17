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
} from "../../shared/desktop-mcp";
import { DESKTOP_WINDOW_BRIDGE_READY_EVENT } from "./desktop-window";

export type McpCapabilityProbeResult = DesktopMcpCapabilityProbeResult;
export type McpHealthRecord = import("../../shared/desktop-mcp").DesktopMcpHealthRecord;
export type McpHealthStatus = import("../../shared/desktop-mcp").DesktopMcpHealthStatus;
export type McpMarketItem = import("../../shared/desktop-mcp").DesktopMcpMarketItem;
export type McpMarketProvider = import("../../shared/desktop-mcp").DesktopMcpMarketProvider;
export type McpMarketProviderId = import("../../shared/desktop-mcp").DesktopMcpMarketProviderId;
export type McpRecommendedItem = DesktopMcpRecommendedItem;
export type McpScope = import("../../shared/desktop-mcp").DesktopMcpScope;
export type McpTransport = import("../../shared/desktop-mcp").DesktopMcpTransport;
export type McpView = DesktopMcpView;

type DesktopMcpBridge = {
  listDesktopMcp: (query?: DesktopMcpListParams) => Promise<DesktopMcpListResponse>;
  getDesktopMcpEffective: (params: { workspaceId: string; q?: string; status?: string }) => Promise<DesktopMcpEffectiveResponse>;
  listDesktopMcpRecommended: () => Promise<DesktopMcpRecommendedItem[]>;
  createDesktopMcp: (input: DesktopMcpDraftInput) => Promise<DesktopMcpCreateResponse>;
  patchDesktopMcp: (mcpId: string, input: DesktopMcpDraftInput) => Promise<DesktopMcpView>;
  deleteDesktopMcp: (mcpId: string) => Promise<DesktopMcpDeleteResponse>;
  testDesktopMcpConnection: (mcpId: string) => Promise<DesktopMcpTestConnectionResult>;
  healthCheckDesktopMcp: (mcpId: string) => Promise<DesktopMcpTestConnectionResult>;
  fetchDesktopMcpCapabilities: (mcpId: string) => Promise<DesktopMcpCapabilityProbeResult>;
  listDesktopMcpHealthHistory: (params: { mcpId: string; limit?: number; offset?: number }) => Promise<DesktopMcpHealthHistoryResponse>;
  getDesktopMcpRuntimeConfig: (params?: { workspaceId?: string }) => Promise<DesktopMcpRuntimeConfig>;
  installDesktopMcpRecommended: (id: string, input?: { scope?: string; workspaceId?: string }) => Promise<DesktopMcpCreateResponse>;
  listDesktopMcpMarketProviders: () => Promise<DesktopMcpMarketProvidersResponse>;
  searchDesktopMcpMarket: (input?: DesktopMcpMarketSearchQuery) => Promise<DesktopMcpMarketSearchResponse>;
  searchDesktopMcpMarketByRequirement: (input?: DesktopMcpMarketRequirementQuery) => Promise<DesktopMcpMarketSearchByRequirementResponse>;
  installDesktopMcpMarket: (input: DesktopMcpMarketInstallInput) => Promise<DesktopMcpMarketInstallResponse>;
  autoInstallDesktopMcpMarketByRequirement: (input: DesktopMcpMarketAutoInstallInput) => Promise<DesktopMcpMarketAutoInstallResponse>;
};

export type DesktopMcpMutationAction =
  | "created"
  | "updated"
  | "deleted"
  | "health-checked"
  | "recommended-installed"
  | "market-installed";

export type DesktopMcpMutationEvent = {
  action: DesktopMcpMutationAction;
  mcpId?: string;
  at: string;
};

declare global {
  interface Window {
    maomiDesktopMcp?: DesktopMcpBridge;
  }
}

export const DESKTOP_MCP_BRIDGE_READY_EVENT = DESKTOP_WINDOW_BRIDGE_READY_EVENT;
export const DESKTOP_MCP_INVALIDATED_EVENT = "maomi:desktop-mcp-invalidated";

function getDesktopMcpBridge(): DesktopMcpBridge {
  const bridge = window.maomiDesktopMcp;
  if (!bridge) {
    throw new Error("Desktop MCP bridge is unavailable.");
  }
  return bridge;
}

function emitDesktopMcpInvalidated(action: DesktopMcpMutationAction, mcpId?: string): void {
  window.dispatchEvent(new CustomEvent<DesktopMcpMutationEvent>(
    DESKTOP_MCP_INVALIDATED_EVENT,
    { detail: { action, mcpId, at: new Date().toISOString() } },
  ));
}

export function hasDesktopMcpBridge(): boolean {
  return Boolean(window.maomiDesktopMcp);
}

export function listDesktopMcp(query: DesktopMcpListParams = {}): Promise<DesktopMcpListResponse> {
  return getDesktopMcpBridge().listDesktopMcp(query);
}

export function getDesktopMcpEffective(params: { workspaceId: string; q?: string; status?: string }): Promise<DesktopMcpEffectiveResponse> {
  return getDesktopMcpBridge().getDesktopMcpEffective(params);
}

export function listDesktopMcpRecommended(): Promise<DesktopMcpRecommendedItem[]> {
  return getDesktopMcpBridge().listDesktopMcpRecommended();
}

export async function createDesktopMcp(input: DesktopMcpDraftInput): Promise<DesktopMcpCreateResponse> {
  const response = await getDesktopMcpBridge().createDesktopMcp(input);
  emitDesktopMcpInvalidated("created", response.item.id);
  return response;
}

export async function patchDesktopMcp(mcpId: string, input: DesktopMcpDraftInput): Promise<DesktopMcpView> {
  const item = await getDesktopMcpBridge().patchDesktopMcp(mcpId, input);
  emitDesktopMcpInvalidated("updated", item.id);
  return item;
}

export async function deleteDesktopMcp(mcpId: string): Promise<DesktopMcpDeleteResponse> {
  const response = await getDesktopMcpBridge().deleteDesktopMcp(mcpId);
  if (response.deleted) {
    emitDesktopMcpInvalidated("deleted", response.mcpId);
  }
  return response;
}

export function testDesktopMcpConnection(mcpId: string): Promise<DesktopMcpTestConnectionResult> {
  return getDesktopMcpBridge().testDesktopMcpConnection(mcpId);
}

export async function healthCheckDesktopMcp(mcpId: string): Promise<DesktopMcpTestConnectionResult> {
  const response = await getDesktopMcpBridge().healthCheckDesktopMcp(mcpId);
  emitDesktopMcpInvalidated("health-checked", mcpId);
  return response;
}

export function fetchDesktopMcpCapabilities(mcpId: string): Promise<DesktopMcpCapabilityProbeResult> {
  return getDesktopMcpBridge().fetchDesktopMcpCapabilities(mcpId);
}

export function listDesktopMcpHealthHistory(params: { mcpId: string; limit?: number; offset?: number }): Promise<DesktopMcpHealthHistoryResponse> {
  return getDesktopMcpBridge().listDesktopMcpHealthHistory(params);
}

export function getDesktopMcpRuntimeConfig(params: { workspaceId?: string } = {}): Promise<DesktopMcpRuntimeConfig> {
  return getDesktopMcpBridge().getDesktopMcpRuntimeConfig(params);
}

export async function installDesktopMcpRecommended(
  id: string,
  input: { scope?: string; workspaceId?: string } = {},
): Promise<DesktopMcpCreateResponse> {
  const response = await getDesktopMcpBridge().installDesktopMcpRecommended(id, input);
  emitDesktopMcpInvalidated("recommended-installed", response.item.id);
  return response;
}

export function listDesktopMcpMarketProviders(): Promise<DesktopMcpMarketProvidersResponse> {
  return getDesktopMcpBridge().listDesktopMcpMarketProviders();
}

export function searchDesktopMcpMarket(input: DesktopMcpMarketSearchQuery = {}): Promise<DesktopMcpMarketSearchResponse> {
  return getDesktopMcpBridge().searchDesktopMcpMarket(input);
}

export function searchDesktopMcpMarketByRequirement(
  input: DesktopMcpMarketRequirementQuery = {},
): Promise<DesktopMcpMarketSearchByRequirementResponse> {
  return getDesktopMcpBridge().searchDesktopMcpMarketByRequirement(input);
}

export async function installDesktopMcpMarket(input: DesktopMcpMarketInstallInput): Promise<DesktopMcpMarketInstallResponse> {
  const response = await getDesktopMcpBridge().installDesktopMcpMarket(input);
  emitDesktopMcpInvalidated("market-installed", response.item.id);
  return response;
}

export async function autoInstallDesktopMcpMarketByRequirement(
  input: DesktopMcpMarketAutoInstallInput,
): Promise<DesktopMcpMarketAutoInstallResponse> {
  const response = await getDesktopMcpBridge().autoInstallDesktopMcpMarketByRequirement(input);
  emitDesktopMcpInvalidated("market-installed", response.installation.item.id);
  return response;
}

export function fetchMcpList(_runtimeUrl: string, query: DesktopMcpListParams = {}) {
  return listDesktopMcp(query);
}

export function fetchMcpRecommended(_runtimeUrl: string) {
  return listDesktopMcpRecommended();
}

export function fetchMcpMarketProviders(_runtimeUrl: string) {
  return listDesktopMcpMarketProviders().then((response) => response.items);
}

export function createMcp(_runtimeUrl: string, input: DesktopMcpDraftInput) {
  return createDesktopMcp(input);
}

export function patchMcp(_runtimeUrl: string, mcpId: string, input: DesktopMcpDraftInput) {
  return patchDesktopMcp(mcpId, input);
}

export function deleteMcp(_runtimeUrl: string, mcpId: string) {
  return deleteDesktopMcp(mcpId);
}

export function healthCheckMcp(_runtimeUrl: string, mcpId: string) {
  return healthCheckDesktopMcp(mcpId);
}

export function fetchMcpCapabilities(_runtimeUrl: string, mcpId: string) {
  return fetchDesktopMcpCapabilities(mcpId);
}

export function installRecommendedMcp(
  _runtimeUrl: string,
  id: string,
  input: { scope?: string; workspaceId?: string } = {},
) {
  return installDesktopMcpRecommended(id, input);
}

export function searchMcpMarket(_runtimeUrl: string, input: DesktopMcpMarketSearchQuery = {}) {
  return searchDesktopMcpMarket(input);
}

export function searchMcpMarketByRequirement(
  _runtimeUrl: string,
  input: DesktopMcpMarketRequirementQuery = {},
) {
  return searchDesktopMcpMarketByRequirement(input);
}

export function installMcpFromMarket(_runtimeUrl: string, input: DesktopMcpMarketInstallInput) {
  return installDesktopMcpMarket(input);
}

export function autoInstallMcpByRequirement(
  _runtimeUrl: string,
  input: DesktopMcpMarketAutoInstallInput,
) {
  return autoInstallDesktopMcpMarketByRequirement(input);
}

export function testMcpConnection(_runtimeUrl: string, input: DesktopMcpDraftInput) {
  const persistedId = (input as DesktopMcpDraftInput & { id?: unknown }).id;
  if (typeof persistedId === "string" && persistedId.trim()) {
    return testDesktopMcpConnection(persistedId);
  }

  return Promise.resolve({
    status: "warning" as const,
    latencyMs: 0,
    reasonCode: "DRAFT_NOT_PERSISTED",
    message: "请先保存后再检查",
  });
}
