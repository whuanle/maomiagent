import type { RuntimeLogger } from "../../../logs";
import {
  AGENT_MODE_VALUES,
  AGENT_SOURCE_VALUES,
  type AgentBundleMemberInput,
  type AgentCreateInput,
  type AgentIdentity,
  type AgentItem,
  type AgentModelStrategy,
  type AgentPatchInput,
  type AgentSkillsConfig,
  type AgentSource,
  type AgentSubAgentPolicy,
  type AgentWorkflowConfig,
  type AgentsListQuery,
  type AgentsListResponse,
  type DesktopAgentBundleSaveInput,
  type DesktopAgentBundleSaveResponse,
  type DesktopAgentBundleView,
  type DesktopAgentCreateResponse,
  type DesktopAgentDeleteResponse,
  type OpencodeAgentImportFormat,
  type OpencodeAgentImportInput,
  type OpencodeAgentImportPreview,
  type OpencodeAgentImportResult,
} from "../../abstraction/models/desktop-agents.models";
import type { DesktopAgentsPort } from "../../abstraction/ports/desktop-agents.ports";
import { DEFAULT_DESKTOP_PRIMARY_AGENT_ID } from "../../../../../shared/conversation/managed-execution";
import { BUILTIN_MAOMI_AGENTS } from "./builtin-agents";
import type { DesktopAgentsStore } from "../stores/desktop-agents-store";

const AGENT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$/;
const WRITABLE_AGENT_SOURCES = new Set<AgentSource>(["user-custom", "workspace-local"]);
const DEFAULT_PAGE_LIMIT = 1000;

type ParsedImportDraft = {
  agentId: string;
  payload: Record<string, unknown>;
};

const OPENCODE_SINGLE_AGENT_FIELD_KEYS = new Set([
  "agentId",
  "id",
  "name",
  "label",
  "description",
  "mode",
  "enabled",
  "hidden",
  "prompt",
  "model",
  "modelStrategy",
  "tools",
  "skills",
  "workflow",
  "identity",
  "temperature",
  "topP",
  "top_p",
  "steps",
  "max_steps",
  "maxSteps",
  "permission",
  "sandbox",
  "subAgentPolicy",
  "sub_agent_policy",
  "options",
]);

class DesktopAgentsError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function trimText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function trimNullableText(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return trimText(value);
}

function normalizeAgentId(value: unknown, field = "agentId"): string {
  if (typeof value !== "string" || !AGENT_ID_RE.test(value.trim())) {
    throw new DesktopAgentsError("INVALID_ARGUMENT", "invalid agentId format", {
      field,
    });
  }

  return value.trim();
}

function normalizeMode(value: unknown, fallback: AgentItem["mode"] = "primary"): AgentItem["mode"] {
  return AGENT_MODE_VALUES.includes(value as AgentItem["mode"])
    ? value as AgentItem["mode"]
    : fallback;
}

function normalizeFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map((item) => trimText(item))
      .filter((item): item is string => Boolean(item)),
  )];
}

function normalizeSubAgentPolicy(
  value: unknown,
  currentAgentId?: string,
): AgentSubAgentPolicy | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const mode = value.mode === "allow_list" ? "allow_list" : value.mode === "all" ? "all" : undefined;
  if (!mode) {
    return undefined;
  }

  if (mode === "allow_list") {
    const allowedAgentIds = normalizeStringArray(value.allowedAgentIds).filter((item) => item !== currentAgentId);
    return {
      mode,
      ...(allowedAgentIds.length > 0 ? { allowedAgentIds } : {}),
    };
  }

  return { mode: "all" };
}

function getAllowedAgentIds(item: Pick<AgentItem, "subAgentPolicy"> | null | undefined): string[] {
  if (item?.subAgentPolicy?.mode !== "allow_list") {
    return [];
  }

  return normalizeStringArray(item.subAgentPolicy.allowedAgentIds);
}

function normalizeModelStrategy(value: unknown): AgentModelStrategy | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const primary = trimText(value.primary);
  const fallback = normalizeStringArray(value.fallback);
  if (!primary && fallback.length === 0) {
    return undefined;
  }

  return {
    ...(primary ? { primary } : {}),
    ...(fallback.length > 0 ? { fallback } : {}),
  };
}

function normalizeIdentity(value: unknown): AgentIdentity | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const name = trimText(value.name);
  const emoji = trimText(value.emoji);
  const theme = trimText(value.theme);
  if (!name && !emoji && !theme) {
    return undefined;
  }

  return {
    ...(name ? { name } : {}),
    ...(emoji ? { emoji } : {}),
    ...(theme ? { theme } : {}),
  };
}

