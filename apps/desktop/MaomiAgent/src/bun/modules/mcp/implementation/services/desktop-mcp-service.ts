import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport, type StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type { DesktopConfigurationPort } from "../../../configuration";
import type { RuntimeLogger } from "../../../logs";
import type { DesktopWorkspaceQueryPort } from "../../../workspace";
import {
  DESKTOP_MCP_MARKET_PROVIDER_VALUES,
  MAX_DESKTOP_MCP_REQUEST_TIMEOUT_MS,
  clampDesktopMcpRequestTimeoutMs,
  type DesktopMcpAuth,
  type DesktopMcpCapabilityProbeResult,
  type DesktopMcpCreateResponse,
  type DesktopMcpDeleteResponse,
  type DesktopMcpDraftInput,
  type DesktopMcpEffectiveResponse,
  type DesktopMcpEffectiveRow,
  type DesktopMcpHealthRecord,
  type DesktopMcpHealthStatus,
  type DesktopMcpItem,
  type DesktopMcpListParams,
  type DesktopMcpListResponse,
  type DesktopMcpListStatus,
  type DesktopMcpMarketAutoInstallInput,
  type DesktopMcpMarketAutoInstallResponse,
  type DesktopMcpMarketInstallInput,
  type DesktopMcpMarketInstallResponse,
  type DesktopMcpMarketIntentItem,
  type DesktopMcpMarketItem,
  type DesktopMcpMarketProvider,
  type DesktopMcpMarketProviderId,
  type DesktopMcpMarketProvidersResponse,
  type DesktopMcpMarketRequirementQuery,
  type DesktopMcpMarketSearchByRequirementResponse,
  type DesktopMcpMarketSearchQuery,
  type DesktopMcpMarketSearchResponse,
  type DesktopMcpRecommendedItem,
  type DesktopMcpRetry,
  type DesktopMcpRuntimeConfig,
  type DesktopMcpRuntimeEntry,
  type DesktopMcpScope,
  type DesktopMcpTestConnectionResult,
  type DesktopMcpToolDescriptor,
  type DesktopMcpTransport,
  type DesktopMcpView,
} from "../../../../../shared/desktop-mcp";
import type { DesktopMcpPort, DesktopMcpRuntimeTool } from "../../abstraction/ports/desktop-mcp.ports";

const MCP_NAME_RE = /^[a-zA-Z0-9._-]{2,64}$/;
const MANAGED_RUNTIME_PROVIDER_ID = "desktop.mcp.managed";
const MANAGED_RUNTIME_OWNER_ID = "desktop.mcp";
const REGISTRY_BASE_URL = "https://registry.modelcontextprotocol.io/v0";
const WORKSPACE_DIRECTORY_PLACEHOLDER = "{workspace:directory}";

const MARKET_PROVIDERS: DesktopMcpMarketProvider[] = [
  { id: "official", label: "Official" },
  { id: "smithery", label: "Smithery" },
  { id: "pulsemcp", label: "PulseMCP" },
];

const RECOMMENDED_ITEMS: Omit<DesktopMcpRecommendedItem, "installed">[] = [
  {
    id: "playwright",
    name: "playwright",
    title: "Playwright",
    description: "Browser preview, interaction, and screenshot tools through npm stdio.",
    transport: "stdio",
    endpoint: "npx",
    enabled: false,
    timeoutMs: 30_000,
    tags: ["browser", "automation", "preview"],
    metadata: { args: ["-y", "@playwright/mcp@latest", "--headless"] },
  },
  {
    id: "filesystem",
    name: "filesystem",
    title: "Filesystem",
    description: "Local filesystem tools through npm stdio.",
    transport: "stdio",
    endpoint: "npx",
    enabled: false,
    timeoutMs: 15_000,
    tags: ["local", "files"],
    metadata: { args: ["-y", "@modelcontextprotocol/server-filesystem", WORKSPACE_DIRECTORY_PLACEHOLDER] },
  },
  {
    id: "fetch",
    name: "fetch",
    title: "Fetch",
    description: "HTTP fetch tools through npm stdio.",
    transport: "stdio",
    endpoint: "npx",
    enabled: false,
    timeoutMs: 15_000,
    tags: ["web", "http"],
    metadata: { args: ["-y", "@modelcontextprotocol/server-fetch"] },
  },
];

type DesktopMcpStorage = {
  version: string;
  items: DesktopMcpItem[];
  healthRecords: DesktopMcpHealthRecord[];
  updatedAt: string;
};

type ProbeInput = Pick<
  DesktopMcpItem,
  "transport" | "endpoint" | "enabled" | "auth" | "timeoutMs" | "metadata"
> & {
  workspaceDirectory?: string;
};

type RuntimePlaceholderContext = {
  workspaceDirectory?: string;
};

type RegistryHeaderRow = {
  name?: unknown;
  value?: unknown;
  isSecret?: unknown;
};

type RegistryEnvironmentRow = {
  name?: unknown;
  default?: unknown;
};

type RegistryRemote = {
  type?: unknown;
  url?: unknown;
  headers?: unknown;
};

type RegistryPackage = {
  registryType?: unknown;
  identifier?: unknown;
  transport?: { type?: unknown };
  environmentVariables?: unknown;
};

type RegistryServer = {
  name?: unknown;
  version?: unknown;
  title?: unknown;
  description?: unknown;
  repository?: { url?: unknown };
  websiteUrl?: unknown;
  tags?: unknown;
  remotes?: unknown;
  packages?: unknown;
};

type RegistryRow = {
  server?: RegistryServer;
};

type InstallPlan = {
  strategy: "remote" | "npm-stdio";
  transport: DesktopMcpTransport;
  endpoint: string;
  metadata?: Record<string, unknown>;
};

