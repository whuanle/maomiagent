import type { Translate } from "../../i18n"
import type {
  McpCapabilityProbeResult,
  McpHealthStatus,
  McpMarketItem,
  McpMarketProvider,
  McpMarketProviderId,
  McpScope,
  McpTransport,
  McpView,
} from "../../lib/desktop-mcp"

export type McpForm = {
  name: string
  scope: McpScope
  workspaceId: string
  transport: McpTransport
  endpoint: string
  enabled: boolean
  timeoutMs: string
  tagsText: string
  description: string
  argsText: string
  envText: string
  headersText: string
  queryText: string
}

export type MarketViewItem = McpMarketItem & {
  score?: number
  matchedTerms?: string[]
  reasons?: string[]
}

export type TestResult = {
  status: McpHealthStatus
  latencyMs: number
  reasonCode?: string
  message?: string
}

export function requiresManualConnectionTest(form: Pick<McpForm, "enabled">): boolean {
  return form.enabled
}

export function canSaveMcpDraft(
  form: Pick<McpForm, "enabled">,
  testResult: TestResult | null,
): boolean {
  if (!requiresManualConnectionTest(form)) {
    return true
  }

  return testResult?.status === "healthy"
}

export function shouldShowMcpSaveButton(
  _form: Pick<McpForm, "enabled">,
  _testResult: TestResult | null,
): boolean {
  return true
}

function areJsonValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

type McpConnectionSnapshot = Pick<
  McpView,
  "enabled" | "transport" | "endpoint" | "timeoutMs" | "metadata" | "auth"
>

function hasConnectionRelevantChanges(
  current: McpConnectionSnapshot,
  next: Pick<McpConnectionSnapshot, "transport" | "endpoint" | "timeoutMs" | "metadata" | "auth">,
): boolean {
  return current.transport !== next.transport
    || current.endpoint !== next.endpoint
    || current.timeoutMs !== next.timeoutMs
    || !areJsonValuesEqual(current.auth, next.auth)
    || !areJsonValuesEqual(current.metadata, next.metadata)
}

export const initialForm: McpForm = {
  name: "",
  scope: "global",
  workspaceId: "",
  transport: "stdio",
  endpoint: "npx",
  enabled: false,
  timeoutMs: "30000",
  tagsText: "",
  description: "",
  argsText: "-y\n@playwright/mcp@latest\n--headless",
  envText: "",
  headersText: "",
  queryText: "",
}

export const defaultMarketProviders: McpMarketProvider[] = [
  { id: "official", label: "MCP Official Registry" },
  { id: "smithery", label: "Smithery" },
  { id: "pulsemcp", label: "PulseMCP" },
]

function normalizeComparableText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
}

function normalizeMarketEndpoint(value: string): string {
  const trimmed = value.trim()
  const normalized = trimmed.replace(/\/+$/, "")
  return normalizeComparableText(normalized || trimmed)
}

export function formatDateTime(value?: string): string {
  if (!value) {
    return "-"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

export function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export function buildMarketDisplayKey(input: {
  endpoint: string
  platform?: string
  provider?: string
  serverName: string
  transport: string
}): string {
  return [
    normalizeComparableText(input.platform || input.provider || "official"),
    normalizeComparableText(input.serverName),
    normalizeComparableText(input.transport),
    normalizeMarketEndpoint(input.endpoint),
  ].join("|")
}

export function dedupeMarketViewItems<T extends McpMarketItem>(items: T[]): T[] {
  const output: T[] = []
  const seen = new Set<string>()

  for (const item of items) {
    const key = buildMarketDisplayKey(item)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    output.push(item)
  }

  return output
}

export function buildInstalledMarketDisplayKey(item: McpView): string | null {
  const metadata = toMetadataRecord(item.metadata)
  const market = toMetadataRecord(metadata?.market)
  const serverName = typeof market?.serverName === "string" ? market.serverName.trim() : ""
  if (!serverName) {
    return null
  }

  const platform =
    typeof market?.platform === "string"
      ? market.platform
      : typeof market?.provider === "string"
        ? market.provider
        : "official"

  return buildMarketDisplayKey({
    endpoint: item.endpoint,
    platform,
    serverName,
    transport: item.transport,
  })
}

export function parseKeyValueText(text: string): Record<string, string> {
  const output: Record<string, string> = {}
  const rows = text.split(/\r?\n/)
  for (const row of rows) {
    const trimmed = row.trim()
    if (!trimmed) {
      continue
    }
    const index = trimmed.indexOf("=")
    if (index < 1) {
      continue
    }
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim()
    if (!key) {
      continue
    }
    output[key] = value
  }
  return output
}

export function toKeyValueText(source: unknown): string {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return ""
  }

  const rows = Object.entries(source as Record<string, unknown>)
    .filter(([key, value]) => key.trim() && typeof value === "string")
    .map(([key, value]) => `${key}=${value}`)
  return rows.join("\n")
}

export function toMetadataRecord(source: unknown): Record<string, unknown> | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null
  }
  return source as Record<string, unknown>
}