function normalizeSkills(value: unknown): AgentSkillsConfig | undefined {
  if (!isRecord(value) || !Array.isArray(value.bindings)) {
    return undefined;
  }

  const bindings = value.bindings
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const skillId = trimText(item.skillId);
      if (!skillId) {
        return null;
      }

      return {
        skillId,
        ...(typeof item.enabled === "boolean" ? { enabled: item.enabled } : {}),
        ...(isRecord(item.params) ? { params: item.params } : {}),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return bindings.length > 0 ? { bindings } : undefined;
}

function normalizeWorkflow(value: unknown): AgentWorkflowConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const goal = trimText(value.goal);
  const steps = normalizeStringArray(value.steps);
  const uiMode = trimText(value.uiMode);
  if (!goal && steps.length === 0 && !uiMode) {
    return undefined;
  }

  return {
    ...(goal ? { goal } : {}),
    ...(steps.length > 0 ? { steps } : {}),
    ...(uiMode ? { uiMode } : {}),
  };
}

function normalizePermission(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function resolvePermissionCompat(
  permission: unknown,
  sandbox: unknown,
): Record<string, unknown> | undefined {
  if (isRecord(permission)) {
    return permission;
  }

  const sandboxValue = trimText(sandbox);
  return sandboxValue ? { sandbox: sandboxValue } : undefined;
}

function sortAgentItems(items: AgentItem[]): AgentItem[] {
  const sourceOrder = (source: AgentItem["source"]) => {
    if (source === "builtin-maomi") return 0;
    if (source === "workspace-local") return 1;
    if (source === "user-custom") return 2;
    if (source === "installed-package") return 3;
    return 4;
  };

  return [...items].sort((left, right) => {
    const sourceRank = sourceOrder(left.source) - sourceOrder(right.source);
    if (sourceRank !== 0) {
      return sourceRank;
    }

    const defaultAgentRank = Number(right.agentId === DEFAULT_DESKTOP_PRIMARY_AGENT_ID)
      - Number(left.agentId === DEFAULT_DESKTOP_PRIMARY_AGENT_ID);
    if (defaultAgentRank !== 0) {
      return defaultAgentRank;
    }

    const byName = left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (byName !== 0) {
      return byName;
    }

    return left.agentId.localeCompare(right.agentId, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function paginate(items: AgentItem[]): AgentsListResponse["meta"] {
  return {
    total: items.length,
    limit: Math.max(items.length, DEFAULT_PAGE_LIMIT),
    offset: 0,
    hasMore: false,
  };
}

function buildImportedAgentMetadata(format: OpencodeAgentImportFormat): Record<string, unknown> {
  return {
    importedFrom: "desktop-agent-import",
    importedFormat: format,
  };
}

function parseSimpleYamlScalar(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null" || trimmed === "~") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\""))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => parseSimpleYamlScalar(item));
  }

  return trimmed;
}

function splitYamlKeyValue(line: string): { key: string; rawValue: string } | null {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const key = line.slice(0, separatorIndex).trim();
  if (!key) {
    return null;
  }

  return {
    key,
    rawValue: line.slice(separatorIndex + 1),
  };
}

function findNextYamlContentLine(lines: string[], startIndex: number): number {
  for (let index = startIndex; index < lines.length; index += 1) {
    const text = lines[index]?.trim() ?? "";
    if (!text || text.startsWith("#")) {
      continue;
    }
    return index;
  }

  return -1;
}

function countYamlIndent(rawLine: string): number {
  const matched = rawLine.match(/^ */);
  return matched?.[0]?.length ?? 0;
}

function parseSimpleYamlBlock(
  lines: string[],
  startIndex: number,
  indent: number,
): { value: unknown; nextIndex: number } {
  let index = startIndex;
  let arrayMode = false;
  const objectValue: Record<string, unknown> = {};
  const arrayValue: unknown[] = [];

  while (index < lines.length) {
    const rawLine = lines[index] ?? "";
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      index += 1;
      continue;
    }

    const currentIndent = countYamlIndent(rawLine);
    if (currentIndent < indent) {
      break;
    }
    if (currentIndent > indent) {
      throw new DesktopAgentsError("INVALID_ARGUMENT", "invalid markdown frontmatter indent", {
        line: index + 1,
      });
    }

    const line = rawLine.slice(indent);
    if (line.startsWith("- ")) {
      if (!arrayMode && Object.keys(objectValue).length > 0) {
        throw new DesktopAgentsError(
          "INVALID_ARGUMENT",
          "markdown frontmatter cannot mix map and list entries",
          { line: index + 1 },
        );
      }

      arrayMode = true;
      const itemText = line.slice(2);
      if (!itemText.trim()) {
        const nextIndex = findNextYamlContentLine(lines, index + 1);
        if (nextIndex < 0) {
          arrayValue.push("");
          index += 1;
          continue;
        }
        const nextIndent = countYamlIndent(lines[nextIndex] ?? "");
        if (nextIndent <= indent) {
          arrayValue.push("");
          index += 1;
          continue;
        }
        const nested = parseSimpleYamlBlock(lines, index + 1, indent + 2);
        arrayValue.push(nested.value);
        index = nested.nextIndex;
        continue;
      }

      const inlineEntry = splitYamlKeyValue(itemText);
      if (inlineEntry && !inlineEntry.rawValue.trim()) {
        const nextIndex = findNextYamlContentLine(lines, index + 1);
        const nextIndent = nextIndex >= 0 ? countYamlIndent(lines[nextIndex] ?? "") : 0;
        const nested =
          nextIndex >= 0 && nextIndent > indent
            ? parseSimpleYamlBlock(lines, index + 1, indent + 2)
            : { value: "", nextIndex: index + 1 };
        arrayValue.push({
          [inlineEntry.key]: nested.value,
        });
        index = nested.nextIndex;
        continue;
      }

      arrayValue.push(
        inlineEntry
          ? { [inlineEntry.key]: parseSimpleYamlScalar(inlineEntry.rawValue) }
          : parseSimpleYamlScalar(itemText),
      );
      index += 1;
      continue;
    }

    if (arrayMode) {
      throw new DesktopAgentsError(
        "INVALID_ARGUMENT",
        "markdown frontmatter cannot mix list and map entries",
        { line: index + 1 },
      );
    }

    const entry = splitYamlKeyValue(line);
    if (!entry) {
      throw new DesktopAgentsError("INVALID_ARGUMENT", "invalid markdown frontmatter entry", {
        line: index + 1,
      });
    }

    if (!entry.rawValue.trim()) {
      const nextIndex = findNextYamlContentLine(lines, index + 1);
      const nextIndent = nextIndex >= 0 ? countYamlIndent(lines[nextIndex] ?? "") : 0;
      const nested =
        nextIndex >= 0 && nextIndent > indent
          ? parseSimpleYamlBlock(lines, index + 1, indent + 2)
          : { value: "", nextIndex: index + 1 };
      objectValue[entry.key] = nested.value;
      index = nested.nextIndex;
      continue;
    }

    objectValue[entry.key] = parseSimpleYamlScalar(entry.rawValue);
    index += 1;
  }

  return {
    value: arrayMode ? arrayValue : objectValue,
    nextIndex: index,
  };
}