export class DesktopMcpServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DesktopMcpServiceError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${suffix}`;
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalString(value: unknown): string | undefined {
  const trimmed = trimString(value);
  return trimmed || undefined;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createEmptyStorage(): DesktopMcpStorage {
  return {
    version: "1.0",
    items: [],
    healthRecords: [],
    updatedAt: nowIso(),
  };
}

function normalizeStatePath(pathname?: string): string {
  const fallback = join(homedir(), ".maomiagent", "desktop", "mcp", "mcp-state.json");
  const target = normalizeOptionalString(pathname) ?? fallback;
  if (target.startsWith("~/")) {
    return join(homedir(), target.slice(2));
  }
  return isAbsolute(target) ? target : resolve(process.cwd(), target);
}

function normalizeName(input: unknown): string {
  const name = trimString(input);
  if (!name) {
    throw new DesktopMcpServiceError("INVALID_ARGUMENT", "name is required", { field: "name" });
  }
  if (!MCP_NAME_RE.test(name)) {
    throw new DesktopMcpServiceError("INVALID_ARGUMENT", "invalid name format", { field: "name" });
  }
  return name;
}

function normalizeScope(input: unknown, workspaceId: unknown): { scope: DesktopMcpScope; workspaceId?: string } {
  const scope = trimString(input || "global").toLowerCase();
  if (scope === "global") {
    return { scope: "global" };
  }
  if (scope !== "workspace") {
    throw new DesktopMcpServiceError("INVALID_ARGUMENT", "unsupported scope", { field: "scope" });
  }
  const normalizedWorkspaceId = trimString(workspaceId);
  if (!normalizedWorkspaceId) {
    throw new DesktopMcpServiceError("INVALID_ARGUMENT", "workspaceId is required", { field: "workspaceId" });
  }
  return { scope: "workspace", workspaceId: normalizedWorkspaceId };
}

function normalizeTransport(input: unknown): DesktopMcpTransport {
  const normalized = trimString(input).toLowerCase().replace(/[\s_]+/g, "-");
  if (normalized === "stdio" || normalized === "sdtio") {
    return "stdio";
  }
  if (normalized === "http" || normalized === "http-streamable") {
    return "http-streamable";
  }
  if (normalized === "sse") {
    return "sse";
  }
  throw new DesktopMcpServiceError("INVALID_ARGUMENT", "unsupported transport", { field: "transport" });
}

function validateEndpoint(transport: DesktopMcpTransport, endpoint: unknown): string {
  const value = trimString(endpoint);
  if (!value) {
    throw new DesktopMcpServiceError("INVALID_ARGUMENT", "endpoint is required", { field: "endpoint" });
  }
  if (transport === "stdio") {
    return value;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("invalid protocol");
    }
    return parsed.toString();
  } catch {
    throw new DesktopMcpServiceError("INVALID_TRANSPORT_ENDPOINT", "endpoint must be absolute http/https URL", { field: "endpoint" });
  }
}

function validateAuth(input: unknown): DesktopMcpAuth {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { mode: "none" };
  }
  const raw = input as Partial<DesktopMcpAuth>;
  const mode = raw.mode ?? "none";
  if (mode !== "none" && mode !== "token" && mode !== "basic" && mode !== "custom") {
    throw new DesktopMcpServiceError("AUTH_VALIDATION_FAILED", "invalid auth mode", { field: "auth.mode" });
  }
  if (mode === "token" && !trimString(raw.token)) {
    throw new DesktopMcpServiceError("AUTH_VALIDATION_FAILED", "token auth requires token", { field: "auth.token" });
  }
  if (mode === "basic") {
    if (!trimString(raw.username)) {
      throw new DesktopMcpServiceError("AUTH_VALIDATION_FAILED", "basic auth requires username", { field: "auth.username" });
    }
    if (!trimString(raw.password)) {
      throw new DesktopMcpServiceError("AUTH_VALIDATION_FAILED", "basic auth requires password", { field: "auth.password" });
    }
  }
  return {
    mode,
    token: normalizeOptionalString(raw.token),
    username: normalizeOptionalString(raw.username),
    password: normalizeOptionalString(raw.password),
    custom: raw.custom && typeof raw.custom === "object" && !Array.isArray(raw.custom)
      ? cloneJson(raw.custom)
      : undefined,
  };
}

function validateTimeout(timeoutMs: unknown): number | undefined {
  if (timeoutMs === undefined || timeoutMs === null) {
    return undefined;
  }
  if (typeof timeoutMs !== "number" || timeoutMs < 1_000 || timeoutMs > MAX_DESKTOP_MCP_REQUEST_TIMEOUT_MS) {
    throw new DesktopMcpServiceError("INVALID_ARGUMENT", `timeoutMs must be between 1000 and ${MAX_DESKTOP_MCP_REQUEST_TIMEOUT_MS}`, { field: "timeoutMs" });
  }
  return Math.floor(timeoutMs);
}

function validateRetry(retry: unknown): DesktopMcpRetry | undefined {
  if (retry === undefined || retry === null) {
    return undefined;
  }
  if (typeof retry !== "object" || Array.isArray(retry)) {
    throw new DesktopMcpServiceError("INVALID_ARGUMENT", "retry must be object", { field: "retry" });
  }
  const raw = retry as Partial<DesktopMcpRetry>;
  if (raw.maxAttempts !== undefined && (typeof raw.maxAttempts !== "number" || raw.maxAttempts < 0 || raw.maxAttempts > 10)) {
    throw new DesktopMcpServiceError("INVALID_ARGUMENT", "retry.maxAttempts must be between 0 and 10", { field: "retry.maxAttempts" });
  }
  if (raw.backoffMs !== undefined && (typeof raw.backoffMs !== "number" || raw.backoffMs < 0)) {
    throw new DesktopMcpServiceError("INVALID_ARGUMENT", "retry.backoffMs must be >= 0", { field: "retry.backoffMs" });
  }
  return {
    maxAttempts: raw.maxAttempts,
    backoffMs: raw.backoffMs,
  };
}

function validateConcurrency(concurrencyHint: unknown): number | undefined {
  if (concurrencyHint === undefined || concurrencyHint === null) {
    return undefined;
  }
  if (typeof concurrencyHint !== "number" || concurrencyHint < 1 || concurrencyHint > 64) {
    throw new DesktopMcpServiceError("INVALID_ARGUMENT", "concurrencyHint must be between 1 and 64", { field: "concurrencyHint" });
  }
  return Math.floor(concurrencyHint);
}

function validateTags(tags: unknown): string[] | undefined {
  if (tags === undefined || tags === null) {
    return undefined;
  }
  if (!Array.isArray(tags) || tags.some((item) => typeof item !== "string")) {
    throw new DesktopMcpServiceError("INVALID_ARGUMENT", "tags must be string[]", { field: "tags" });
  }
  const normalized = [...new Set(tags.map((item) => item.trim()).filter(Boolean))];
  return normalized.length > 0 ? normalized : undefined;
}

function validateMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (metadata === undefined || metadata === null) {
    return undefined;
  }
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new DesktopMcpServiceError("INVALID_ARGUMENT", "metadata must be object", { field: "metadata" });
  }
  return cloneJson(metadata as Record<string, unknown>);
}

function migrateLegacyFilesystemMetadata(name: string, metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (name !== "filesystem" || !metadata) {
    return metadata;
  }

  const args = toStringArray(metadata.args);
  if (!args || args.length < 3) {
    return metadata;
  }

  const target = args[1]?.trim();
  const root = args[2]?.trim();
  if (target !== "@modelcontextprotocol/server-filesystem" || root !== "{env:HOME}") {
    return metadata;
  }

  return {
    ...metadata,
    args: [
      args[0]!,
      args[1]!,
      WORKSPACE_DIRECTORY_PLACEHOLDER,
      ...args.slice(3),
    ],
  };
}

function validateDescription(description: unknown): string | undefined {
  if (description === undefined || description === null) {
    return undefined;
  }
  if (typeof description !== "string") {
    throw new DesktopMcpServiceError("INVALID_ARGUMENT", "description must be string", { field: "description" });
  }
  return description.trim() || undefined;
}

function normalizeStoredItem(raw: unknown): DesktopMcpItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const item = raw as Partial<DesktopMcpItem>;
  try {
    const scope = normalizeScope(item.scope, item.workspaceId);
    const transport = normalizeTransport(item.transport);
    const name = normalizeName(item.name);
    const metadata = migrateLegacyFilesystemMetadata(name, validateMetadata(item.metadata));
    return {
      id: normalizeOptionalString(item.id) ?? createId("mcp"),
      name,
      scope: scope.scope,
      workspaceId: scope.workspaceId,
      transport,
      endpoint: validateEndpoint(transport, item.endpoint),
      enabled: item.enabled === true,
      auth: validateAuth(item.auth),
      timeoutMs: validateTimeout(item.timeoutMs),
      retry: validateRetry(item.retry),
      concurrencyHint: validateConcurrency(item.concurrencyHint),
      tags: validateTags(item.tags),
      metadata,
      description: validateDescription(item.description),
      createdAt: normalizeOptionalString(item.createdAt) ?? nowIso(),
      updatedAt: normalizeOptionalString(item.updatedAt) ?? nowIso(),
    };
  } catch {
    return null;
  }
}

function normalizeHealthRecord(raw: unknown): DesktopMcpHealthRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Partial<DesktopMcpHealthRecord>;
  if (record.status !== "healthy" && record.status !== "warning" && record.status !== "down") {
    return null;
  }
  const mcpId = normalizeOptionalString(record.mcpId);
  if (!mcpId) {
    return null;
  }
  return {
    recordId: normalizeOptionalString(record.recordId) ?? createId("mhr"),
    mcpId,
    status: record.status,
    latencyMs: typeof record.latencyMs === "number" && Number.isFinite(record.latencyMs) ? Math.max(0, Math.floor(record.latencyMs)) : 0,
    checkedAt: normalizeOptionalString(record.checkedAt) ?? nowIso(),
    reasonCode: normalizeOptionalString(record.reasonCode),
    message: normalizeOptionalString(record.message),
  };
}

function normalizeStorage(raw: unknown): DesktopMcpStorage {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createEmptyStorage();
  }
  const value = raw as Partial<DesktopMcpStorage>;
  return {
    version: normalizeOptionalString(value.version) ?? "1.0",
    items: Array.isArray(value.items)
      ? value.items.map(normalizeStoredItem).filter((item): item is DesktopMcpItem => Boolean(item))
      : [],
    healthRecords: Array.isArray(value.healthRecords)
      ? value.healthRecords.map(normalizeHealthRecord).filter((item): item is DesktopMcpHealthRecord => Boolean(item))
      : [],
    updatedAt: normalizeOptionalString(value.updatedAt) ?? nowIso(),
  };
}

function sanitizeAuth(auth: DesktopMcpAuth): { mode: DesktopMcpAuth["mode"] } {
  return { mode: auth.mode };
}

function latestHealthMap(records: DesktopMcpHealthRecord[]): Map<string, DesktopMcpHealthRecord> {
  const map = new Map<string, DesktopMcpHealthRecord>();
  for (const record of records) {
    const prev = map.get(record.mcpId);
    if (!prev || record.checkedAt > prev.checkedAt) {
      map.set(record.mcpId, record);
    }
  }
  return map;
}

function toView(item: DesktopMcpItem, latest?: DesktopMcpHealthRecord): DesktopMcpView {
  return {
    ...cloneJson(item),
    auth: sanitizeAuth(item.auth),
    runtimeSource: "managed",
    runtimeOwnerId: MANAGED_RUNTIME_OWNER_ID,
    runtimeProviderId: MANAGED_RUNTIME_PROVIDER_ID,
    health: latest
      ? {
        status: latest.status,
        checkedAt: latest.checkedAt,
        reasonCode: latest.reasonCode,
        message: latest.message,
        latencyMs: latest.latencyMs,
      }
      : undefined,
  };
}

function deriveStatus(item: DesktopMcpView): DesktopMcpListStatus {
  if (!item.enabled) {
    return "disabled";
  }
  return item.health?.status ?? "warning";
}

function normalizeDraftInput(input: DesktopMcpDraftInput, current?: DesktopMcpItem): Omit<DesktopMcpItem, "id" | "createdAt" | "updatedAt"> {
  const name = input.name !== undefined ? normalizeName(input.name) : current?.name;
  const scope = normalizeScope(
    input.scope !== undefined ? input.scope : current?.scope,
    input.workspaceId !== undefined ? input.workspaceId : current?.workspaceId,
  );
  const transport = input.transport !== undefined ? normalizeTransport(input.transport) : current?.transport;
  if (!name || !transport) {
    throw new DesktopMcpServiceError("INVALID_ARGUMENT", "missing required fields");
  }
  return {
    name,
    scope: scope.scope,
    workspaceId: scope.workspaceId,
    transport,
    endpoint: validateEndpoint(transport, input.endpoint !== undefined ? input.endpoint : current?.endpoint),
    enabled: input.enabled !== undefined ? input.enabled === true : current?.enabled === true,
    auth: input.auth !== undefined ? validateAuth(input.auth) : validateAuth(current?.auth),
    timeoutMs: validateTimeout(input.timeoutMs !== undefined ? input.timeoutMs : current?.timeoutMs),
    retry: validateRetry(input.retry !== undefined ? input.retry : current?.retry),
    concurrencyHint: validateConcurrency(input.concurrencyHint !== undefined ? input.concurrencyHint : current?.concurrencyHint),
    tags: validateTags(input.tags !== undefined ? input.tags : current?.tags),
    metadata: validateMetadata(input.metadata !== undefined ? input.metadata : current?.metadata),
    description: validateDescription(input.description !== undefined ? input.description : current?.description),
  };
}

function ensureUniqueName(storage: DesktopMcpStorage, draft: Pick<DesktopMcpItem, "name" | "scope" | "workspaceId">, ignoreMcpId?: string): void {
  const duplicate = storage.items.find((item) => item.id !== ignoreMcpId
    && item.name === draft.name
    && item.scope === draft.scope
    && (draft.scope === "global" || item.workspaceId === draft.workspaceId));
  if (duplicate) {
    throw new DesktopMcpServiceError("CONFLICT", "name already exists in current scope", {
      field: "name",
      name: draft.name,
      scope: draft.scope,
      workspaceId: draft.workspaceId,
    });
  }
}

function resolveEffectiveItems(items: DesktopMcpItem[], workspaceId?: string): DesktopMcpItem[] {
  const byName = new Map<string, DesktopMcpItem>();
  for (const item of items.filter((row) => row.scope === "global")) {
    byName.set(item.name, item);
  }
  if (workspaceId) {
    for (const item of items.filter((row) => row.scope === "workspace" && row.workspaceId === workspaceId)) {
      byName.set(item.name, item);
    }
  }
  return [...byName.values()];
}

function buildEffectiveRows(items: DesktopMcpItem[], health: Map<string, DesktopMcpHealthRecord>, workspaceId: string): DesktopMcpEffectiveRow[] {
  const globals = new Map(items.filter((item) => item.scope === "global").map((item) => [item.name, item]));
  const workspaceItems = new Map(items.filter((item) => item.scope === "workspace" && item.workspaceId === workspaceId).map((item) => [item.name, item]));
  const names = [...new Set([...globals.keys(), ...workspaceItems.keys()])].sort((left, right) => left.localeCompare(right));
  return names.map((name) => {
    const workspaceItem = workspaceItems.get(name);
    const globalItem = globals.get(name);
    const winner = workspaceItem ?? globalItem;
    if (!winner) {
      throw new DesktopMcpServiceError("INTERNAL_ERROR", "effective MCP winner missing");
    }
    return {
      effectiveId: `${workspaceId}:${name}`,
      winnerScope: winner.scope,
      winnerMcpId: winner.id,
      shadowedMcpId: workspaceItem && globalItem ? globalItem.id : undefined,
      explain: workspaceItem && globalItem ? "workspace item overrides global item with same name" : `${winner.scope} item is active`,
      item: toView(winner, health.get(winner.id)),
    };
  });
}

function substituteRuntimePlaceholders(text: string, context: RuntimePlaceholderContext = {}): string {
  return text
    .replace(/\{env:([^}]+)\}/g, (_match, varName: string) => process.env[varName] || "")
    .replaceAll(WORKSPACE_DIRECTORY_PLACEHOLDER, context.workspaceDirectory || homedir());
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  return result.length > 0 ? result : undefined;
}

function toStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string" && key.trim()) {
      result[key.trim()] = raw;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function extractHeaders(input: ProbeInput): Headers {
  const headers = new Headers();
  const metadataHeaders = input.metadata && typeof input.metadata === "object" ? input.metadata.headers : undefined;
  const headerRecord = toStringRecord(metadataHeaders);
  if (headerRecord) {
    for (const [key, value] of Object.entries(headerRecord)) {
      headers.set(key, substituteRuntimePlaceholders(value, input));
    }
  }
  if (input.auth.mode === "token" && input.auth.token) {
    headers.set("Authorization", `Bearer ${substituteRuntimePlaceholders(input.auth.token, input)}`);
  } else if (input.auth.mode === "basic" && input.auth.username && input.auth.password) {
    const encoded = Buffer.from(
      `${substituteRuntimePlaceholders(input.auth.username, input)}:${substituteRuntimePlaceholders(input.auth.password, input)}`,
    ).toString("base64");
    headers.set("Authorization", `Basic ${encoded}`);
  } else if (input.auth.mode === "custom" && input.auth.custom) {
    for (const [key, value] of Object.entries(input.auth.custom)) {
      if (typeof value === "string" && key.trim()) {
        headers.set(key.trim(), substituteRuntimePlaceholders(value, input));
      }
    }
  }
  return headers;
}

function buildProbeUrl(endpoint: string, metadata?: Record<string, unknown>): URL {
  const url = new URL(substituteRuntimePlaceholders(endpoint));
  const query = metadata?.query;
  if (query && typeof query === "object" && !Array.isArray(query)) {
    for (const [key, value] of Object.entries(query)) {
      if (!key.trim() || value === undefined || value === null) {
        continue;
      }
      if (typeof value === "string") {
        url.searchParams.set(key.trim(), substituteRuntimePlaceholders(value));
      } else if (typeof value === "number" || typeof value === "boolean") {
        url.searchParams.set(key.trim(), String(value));
      }
    }
  }
  return url;
}

function toRequestHeaders(headers: Headers): Record<string, string> | undefined {
  const entries = [...headers.entries()];
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function buildSdkRequestInit(item: ProbeInput): RequestInit | undefined {
  const headers = toRequestHeaders(extractHeaders(item));
  return headers ? { headers } : undefined;
}

function getProcessEnvRecord(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return env;
}

function buildStdioServerParameters(item: ProbeInput): StdioServerParameters {
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const command = substituteRuntimePlaceholders(item.endpoint, item);
  const args = (toStringArray(metadata.args) ?? []).map((value) => substituteRuntimePlaceholders(value, item));
  const metadataEnv = toStringRecord(metadata.env);
  const env = metadataEnv
    ? Object.fromEntries(Object.entries(metadataEnv).map(([key, value]) => [key, substituteRuntimePlaceholders(value, item)]))
    : undefined;
  return {
    command,
    args,
    env: { ...getProcessEnvRecord(), ...(env ?? {}) },
    stderr: "pipe",
    cwd: process.cwd(),
  };
}

async function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(onTimeout()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function mapSdkTools(tools: Array<{ name: string; title?: string; description?: string; inputSchema?: Record<string, unknown> }>): DesktopMcpToolDescriptor[] {
  return tools.map((tool) => ({
    name: tool.name.trim(),
    title: normalizeOptionalString(tool.title),
    description: normalizeOptionalString(tool.description),
    inputSchema: tool.inputSchema && typeof tool.inputSchema === "object" && !Array.isArray(tool.inputSchema) ? cloneJson(tool.inputSchema) : undefined,
  })).filter((tool) => tool.name);
}

async function withSdkClient<T>(item: ProbeInput, methodLabel: string, action: (client: Client, timeoutMs: number) => Promise<T>): Promise<T> {
  const timeoutMs = clampDesktopMcpRequestTimeoutMs(item.timeoutMs);
  const client = new Client({ name: "maomiagent-desktop", version: "0.1.0" });
  const transport = item.transport === "stdio"
    ? new StdioClientTransport(buildStdioServerParameters(item))
    : item.transport === "sse"
      ? new SSEClientTransport(buildProbeUrl(item.endpoint, item.metadata), { requestInit: buildSdkRequestInit(item) })
      : new StreamableHTTPClientTransport(buildProbeUrl(item.endpoint, item.metadata), { requestInit: buildSdkRequestInit(item) });
  try {
    await raceWithTimeout(
      client.connect(transport),
      timeoutMs,
      () => new DesktopMcpServiceError("TIMEOUT", `MCP method ${methodLabel} timed out after ${timeoutMs}ms`, { method: methodLabel, timeoutMs }),
    );
    return await action(client, timeoutMs);
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function listSdkTools(item: ProbeInput): Promise<DesktopMcpToolDescriptor[]> {
  return withSdkClient(item, "tools/list", async (client, timeoutMs) => {
    const result = await client.listTools(undefined, { timeout: timeoutMs });
    return mapSdkTools(result.tools);
  });
}

async function listRuntimeToolsForItem(item: ProbeInput): Promise<DesktopMcpToolDescriptor[]> {
  const declared = extractDeclaredTools(item);
  if (declared.length > 0) {
    return declared;
  }

  return listSdkTools(item);
}

function extractDeclaredTools(item: ProbeInput): DesktopMcpToolDescriptor[] {
  const rawTools = item.metadata && typeof item.metadata === "object" && Array.isArray(item.metadata.tools)
    ? item.metadata.tools
    : [];
  const tools: DesktopMcpToolDescriptor[] = [];
  for (const raw of rawTools) {
    if (typeof raw === "string" && raw.trim()) {
      tools.push({ name: raw.trim() });
    } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const entry = raw as Record<string, unknown>;
      const name = normalizeOptionalString(entry.name);
      if (name) {
        tools.push({
          name,
          title: normalizeOptionalString(entry.title),
          description: normalizeOptionalString(entry.description),
          inputSchema: entry.inputSchema && typeof entry.inputSchema === "object" && !Array.isArray(entry.inputSchema)
            ? cloneJson(entry.inputSchema as Record<string, unknown>)
            : undefined,
        });
      }
    }
  }
  return tools;
}

function buildProbeInput(item: ProbeInput, options?: { forceEnabled?: boolean }): ProbeInput {
  if (!options?.forceEnabled || item.enabled) {
    return item;
  }

  return {
    ...item,
    enabled: true,
  };
}

async function runConnectionProbe(item: ProbeInput): Promise<DesktopMcpTestConnectionResult> {
  const startedAt = Date.now();
  if (!item.enabled) {
    return { status: "warning", latencyMs: 0, reasonCode: "DISABLED", message: "MCP is disabled" };
  }
  if (item.transport === "stdio") {
    try {
      await withSdkClient(item, "initialize", async () => undefined);
      return { status: "healthy", latencyMs: Date.now() - startedAt, reasonCode: "LOCAL_OK", message: "stdio MCP connected successfully" };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      return {
        status: "down",
        latencyMs,
        reasonCode: error instanceof DesktopMcpServiceError && error.code === "TIMEOUT" ? "TIMEOUT" : "LOCAL_PROCESS_ERROR",
        message: error instanceof Error ? error.message : "stdio MCP failed to start",
      };
    }
  }
  const timeoutMs = Math.min(Math.max(item.timeoutMs ?? 10_000, 1_000), 20_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(buildProbeUrl(item.endpoint, item.metadata), {
      method: "GET",
      headers: extractHeaders(item),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    if (response.ok) {
      return { status: "healthy", latencyMs, reasonCode: "HTTP_OK", message: `HTTP ${response.status}` };
    }
    if (response.status === 401 || response.status === 403) {
      return { status: "warning", latencyMs, reasonCode: "AUTH_REQUIRED", message: `HTTP ${response.status}` };
    }
    if (response.status === 404 || response.status === 405) {
      return { status: "warning", latencyMs, reasonCode: "ENDPOINT_NOT_READY", message: `HTTP ${response.status}` };
    }
    return { status: "down", latencyMs, reasonCode: "HTTP_STATUS", message: `HTTP ${response.status}` };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    return {
      status: "down",
      latencyMs,
      reasonCode: error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
      message: error instanceof Error && error.name === "AbortError" ? `timeout after ${timeoutMs}ms` : error instanceof Error ? error.message : "network error",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runCapabilityProbe(item: ProbeInput): Promise<DesktopMcpCapabilityProbeResult> {
  const startedAt = Date.now();
  const health = await runConnectionProbe(item);
  let toolDetails = extractDeclaredTools(item);
  let toolsReasonCode = toolDetails.length > 0 ? "DECLARED_TOOLS" : undefined;
  let toolsMessage = toolDetails.length > 0 ? "Tools declared in metadata" : undefined;
  if (item.enabled) {
    try {
      const sdkTools = await listSdkTools(item);
      toolDetails = sdkTools;
      toolsReasonCode = "SDK_TOOLS_LIST_OK";
      toolsMessage = undefined;
    } catch (error) {
      toolsReasonCode = error instanceof DesktopMcpServiceError ? error.code : "TOOLS_LIST_FAILED";
      toolsMessage = error instanceof Error ? error.message : "failed to list tools";
    }
  }
  return {
    status: health.status,
    latencyMs: Math.max(health.latencyMs, Date.now() - startedAt),
    reasonCode: health.reasonCode,
    message: health.message,
    tools: toolDetails.map((tool) => tool.name),
    toolDetails,
    toolsReasonCode,
    toolsMessage,
  };
}

function toRuntimeEntry(item: DesktopMcpItem, context: RuntimePlaceholderContext = {}): DesktopMcpRuntimeEntry {
  if (item.transport === "stdio") {
    const metadata = item.metadata ?? {};
    return {
      type: "local",
      command: [
        substituteRuntimePlaceholders(item.endpoint, context),
        ...(toStringArray(metadata.args) ?? []).map((value) => substituteRuntimePlaceholders(value, context)),
      ],
      environment: (() => {
        const env = toStringRecord(metadata.env);
        return env
          ? Object.fromEntries(Object.entries(env).map(([key, value]) => [key, substituteRuntimePlaceholders(value, context)]))
          : undefined;
      })(),
      enabled: item.enabled,
      timeout: item.timeoutMs,
    };
  }
  const metadata = item.metadata ?? {};
  return {
    type: "remote",
    url: item.endpoint,
    headers: toStringRecord(metadata.headers),
    enabled: item.enabled,
    timeout: item.timeoutMs,
  };
}

function parseLimit(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(value), 1), 100);
}

function parseOffset(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(Math.floor(value), 0);
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
  return values.length > 0 ? values : undefined;
}

function normalizeProvider(value: unknown): DesktopMcpMarketProviderId {
  const provider = trimString(value || "official").toLowerCase();
  return DESKTOP_MCP_MARKET_PROVIDER_VALUES.includes(provider as DesktopMcpMarketProviderId)
    ? provider as DesktopMcpMarketProviderId
    : "official";
}

function normalizePlaceholder(value: string): string {
  return value.replace(/^\$\{([^}]+)\}$/, "{env:$1}");
}

function resolvePlatform(server: RegistryServer): DesktopMcpMarketProviderId {
  const name = trimString(server.name).toLowerCase();
  const repositoryUrl = trimString(server.repository?.url).toLowerCase();
  const remotes = Array.isArray(server.remotes) ? server.remotes.map((row) => trimString((row as RegistryRemote)?.url).toLowerCase()) : [];
  const packages = Array.isArray(server.packages) ? server.packages.map((row) => trimString((row as RegistryPackage)?.identifier).toLowerCase()) : [];
  if (name.startsWith("ai.smithery/") || repositoryUrl.includes("smithery") || remotes.some((url) => url.includes("smithery"))) {
    return "smithery";
  }
  if (name.startsWith("com.pulsemcp.") || repositoryUrl.includes("pulsemcp") || packages.some((id) => id.includes("@pulsemcp/") || id.includes("pulsemcp"))) {
    return "pulsemcp";
  }
  return "official";
}

function resolveRemoteInstallPlan(server: RegistryServer): InstallPlan | null {
  if (!Array.isArray(server.remotes)) {
    return null;
  }
  const remote = server.remotes.find((row) => {
    const item = row as RegistryRemote;
    const type = trimString(item?.type).toLowerCase();
    return Boolean(trimString(item?.url)) && (type === "streamable-http" || type === "sse");
  }) as RegistryRemote | undefined;
  if (!remote) {
    return null;
  }
  const type = trimString(remote.type).toLowerCase();
  const headers: Record<string, string> = {};
  for (const row of Array.isArray(remote.headers) ? remote.headers : []) {
    const header = row as RegistryHeaderRow;
    const name = trimString(header.name);
    if (!name) {
      continue;
    }
    const value = trimString(header.value);
    if (value) {
      headers[name] = normalizePlaceholder(value);
    } else if (header.isSecret === true) {
      headers[name] = `{env:${name.toUpperCase()}}`;
    }
  }
  return {
    strategy: "remote",
    transport: type === "sse" ? "sse" : "http-streamable",
    endpoint: trimString(remote.url),
    metadata: Object.keys(headers).length > 0 ? { headers } : undefined,
  };
}

function resolveNpmInstallPlan(server: RegistryServer): InstallPlan | null {
  if (!Array.isArray(server.packages)) {
    return null;
  }
  const pkg = server.packages.find((row) => {
    const item = row as RegistryPackage;
    return trimString(item?.registryType).toLowerCase() === "npm"
      && Boolean(trimString(item?.identifier))
      && trimString(item?.transport?.type).toLowerCase() === "stdio";
  }) as RegistryPackage | undefined;
  if (!pkg) {
    return null;
  }
  const env: Record<string, string> = {};
  for (const row of Array.isArray(pkg.environmentVariables) ? pkg.environmentVariables : []) {
    const item = row as RegistryEnvironmentRow;
    const name = trimString(item.name);
    if (name) {
      env[name] = trimString(item.default) || `{env:${name.toUpperCase()}}`;
    }
  }
  const metadata: Record<string, unknown> = { args: ["-y", trimString(pkg.identifier)] };
  if (Object.keys(env).length > 0) {
    metadata.env = env;
  }
  return { strategy: "npm-stdio", transport: "stdio", endpoint: "npx", metadata };
}

function resolveInstallPlan(server: RegistryServer): InstallPlan | null {
  return resolveRemoteInstallPlan(server) ?? resolveNpmInstallPlan(server);
}

function encodeCatalogId(serverName: string, version?: string): string {
  return Buffer.from(JSON.stringify({ name: serverName, version: version || undefined }), "utf8").toString("base64url");
}

function decodeCatalogId(catalogId: unknown): { name: string; version?: string } {
  const raw = trimString(catalogId);
  if (!raw) {
    throw new DesktopMcpServiceError("INVALID_ARGUMENT", "catalogId is required", { field: "catalogId" });
  }
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { name?: unknown; version?: unknown };
    const name = trimString(parsed.name);
    if (!name) {
      throw new Error("missing name");
    }
    return { name, version: normalizeOptionalString(parsed.version) };
  } catch {
    throw new DesktopMcpServiceError("INVALID_ARGUMENT", "invalid catalogId", { field: "catalogId" });
  }
}

function toMarketItem(provider: DesktopMcpMarketProviderId, server: RegistryServer): DesktopMcpMarketItem | null {
  const serverName = trimString(server.name);
  if (!serverName) {
    return null;
  }
  const plan = resolveInstallPlan(server);
  if (!plan) {
    return null;
  }
  const platform = resolvePlatform(server);
  if (provider !== "official" && platform !== provider) {
    return null;
  }
  const version = normalizeOptionalString(server.version);
  return {
    provider,
    platform,
    catalogId: encodeCatalogId(serverName, version),
    serverName,
    version,
    title: normalizeOptionalString(server.title) ?? serverName,
    description: normalizeOptionalString(server.description),
    repositoryUrl: normalizeOptionalString(server.repository?.url),
    websiteUrl: normalizeOptionalString(server.websiteUrl),
    tags: asStringArray(server.tags),
    transport: plan.transport,
    endpoint: plan.endpoint,
    strategy: plan.strategy,
  };
}

async function fetchRegistryServers(input: { q?: string; limit: number }): Promise<RegistryServer[]> {
  const searchParams = new URLSearchParams();
  if (input.q) {
    searchParams.set("search", input.q);
  }
  searchParams.set("limit", String(input.limit));
  const response = await fetch(`${REGISTRY_BASE_URL}/servers?${searchParams.toString()}`);
  if (!response.ok) {
    throw new DesktopMcpServiceError("INTERNAL_ERROR", "failed to query mcp registry", { status: response.status, statusText: response.statusText });
  }
  const payload = await response.json() as { servers?: RegistryRow[] };
  return Array.isArray(payload.servers)
    ? payload.servers.map((item) => item.server).filter((item): item is RegistryServer => Boolean(item && typeof item === "object"))
    : [];
}

function toManagedMcpName(serverName: string): string {
  const tail = serverName.split("/").pop() || serverName;
  const normalized = tail.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+/, "").replace(/-+$/, "").slice(0, 64);
  return MCP_NAME_RE.test(normalized) ? normalized : `mcp-${Date.now().toString(36)}`.slice(0, 64);
}

function buildUniqueName(baseName: string, existingNames: Set<string>): string {
  if (!existingNames.has(baseName)) {
    return baseName;
  }
  for (let index = 2; index <= 99; index += 1) {
    const suffix = `-${index}`;
    const candidate = `${baseName.slice(0, Math.max(2, 64 - suffix.length))}${suffix}`;
    if (MCP_NAME_RE.test(candidate) && !existingNames.has(candidate)) {
      return candidate;
    }
  }
  return `${baseName.slice(0, 56)}-${Date.now().toString(36).slice(-7)}`;
}

function buildRequirementQueries(requirement: unknown): { requirement: string; terms: string[]; queries: string[] } {
  const text = trimString(requirement);
  if (!text) {
    throw new DesktopMcpServiceError("INVALID_ARGUMENT", "requirement is required", { field: "requirement" });
  }
  const terms = [...new Set(text.toLowerCase().split(/[^a-z0-9._-]+/).map((item) => item.trim()).filter((item) => item.length > 1))];
  const queries = [...new Set([text, ...terms.slice(0, 4)])];
  return { requirement: text, terms, queries };
}

function computeIntentScore(item: DesktopMcpMarketItem, terms: string[], queryIndex: number, resultIndex: number): DesktopMcpMarketIntentItem {
  const text = [item.serverName, item.title, item.description, item.repositoryUrl, item.websiteUrl, ...(item.tags ?? [])].join("\n").toLowerCase();
  const matchedTerms = terms.filter((term) => text.includes(term.toLowerCase()));
  return {
    ...item,
    score: Math.max(30, 120 - queryIndex * 14 - resultIndex * 2) + matchedTerms.length * 8,
    matchedTerms,
    reasons: [
      matchedTerms.length > 0 ? `命中关键词：${matchedTerms.slice(0, 5).join("、")}` : "匹配需求描述",
      item.strategy === "npm-stdio" ? "支持 npm stdio 安装" : "支持远程端点接入",
      `来源平台：${item.platform}`,
    ],
  };
}

export class DesktopMcpService implements DesktopMcpPort {
  private readonly stateFilePath: string;
  private storage: DesktopMcpStorage | null = null;
  private loading: Promise<DesktopMcpStorage> | null = null;

  constructor(
    private readonly configuration: DesktopConfigurationPort,
    private readonly logger: RuntimeLogger,
    private readonly workspaceQuery?: Pick<DesktopWorkspaceQueryPort, "get">,
  ) {
    this.stateFilePath = normalizeStatePath(
      this.configuration.getString("mcp.storage.path")
        ?? process.env.MAOMI_DESKTOP_MCP_STATE_PATH,
    );
  }

  async list(params: DesktopMcpListParams = {}): Promise<DesktopMcpListResponse> {
    const storage = await this.loadStorage();
    const health = latestHealthMap(storage.healthRecords);
    const limit = parseLimit(params.limit, 50);
    const offset = parseOffset(params.offset);
    let items = params.scope === "effective"
      ? resolveEffectiveItems(storage.items, params.workspaceId)
      : storage.items.filter((item) => {
        if (params.scope === "global") {
          return item.scope === "global";
        }
        if (params.scope === "workspace") {
          return item.scope === "workspace" && (!params.workspaceId || item.workspaceId === params.workspaceId);
        }
        return true;
      });
    let views = items.map((item) => toView(item, health.get(item.id)));
    if (params.q?.trim()) {
      const q = params.q.trim().toLowerCase();
      views = views.filter((item) => item.name.toLowerCase().includes(q)
        || item.endpoint.toLowerCase().includes(q)
        || (item.tags ?? []).some((tag) => tag.toLowerCase().includes(q)));
    }
    if (params.status) {
      views = views.filter((item) => deriveStatus(item) === params.status);
    }
    views.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const total = views.length;
    return {
      items: views.slice(offset, offset + limit),
      meta: { total, limit, offset, hasMore: offset + limit < total },
    };
  }

  async effective(params: { workspaceId: string; q?: string; status?: string }): Promise<DesktopMcpEffectiveResponse> {
    const workspaceId = trimString(params.workspaceId);
    if (!workspaceId) {
      throw new DesktopMcpServiceError("INVALID_ARGUMENT", "workspaceId is required", { field: "workspaceId" });
    }
    const storage = await this.loadStorage();
    const health = latestHealthMap(storage.healthRecords);
    let rows = buildEffectiveRows(storage.items, health, workspaceId);
    if (params.q?.trim()) {
      const q = params.q.trim().toLowerCase();
      rows = rows.filter((row) => row.item.name.toLowerCase().includes(q)
        || row.item.endpoint.toLowerCase().includes(q)
        || row.explain.toLowerCase().includes(q));
    }
    if (params.status) {
      rows = rows.filter((row) => deriveStatus(row.item) === params.status);
    }
    return { items: rows };
  }

  async recommended(): Promise<DesktopMcpRecommendedItem[]> {
    const storage = await this.loadStorage();
    const installedNames = new Set(storage.items.map((item) => item.name));
    return RECOMMENDED_ITEMS.map((item) => ({ ...cloneJson(item), installed: installedNames.has(item.name) }));
  }

  async create(input: DesktopMcpDraftInput): Promise<DesktopMcpCreateResponse> {
    const storage = await this.loadStorage();
    const now = nowIso();
    const draft = normalizeDraftInput(input);
    ensureUniqueName(storage, draft);
    const item: DesktopMcpItem = {
      ...draft,
      id: createId("mcp"),
      createdAt: now,
      updatedAt: now,
    };
    storage.items.push(item);
    await this.persistStorage(storage);
    await this.log("info", "Desktop MCP created", { mcpId: item.id, name: item.name, scope: item.scope });
    return { item: toView(item), created: true };
  }

  async patch(mcpId: string, input: DesktopMcpDraftInput): Promise<DesktopMcpView> {
    const storage = await this.loadStorage();
    const index = storage.items.findIndex((item) => item.id === mcpId);
    if (index < 0) {
      throw new DesktopMcpServiceError("NOT_FOUND", "mcp not found", { mcpId });
    }
    const current = storage.items[index];
    const draft = normalizeDraftInput(input, current);
    ensureUniqueName(storage, draft, mcpId);
    const next: DesktopMcpItem = { ...current, ...draft, updatedAt: nowIso() };
    storage.items[index] = next;
    await this.persistStorage(storage);
    await this.log("info", "Desktop MCP updated", { mcpId: next.id, name: next.name, scope: next.scope });
    return toView(next, latestHealthMap(storage.healthRecords).get(next.id));
  }

  async delete(mcpId: string): Promise<DesktopMcpDeleteResponse> {
    const storage = await this.loadStorage();
    const before = storage.items.length;
    storage.items = storage.items.filter((item) => item.id !== mcpId);
    storage.healthRecords = storage.healthRecords.filter((item) => item.mcpId !== mcpId);
    const deleted = storage.items.length !== before;
    if (deleted) {
      await this.persistStorage(storage);
      await this.log("info", "Desktop MCP deleted", { mcpId });
    }
    return { deleted, mcpId };
  }

  async healthHistory(params: { mcpId: string; limit?: number; offset?: number }) {
    const storage = await this.loadStorage();
    const limit = parseLimit(params.limit, 20);
    const offset = parseOffset(params.offset);
    const items = storage.healthRecords
      .filter((record) => record.mcpId === params.mcpId)
      .sort((left, right) => right.checkedAt.localeCompare(left.checkedAt));
    const total = items.length;
    return {
      items: items.slice(offset, offset + limit),
      meta: { total, limit, offset, hasMore: offset + limit < total },
    };
  }

  async runtimeConfig(params: { workspaceId?: string } = {}): Promise<DesktopMcpRuntimeConfig> {
    const storage = await this.loadStorage();
    const config: DesktopMcpRuntimeConfig = {};
    const workspaceDirectory = await this.resolveWorkspaceDirectory(params.workspaceId);
    for (const item of resolveEffectiveItems(storage.items, params.workspaceId)) {
      config[item.name] = toRuntimeEntry(item, { workspaceDirectory });
    }
    return config;
  }

  async runtimeTools(params: { workspaceId?: string } = {}): Promise<DesktopMcpRuntimeTool[]> {
    const storage = await this.loadStorage();
    const items = resolveEffectiveItems(storage.items, params.workspaceId)
      .filter((item) => item.enabled);
    const results = await Promise.allSettled(items.map(async (item) => {
      const probe = await this.buildRuntimeProbeInput(item, params.workspaceId, { forceEnabled: true });
      const tools = await listRuntimeToolsForItem(probe);
      return tools.map((tool) => ({
        mcpId: item.id,
        mcpName: item.name,
        toolName: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        timeoutMs: clampDesktopMcpRequestTimeoutMs(item.timeoutMs),
      } satisfies DesktopMcpRuntimeTool));
    }));

    const runtimeTools: DesktopMcpRuntimeTool[] = [];
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      if (result?.status === "fulfilled") {
        runtimeTools.push(...result.value);
        continue;
      }

      const item = items[index];
      await this.log("warn", "Failed to enumerate MCP runtime tools", {
        context: {
          mcpId: item?.id,
          name: item?.name,
          workspaceId: params.workspaceId,
          error: result?.reason instanceof Error ? result.reason.message : String(result?.reason),
        },
      });
    }

    return runtimeTools;
  }

  async testConnection(mcpId: string): Promise<DesktopMcpTestConnectionResult> {
    const item = await this.requireItem(mcpId);
    return runConnectionProbe(await this.buildRuntimeProbeInput(item, item.workspaceId, { forceEnabled: true }));
  }

  async healthCheck(mcpId: string): Promise<DesktopMcpTestConnectionResult> {
    const storage = await this.loadStorage();
    const item = storage.items.find((row) => row.id === mcpId);
    if (!item) {
      throw new DesktopMcpServiceError("NOT_FOUND", "mcp not found", { mcpId });
    }
    const result = await runConnectionProbe(await this.buildRuntimeProbeInput(item, item.workspaceId, { forceEnabled: true }));
    storage.healthRecords.push({
      recordId: createId("mhr"),
      mcpId,
      status: result.status,
      latencyMs: result.latencyMs,
      checkedAt: nowIso(),
      reasonCode: result.reasonCode,
      message: result.message,
    });
    storage.healthRecords = storage.healthRecords.slice(-1_000);
    await this.persistStorage(storage);
    return result;
  }

  async capabilities(mcpId: string): Promise<DesktopMcpCapabilityProbeResult> {
    const item = await this.requireItem(mcpId);
    return runCapabilityProbe(await this.buildRuntimeProbeInput(item, item.workspaceId, { forceEnabled: true }));
  }

  async executeRuntimeTool(input: {
    workspaceId?: string;
    mcpName: string;
    toolName: string;
    arguments?: Record<string, unknown>;
    timeoutMs?: number;
  }): Promise<unknown> {
    const mcpName = trimString(input.mcpName);
    const toolName = trimString(input.toolName);
    if (!mcpName) {
      throw new DesktopMcpServiceError("INVALID_ARGUMENT", "mcpName is required", { field: "mcpName" });
    }
    if (!toolName) {
      throw new DesktopMcpServiceError("INVALID_ARGUMENT", "toolName is required", { field: "toolName" });
    }

    const item = await this.resolveEffectiveItemByName({
      workspaceId: input.workspaceId,
      mcpName,
    });
    if (!item.enabled) {
      throw new DesktopMcpServiceError("INVALID_ARGUMENT", "mcp is disabled", {
        field: "mcpName",
        mcpName,
        workspaceId: input.workspaceId,
      });
    }

    const probe = await this.buildRuntimeProbeInput(item, input.workspaceId, { forceEnabled: true });
    const timeoutMs = clampDesktopMcpRequestTimeoutMs(input.timeoutMs ?? item.timeoutMs);
    return withSdkClient(probe, `tools/call:${toolName}`, async (client) => {
      await client.listTools(undefined, { timeout: timeoutMs });
      return client.callTool(
        {
          name: toolName,
          ...(input.arguments ? { arguments: input.arguments } : {}),
        },
        undefined,
        { timeout: timeoutMs },
      );
    });
  }

  async installRecommended(id: string, input: { scope?: string; workspaceId?: string } = {}): Promise<DesktopMcpCreateResponse> {
    const template = RECOMMENDED_ITEMS.find((item) => item.id === id || item.name === id);
    if (!template) {
      throw new DesktopMcpServiceError("NOT_FOUND", "recommended MCP not found", { id });
    }
    return this.create({
      name: template.name,
      scope: input.scope === "workspace" ? "workspace" : "global",
      workspaceId: input.workspaceId,
      transport: template.transport,
      endpoint: template.endpoint,
      enabled: template.enabled,
      auth: { mode: "none" },
      timeoutMs: template.timeoutMs,
      tags: template.tags,
      metadata: template.metadata,
      description: template.description,
    });
  }

  async providers(): Promise<DesktopMcpMarketProvidersResponse> {
    return { items: MARKET_PROVIDERS };
  }

  async search(input: DesktopMcpMarketSearchQuery = {}): Promise<DesktopMcpMarketSearchResponse> {
    const provider = normalizeProvider(input.provider);
    const q = trimString(input.q);
    if (!q) {
      throw new DesktopMcpServiceError("INVALID_ARGUMENT", "q is required", { field: "q" });
    }
    const limit = parseLimit(input.limit, 20);
    const servers = await fetchRegistryServers({ q, limit: Math.max(20, limit * 2) });
    const map = new Map<string, DesktopMcpMarketItem>();
    for (const server of servers) {
      const item = toMarketItem(provider, server);
      if (item && !map.has(item.catalogId)) {
        map.set(item.catalogId, item);
      }
    }
    return { provider, items: [...map.values()].slice(0, limit), providers: MARKET_PROVIDERS };
  }

  async searchByRequirement(input: DesktopMcpMarketRequirementQuery = {}): Promise<DesktopMcpMarketSearchByRequirementResponse> {
    const provider = normalizeProvider(input.provider);
    const limit = parseLimit(input.limit, 10);
    const plan = buildRequirementQueries(input.requirement);
    const responses = await Promise.all(plan.queries.map((q) => fetchRegistryServers({ q, limit: Math.max(24, limit * 3) })));
    const map = new Map<string, DesktopMcpMarketIntentItem>();
    responses.forEach((servers, queryIndex) => {
      servers.forEach((server, resultIndex) => {
        const item = toMarketItem(provider, server);
        if (!item) {
          return;
        }
        const scored = computeIntentScore(item, plan.terms, queryIndex, resultIndex);
        const current = map.get(scored.catalogId);
        if (!current || scored.score > current.score) {
          map.set(scored.catalogId, scored);
        }
      });
    });
    const items = [...map.values()].sort((left, right) => right.score - left.score).slice(0, limit);
    return { provider, requirement: plan.requirement, queries: plan.queries, terms: plan.terms, items, providers: MARKET_PROVIDERS };
  }

  async install(input: DesktopMcpMarketInstallInput): Promise<DesktopMcpMarketInstallResponse> {
    const provider = normalizeProvider(input.provider);
    const target = decodeCatalogId(input.catalogId);
    const servers = await fetchRegistryServers({ q: target.name, limit: 100 });
    const server = servers.find((candidate) => trimString(candidate.name) === target.name && (!target.version || !trimString(candidate.version) || trimString(candidate.version) === target.version));
    if (!server) {
      throw new DesktopMcpServiceError("NOT_FOUND", "mcp catalog item not found", { provider, name: target.name, version: target.version });
    }
    const platform = resolvePlatform(server);
    if (provider !== "official" && platform !== provider) {
      throw new DesktopMcpServiceError("INVALID_ARGUMENT", "catalog item platform does not match provider", { provider, platform });
    }
    const plan = resolveInstallPlan(server);
    if (!plan) {
      throw new DesktopMcpServiceError("INVALID_ARGUMENT", "catalog item is not auto-installable", { catalogId: input.catalogId });
    }
    const normalizedCatalogId = encodeCatalogId(trimString(server.name), normalizeOptionalString(server.version));
    const existing = await this.list({ scope: "global", limit: 1000, offset: 0 });
    const existingByCatalog = existing.items.find((item) => {
      const market = item.metadata?.market;
      return market && typeof market === "object" && !Array.isArray(market) && trimString((market as Record<string, unknown>).catalogId) === normalizedCatalogId;
    });
    if (existingByCatalog) {
      return { provider, catalogId: normalizedCatalogId, item: existingByCatalog, created: false };
    }
    const name = buildUniqueName(toManagedMcpName(trimString(server.name)), new Set(existing.items.map((item) => item.name)));
    const created = await this.create({
      name,
      scope: "global",
      transport: plan.transport,
      endpoint: plan.endpoint,
      enabled: input.enabled === undefined ? true : Boolean(input.enabled),
      auth: { mode: "none" },
      timeoutMs: 15_000,
      tags: [...new Set([...(asStringArray(server.tags) ?? []), platform, "market"])],
      metadata: {
        ...(plan.metadata ?? {}),
        market: {
          provider,
          platform,
          catalogId: normalizedCatalogId,
          source: "registry.modelcontextprotocol.io",
          serverName: trimString(server.name),
          version: normalizeOptionalString(server.version),
          repositoryUrl: normalizeOptionalString(server.repository?.url),
          websiteUrl: normalizeOptionalString(server.websiteUrl),
        },
      },
      description: normalizeOptionalString(server.description),
    });
    return { provider, catalogId: normalizedCatalogId, item: created.item, created: true };
  }

  async autoInstallByRequirement(input: DesktopMcpMarketAutoInstallInput): Promise<DesktopMcpMarketAutoInstallResponse> {
    const discovery = await this.searchByRequirement({
      provider: input.provider,
      requirement: input.requirement,
      limit: parseLimit(input.limit, 6),
    });
    const selected = discovery.items[0];
    if (!selected) {
      throw new DesktopMcpServiceError("NOT_FOUND", "no installable mcp matched this requirement", { requirement: discovery.requirement });
    }
    const installation = await this.install({ provider: discovery.provider, catalogId: selected.catalogId, enabled: input.enabled });
    return {
      provider: discovery.provider,
      requirement: discovery.requirement,
      queries: discovery.queries,
      terms: discovery.terms,
      selected,
      candidates: discovery.items,
      installation,
    };
  }

  private async requireItem(mcpId: string): Promise<DesktopMcpItem> {
    const storage = await this.loadStorage();
    const item = storage.items.find((row) => row.id === mcpId);
    if (!item) {
      throw new DesktopMcpServiceError("NOT_FOUND", "mcp not found", { mcpId });
    }
    return item;
  }

  private async resolveWorkspaceDirectory(workspaceId?: string): Promise<string | undefined> {
    if (!workspaceId || !this.workspaceQuery) {
      return undefined;
    }

    try {
      const workspace = await this.workspaceQuery.get(workspaceId);
      return normalizeOptionalString(workspace?.directoryPath);
    } catch {
      return undefined;
    }
  }

  private async buildRuntimeProbeInput(
    item: DesktopMcpItem,
    workspaceId?: string,
    options?: { forceEnabled?: boolean },
  ): Promise<ProbeInput> {
    return {
      ...buildProbeInput(item, options),
      workspaceDirectory: await this.resolveWorkspaceDirectory(workspaceId ?? item.workspaceId),
    };
  }

  private async resolveEffectiveItemByName(input: {
    workspaceId?: string;
    mcpName: string;
  }): Promise<DesktopMcpItem> {
    const storage = await this.loadStorage();
    const item = resolveEffectiveItems(storage.items, input.workspaceId)
      .find((entry) => entry.name === input.mcpName);
    if (!item) {
      throw new DesktopMcpServiceError("NOT_FOUND", "effective mcp not found", {
        mcpName: input.mcpName,
        workspaceId: input.workspaceId,
      });
    }
    return item;
  }

  private async loadStorage(): Promise<DesktopMcpStorage> {
    if (this.storage) {
      return this.storage;
    }
    if (this.loading) {
      return this.loading;
    }
    this.loading = (async () => {
      try {
        const raw = await fs.readFile(this.stateFilePath, "utf-8");
        this.storage = normalizeStorage(JSON.parse(raw));
      } catch {
        this.storage = createEmptyStorage();
      }
      return this.storage;
    })();
    try {
      return await this.loading;
    } finally {
      this.loading = null;
    }
  }

  private async persistStorage(storage: DesktopMcpStorage): Promise<void> {
    const next = { ...cloneJson(storage), updatedAt: nowIso() };
    this.storage = next;
    await fs.mkdir(dirname(this.stateFilePath), { recursive: true });
    await fs.writeFile(this.stateFilePath, JSON.stringify(next, null, 2), "utf-8");
  }

  private async log(level: "info" | "warn" | "error", message: string, context?: Record<string, unknown>): Promise<void> {
    try {
      await this.logger[level](message, { context });
    } catch {
      // Logging must not block MCP state operations.
    }
  }
}