export function buildInspectEndpoint(endpoint: string, metadata: unknown): string {
  const trimmedEndpoint = endpoint.trim()
  if (!trimmedEndpoint) {
    return endpoint
  }

  const metadataRecord = toMetadataRecord(metadata)
  const queryRecord = toMetadataRecord(metadataRecord?.query)
  if (!queryRecord) {
    return trimmedEndpoint
  }

  try {
    const url = new URL(trimmedEndpoint)
    for (const [key, value] of Object.entries(queryRecord)) {
      const queryKey = key.trim()
      if (!queryKey || value === undefined || value === null) {
        continue
      }

      if (
        typeof value === "string"
        || typeof value === "number"
        || typeof value === "boolean"
      ) {
        url.searchParams.set(queryKey, String(value))
      }
    }

    return url.toString()
  } catch {
    return trimmedEndpoint
  }
}

export function deriveListStatus(item: McpView): McpHealthStatus | "disabled" {
  if (!item.enabled) {
    return "disabled"
  }
  if (!item.health) {
    return "warning"
  }
  return item.health.status
}

export function statusTagColor(status: McpHealthStatus | "disabled") {
  if (status === "healthy") {
    return "success" as const
  }
  if (status === "warning") {
    return "warning" as const
  }
  if (status === "down") {
    return "error" as const
  }
  return "default" as const
}

export function scopeTagColor(scope: McpScope) {
  return scope === "global" ? "blue" as const : "gold" as const
}

export function marketStateTagColor(installed: boolean) {
  return installed ? "success" as const : "processing" as const
}

export function marketProviderLabel(
  t: Translate,
  provider: McpMarketProviderId,
  fallback?: string,
): string {
  if (provider === "official") {
    return t("MCP页.市场.来源.official")
  }
  if (provider === "smithery") {
    return t("MCP页.市场.来源.smithery")
  }
  if (provider === "pulsemcp") {
    return t("MCP页.市场.来源.pulsemcp")
  }
  return fallback || provider
}

export function hasDiscoveredTools(result: McpCapabilityProbeResult | null | undefined): boolean {
  return Array.isArray(result?.toolDetails) && result.toolDetails.length > 0
}

export function toPayload(form: McpForm): Record<string, unknown> {
  const tags = form.tagsText
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  const metadata: Record<string, unknown> = {}
  if (form.transport === "stdio") {
    const args = form.argsText
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
    const env = parseKeyValueText(form.envText)
    if (args.length > 0) {
      metadata.args = args
    }
    if (Object.keys(env).length > 0) {
      metadata.env = env
    }
  } else {
    const headers = parseKeyValueText(form.headersText)
    const query = parseKeyValueText(form.queryText)
    if (Object.keys(headers).length > 0) {
      metadata.headers = headers
    }
    if (Object.keys(query).length > 0) {
      metadata.query = query
    }
  }

  return {
    name: form.name.trim(),
    scope: form.scope,
    workspaceId: form.scope === "workspace" ? form.workspaceId.trim() : undefined,
    transport: form.transport,
    endpoint: form.endpoint.trim(),
    enabled: form.enabled,
    timeoutMs: form.timeoutMs.trim() ? Number(form.timeoutMs.trim()) : undefined,
    tags: tags.length > 0 ? tags : undefined,
    description: form.description.trim() || undefined,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    auth: { mode: "none" },
  }
}

export function buildMcpSavePayload(
  form: McpForm,
  testResult: TestResult | null,
  editingItem: McpConnectionSnapshot | null,
): Record<string, unknown> {
  const payload = toPayload(form)
  if (!form.enabled) {
    return payload
  }

  if (testResult?.status === "healthy") {
    return payload
  }

  if (
    editingItem?.enabled
    && !hasConnectionRelevantChanges(editingItem, {
      transport: payload.transport as McpTransport,
      endpoint: payload.endpoint as string,
      timeoutMs: payload.timeoutMs as number | undefined,
      metadata: payload.metadata as Record<string, unknown> | undefined,
      auth: payload.auth as McpConnectionSnapshot["auth"],
    })
  ) {
    return payload
  }

  return {
    ...payload,
    enabled: false,
  }
}