function parseSimpleYamlFrontmatter(frontmatter: string): Record<string, unknown> {
  const normalized = frontmatter.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return {};
  }

  const parsed = parseSimpleYamlBlock(normalized.split("\n"), 0, 0).value;
  if (!isRecord(parsed)) {
    throw new DesktopAgentsError("INVALID_ARGUMENT", "markdown frontmatter must be an object");
  }

  return parsed;
}

function splitMarkdownFrontmatter(content: string): { frontmatter: string; body: string } {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if ((lines[0] ?? "").trim() !== "---") {
    throw new DesktopAgentsError(
      "INVALID_ARGUMENT",
      "markdown import must start with YAML frontmatter",
    );
  }

  let closingIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    const trimmed = (lines[index] ?? "").trim();
    if (trimmed === "---" || trimmed === "...") {
      closingIndex = index;
      break;
    }
  }

  if (closingIndex < 0) {
    throw new DesktopAgentsError(
      "INVALID_ARGUMENT",
      "markdown import frontmatter is missing a closing delimiter",
    );
  }

  return {
    frontmatter: lines.slice(1, closingIndex).join("\n"),
    body: lines.slice(closingIndex + 1).join("\n").trim(),
  };
}

function looksLikeSingleOpencodeAgentConfig(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => OPENCODE_SINGLE_AGENT_FIELD_KEYS.has(key));
}

function normalizeImportedSubAgentPolicy(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const allowedAgentIds = Array.isArray(value.allowedAgentIds)
    ? value.allowedAgentIds
    : Array.isArray(value.allowed_agent_ids)
      ? value.allowed_agent_ids
      : undefined;
  const normalized = normalizeSubAgentPolicy({
    mode: value.mode,
    allowedAgentIds,
  });

  return normalized
    ? {
        mode: normalized.mode,
        ...(normalized.allowedAgentIds ? { allowedAgentIds: normalized.allowedAgentIds } : {}),
      }
    : undefined;
}

function buildOpencodeImportPayload(input: {
  agentId: string;
  raw: Record<string, unknown>;
  format: OpencodeAgentImportFormat;
  enabled: boolean;
  markdownPrompt?: string;
}): Record<string, unknown> {
  const maomiOptions =
    isRecord(input.raw.options) && isRecord(input.raw.options.maomi)
      ? input.raw.options.maomi
      : undefined;
  const prompt =
    input.markdownPrompt !== undefined
      ? input.markdownPrompt
      : typeof input.raw.prompt === "string"
        ? input.raw.prompt
        : undefined;

  return {
    agentId: input.agentId,
    name: trimText(input.raw.name) ?? trimText(input.raw.label),
    description: typeof input.raw.description === "string" ? input.raw.description : undefined,
    mode: AGENT_MODE_VALUES.includes(input.raw.mode as AgentItem["mode"])
      ? input.raw.mode
      : undefined,
    enabled: input.enabled,
    hidden: typeof input.raw.hidden === "boolean" ? input.raw.hidden : undefined,
    prompt,
    model: trimText(input.raw.model),
    modelStrategy: input.raw.modelStrategy,
    identity: maomiOptions?.identity ?? input.raw.identity,
    tools: input.raw.tools,
    skills: maomiOptions?.skills ?? input.raw.skills,
    workflow: maomiOptions?.workflow ?? input.raw.workflow,
    temperature: normalizeFiniteNumber(input.raw.temperature),
    topP: normalizeFiniteNumber(input.raw.topP ?? input.raw.top_p),
    steps: normalizeFiniteNumber(input.raw.steps ?? input.raw.max_steps ?? input.raw.maxSteps),
    permission: input.raw.permission,
    sandbox: input.raw.sandbox,
    subAgentPolicy: normalizeImportedSubAgentPolicy(
      input.raw.subAgentPolicy ?? input.raw.sub_agent_policy,
    ),
    metadata: buildImportedAgentMetadata(input.format),
  };
}

function parseOpencodeJsonImport(input: {
  content: string;
  agentId?: string;
  enabled: boolean;
}): ParsedImportDraft[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(input.content);
  } catch (error) {
    throw new DesktopAgentsError("INVALID_ARGUMENT", "invalid agent import JSON", {
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  if (!isRecord(parsed)) {
    throw new DesktopAgentsError("INVALID_ARGUMENT", "agent import JSON must be an object");
  }

  const source = isRecord(parsed.agents) ? parsed.agents : parsed;
  if (looksLikeSingleOpencodeAgentConfig(source)) {
    const agentId = normalizeAgentId(input.agentId ?? source.agentId ?? source.id);
    return [{
      agentId,
      payload: buildOpencodeImportPayload({
        agentId,
        raw: source,
        format: "json",
        enabled: input.enabled,
      }),
    }];
  }

  const entries = Object.entries(source);
  if (entries.length === 0) {
    throw new DesktopAgentsError("INVALID_ARGUMENT", "agent import JSON is empty");
  }
  if (!entries.every(([, value]) => isRecord(value))) {
    throw new DesktopAgentsError(
      "INVALID_ARGUMENT",
      "agent import JSON must be a single agent object or an agent map",
    );
  }

  return entries.map(([agentId, value]) => {
    const normalizedAgentId = normalizeAgentId(agentId);
    return {
      agentId: normalizedAgentId,
      payload: buildOpencodeImportPayload({
        agentId: normalizedAgentId,
        raw: value as Record<string, unknown>,
        format: "json",
        enabled: input.enabled,
      }),
    };
  });
}

function parseOpencodeMarkdownImport(input: {
  content: string;
  agentId?: string;
  enabled: boolean;
}): ParsedImportDraft[] {
  const { frontmatter, body } = splitMarkdownFrontmatter(input.content);
  const parsedFrontmatter = parseSimpleYamlFrontmatter(frontmatter);
  const agentId = normalizeAgentId(
    input.agentId
      ?? parsedFrontmatter.agentId
      ?? parsedFrontmatter.agent_id
      ?? parsedFrontmatter.id,
  );

  return [{
    agentId,
    payload: buildOpencodeImportPayload({
      agentId,
      raw: parsedFrontmatter,
      format: "markdown",
      enabled: input.enabled,
      markdownPrompt: body,
    }),
  }];
}

function parseImportInput(input: OpencodeAgentImportInput): {
  format: OpencodeAgentImportFormat;
  drafts: ParsedImportDraft[];
} {
  if (input.format !== "json" && input.format !== "markdown") {
    throw new DesktopAgentsError("INVALID_ARGUMENT", "format is required", {
      field: "format",
    });
  }

  const content = trimText(input.content);
  if (!content) {
    throw new DesktopAgentsError("INVALID_ARGUMENT", "content is required", {
      field: "content",
    });
  }

  const enabled = input.enabled === undefined ? true : Boolean(input.enabled);
  const agentId = trimText(input.agentId);
  const drafts = input.format === "markdown"
    ? parseOpencodeMarkdownImport({ content, agentId, enabled })
    : parseOpencodeJsonImport({ content, agentId, enabled });

  return {
    format: input.format,
    drafts,
  };
}

function matchesQuery(item: AgentItem, query: string): boolean {
  return [
    item.agentId,
    item.name,
    item.description ?? "",
    item.prompt ?? "",
    item.mode,
    item.source,
    item.version,
  ].join("\n").toLowerCase().includes(query);
}

function isWritableAgent(item: Pick<AgentItem, "source"> | null | undefined): boolean {
  return Boolean(item && WRITABLE_AGENT_SOURCES.has(item.source));
}

function coerceSource(value: unknown, fallback: AgentSource): AgentSource {
  return AGENT_SOURCE_VALUES.includes(value as AgentSource)
    ? value as AgentSource
    : fallback;
}

function buildImportedAgentItem(input: {
  agentId: string;
  payload: Record<string, unknown>;
  existing?: AgentItem;
}): AgentItem {
  const now = nowIso();
  const mergedMetadata = isRecord(input.payload.metadata)
    ? {
        ...(input.existing?.metadata ?? {}),
        ...input.payload.metadata,
      }
    : input.existing?.metadata;

  return {
    agentId: input.agentId,
    name:
      trimText(input.payload.name)
      ?? trimText(input.payload.label)
      ?? input.existing?.name
      ?? input.agentId,
    description:
      typeof input.payload.description === "string"
        ? input.payload.description
        : input.existing?.description,
    mode:
      input.payload.mode === undefined
        ? input.existing?.mode ?? "primary"
        : normalizeMode(input.payload.mode),
    enabled:
      input.payload.enabled === undefined
        ? input.existing?.enabled ?? true
        : Boolean(input.payload.enabled),
    version: input.existing?.version ?? "1",
    source: input.existing?.source ?? "workspace-local",
    hidden:
      input.payload.hidden === undefined
        ? input.existing?.hidden
        : Boolean(input.payload.hidden),
    prompt:
      input.payload.prompt === undefined
        ? input.existing?.prompt
        : trimText(input.payload.prompt),
    model:
      input.payload.model === undefined
        ? input.existing?.model
        : trimText(input.payload.model),
    modelStrategy:
      input.payload.modelStrategy === undefined
        ? input.existing?.modelStrategy
        : normalizeModelStrategy(input.payload.modelStrategy),
    identity:
      input.payload.identity === undefined
        ? input.existing?.identity
        : normalizeIdentity(input.payload.identity),
    tools:
      input.payload.tools === undefined
        ? input.existing?.tools
        : (isRecord(input.payload.tools) ? input.payload.tools : undefined),
    skills:
      input.payload.skills === undefined
        ? input.existing?.skills
        : normalizeSkills(input.payload.skills),
    workflow:
      input.payload.workflow === undefined
        ? input.existing?.workflow
        : normalizeWorkflow(input.payload.workflow),
    temperature:
      input.payload.temperature === undefined
        ? input.existing?.temperature
        : normalizeFiniteNumber(input.payload.temperature),
    topP:
      input.payload.topP === undefined
        ? input.existing?.topP
        : normalizeFiniteNumber(input.payload.topP),
    steps:
      input.payload.steps === undefined
        ? input.existing?.steps
        : normalizeFiniteNumber(input.payload.steps),
    permission:
      input.payload.permission === undefined && input.payload.sandbox === undefined
        ? input.existing?.permission
        : resolvePermissionCompat(input.payload.permission, input.payload.sandbox),
    subAgentPolicy:
      input.payload.subAgentPolicy === undefined
        ? input.existing?.subAgentPolicy
        : normalizeSubAgentPolicy(input.payload.subAgentPolicy, input.agentId),
    metadata: mergedMetadata,
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function buildManualAgent(input: {
  agentId: string;
  payload: AgentCreateInput;
  source: AgentSource;
}): AgentItem {
  const now = nowIso();
  return {
    agentId: input.agentId,
    name: trimText(input.payload.name) ?? input.agentId,
    description: trimText(input.payload.description),
    mode: normalizeMode(input.payload.mode),
    enabled: input.payload.enabled !== false,
    version: "1",
    source: input.source,
    prompt: trimText(input.payload.prompt),
    subAgentPolicy: normalizeSubAgentPolicy(input.payload.subAgentPolicy, input.agentId),
    createdAt: now,
    updatedAt: now,
  };
}

function buildBundleMetadata(input: {
  existing?: AgentItem;
  primaryAgentId?: string;
}): Record<string, unknown> | undefined {
  const next = isRecord(input.existing?.metadata)
    ? { ...input.existing.metadata }
    : {};

  if (input.primaryAgentId) {
    next.primaryAgentIds = [input.primaryAgentId];
    next.managedBy = "desktop-agent-bundle";
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function buildBundleMemberItem(input: {
  draft: AgentBundleMemberInput;
  existing?: AgentItem;
  fallbackMode: AgentItem["mode"];
  source: AgentSource;
  primaryAgentId?: string;
  subAgentPolicy?: AgentSubAgentPolicy;
}): AgentItem {
  const now = nowIso();

  return {
    agentId: normalizeAgentId(input.draft.agentId),
    name: trimText(input.draft.name) ?? input.existing?.name ?? normalizeAgentId(input.draft.agentId),
    description:
      input.draft.description !== undefined
        ? trimText(input.draft.description)
        : input.existing?.description,
    mode:
      input.draft.mode !== undefined
        ? normalizeMode(input.draft.mode, input.fallbackMode)
        : input.existing?.mode ?? input.fallbackMode,
    enabled:
      input.draft.enabled !== undefined
        ? input.draft.enabled === true
        : input.existing?.enabled ?? true,
    version: input.existing?.version ?? "1",
    source: input.existing?.source ?? input.source,
    hidden: input.existing?.hidden,
    prompt:
      input.draft.prompt !== undefined
        ? trimText(input.draft.prompt)
        : input.existing?.prompt,
    model: input.existing?.model,
    modelStrategy: input.existing?.modelStrategy,
    identity: input.existing?.identity,
    tools: input.existing?.tools,
    skills: input.existing?.skills,
    workflow: input.existing?.workflow,
    temperature: input.existing?.temperature,
    topP: input.existing?.topP,
    steps: input.existing?.steps,
    permission: input.existing?.permission,
    subAgentPolicy: input.subAgentPolicy ?? input.existing?.subAgentPolicy,
    metadata: buildBundleMetadata({
      existing: input.existing,
      primaryAgentId: input.primaryAgentId,
    }),
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export class DesktopAgentsService implements DesktopAgentsPort {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: DesktopAgentsStore,
    private readonly logger: RuntimeLogger,
  ) {}

  async list(input: AgentsListQuery = {}): Promise<AgentsListResponse> {
    const query = trimText(input.q)?.toLowerCase();
    let items = this.getMergedItems();

    if (typeof input.enabled === "boolean") {
      items = items.filter((item) => item.enabled === input.enabled);
    }
    if (input.source) {
      items = items.filter((item) => item.source === input.source);
    }
    if (query) {
      items = items.filter((item) => matchesQuery(item, query));
    }

    const sorted = sortAgentItems(items);
    return {
      items: sorted,
      meta: paginate(sorted),
    };
  }

  async get(agentId: string): Promise<AgentItem | null> {
    const normalizedAgentId = normalizeAgentId(agentId);
    return this.getMergedItems().find((item) => item.agentId === normalizedAgentId) ?? null;
  }

  async getBundle(agentId: string): Promise<DesktopAgentBundleView> {
    const normalizedAgentId = normalizeAgentId(agentId);
    const rootItem = this.getMergedItems().find((item) => item.agentId === normalizedAgentId) ?? null;
    const itemById = new Map(this.getMergedItems().map((item) => [item.agentId, item]));
    const childItems = getAllowedAgentIds(rootItem)
      .map((childAgentId) => itemById.get(childAgentId))
      .filter((item): item is AgentItem => Boolean(item));

    return {
      rootItem,
      childItems: sortAgentItems(childItems),
    };
  }

  async create(input: AgentCreateInput): Promise<DesktopAgentCreateResponse> {
    return this.runMutation(async () => {
      const agentId = normalizeAgentId(input.agentId);
      const existing = this.getMergedItems().find((item) => item.agentId === agentId);
      if (existing) {
        throw new DesktopAgentsError("AGENT_EXISTS", "agentId already exists", { agentId });
      }

      const item = buildManualAgent({
        agentId,
        payload: input,
        source: "user-custom",
      });
      this.store.upsert(item);
      await this.logger.info("Desktop agent created", {
        context: {
          agentId,
          source: item.source,
        },
      });

      return { item, created: true };
    });
  }

  async update(agentId: string, input: AgentPatchInput): Promise<AgentItem | null> {
    const normalizedAgentId = normalizeAgentId(agentId);
    return this.runMutation(async () => {
      const current = this.store.get(normalizedAgentId) ?? this.getMergedItems().find((item) => item.agentId === normalizedAgentId) ?? null;
      if (!current) {
        return null;
      }
      if (!isWritableAgent(current)) {
        throw new DesktopAgentsError("READ_ONLY_AGENT", "managed agent is read-only", {
          agentId: normalizedAgentId,
          source: current.source,
        });
      }

      const next: AgentItem = {
        ...current,
        name: input.name !== undefined ? trimText(input.name) ?? current.name : current.name,
        description:
          input.description !== undefined
            ? trimNullableText(input.description) ?? undefined
            : current.description,
        mode: input.mode !== undefined ? normalizeMode(input.mode, current.mode) : current.mode,
        enabled: input.enabled !== undefined ? input.enabled === true : current.enabled,
        prompt:
          input.prompt !== undefined
            ? trimNullableText(input.prompt) ?? undefined
            : current.prompt,
        subAgentPolicy:
          input.subAgentPolicy !== undefined
            ? normalizeSubAgentPolicy(input.subAgentPolicy, normalizedAgentId)
            : current.subAgentPolicy,
        updatedAt: nowIso(),
      };

      this.store.upsert(next);
      await this.logger.info("Desktop agent updated", {
        context: {
          agentId: normalizedAgentId,
        },
      });
      return next;
    });
  }

  async saveBundle(input: DesktopAgentBundleSaveInput): Promise<DesktopAgentBundleSaveResponse> {
    return this.runMutation(async () => {
      const rootAgentId = normalizeAgentId(input.root.agentId);
      const mergedItems = this.getMergedItems();
      const existingById = new Map(mergedItems.map((item) => [item.agentId, item]));
      const currentRoot = existingById.get(rootAgentId) ?? null;

      if (currentRoot && !isWritableAgent(currentRoot)) {
        throw new DesktopAgentsError("READ_ONLY_AGENT", "managed agent is read-only", {
          agentId: rootAgentId,
          source: currentRoot.source,
        });
      }

      const childDrafts = Array.isArray(input.childAgents) ? input.childAgents : [];
      const childIds = new Set<string>();
      const childItems: AgentItem[] = [];

      for (const draft of childDrafts) {
        const childAgentId = normalizeAgentId(draft.agentId);
        if (childAgentId === rootAgentId) {
          throw new DesktopAgentsError("INVALID_ARGUMENT", "child agent cannot reuse root agentId", {
            agentId: childAgentId,
          });
        }
        if (childIds.has(childAgentId)) {
          throw new DesktopAgentsError("INVALID_ARGUMENT", "duplicate child agentId in bundle", {
            agentId: childAgentId,
          });
        }
        childIds.add(childAgentId);

        const existingChild = existingById.get(childAgentId);
        if (existingChild && !isWritableAgent(existingChild)) {
          throw new DesktopAgentsError("READ_ONLY_AGENT", "managed child agent is read-only", {
            agentId: childAgentId,
            source: existingChild.source,
          });
        }

        const childItem = buildBundleMemberItem({
          draft,
          existing: existingChild ?? undefined,
          fallbackMode: "subagent",
          source: existingChild?.source ?? "user-custom",
          primaryAgentId: rootAgentId,
        });
        if (childItem.mode === "primary") {
          throw new DesktopAgentsError("INVALID_ARGUMENT", "child agent mode cannot be primary", {
            agentId: childAgentId,
          });
        }

        this.store.upsert(childItem);
        childItems.push(childItem);
      }

      const linkedAgentIds = normalizeStringArray(input.linkedAgentIds)
        .filter((agentId) => agentId !== rootAgentId && !childIds.has(agentId));
      const removedAgentIds = normalizeStringArray(input.removedAgentIds)
        .filter((agentId) => agentId !== rootAgentId && !childIds.has(agentId));
      const rootMode = normalizeMode(input.root.mode, currentRoot?.mode ?? "primary");

      if (childItems.length > 0 && rootMode === "subagent") {
        throw new DesktopAgentsError("INVALID_ARGUMENT", "root agent with children cannot be subagent", {
          agentId: rootAgentId,
        });
      }

      const nextRootSubAgentPolicy = rootMode === "subagent"
        ? undefined
        : childItems.length > 0 || linkedAgentIds.length > 0
          ? {
              mode: "allow_list" as const,
              allowedAgentIds: [...childItems.map((item) => item.agentId), ...linkedAgentIds],
            }
          : currentRoot?.subAgentPolicy?.mode === "all"
            ? { mode: "all" as const }
            : undefined;

      const rootItem = buildBundleMemberItem({
        draft: input.root,
        existing: currentRoot ?? undefined,
        fallbackMode: currentRoot?.mode ?? "primary",
        source: currentRoot?.source ?? "user-custom",
        subAgentPolicy: nextRootSubAgentPolicy,
      });
      this.store.upsert(rootItem);

      const deletedAgentIds: string[] = [];
      for (const removedAgentId of removedAgentIds) {
        const existing = existingById.get(removedAgentId) ?? this.store.get(removedAgentId);
        if (!existing) {
          continue;
        }
        if (!isWritableAgent(existing)) {
          throw new DesktopAgentsError("READ_ONLY_AGENT", "managed child agent is read-only", {
            agentId: removedAgentId,
            source: existing.source,
          });
        }
        if (this.store.remove(removedAgentId)) {
          deletedAgentIds.push(removedAgentId);
        }
      }

      await this.logger.info("Desktop agent bundle saved", {
        context: {
          rootAgentId,
          childCount: childItems.length,
          linkedAgentIds,
          removedAgentIds: deletedAgentIds,
        },
      });

      return {
        rootItem,
        childItems: sortAgentItems(childItems),
        linkedAgentIds,
        removedAgentIds: deletedAgentIds,
      };
    });
  }

  async setEnabled(agentId: string, enabled: boolean): Promise<AgentItem | null> {
    return this.update(agentId, { enabled });
  }

  async remove(agentId: string): Promise<DesktopAgentDeleteResponse> {
    const normalizedAgentId = normalizeAgentId(agentId);
    return this.runMutation(async () => {
      const current = this.store.get(normalizedAgentId) ?? this.getMergedItems().find((item) => item.agentId === normalizedAgentId) ?? null;
      if (current && !isWritableAgent(current)) {
        throw new DesktopAgentsError("READ_ONLY_AGENT", "managed agent is read-only", {
          agentId: normalizedAgentId,
          source: current.source,
        });
      }

      const deleted = this.store.remove(normalizedAgentId);
      if (deleted) {
        await this.logger.warn("Desktop agent removed", {
          context: {
            agentId: normalizedAgentId,
          },
        });
      }

      return {
        deleted,
        agentId: normalizedAgentId,
      };
    });
  }

  async previewImport(input: OpencodeAgentImportInput): Promise<OpencodeAgentImportPreview> {
    const parsed = parseImportInput(input);
    const existingById = new Map(this.getMergedItems().map((item) => [item.agentId, item]));

    for (const draft of parsed.drafts) {
      const existing = existingById.get(draft.agentId);
      if (existing && !isWritableAgent(existing)) {
        throw new DesktopAgentsError("READ_ONLY_AGENT", "cannot import over managed agent id", {
          agentId: draft.agentId,
          source: existing.source,
        });
      }
    }

    const items = parsed.drafts.map((draft) => buildImportedAgentItem({
      agentId: draft.agentId,
      payload: draft.payload,
      existing: existingById.get(draft.agentId),
    }));
    const existingItems = parsed.drafts
      .map((draft) => existingById.get(draft.agentId))
      .filter((item): item is AgentItem => Boolean(item));

    return {
      format: parsed.format,
      items,
      existingItems,
      createdCount: parsed.drafts.length - existingItems.length,
      updatedCount: existingItems.length,
    };
  }

  async importAgents(input: OpencodeAgentImportInput): Promise<OpencodeAgentImportResult> {
    return this.runMutation(async () => {
      const parsed = parseImportInput(input);
      const existingById = new Map(this.getMergedItems().map((item) => [item.agentId, item]));
      const items: AgentItem[] = [];
      let updatedCount = 0;

      for (const draft of parsed.drafts) {
        const existing = existingById.get(draft.agentId);
        if (existing && !isWritableAgent(existing)) {
          throw new DesktopAgentsError("READ_ONLY_AGENT", "cannot import over managed agent id", {
            agentId: draft.agentId,
            source: existing.source,
          });
        }

        const item = buildImportedAgentItem({
          agentId: draft.agentId,
          payload: draft.payload,
          existing,
        });
        item.source = coerceSource(item.source, existing?.source ?? "workspace-local");
        this.store.upsert(item);
        items.push(item);
        if (existing) {
          updatedCount += 1;
        }
      }

      await this.logger.info("Desktop agents imported", {
        context: {
          format: parsed.format,
          count: items.length,
        },
      });

      return {
        format: parsed.format,
        items: sortAgentItems(items),
        createdCount: items.length - updatedCount,
        updatedCount,
      };
    });
  }

  private getMergedItems(): AgentItem[] {
    const merged = new Map<string, AgentItem>();
    for (const item of BUILTIN_MAOMI_AGENTS) {
      merged.set(item.agentId, item);
    }
    for (const item of this.store.list()) {
      merged.set(item.agentId, item);
    }
    return [...merged.values()];
  }

  private async runMutation<TValue>(work: () => Promise<TValue>): Promise<TValue> {
    const next = this.mutationQueue.then(work, work);
    this.mutationQueue = next.then(() => undefined, () => undefined);
    return next;
  }
}