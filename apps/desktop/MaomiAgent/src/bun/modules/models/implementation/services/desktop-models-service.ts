import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DesktopConfigurationPort } from "../../../configuration";
import type { RuntimeLogger } from "../../../logs";
import { resolveDesktopAiProviderRuntimeSupport } from "../../../ai/provider-runtime-support";
import {
  DESKTOP_MODEL_CHANNEL_ID_RE,
  normalizeDesktopModelChannelId,
} from "../../abstraction/models/desktop-models.models";
import {
  listConversationalEnabledDesktopChannelModels,
  resolveDesktopChannelModelMetadata,
  resolvePreferredDesktopConversationalDefaultSelection,
} from "../../../../../shared/desktop-model-metadata";
import type {
  DesktopDiscoveredChannelModel,
  DesktopModelBatchToggleInput,
  DesktopModelChannelItem,
  DesktopModelChannelListQuery,
  DesktopModelChannelStateItem,
  DesktopModelProviderApiStyle,
  DesktopModelProviderConfigField,
  DesktopModelProviderConfigFieldOption,
  DesktopModelProviderConfigFieldRole,
  DesktopModelProviderConfigFieldType,
  DesktopModelProviderDeploymentKind,
  DesktopModelProviderDiscoveryKind,
  DesktopModelCreateChannelInput,
  DesktopModelCreateChannelResponse,
  DesktopModelDeleteChannelResponse,
  DesktopModelDiscoveryResponse,
  DesktopModelInterleavedConfig,
  DesktopModelModalities,
  DesktopModelProviderItem,
  DesktopModelProviderProtocolFamily,
  DesktopModelResolvedRuntimeTarget,
  DesktopModelRuntimeSelectionQuery,
  DesktopModelRuntimeSelectionSnapshot,
  DesktopModelsSnapshot,
  DesktopModelUpdateChannelInput,
} from "../../abstraction/models/desktop-models.models";
import type { DesktopModelsPort } from "../../abstraction/ports/desktop-models.ports";

type RawProviderModel = {
  id?: string;
  name?: string;
  family?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  interleaved?: boolean | {
    field?: string;
  };
  knowledge?: string;
  release_date?: string;
  last_updated?: string;
  modalities?: {
    input?: unknown[];
    output?: unknown[];
  };
  open_weights?: boolean;
  cost?: Record<string, unknown>;
  limit?: {
    input?: number;
    context?: number;
    output?: number;
  };
};

type RawProviderType = {
  id?: string;
  name?: string;
  api?: string;
  protocol_family?: string;
  deployment_kind?: string;
  deployment?: string;
  discovery_kind?: string;
  discovery?: string;
  protocol_variant?: string;
  api_style?: string;
  doc?: string;
  env?: string[];
  npm?: string;
  package?: string;
  config?: unknown[];
  config_fields?: unknown[];
  models?: Record<string, RawProviderModel>;
};

type RawProviderConfigField = {
  key?: string;
  name?: string;
  label?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  help_text?: string;
  helpText?: string;
  default?: unknown;
  default_value?: unknown;
  defaultValue?: unknown;
  env_key?: string;
  envKey?: string;
  role?: string;
  options?: unknown[];
};

type RemoteModelDiscoveryMode = "openai" | "ollama";

const SUPPORTED_PROVIDER_PROTOCOL_FAMILIES = new Set<DesktopModelProviderProtocolFamily>([
  "openai",
  "anthropic",
  "google",
  "ollama",
  "custom",
]);

const SUPPORTED_PROVIDER_API_STYLES = new Set<DesktopModelProviderApiStyle>([
  "responses",
  "chat-completions",
  "messages",
  "generate-content",
  "ollama-chat",
  "ollama-generate",
  "custom",
]);

const SUPPORTED_PROVIDER_DEPLOYMENT_KINDS = new Set<DesktopModelProviderDeploymentKind>([
  "direct",
  "azure-openai",
  "compatible-cloud",
  "compatible-local",
  "cloud-wrapper",
  "local-native",
  "custom",
]);

const SUPPORTED_PROVIDER_DISCOVERY_KINDS = new Set<DesktopModelProviderDiscoveryKind>([
  "openai-models",
  "ollama-tags",
  "manual",
  "custom",
]);

const SUPPORTED_PROVIDER_CONFIG_FIELD_TYPES = new Set<DesktopModelProviderConfigFieldType>([
  "text",
  "secret",
  "url",
  "select",
  "number",
  "boolean",
]);

const SUPPORTED_PROVIDER_CONFIG_FIELD_ROLES = new Set<DesktopModelProviderConfigFieldRole>([
  "apiKey",
  "resourceName",
  "deployment",
  "organization",
  "apiVersion",
  "region",
  "project",
  "location",
  "accessKeyId",
  "secretAccessKey",
  "sessionToken",
  "baseUrlOverride",
  "customHeader",
  "custom",
]);

type CustomChannelModel = {
  modelId: string;
  displayName?: string;
  family?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsAttachments?: boolean;
  supportsReasoning?: boolean;
  supportsFunctionCall?: boolean;
  supportsStructuredOutput?: boolean;
  supportsTemperature?: boolean;
  interleaved?: DesktopModelInterleavedConfig;
  knowledgeCutoff?: string;
  releaseDate?: string;
  lastUpdated?: string;
  modalities?: DesktopModelModalities;
  openWeights?: boolean;
  cost?: Record<string, number>;
};

type DesktopModelsStorage = {
  channels: DesktopModelChannelItem[];
  version: string;
  updatedAt: string;
};

type StorageCache = {
  path: string;
  value: DesktopModelsStorage;
  mtimeMs: number | null;
};

type ModelSelectionResolution = {
  requestedChannelId: string;
  requestedModelId: string;
  resolvedProviderType?: string;
  resolvedChannelId: string;
  resolvedModelId: string;
  resolution: "none" | "as-requested" | "resolved-from-model";
  persistedSelectedChannelId: string;
  persistedSelectedModelId: string;
};

const CURRENT_MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_APP_ROOT = resolve(
  CURRENT_MODULE_DIR,
  "..",
  "..",
  "..",
  "..",
  "..",
  "..",
);

export class DesktopModelsServiceError extends Error {
  code: string;
  data?: Record<string, unknown>;

  constructor(code: string, message: string, data?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

function createEmptyStorage(): DesktopModelsStorage {
  return {
    channels: [],
    version: "1.0",
    updatedAt: new Date().toISOString(),
  };
}

function cloneStorage(storage: DesktopModelsStorage): DesktopModelsStorage {
  return JSON.parse(JSON.stringify(storage)) as DesktopModelsStorage;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeOptionalPositiveNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }

  return undefined;
}

function normalizeProviderProtocolFamily(
  value: unknown,
): DesktopModelProviderProtocolFamily | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized || !SUPPORTED_PROVIDER_PROTOCOL_FAMILIES.has(normalized as DesktopModelProviderProtocolFamily)) {
    return undefined;
  }

  return normalized as DesktopModelProviderProtocolFamily;
}

function normalizeProviderApiStyle(value: unknown): DesktopModelProviderApiStyle | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized || !SUPPORTED_PROVIDER_API_STYLES.has(normalized as DesktopModelProviderApiStyle)) {
    return undefined;
  }

  return normalized as DesktopModelProviderApiStyle;
}

function normalizeProviderDeploymentKind(
  value: unknown,
): DesktopModelProviderDeploymentKind | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized || !SUPPORTED_PROVIDER_DEPLOYMENT_KINDS.has(normalized as DesktopModelProviderDeploymentKind)) {
    return undefined;
  }

  return normalized as DesktopModelProviderDeploymentKind;
}

function normalizeProviderDiscoveryKind(
  value: unknown,
): DesktopModelProviderDiscoveryKind | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized || !SUPPORTED_PROVIDER_DISCOVERY_KINDS.has(normalized as DesktopModelProviderDiscoveryKind)) {
    return undefined;
  }

  return normalized as DesktopModelProviderDiscoveryKind;
}

function normalizeProviderConfigFieldType(
  value: unknown,
): DesktopModelProviderConfigFieldType | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized || !SUPPORTED_PROVIDER_CONFIG_FIELD_TYPES.has(normalized as DesktopModelProviderConfigFieldType)) {
    return undefined;
  }

  return normalized as DesktopModelProviderConfigFieldType;
}

function normalizeProviderConfigFieldRole(
  value: unknown,
): DesktopModelProviderConfigFieldRole | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized || !SUPPORTED_PROVIDER_CONFIG_FIELD_ROLES.has(normalized as DesktopModelProviderConfigFieldRole)) {
    return undefined;
  }

  return normalized as DesktopModelProviderConfigFieldRole;
}

function normalizeProviderConfigDefaultValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return undefined;
}

function normalizeProviderConfigFieldOption(
  value: unknown,
): DesktopModelProviderConfigFieldOption | null {
  if (typeof value === "string") {
    const normalized = normalizeOptionalString(value);
    return normalized ? { label: normalized, value: normalized } : null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const item = value as { label?: unknown; value?: unknown };
  const optionValue = normalizeOptionalString(item.value);
  if (!optionValue) {
    return null;
  }

  return {
    label: normalizeOptionalString(item.label) ?? optionValue,
    value: optionValue,
  };
}

function inferLegacyProviderConfigFieldType(
  key: string,
): DesktopModelProviderConfigFieldType {
  if (/(?:URL|URI)$/i.test(key)) {
    return "url";
  }

  if (/(?:API_KEY|ACCESS_TOKEN|TOKEN|SECRET)$/i.test(key)) {
    return "secret";
  }

  return "text";
}

function inferLegacyProviderConfigFieldRole(
  key: string,
): DesktopModelProviderConfigFieldRole | undefined {
  if (/(?:API_KEY|ACCESS_TOKEN|TOKEN|SECRET)$/i.test(key)) {
    return "apiKey";
  }

  if (/RESOURCE_NAME/i.test(key)) {
    return "resourceName";
  }

  if (/DEPLOYMENT/i.test(key)) {
    return "deployment";
  }

  if (/ORGANIZATION/i.test(key)) {
    return "organization";
  }

  return undefined;
}

function normalizeProviderEnvKeys(raw: RawProviderType): string[] {
  return Array.isArray(raw.env)
    ? raw.env.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function normalizeProviderConfigField(
  raw: unknown,
): DesktopModelProviderConfigField | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const item = raw as RawProviderConfigField;
  const key = normalizeOptionalString(item.key) ?? normalizeOptionalString(item.name);
  if (!key) {
    return null;
  }

  const envKey = normalizeOptionalString(item.env_key) ?? normalizeOptionalString(item.envKey);
  const inferredFieldType = inferLegacyProviderConfigFieldType(envKey ?? key);
  const type = normalizeProviderConfigFieldType(item.type) ?? inferredFieldType;
  const options = Array.isArray(item.options)
    ? item.options
        .map((entry) => normalizeProviderConfigFieldOption(entry))
        .filter((entry): entry is DesktopModelProviderConfigFieldOption => Boolean(entry))
    : [];

  return {
    key,
    label: normalizeOptionalString(item.label) ?? key,
    type,
    required: item.required === true ? true : undefined,
    placeholder: normalizeOptionalString(item.placeholder),
    helpText: normalizeOptionalString(item.help_text) ?? normalizeOptionalString(item.helpText),
    defaultValue: normalizeProviderConfigDefaultValue(
      item.default_value ?? item.defaultValue ?? item.default,
    ),
    envKey,
    role: normalizeProviderConfigFieldRole(item.role) ?? inferLegacyProviderConfigFieldRole(envKey ?? key),
    options: options.length > 0 ? options : undefined,
  };
}

function buildLegacyProviderConfigSchema(envKeys: string[]): DesktopModelProviderConfigField[] {
  return envKeys.map((envKey) => ({
    key: envKey,
    label: envKey,
    type: inferLegacyProviderConfigFieldType(envKey),
    envKey,
    role: inferLegacyProviderConfigFieldRole(envKey),
  }));
}

function normalizeProviderConfigSchema(raw: RawProviderType): DesktopModelProviderConfigField[] {
  const explicit = Array.isArray(raw.config)
    ? raw.config
    : Array.isArray(raw.config_fields)
      ? raw.config_fields
      : [];
  const seen = new Set<string>();
  const normalized: DesktopModelProviderConfigField[] = [];

  for (const item of explicit) {
    const field = normalizeProviderConfigField(item);
    if (!field || seen.has(field.key)) {
      continue;
    }

    seen.add(field.key);
    normalized.push(field);
  }

  if (normalized.length > 0) {
    return normalized;
  }

  return buildLegacyProviderConfigSchema(normalizeProviderEnvKeys(raw));
}

function getProviderPackageId(raw: RawProviderType) {
  return normalizeOptionalString(raw.npm) ?? normalizeOptionalString(raw.package) ?? "";
}

function inferProviderProtocolFamily(
  providerType: string,
  raw: RawProviderType,
): DesktopModelProviderProtocolFamily | undefined {
  const explicit = normalizeProviderProtocolFamily(raw.protocol_family);
  if (explicit) {
    return explicit;
  }

  const normalizedProviderType = providerType.toLowerCase();
  switch (normalizedProviderType) {
    case "openai":
      return "openai";
    case "anthropic":
      return "anthropic";
    case "azure":
    case "lmstudio":
    case "lm-studio":
    case "openrouter":
    case "github-copilot":
      return "openai";
    case "google":
    case "gemini":
      return "google";
    case "ollama":
    case "ollama-cloud":
      return "ollama";
    default:
      break;
  }

  const providerPackage = getProviderPackageId(raw);
  if (
    providerPackage === "@ai-sdk/openai"
    || providerPackage === "@ai-sdk/openai-compatible"
    || providerPackage === "@openrouter/ai-sdk-provider"
  ) {
    return "openai";
  }
  if (providerPackage === "@ai-sdk/anthropic") {
    return "anthropic";
  }
  if (providerPackage === "@ai-sdk/azure") {
    return "openai";
  }
  if (providerPackage === "@ai-sdk/google") {
    return "google";
  }

  return undefined;
}

function inferProviderDeploymentKind(
  providerType: string,
  raw: RawProviderType,
  protocolFamily: DesktopModelProviderProtocolFamily | undefined,
): DesktopModelProviderDeploymentKind | undefined {
  const explicit = normalizeProviderDeploymentKind(raw.deployment_kind ?? raw.deployment);
  if (explicit) {
    return explicit;
  }

  const normalizedProviderType = providerType.toLowerCase();
  switch (normalizedProviderType) {
    case "azure":
      return "azure-openai";
    case "lmstudio":
    case "lm-studio":
      return "compatible-local";
    case "ollama":
      return "local-native";
    case "ollama-cloud":
      return "direct";
    case "openrouter":
    case "github-copilot":
      return "compatible-cloud";
    case "amazon-bedrock":
      return "cloud-wrapper";
    default:
      break;
  }

  const providerPackage = getProviderPackageId(raw);
  if (providerPackage === "@ai-sdk/azure") {
    return "azure-openai";
  }
  if (providerPackage === "@ai-sdk/openai-compatible" || providerPackage === "@openrouter/ai-sdk-provider") {
    return normalizeOptionalString(raw.api)?.includes("localhost")
      || normalizeOptionalString(raw.api)?.includes("127.0.0.1")
      ? "compatible-local"
      : "compatible-cloud";
  }
  if (providerPackage === "@ai-sdk/amazon-bedrock" || providerPackage === "@ai-sdk/google-vertex") {
    return "cloud-wrapper";
  }
  if (protocolFamily) {
    return "direct";
  }

  return undefined;
}

function inferProviderApiStyle(
  providerType: string,
  raw: RawProviderType,
  protocolFamily: DesktopModelProviderProtocolFamily | undefined,
  deploymentKind: DesktopModelProviderDeploymentKind | undefined,
): DesktopModelProviderApiStyle | undefined {
  const explicit = normalizeProviderApiStyle(raw.protocol_variant ?? raw.api_style);
  if (explicit) {
    return explicit;
  }

  const providerPackage = getProviderPackageId(raw);
  if (protocolFamily === "anthropic") {
    return "messages";
  }
  if (protocolFamily === "google") {
    return "generate-content";
  }
  if (protocolFamily === "openai") {
    if (providerType.toLowerCase() === "openai" || providerPackage === "@ai-sdk/openai") {
      return "responses";
    }
    return "chat-completions";
  }
  if (protocolFamily === "ollama") {
    return deploymentKind === "local-native" ? "ollama-chat" : "chat-completions";
  }
  if (deploymentKind === "azure-openai") {
    return "chat-completions";
  }

  return undefined;
}

function inferProviderDiscoveryKind(
  raw: RawProviderType,
  protocolFamily: DesktopModelProviderProtocolFamily | undefined,
  deploymentKind: DesktopModelProviderDeploymentKind | undefined,
): DesktopModelProviderDiscoveryKind | undefined {
  const explicit = normalizeProviderDiscoveryKind(raw.discovery_kind ?? raw.discovery);
  if (explicit) {
    return explicit;
  }

  if (protocolFamily === "openai" && deploymentKind !== "azure-openai") {
    return "openai-models";
  }
  if (protocolFamily === "ollama" && deploymentKind === "local-native") {
    return "ollama-tags";
  }

  return "manual";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function normalizeModalities(value: unknown): DesktopModelModalities | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const item = value as {
    input?: unknown[];
    output?: unknown[];
  };
  const input = normalizeStringArray(item.input);
  const output = normalizeStringArray(item.output);

  if (input.length === 0 && output.length === 0) {
    return undefined;
  }

  return { input, output };
}

function normalizeInterleaved(value: unknown): DesktopModelInterleavedConfig | undefined {
  if (value === true || value === false) {
    return value;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const field = normalizeOptionalString((value as { field?: unknown }).field);
  return field ? { field } : {};
}

function normalizeNumericRecord(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const next: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "number" && Number.isFinite(entry)) {
      next[key] = entry;
    }
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function normalizeStorage(raw: unknown): DesktopModelsStorage {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return createEmptyStorage();
  }

  const source = raw as Partial<DesktopModelsStorage>;
  const channels: DesktopModelChannelItem[] = [];

  for (const channelEntry of Array.isArray(source.channels) ? source.channels : []) {
    if (!channelEntry || typeof channelEntry !== "object" || Array.isArray(channelEntry)) {
      continue;
    }

    const item = channelEntry as Partial<DesktopModelChannelItem>;
    const providerType = normalizeOptionalString(item.providerType);
    const channelId = normalizeOptionalString(item.channelId);
    const name = normalizeOptionalString(item.name);
    if (!providerType || !channelId || !name) {
      continue;
    }

    channels.push({
      providerType,
      channelId,
      name,
      baseUrl: normalizeOptionalString(item.baseUrl),
      enabled: item.enabled !== false,
      metadata:
        item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
          ? item.metadata as Record<string, unknown>
          : undefined,
      createdAt:
        typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      updatedAt:
        typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
      models: Array.isArray(item.models)
        ? item.models
            .map((entry) => normalizeModelState(providerType, channelId, entry))
            .filter((entry): entry is DesktopModelChannelStateItem => Boolean(entry))
        : [],
    });
  }

  return {
    channels,
    version: typeof source.version === "string" ? source.version : "1.0",
    updatedAt:
      typeof source.updatedAt === "string" ? source.updatedAt : new Date().toISOString(),
  };
}

function normalizeModelState(
  providerType: string,
  channelId: string,
  raw: unknown,
): DesktopModelChannelStateItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const item = raw as Partial<DesktopModelChannelStateItem>;
  const modelId = normalizeOptionalString(item.modelId);
  if (!modelId || item.enabled === false) {
    return null;
  }

  return {
    providerType,
    channelId,
    modelId,
    enabled: true,
    updatedAt:
      typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
  };
}

function normalizeCustomChannelModel(raw: unknown): CustomChannelModel | null {
  if (typeof raw === "string") {
    const modelId = normalizeOptionalString(raw);
    return modelId ? { modelId, displayName: modelId } : null;
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const item = raw as Partial<CustomChannelModel>;
  const modelId = normalizeOptionalString(item.modelId);
  if (!modelId) {
    return null;
  }

  return {
    modelId,
    displayName: normalizeOptionalString(item.displayName) ?? modelId,
    family: normalizeOptionalString(item.family),
    contextWindow: normalizeOptionalPositiveNumber(item.contextWindow),
    maxOutputTokens: normalizeOptionalPositiveNumber(item.maxOutputTokens),
    supportsAttachments: item.supportsAttachments === true,
    supportsReasoning: item.supportsReasoning === true,
    supportsFunctionCall: item.supportsFunctionCall === true,
    supportsStructuredOutput: item.supportsStructuredOutput === true,
    supportsTemperature: item.supportsTemperature === true,
    interleaved: normalizeInterleaved(item.interleaved),
    knowledgeCutoff: normalizeOptionalString(item.knowledgeCutoff),
    releaseDate: normalizeOptionalString(item.releaseDate),
    lastUpdated: normalizeOptionalString(item.lastUpdated),
    modalities: normalizeModalities(item.modalities),
    openWeights: item.openWeights === true,
    cost: normalizeNumericRecord(item.cost),
  };
}

function extractCustomModels(channel: Pick<DesktopModelChannelItem, "metadata">): CustomChannelModel[] {
  const raw = channel.metadata && typeof channel.metadata === "object"
    ? (channel.metadata.customModels as unknown)
    : undefined;

  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const models: CustomChannelModel[] = [];

  for (const entry of raw) {
    const normalized = normalizeCustomChannelModel(entry);
    if (!normalized || seen.has(normalized.modelId)) {
      continue;
    }

    seen.add(normalized.modelId);
    models.push(normalized);
  }

  return models;
}

function normalizeBaseUrl(baseUrl?: string): string | undefined {
  const normalized = normalizeOptionalString(baseUrl);
  if (!normalized) {
    return undefined;
  }

  try {
    const parsed = new URL(normalized);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    throw new DesktopModelsServiceError("INVALID_ARGUMENT", "invalid baseUrl format", {
      field: "baseUrl",
    });
  }
}

function normalizeChannelId(value: unknown): string {
  const normalized = normalizeDesktopModelChannelId(value);
  if (!normalized) {
    throw new DesktopModelsServiceError("INVALID_ARGUMENT", "channelId is required", {
      field: "channelId",
    });
  }

  if (!DESKTOP_MODEL_CHANNEL_ID_RE.test(normalized)) {
    throw new DesktopModelsServiceError("INVALID_ARGUMENT", "invalid channelId format", {
      field: "channelId",
    });
  }

  return normalized;
}

function normalizeChannelName(value: unknown): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new DesktopModelsServiceError("INVALID_ARGUMENT", "name is required", {
      field: "name",
    });
  }

  return normalized;
}

function normalizeMetadata(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new DesktopModelsServiceError("INVALID_ARGUMENT", "metadata must be object", {
      field: "metadata",
    });
  }

  return value as Record<string, unknown>;
}

function buildSelectionHash(input: unknown) {
  return createHash("sha1")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 16);
}

function resolveRelativePath(pathname: string): string {
  if (pathname.startsWith("~/")) {
    return join(homedir(), pathname.slice(2));
  }

  return isAbsolute(pathname) ? pathname : resolve(process.cwd(), pathname);
}

async function findFirstExistingPath(paths: string[]): Promise<string | null> {
  for (const pathname of paths) {
    try {
      await fs.access(pathname);
      return pathname;
    } catch {
      // continue
    }
  }

  return null;
}

function isRemoteModelDiscoverySupported(
  providerType: string,
  raw: RawProviderType,
) {
  const protocolFamily = inferProviderProtocolFamily(providerType, raw);
  const deploymentKind = inferProviderDeploymentKind(providerType, raw, protocolFamily);
  const discoveryKind = inferProviderDiscoveryKind(raw, protocolFamily, deploymentKind);
  if (discoveryKind === "manual") {
    return false;
  }

  const providerMode = resolveRemoteModelDiscoveryMode(providerType, raw);
  return Boolean(providerMode);
}

function resolveRemoteModelDiscoveryMode(
  providerType: string,
  raw: RawProviderType,
): RemoteModelDiscoveryMode | null {
  const protocolFamily = inferProviderProtocolFamily(providerType, raw);
  const deploymentKind = inferProviderDeploymentKind(providerType, raw, protocolFamily);
  const discoveryKind = inferProviderDiscoveryKind(raw, protocolFamily, deploymentKind);

  if (discoveryKind === "openai-models") {
    return "openai";
  }
  if (discoveryKind === "ollama-tags") {
    return "ollama";
  }
  if (discoveryKind === "manual" || discoveryKind === "custom") {
    return null;
  }

  const providerPackage = getProviderPackageId(raw);

  if (providerType === "openai" || providerPackage === "@ai-sdk/openai") {
    return "openai";
  }
  if (deploymentKind !== "azure-openai" && providerPackage === "@ai-sdk/openai-compatible") {
    return "openai";
  }

  return null;
}

function normalizeProviderType(
  providerType: string,
  raw: RawProviderType,
): DesktopModelProviderItem {
  const env = normalizeProviderEnvKeys(raw);
  const protocolFamily = inferProviderProtocolFamily(providerType, raw);
  const deploymentKind = inferProviderDeploymentKind(providerType, raw, protocolFamily);
  const discoveryKind = inferProviderDiscoveryKind(raw, protocolFamily, deploymentKind);
  const apiStyle = inferProviderApiStyle(providerType, raw, protocolFamily, deploymentKind);
  const models: DesktopModelProviderItem["models"] = Object.entries(raw.models ?? {}).map(
    ([modelKey, model]) => {
      const modelId = normalizeOptionalString(model.id) ?? modelKey;
      return {
        providerType,
        modelId,
        displayName: normalizeOptionalString(model.name) ?? modelId,
        family: normalizeOptionalString(model.family),
        contextWindow:
          typeof model.limit?.context === "number" ? model.limit.context : undefined,
        maxOutputTokens:
          typeof model.limit?.output === "number" ? model.limit.output : undefined,
        supportsAttachments: model.attachment === true,
        supportsReasoning:
          typeof model.reasoning === "boolean" ? model.reasoning : undefined,
        supportsFunctionCall:
          typeof model.tool_call === "boolean" ? model.tool_call : undefined,
        supportsStructuredOutput:
          typeof model.structured_output === "boolean" ? model.structured_output : undefined,
        supportsTemperature:
          typeof model.temperature === "boolean" ? model.temperature : undefined,
        interleaved: normalizeInterleaved(model.interleaved),
        knowledgeCutoff: normalizeOptionalString(model.knowledge),
        releaseDate: normalizeOptionalString(model.release_date),
        lastUpdated: normalizeOptionalString(model.last_updated),
        modalities: normalizeModalities(model.modalities),
        openWeights:
          typeof model.open_weights === "boolean" ? model.open_weights : undefined,
        cost: normalizeNumericRecord(model.cost),
      };
    },
  );

  return {
    providerType,
    displayName: normalizeOptionalString(raw.name) ?? providerType,
    defaultBaseUrl: normalizeOptionalString(raw.api),
    protocolFamily,
    apiStyle,
    deploymentKind,
    discoveryKind,
    runtimeSupport: resolveDesktopAiProviderRuntimeSupport({
      providerType,
      protocolFamily,
      apiStyle,
    }),
    env,
    configSchema: normalizeProviderConfigSchema(raw),
    doc: normalizeOptionalString(raw.doc),
    supportsRemoteModelDiscovery: isRemoteModelDiscoverySupported(providerType, raw),
    models,
  };
}

function parseUpstreamModelLimit(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const item = value as Record<string, unknown>;
  return {
    contextWindow: normalizeOptionalPositiveNumber(
      item.contextWindow
      ?? item.context_window
      ?? item.input_token_limit
      ?? item.max_context_length
      ?? item.maxInputTokens,
    ),
    maxOutputTokens: normalizeOptionalPositiveNumber(
      item.maxOutputTokens
      ?? item.max_output_tokens
      ?? item.max_completion_tokens
      ?? item.output_token_limit
      ?? item.maxOutput,
    ),
  };
}

function normalizeDiscoveredChannelModel(
  raw: unknown,
): Omit<DesktopDiscoveredChannelModel, "knownProviderModel"> | null {
  if (typeof raw === "string") {
    const modelId = normalizeOptionalString(raw);
    if (!modelId) {
      return null;
    }

    return {
      modelId,
      displayName: modelId,
    };
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const item = raw as Record<string, unknown>;
  const modelId = normalizeOptionalString(item.id) ?? normalizeOptionalString(item.modelId);
  if (!modelId) {
    return null;
  }

  const limits = parseUpstreamModelLimit(item.limit ?? item.limits ?? item);

  return {
    modelId,
    displayName:
      normalizeOptionalString(item.display_name)
      ?? normalizeOptionalString(item.name)
      ?? modelId,
    family: normalizeOptionalString(item.family),
    contextWindow: limits.contextWindow,
    maxOutputTokens: limits.maxOutputTokens,
    supportsAttachments:
      item.supportsAttachments === true
      || item.supports_attachments === true
      || item.attachment === true,
    supportsReasoning:
      item.supportsReasoning === true
      || item.supports_reasoning === true
      || item.reasoning === true,
    supportsFunctionCall:
      item.supportsFunctionCall === true
      || item.supports_function_call === true
      || item.tool_call === true
      || item.toolCall === true,
    supportsStructuredOutput:
      item.supportsStructuredOutput === true
      || item.supports_structured_output === true
      || item.structured_output === true,
    supportsTemperature:
      item.supportsTemperature === true
      || item.supports_temperature === true
      || item.temperature === true,
    interleaved: normalizeInterleaved(item.interleaved),
    knowledgeCutoff:
      normalizeOptionalString(item.knowledgeCutoff)
      ?? normalizeOptionalString(item.knowledge),
    releaseDate:
      normalizeOptionalString(item.releaseDate)
      ?? normalizeOptionalString(item.release_date),
    lastUpdated:
      normalizeOptionalString(item.lastUpdated)
      ?? normalizeOptionalString(item.last_updated),
    modalities: normalizeModalities(item.modalities),
    openWeights:
      item.openWeights === true
      || item.open_weights === true,
    cost: normalizeNumericRecord(item.cost),
  };
}

function normalizeOpenAIProviderBaseUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    return undefined;
  }

  const url = new URL(normalized);
  const pathname = url.pathname.replace(/\/$/, "");

  if (/\/chat\/completions$/i.test(pathname)) {
    url.pathname = pathname.replace(/\/chat\/completions$/i, "") || "/v1";
    return url.toString().replace(/\/$/, "");
  }

  if (/\/responses$/i.test(pathname)) {
    url.pathname = pathname.replace(/\/responses$/i, "") || "/v1";
    return url.toString().replace(/\/$/, "");
  }

  if (/\/v1$/i.test(pathname)) {
    return url.toString().replace(/\/$/, "");
  }

  url.pathname = `${pathname || ""}/v1`;
  return url.toString().replace(/\/$/, "");
}

function ensureAzureOpenAIBaseUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    return undefined;
  }

  const url = new URL(normalized);
  const pathname = url.pathname.replace(/\/$/, "");

  if (/\/chat\/completions$/i.test(pathname) || /\/responses$/i.test(pathname)) {
    url.pathname = pathname.replace(/\/(?:chat\/completions|responses)$/i, "") || "/openai/v1";
    return url.toString().replace(/\/$/, "");
  }

  if (/\/openai\/v1$/i.test(pathname)) {
    return url.toString().replace(/\/$/, "");
  }

  if (/\/openai$/i.test(pathname)) {
    url.pathname = `${pathname}/v1`;
    return url.toString().replace(/\/$/, "");
  }

  url.pathname = `${pathname || ""}/openai/v1`;
  return url.toString().replace(/\/$/, "");
}

function normalizeOllamaDiscoveryBaseUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) {
    return undefined;
  }

  const url = new URL(normalized);
  const pathname = url.pathname.replace(/\/$/, "");

  if (/\/api\/tags$/i.test(pathname)) {
    return url.toString().replace(/\/$/, "");
  }
  if (/\/api$/i.test(pathname)) {
    url.pathname = `${pathname}/tags`;
    return url.toString().replace(/\/$/, "");
  }

  url.pathname = `${pathname || ""}/api/tags`;
  return url.toString().replace(/\/$/, "");
}

function findChannel(
  storage: DesktopModelsStorage,
  providerType: string,
  channelId: string,
) {
  return storage.channels.find(
    (item) => item.providerType === providerType && item.channelId === channelId,
  );
}

function channelAllowsCustomModel(channel: DesktopModelChannelItem, modelId: string) {
  return extractCustomModels(channel).some((item) => item.modelId === modelId);
}

export class DesktopModelsService implements DesktopModelsPort {
  private readonly config: DesktopConfigurationPort;
  private readonly logger: RuntimeLogger;
  private storageCache: StorageCache | null = null;
  private loadStoragePromise: Promise<DesktopModelsStorage> | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();
  private providerCatalogCache:
    | {
        key: string;
        path: string | null;
        value: Record<string, RawProviderType>;
      }
    | null = null;
  private providerCatalogPromise: Promise<Record<string, RawProviderType>> | null = null;

  constructor(config: DesktopConfigurationPort, logger: RuntimeLogger) {
    this.config = config;
    this.logger = logger;
  }

  private async writeLog(
    level: "info" | "warn" | "error",
    message: string,
    context?: Record<string, unknown>,
  ) {
    try {
      await this.logger[level](message, { context });
    } catch {
      // Ignore logger failures in model management flow.
    }
  }

  private getStateFilePath(): string {
    return resolveRelativePath(
      this.config.getString("models.state.path")
        ?? join(homedir(), ".maomiagent", "desktop", "data", "providers-state.json"),
    );
  }

  private getLegacyImportFilePath(): string {
    return resolveRelativePath(
      this.config.getString("models.legacyImport.path")
        ?? join(homedir(), ".maomiagent", "providers-state.json"),
    );
  }

  private getExecutableModelsJsonCandidates(): string[] {
    const execPath = normalizeOptionalString(process.execPath);
    if (!execPath || /(?:^|[\\/])bun(?:\.exe)?$/i.test(execPath)) {
      return [];
    }

    const executableDir = dirname(execPath);
    return [
      resolve(executableDir, "data", "models.json"),
      resolve(executableDir, "resources", "data", "models.json"),
      resolve(executableDir, "..", "data", "models.json"),
    ];
  }

  private getSourceTreeModelsJsonCandidates(): string[] {
    return [
      resolve(SOURCE_APP_ROOT, "data", "models.json"),
      resolve(SOURCE_APP_ROOT, "src", "data", "models.json"),
    ];
  }

  private getWorkspaceRootModelsJsonCandidates(): string[] {
    const cwd = process.cwd();
    return [
      resolve(cwd, "apps", "desktop", "MaomiAgent", "data", "models.json"),
      resolve(cwd, "apps", "desktop", "MaomiAgent", "src", "data", "models.json"),
    ];
  }

  private getModelsJsonCandidates(): string[] {
    const configured = this.config.getString("models.catalog.path");
    const envPath = normalizeOptionalString(process.env.MAOMI_MODELS_JSON_PATH);
    const cwd = process.cwd();
    const candidates = [
      configured,
      envPath,
      ...this.getExecutableModelsJsonCandidates(),
      ...this.getSourceTreeModelsJsonCandidates(),
      resolve(cwd, "data", "models.json"),
      resolve(cwd, "src", "data", "models.json"),
      ...this.getWorkspaceRootModelsJsonCandidates(),
    ].filter((item): item is string => Boolean(item));

    return [...new Set(candidates.map((item) => resolveRelativePath(item)))];
  }

  private async ensureParentDir(pathname: string) {
    await fs.mkdir(dirname(pathname), { recursive: true });
  }

  private async getFileMtimeMs(pathname: string) {
    try {
      const stat = await fs.stat(pathname);
      return stat.mtimeMs;
    } catch {
      return null;
    }
  }

  private async loadStorageFromDisk(pathname: string): Promise<DesktopModelsStorage | null> {
    try {
      const raw = await fs.readFile(pathname, "utf-8");
      return normalizeStorage(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  private async persistStorage(storage: DesktopModelsStorage): Promise<void> {
    const pathname = this.getStateFilePath();
    await this.ensureParentDir(pathname);

    const next: DesktopModelsStorage = {
      ...cloneStorage(storage),
      updatedAt: new Date().toISOString(),
    };

    await fs.writeFile(pathname, JSON.stringify(next, null, 2), "utf-8");
    this.storageCache = {
      path: pathname,
      value: next,
      mtimeMs: await this.getFileMtimeMs(pathname),
    };
  }

  private async importLegacyStorageIfNeeded(): Promise<DesktopModelsStorage> {
    const legacyPath = this.getLegacyImportFilePath();
    const imported = await this.loadStorageFromDisk(legacyPath);
    if (!imported) {
      return createEmptyStorage();
    }

    if (imported.channels.length > 0) {
      await this.writeLog("info", "Imported legacy model state into desktop storage", {
        legacyPath,
        channels: imported.channels.length,
      });
    }
    await this.persistStorage(imported);
    return imported;
  }

  private async loadStorage(): Promise<DesktopModelsStorage> {
    const pathname = this.getStateFilePath();

    if (this.storageCache && this.storageCache.path !== pathname) {
      this.storageCache = null;
    }

    if (this.storageCache) {
      const diskMtimeMs = await this.getFileMtimeMs(pathname);
      if (diskMtimeMs !== null && diskMtimeMs !== this.storageCache.mtimeMs) {
        this.storageCache = null;
      } else {
        return this.storageCache.value;
      }
    }

    if (this.loadStoragePromise) {
      return this.loadStoragePromise;
    }

    this.loadStoragePromise = (async () => {
      const fromDisk = await this.loadStorageFromDisk(pathname);
      const loaded = fromDisk ?? await this.importLegacyStorageIfNeeded();
      this.storageCache = {
        path: pathname,
        value: loaded,
        mtimeMs: await this.getFileMtimeMs(pathname),
      };
      return loaded;
    })();

    try {
      return await this.loadStoragePromise;
    } finally {
      this.loadStoragePromise = null;
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

  private getCatalogCacheKey() {
    return this.getModelsJsonCandidates().join("|");
  }

  private async loadProviderCatalog(): Promise<Record<string, RawProviderType>> {
    const cacheKey = this.getCatalogCacheKey();
    if (this.providerCatalogCache?.key === cacheKey) {
      return this.providerCatalogCache.value;
    }

    if (this.providerCatalogPromise) {
      return this.providerCatalogPromise;
    }

    this.providerCatalogPromise = (async () => {
      const targetPath = await findFirstExistingPath(this.getModelsJsonCandidates());
      if (!targetPath) {
        this.providerCatalogCache = {
          key: cacheKey,
          path: null,
          value: {},
        };
        return {};
      }

      try {
        const raw = await fs.readFile(targetPath, "utf-8");
        const normalized = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
        const parsed = JSON.parse(normalized);
        const nextValue =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed as Record<string, RawProviderType>
            : {};

        this.providerCatalogCache = {
          key: cacheKey,
          path: targetPath,
          value: nextValue,
        };
        return nextValue;
      } catch {
        this.providerCatalogCache = {
          key: cacheKey,
          path: targetPath,
          value: {},
        };
        return {};
      }
    })();

    try {
      return await this.providerCatalogPromise;
    } finally {
      this.providerCatalogPromise = null;
    }
  }

  private async listProviderTypesInternal(): Promise<DesktopModelProviderItem[]> {
    const catalog = await this.loadProviderCatalog();
    return Object.entries(catalog)
      .map(([providerType, raw]) => normalizeProviderType(providerType, raw))
      .sort((left, right) =>
        left.displayName.localeCompare(right.displayName, "en", {
          sensitivity: "base",
        }),
      );
  }

  private async ensureProviderExists(providerType: string) {
    const catalog = await this.loadProviderCatalog();
    if (!catalog[providerType]) {
      throw new DesktopModelsServiceError("NOT_FOUND", `provider '${providerType}' not found`, {
        providerType,
      });
    }
  }

  private async ensureProviderModelExists(providerType: string, modelId: string) {
    const providers = await this.listProviderTypesInternal();
    const provider = providers.find((item) => item.providerType === providerType);
    if (!provider) {
      throw new DesktopModelsServiceError("NOT_FOUND", `provider '${providerType}' not found`, {
        providerType,
      });
    }

    if (!provider.models.some((item) => item.modelId === modelId)) {
      throw new DesktopModelsServiceError(
        "MODEL_NOT_FOUND",
        `model '${modelId}' not found in provider '${providerType}'`,
        {
          providerType,
          modelId,
        },
      );
    }
  }

  private async hasProviderModel(providerType: string, modelId: string) {
    try {
      await this.ensureProviderModelExists(providerType, modelId);
      return true;
    } catch (error) {
      if (error instanceof DesktopModelsServiceError && error.code === "MODEL_NOT_FOUND") {
        return false;
      }
      throw error;
    }
  }

  private getChannelEnvMap(channel: Pick<DesktopModelChannelItem, "metadata">) {
    return channel.metadata && typeof channel.metadata === "object"
      ? ((channel.metadata.env as Record<string, unknown> | undefined) ?? {})
      : {};
  }

  private getChannelConfigMap(channel: Pick<DesktopModelChannelItem, "metadata">) {
    return channel.metadata && typeof channel.metadata === "object"
      ? ((channel.metadata.config as Record<string, unknown> | undefined) ?? {})
      : {};
  }

  private readChannelConfigValue(channel: Pick<DesktopModelChannelItem, "metadata">, key: string) {
    const configMap = this.getChannelConfigMap(channel);
    const inline = configMap[key];
    if (typeof inline === "string") {
      return inline.trim();
    }

    if (typeof inline === "number" || typeof inline === "boolean") {
      return String(inline);
    }

    return "";
  }

  private readChannelEnvValue(channel: Pick<DesktopModelChannelItem, "metadata">, key: string) {
    const envMap = this.getChannelEnvMap(channel);
    const inline = typeof envMap[key] === "string" ? envMap[key].trim() : "";
    if (inline) {
      return inline;
    }

    return typeof process.env[key] === "string" ? process.env[key]!.trim() : "";
  }

  private readChannelProviderConfigValue(
    channel: Pick<DesktopModelChannelItem, "metadata">,
    field: DesktopModelProviderConfigField,
  ) {
    const inline = this.readChannelConfigValue(channel, field.key);
    if (inline) {
      return inline;
    }

    if (field.envKey) {
      return this.readChannelEnvValue(channel, field.envKey);
    }

    return "";
  }

  private readChannelProviderConfigValueByRole(
    provider: RawProviderType | undefined,
    channel: Pick<DesktopModelChannelItem, "metadata">,
    role: DesktopModelProviderConfigFieldRole,
  ) {
    for (const field of normalizeProviderConfigSchema(provider ?? {})) {
      if (field.role !== role) {
        continue;
      }

      const value = this.readChannelProviderConfigValue(channel, field);
      if (value) {
        return value;
      }
    }

    return "";
  }

  private scoreProviderEnvKey(key: string) {
    let score = 0;

    if (/(?:API_KEY|API_TOKEN|ACCESS_TOKEN|SECRET|TOKEN)$/i.test(key)) {
      score += 120;
    }
    if (/(?:_KEY|_TOKEN|_SECRET)/i.test(key)) {
      score += 40;
    }
    if (/(?:RESOURCE_NAME|PROJECT|LOCATION|ENDPOINT|BASE_URL|URL|ACCOUNT_ID|GATEWAY_ID|CREDENTIALS)/i.test(key)) {
      score -= 160;
    }
    if (/AZURE_API_KEY/i.test(key) || /OPENAI_API_KEY/i.test(key)) {
      score += 200;
    }

    return score;
  }

  private resolveChannelApiKey(
    provider: RawProviderType | undefined,
    channel: Pick<DesktopModelChannelItem, "metadata">,
  ) {
    const configuredApiKey = this.readChannelProviderConfigValueByRole(provider, channel, "apiKey");
    if (configuredApiKey) {
      return configuredApiKey;
    }

    const keys = [...(provider?.env ?? [])].sort((left, right) => {
      const diff = this.scoreProviderEnvKey(right) - this.scoreProviderEnvKey(left);
      if (diff !== 0) {
        return diff;
      }
      return left.localeCompare(right, "en", { sensitivity: "base" });
    });

    for (const key of keys) {
      const value = this.readChannelEnvValue(channel, key);
      if (value) {
        return value;
      }
    }

    return undefined;
  }

  private resolveRuntimeBaseUrl(input: {
    providerType: string;
    provider: RawProviderType | undefined;
    providerDefaultBaseUrl?: string;
    channel: Pick<DesktopModelChannelItem, "baseUrl" | "metadata">;
  }) {
    const baseUrlOverride = this.readChannelProviderConfigValueByRole(
      input.provider,
      input.channel,
      "baseUrlOverride",
    );
    const preferredBaseUrl = baseUrlOverride || input.channel.baseUrl || input.providerDefaultBaseUrl;

    if (preferredBaseUrl) {
      return input.providerType === "azure"
        ? ensureAzureOpenAIBaseUrl(preferredBaseUrl)
        : normalizeBaseUrl(preferredBaseUrl);
    }

    if (input.providerType !== "azure") {
      return undefined;
    }

    const configuredEndpoint =
      this.readChannelEnvValue(input.channel, "AZURE_OPENAI_ENDPOINT")
      || this.readChannelEnvValue(input.channel, "AZURE_BASE_URL")
      || this.readChannelEnvValue(input.channel, "AZURE_ENDPOINT");
    if (configuredEndpoint) {
      return ensureAzureOpenAIBaseUrl(configuredEndpoint);
    }

    const resourceName =
      this.readChannelProviderConfigValueByRole(input.provider, input.channel, "resourceName")
      || this.readChannelEnvValue(input.channel, "AZURE_RESOURCE_NAME")
      || this.readChannelEnvValue(input.channel, "AZURE_OPENAI_RESOURCE_NAME");

    return resourceName
      ? ensureAzureOpenAIBaseUrl(`https://${resourceName}.openai.azure.com`)
      : undefined;
  }

  private resolveRemoteModelDiscoveryBaseUrl(
    mode: RemoteModelDiscoveryMode,
    providerType: string,
    provider: RawProviderType | undefined,
    channel: Pick<DesktopModelChannelItem, "channelId" | "baseUrl" | "metadata">,
  ) {
    const preferredBaseUrl = channel.baseUrl || normalizeOptionalString(provider?.api);
    if (preferredBaseUrl) {
      if (mode === "ollama") {
        return normalizeOllamaDiscoveryBaseUrl(preferredBaseUrl) ?? preferredBaseUrl;
      }
      return normalizeOpenAIProviderBaseUrl(preferredBaseUrl) ?? preferredBaseUrl;
    }

    if (mode === "openai" && providerType === "openai") {
      return "https://api.openai.com/v1";
    }
    if (mode === "ollama") {
      return "http://localhost:11434/api/tags";
    }

    throw new DesktopModelsServiceError(
      "INVALID_ARGUMENT",
      "current channel requires baseUrl to pull available models",
      {
        providerType,
        channelId: channel.channelId,
        field: "baseUrl",
      },
    );
  }

  private async fetchRemoteAvailableModels(
    providerType: string,
    provider: RawProviderType | undefined,
    channel: DesktopModelChannelItem,
  ): Promise<Array<Omit<DesktopDiscoveredChannelModel, "knownProviderModel">>> {
    const mode = resolveRemoteModelDiscoveryMode(providerType, provider ?? {});
    if (!mode) {
      throw new DesktopModelsServiceError(
        "INVALID_ARGUMENT",
        "current provider does not support remote model discovery",
        {
          providerType,
          channelId: channel.channelId,
        },
      );
    }

    const apiKey = this.resolveChannelApiKey(provider, channel);
    if (mode === "openai" && !apiKey) {
      throw new DesktopModelsServiceError(
        "INVALID_ARGUMENT",
        "current channel is missing API key required to pull available models",
        {
          providerType,
          channelId: channel.channelId,
        },
      );
    }

    const baseUrl = this.resolveRemoteModelDiscoveryBaseUrl(mode, providerType, provider, channel);
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (mode === "openai" && apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const discoveryUrl = mode === "ollama"
      ? baseUrl
      : `${baseUrl.replace(/\/$/, "")}/models`;
    const response = await fetch(discoveryUrl, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const text = (await response.text()).trim();
      throw new DesktopModelsServiceError(
        "UPSTREAM_REQUEST_FAILED",
        text || `upstream model discovery failed: status ${response.status}`,
        {
          providerType,
          channelId: channel.channelId,
          status: response.status,
        },
      );
    }

    const body = await response.json();
    const rawItems = Array.isArray(body)
      ? body
      : Array.isArray((body as { data?: unknown[] }).data)
        ? (body as { data: unknown[] }).data
        : Array.isArray((body as { models?: unknown[] }).models)
          ? (body as { models: unknown[] }).models
          : [];

    const seen = new Set<string>();
    return rawItems
      .map((item) => normalizeDiscoveredChannelModel(item))
      .filter((item): item is Omit<DesktopDiscoveredChannelModel, "knownProviderModel"> => Boolean(item))
      .filter((item) => {
        if (seen.has(item.modelId)) {
          return false;
        }
        seen.add(item.modelId);
        return true;
      })
      .sort((left, right) =>
        left.modelId.localeCompare(right.modelId, "en", {
          sensitivity: "base",
          numeric: true,
        }),
      );
  }

  private resolveModelSelection(
    snapshot: DesktopModelsSnapshot,
    input: {
      workspaceId: string;
      requestedChannelId: string;
      requestedModelId: string;
    },
  ): ModelSelectionResolution {
    const enabledChannels = snapshot.channels.filter((item) =>
      item.enabled && listConversationalEnabledDesktopChannelModels(snapshot.providers, item).length > 0
    );
    const channelsById = (channelId: string) =>
      enabledChannels.filter((item) => item.channelId === channelId);
    const channelsByModel = (modelId: string) =>
      enabledChannels.filter((item) =>
        listConversationalEnabledDesktopChannelModels(snapshot.providers, item)
          .some((entry) => entry.modelId === modelId)
      );

    let resolvedChannel: DesktopModelChannelItem | undefined;
    let resolvedModelId = input.requestedModelId;
    let resolution: ModelSelectionResolution["resolution"] = "none";

    if (input.requestedChannelId) {
      const matchedChannels = channelsById(input.requestedChannelId);
      if (matchedChannels.length === 0) {
        throw new DesktopModelsServiceError(
          "INVALID_ARGUMENT",
          "selected channel was not found or disabled",
          {
            workspaceId: input.workspaceId,
            selectedChannelId: input.requestedChannelId,
          },
        );
      }

      const narrowed = input.requestedModelId
        ? matchedChannels.filter((item) =>
            listConversationalEnabledDesktopChannelModels(snapshot.providers, item)
              .some((entry) => entry.modelId === input.requestedModelId),
          )
        : matchedChannels;

      if (narrowed.length === 0) {
        throw new DesktopModelsServiceError(
          "INVALID_ARGUMENT",
          "selected model is not enabled on selected channel",
          {
            workspaceId: input.workspaceId,
            selectedChannelId: input.requestedChannelId,
            selectedModelId: input.requestedModelId,
          },
        );
      }

      if (narrowed.length > 1) {
        throw new DesktopModelsServiceError(
          "INVALID_ARGUMENT",
          "selected channel is ambiguous across providers",
          {
            workspaceId: input.workspaceId,
            selectedChannelId: input.requestedChannelId,
            providerTypes: narrowed.map((item) => item.providerType),
          },
        );
      }

      resolvedChannel = narrowed[0];
      resolution = input.requestedModelId ? "as-requested" : "none";
    } else if (input.requestedModelId) {
      const matchedChannels = channelsByModel(input.requestedModelId);
      if (matchedChannels.length === 0) {
        throw new DesktopModelsServiceError(
          "INVALID_ARGUMENT",
          "selected model was not found in enabled channels",
          {
            workspaceId: input.workspaceId,
            selectedModelId: input.requestedModelId,
          },
        );
      }

      if (matchedChannels.length > 1) {
        throw new DesktopModelsServiceError(
          "INVALID_ARGUMENT",
          "selected model is ambiguous; specify channel",
          {
            workspaceId: input.workspaceId,
            selectedModelId: input.requestedModelId,
            channelIds: matchedChannels.map((item) => item.channelId),
          },
        );
      }

      resolvedChannel = matchedChannels[0];
      resolution = "resolved-from-model";
    }

    const resolvedChannelId = resolvedChannel?.channelId || input.requestedChannelId;
    if (!resolvedModelId && resolvedChannel) {
      resolvedModelId = [...listConversationalEnabledDesktopChannelModels(snapshot.providers, resolvedChannel)]
        .sort((left, right) =>
          left.modelId.localeCompare(right.modelId, "en", {
            sensitivity: "base",
            numeric: true,
          }),
        )
        .map((entry) => entry.modelId)[0] || "";
    }

    if (!resolvedModelId && input.requestedModelId) {
      resolvedModelId = input.requestedModelId;
    }

    return {
      requestedChannelId: input.requestedChannelId,
      requestedModelId: input.requestedModelId,
      resolvedProviderType: resolvedChannel?.providerType,
      resolvedChannelId,
      resolvedModelId,
      resolution,
      persistedSelectedChannelId:
        input.requestedChannelId || (input.requestedModelId ? resolvedChannelId : "") || "",
      persistedSelectedModelId: input.requestedModelId || "",
    };
  }

  async listProviders(): Promise<DesktopModelProviderItem[]> {
    return this.listProviderTypesInternal();
  }

  async listChannels(input: DesktopModelChannelListQuery = {}): Promise<DesktopModelChannelItem[]> {
    const storage = await this.loadStorage();
    const filtered = input.providerType
      ? storage.channels.filter((item) => item.providerType === input.providerType)
      : storage.channels;

    return [...filtered].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  async getSnapshot(): Promise<DesktopModelsSnapshot> {
    const [providers, channels] = await Promise.all([
      this.listProviders(),
      this.listChannels(),
    ]);

    return {
      providers,
      channels,
    };
  }

  async resolveRuntimeTarget(
    input: DesktopModelRuntimeSelectionQuery = {},
  ): Promise<DesktopModelResolvedRuntimeTarget> {
    const snapshot = await this.getSnapshot();
    const selection = this.resolveModelSelection(snapshot, {
      workspaceId: input.workspaceId || "global",
      requestedChannelId: normalizeOptionalString(input.selectedChannelId) ?? "",
      requestedModelId: normalizeOptionalString(input.selectedModelId) ?? "",
    });

    if (!selection.resolvedProviderType || !selection.resolvedChannelId || !selection.resolvedModelId) {
      throw new DesktopModelsServiceError(
        "INVALID_ARGUMENT",
        "unable to resolve runtime target from current model selection",
        {
          workspaceId: input.workspaceId,
          selectedChannelId: input.selectedChannelId,
          selectedModelId: input.selectedModelId,
        },
      );
    }

    const provider = snapshot.providers.find((item) => item.providerType === selection.resolvedProviderType);
    if (!provider) {
      throw new DesktopModelsServiceError(
        "NOT_FOUND",
        `provider '${selection.resolvedProviderType}' not found`,
        {
          providerType: selection.resolvedProviderType,
        },
      );
    }

    const channel = snapshot.channels.find((item) =>
      item.providerType === selection.resolvedProviderType
      && item.channelId === selection.resolvedChannelId
    );
    if (!channel) {
      throw new DesktopModelsServiceError(
        "NOT_FOUND",
        "selected channel was not found",
        {
          providerType: selection.resolvedProviderType,
          channelId: selection.resolvedChannelId,
        },
      );
    }

    if (provider.runtimeSupport?.status !== "implemented") {
      throw new DesktopModelsServiceError(
        "UNSUPPORTED_RUNTIME",
        provider.runtimeSupport?.reason || "selected provider is not implemented in desktop ai runtime",
        {
          providerType: selection.resolvedProviderType,
          channelId: selection.resolvedChannelId,
          modelId: selection.resolvedModelId,
          runtimeSupport: provider.runtimeSupport,
        },
      );
    }

    const catalog = await this.loadProviderCatalog();
    const rawProvider = catalog[selection.resolvedProviderType];
    const apiKey = this.resolveChannelApiKey(rawProvider, channel);
    if (!apiKey) {
      throw new DesktopModelsServiceError(
        "INVALID_ARGUMENT",
        "selected channel is missing API key required by the provider runtime",
        {
          providerType: selection.resolvedProviderType,
          channelId: selection.resolvedChannelId,
          modelId: selection.resolvedModelId,
        },
      );
    }

    const baseUrl = this.resolveRuntimeBaseUrl({
      providerType: selection.resolvedProviderType,
      provider: rawProvider,
      providerDefaultBaseUrl: provider.defaultBaseUrl,
      channel,
    });
    const organization = this.readChannelProviderConfigValueByRole(rawProvider, channel, "organization") || undefined;
    const project = this.readChannelProviderConfigValueByRole(rawProvider, channel, "project") || undefined;
    const modelMetadata = resolveDesktopChannelModelMetadata(
      snapshot.providers,
      channel,
      selection.resolvedModelId,
    );

    return {
      providerType: selection.resolvedProviderType,
      channelId: selection.resolvedChannelId,
      modelId: selection.resolvedModelId,
      protocolFamily: provider.protocolFamily,
      apiStyle: provider.apiStyle,
      contextWindow: modelMetadata?.contextWindow,
      maxOutputTokens: modelMetadata?.maxOutputTokens,
      serviceConfig: {
        apiKey,
        ...(baseUrl ? { baseUrl } : {}),
        ...(organization ? { organization } : {}),
        ...(project ? { project } : {}),
      },
    };
  }

  async getRuntimeSelectionSnapshot(
    input: DesktopModelRuntimeSelectionQuery = {},
  ): Promise<DesktopModelRuntimeSelectionSnapshot> {
    const snapshot = await this.getSnapshot();
    const providerMap = new Map(
      snapshot.providers.map((item) => [item.providerType, item]),
    );
    const enabledChannels = [...snapshot.channels]
      .filter((item) =>
        item.enabled && listConversationalEnabledDesktopChannelModels(snapshot.providers, item).length > 0
      )
      .sort((left, right) => {
        const channelCompare = left.channelId.localeCompare(right.channelId, "en", {
          sensitivity: "base",
        });
        if (channelCompare !== 0) {
          return channelCompare;
        }
        return left.providerType.localeCompare(right.providerType, "en", {
          sensitivity: "base",
        });
      });

    const channels = enabledChannels.map((channel) => ({
      value: channel.channelId,
      label: channel.name,
      providerType: channel.providerType,
      enabled: channel.enabled,
    }));

    const models: DesktopModelRuntimeSelectionSnapshot["models"] = [];
    for (const channel of enabledChannels) {
      const provider = providerMap.get(channel.providerType);
      const enabledModels = [...listConversationalEnabledDesktopChannelModels(snapshot.providers, channel)]
        .sort((left, right) =>
          left.modelId.localeCompare(right.modelId, "en", {
            sensitivity: "base",
            numeric: true,
          }),
        );

      for (const state of enabledModels) {
        const modelMetadata = resolveDesktopChannelModelMetadata(
          snapshot.providers,
          channel,
          state.modelId,
        );

        models.push({
          value: state.modelId,
          label: modelMetadata?.displayName || state.modelId,
          providerType: channel.providerType,
          providerDisplayName: provider?.displayName,
          runtimeSupport: provider?.runtimeSupport,
          channelId: channel.channelId,
          effectiveEnabled: true,
          family: modelMetadata?.family,
          supportsAttachments: modelMetadata?.supportsAttachments,
          supportsReasoning: modelMetadata?.supportsReasoning,
          supportsFunctionCall: modelMetadata?.supportsFunctionCall,
          supportsStructuredOutput: modelMetadata?.supportsStructuredOutput,
          supportsTemperature: modelMetadata?.supportsTemperature,
          interleaved: modelMetadata?.interleaved,
          knowledgeCutoff: modelMetadata?.knowledgeCutoff,
          releaseDate: modelMetadata?.releaseDate,
          lastUpdated: modelMetadata?.lastUpdated,
          modalities: modelMetadata?.modalities,
          openWeights: modelMetadata?.openWeights,
          cost: modelMetadata?.cost,
          contextWindow: modelMetadata?.contextWindow,
          maxOutputTokens: modelMetadata?.maxOutputTokens,
        });
      }
    }

    const scope = input.scope ?? (input.workspaceId ? "workspace" : "global");
    const selection = this.resolveModelSelection(snapshot, {
      workspaceId: input.workspaceId || "global",
      requestedChannelId: normalizeOptionalString(input.selectedChannelId) ?? "",
      requestedModelId: normalizeOptionalString(input.selectedModelId) ?? "",
    });

    const preferredDefaultSelection = resolvePreferredDesktopConversationalDefaultSelection(
      snapshot.providers,
      enabledChannels,
    );
    const defaultChannelId =
      selection.persistedSelectedChannelId
      || preferredDefaultSelection?.channelId
      || "";
    const defaultModelCandidates = models.filter((item) => {
      if (!defaultChannelId || item.channelId !== defaultChannelId) {
        return false;
      }
      const expectedProviderType =
        selection.resolvedProviderType
        || (
          defaultChannelId === preferredDefaultSelection?.channelId
            ? preferredDefaultSelection.providerType
            : undefined
        );
      if (expectedProviderType) {
        return item.providerType === expectedProviderType;
      }
      return true;
    });
    const defaultModelId =
      selection.persistedSelectedModelId
      || selection.resolvedModelId
      || (
        defaultChannelId === preferredDefaultSelection?.channelId
          ? preferredDefaultSelection?.modelId
          : undefined
      )
      || defaultModelCandidates[0]?.value
      || "";

    const requestedSelection = {
      channelId: selection.requestedChannelId || undefined,
      modelId: selection.requestedModelId || undefined,
    };
    const resolvedSelection = {
      providerType: selection.resolvedProviderType,
      channelId: selection.resolvedChannelId || undefined,
      modelId: selection.resolvedModelId || undefined,
      runtimeSupport: selection.resolvedProviderType
        ? providerMap.get(selection.resolvedProviderType)?.runtimeSupport
        : undefined,
      resolution: selection.resolution,
    };
    const defaultSelection = {
      channelId: defaultChannelId || undefined,
      modelId: defaultModelId || undefined,
    };
    const generatedAt = new Date().toISOString();

    return {
      scope,
      workspaceId: input.workspaceId || undefined,
      generatedAt,
      etag: buildSelectionHash({
        scope,
        workspaceId: input.workspaceId || undefined,
        requestedSelection,
        resolvedSelection,
        defaultSelection,
        channels,
        models,
      }),
      channels,
      models,
      defaultSelection,
      requestedSelection,
      resolvedSelection,
    };
  }

  async listChannelModels(
    providerType: string,
    channelId: string,
  ): Promise<DesktopModelChannelStateItem[]> {
    const storage = await this.loadStorage();
    const channel = findChannel(storage, providerType, channelId);
    if (!channel) {
      throw new DesktopModelsServiceError("NOT_FOUND", "channel not found", {
        providerType,
        channelId,
      });
    }

    return [...channel.models].sort((left, right) =>
      left.modelId.localeCompare(right.modelId, "en", {
        sensitivity: "base",
        numeric: true,
      }),
    );
  }

  async createChannel(
    providerType: string,
    input: DesktopModelCreateChannelInput,
  ): Promise<DesktopModelCreateChannelResponse> {
    await this.ensureProviderExists(providerType);

    const channelId = normalizeChannelId(input.channelId);
    const name = normalizeChannelName(input.name);
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const metadata = normalizeMetadata(input.metadata);
    const enabled = input.enabled === true;

    try {
      const item = await this.runMutation(async () => {
        const storage = cloneStorage(await this.loadStorage());
        if (findChannel(storage, providerType, channelId)) {
          throw new DesktopModelsServiceError("DUPLICATE_CHANNEL_ID", "channel already exists", {
            providerType,
            channelId,
          });
        }

        const now = new Date().toISOString();
        const nextItem: DesktopModelChannelItem = {
          providerType,
          channelId,
          name,
          baseUrl,
          enabled,
          metadata,
          createdAt: now,
          updatedAt: now,
          models: [],
        };

        storage.channels.push(nextItem);
        await this.persistStorage(storage);
        return nextItem;
      });

      await this.writeLog("info", "Desktop model channel created", {
        providerType,
        channelId,
      });
      return { item, created: true };
    } catch (error) {
      await this.writeLog("error", "Desktop model channel create failed", {
        providerType,
        channelId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async updateChannel(
    providerType: string,
    channelId: string,
    input: DesktopModelUpdateChannelInput,
  ): Promise<DesktopModelChannelItem | null> {
    const normalizedChannelId = normalizeChannelId(channelId);
    const nextName =
      input.name !== undefined ? normalizeChannelName(input.name) : undefined;
    const nextBaseUrl =
      input.baseUrl !== undefined ? normalizeBaseUrl(input.baseUrl) : undefined;
    const nextMetadata =
      input.metadata !== undefined ? normalizeMetadata(input.metadata) : undefined;

    const updated = await this.runMutation(async () => {
      const storage = cloneStorage(await this.loadStorage());
      const channel = findChannel(storage, providerType, normalizedChannelId);
      if (!channel) {
        return null;
      }

      if (nextName !== undefined) {
        channel.name = nextName;
      }
      if (input.baseUrl !== undefined) {
        channel.baseUrl = nextBaseUrl;
      }
      if (input.metadata !== undefined) {
        channel.metadata = nextMetadata;
      }

      channel.updatedAt = new Date().toISOString();
      await this.persistStorage(storage);
      return channel;
    });

    await this.writeLog(updated ? "info" : "warn", "Desktop model channel updated", {
      providerType,
      channelId: normalizedChannelId,
      found: Boolean(updated),
    });

    return updated;
  }

  async setChannelEnabled(
    providerType: string,
    channelId: string,
    enabled: boolean,
  ): Promise<DesktopModelChannelItem | null> {
    const normalizedChannelId = normalizeChannelId(channelId);
    const updated = await this.runMutation(async () => {
      const storage = cloneStorage(await this.loadStorage());
      const channel = findChannel(storage, providerType, normalizedChannelId);
      if (!channel) {
        return null;
      }

      channel.enabled = enabled;
      channel.updatedAt = new Date().toISOString();
      await this.persistStorage(storage);
      return channel;
    });

    await this.writeLog(updated ? "info" : "warn", "Desktop model channel enabled changed", {
      providerType,
      channelId: normalizedChannelId,
      enabled,
      found: Boolean(updated),
    });

    return updated;
  }

  async removeChannel(
    providerType: string,
    channelId: string,
  ): Promise<DesktopModelDeleteChannelResponse> {
    const normalizedChannelId = normalizeChannelId(channelId);
    const deleted = await this.runMutation(async () => {
      const storage = cloneStorage(await this.loadStorage());
      const initialLength = storage.channels.length;
      storage.channels = storage.channels.filter(
        (item) =>
          !(item.providerType === providerType && item.channelId === normalizedChannelId),
      );

      if (storage.channels.length === initialLength) {
        return false;
      }

      await this.persistStorage(storage);
      return true;
    });

    await this.writeLog(deleted ? "info" : "warn", "Desktop model channel deleted", {
      providerType,
      channelId: normalizedChannelId,
      deleted,
    });

    return {
      deleted,
      channelId: normalizedChannelId,
    };
  }

  async setModelEnabled(
    providerType: string,
    channelId: string,
    modelId: string,
    enabled: boolean,
  ): Promise<DesktopModelChannelStateItem | null> {
    const normalizedChannelId = normalizeChannelId(channelId);
    const normalizedModelId = normalizeOptionalString(modelId);
    if (!normalizedModelId) {
      throw new DesktopModelsServiceError("INVALID_ARGUMENT", "modelId is required", {
        field: "modelId",
      });
    }

    const knownProviderModel = await this.hasProviderModel(providerType, normalizedModelId);

    const state = await this.runMutation(async () => {
      const storage = cloneStorage(await this.loadStorage());
      const channel = findChannel(storage, providerType, normalizedChannelId);
      if (!channel) {
        return null;
      }

      if (!knownProviderModel && !channelAllowsCustomModel(channel, normalizedModelId)) {
        throw new DesktopModelsServiceError(
          "MODEL_NOT_FOUND",
          `model '${normalizedModelId}' not found in channel '${normalizedChannelId}'`,
          {
            providerType,
            channelId: normalizedChannelId,
            modelId: normalizedModelId,
          },
        );
      }

      const now = new Date().toISOString();
      const index = channel.models.findIndex((item) => item.modelId === normalizedModelId);

      if (enabled) {
        if (index >= 0) {
          channel.models[index] = {
            ...channel.models[index],
            enabled: true,
            updatedAt: now,
          };
        } else {
          channel.models.push({
            providerType,
            channelId: normalizedChannelId,
            modelId: normalizedModelId,
            enabled: true,
            updatedAt: now,
          });
        }
      } else if (index >= 0) {
        channel.models.splice(index, 1);
      }

      channel.updatedAt = now;
      await this.persistStorage(storage);

      return {
        providerType,
        channelId: normalizedChannelId,
        modelId: normalizedModelId,
        enabled,
        updatedAt: now,
      };
    });

    await this.writeLog(state ? "info" : "warn", "Desktop channel model enabled changed", {
      providerType,
      channelId: normalizedChannelId,
      modelId: normalizedModelId,
      enabled,
      found: Boolean(state),
    });

    return state;
  }

  async batchSetModelEnabled(
    providerType: string,
    channelId: string,
    updates: DesktopModelBatchToggleInput[],
  ): Promise<DesktopModelChannelStateItem[]> {
    const normalizedChannelId = normalizeChannelId(channelId);
    if (!Array.isArray(updates) || updates.length === 0) {
      throw new DesktopModelsServiceError(
        "INVALID_ARGUMENT",
        "updates must be a non-empty array",
        {
          field: "updates",
        },
      );
    }

    const normalizedUpdates = updates.map((item) => {
      const modelId = normalizeOptionalString(item.modelId);
      if (!modelId) {
        throw new DesktopModelsServiceError(
          "INVALID_ARGUMENT",
          "updates contains invalid modelId",
          {
            field: "updates.modelId",
          },
        );
      }

      return {
        modelId,
        enabled: item.enabled === true,
      };
    });

    const providerModelLookup = new Map<string, boolean>();
    for (const item of normalizedUpdates) {
      if (!providerModelLookup.has(item.modelId)) {
        providerModelLookup.set(
          item.modelId,
          await this.hasProviderModel(providerType, item.modelId),
        );
      }
    }

    const results = await this.runMutation(async () => {
      const storage = cloneStorage(await this.loadStorage());
      const channel = findChannel(storage, providerType, normalizedChannelId);
      if (!channel) {
        throw new DesktopModelsServiceError("NOT_FOUND", "channel not found", {
          providerType,
          channelId: normalizedChannelId,
        });
      }

      for (const item of normalizedUpdates) {
        const isKnownProviderModel = providerModelLookup.get(item.modelId) === true;
        if (!isKnownProviderModel && !channelAllowsCustomModel(channel, item.modelId)) {
          throw new DesktopModelsServiceError(
            "MODEL_NOT_FOUND",
            `model '${item.modelId}' not found in channel '${normalizedChannelId}'`,
            {
              providerType,
              channelId: normalizedChannelId,
              modelId: item.modelId,
            },
          );
        }
      }

      const now = new Date().toISOString();
      const nextResults: DesktopModelChannelStateItem[] = [];

      for (const item of normalizedUpdates) {
        const index = channel.models.findIndex((entry) => entry.modelId === item.modelId);

        if (item.enabled) {
          if (index >= 0) {
            channel.models[index] = {
              ...channel.models[index],
              enabled: true,
              updatedAt: now,
            };
          } else {
            channel.models.push({
              providerType,
              channelId: normalizedChannelId,
              modelId: item.modelId,
              enabled: true,
              updatedAt: now,
            });
          }
        } else if (index >= 0) {
          channel.models.splice(index, 1);
        }

        nextResults.push({
          providerType,
          channelId: normalizedChannelId,
          modelId: item.modelId,
          enabled: item.enabled,
          updatedAt: now,
        });
      }

      channel.updatedAt = now;
      await this.persistStorage(storage);
      return nextResults;
    });

    await this.writeLog("info", "Desktop channel model batch updated", {
      providerType,
      channelId: normalizedChannelId,
      updates: normalizedUpdates.length,
    });

    return results;
  }

  async discoverChannelModels(
    providerType: string,
    channelId: string,
  ): Promise<DesktopModelDiscoveryResponse> {
    const normalizedChannelId = normalizeChannelId(channelId);
    const catalog = await this.loadProviderCatalog();
    const provider = catalog[providerType];
    if (!provider) {
      throw new DesktopModelsServiceError("NOT_FOUND", `provider '${providerType}' not found`, {
        providerType,
      });
    }

    const result = await this.runMutation(async () => {
      const storage = cloneStorage(await this.loadStorage());
      const channel = findChannel(storage, providerType, normalizedChannelId);
      if (!channel) {
        throw new DesktopModelsServiceError("NOT_FOUND", "channel not found", {
          providerType,
          channelId: normalizedChannelId,
        });
      }

      const remoteModels = await this.fetchRemoteAvailableModels(providerType, provider, channel);
      const knownProviderModelIds = new Set(
        normalizeProviderType(providerType, provider).models.map((item) => item.modelId),
      );
      const customModels = extractCustomModels(channel);
      const customModelMap = new Map(customModels.map((item) => [item.modelId, item]));
      const enabledModelMap = new Map(channel.models.map((item) => [item.modelId, item]));
      const now = new Date().toISOString();

      let enabledCount = 0;
      let addedCustomCount = 0;

      for (const model of remoteModels) {
        const knownProviderModel = knownProviderModelIds.has(model.modelId);
        if (!knownProviderModel && !customModelMap.has(model.modelId)) {
          const customModel: CustomChannelModel = {
            modelId: model.modelId,
            displayName: model.displayName,
            family: model.family,
            contextWindow: model.contextWindow,
            maxOutputTokens: model.maxOutputTokens,
            supportsAttachments: model.supportsAttachments,
            supportsReasoning: model.supportsReasoning,
            supportsFunctionCall: model.supportsFunctionCall,
            supportsStructuredOutput: model.supportsStructuredOutput,
            supportsTemperature: model.supportsTemperature,
            interleaved: model.interleaved,
            knowledgeCutoff: model.knowledgeCutoff,
            releaseDate: model.releaseDate,
            lastUpdated: model.lastUpdated,
            modalities: model.modalities,
            openWeights: model.openWeights,
            cost: model.cost,
          };
          customModels.push(customModel);
          customModelMap.set(model.modelId, customModel);
          addedCustomCount += 1;
        }

        if (!enabledModelMap.get(model.modelId)?.enabled) {
          enabledCount += 1;
        }

        enabledModelMap.set(model.modelId, {
          providerType,
          channelId: normalizedChannelId,
          modelId: model.modelId,
          enabled: true,
          updatedAt: now,
        });
      }

      channel.models = [...enabledModelMap.values()]
        .filter((item) => item.enabled)
        .sort((left, right) =>
          left.modelId.localeCompare(right.modelId, "en", {
            sensitivity: "base",
            numeric: true,
          }),
        );

      const nextMetadata = normalizeMetadata(channel.metadata) ?? {};
      nextMetadata.customModels = customModels.map((item) => ({
        modelId: item.modelId,
        displayName: item.displayName ?? item.modelId,
        family: item.family,
        contextWindow: item.contextWindow,
        maxOutputTokens: item.maxOutputTokens,
        supportsAttachments: item.supportsAttachments === true,
        supportsReasoning: item.supportsReasoning === true,
        supportsFunctionCall: item.supportsFunctionCall === true,
        supportsStructuredOutput: item.supportsStructuredOutput === true,
        supportsTemperature: item.supportsTemperature === true,
        interleaved: item.interleaved,
        knowledgeCutoff: item.knowledgeCutoff,
        releaseDate: item.releaseDate,
        lastUpdated: item.lastUpdated,
        modalities: item.modalities,
        openWeights: item.openWeights === true,
        cost: item.cost,
      }));
      channel.metadata = nextMetadata;
      channel.updatedAt = now;
      await this.persistStorage(storage);

      return {
        item: channel,
        discovered: remoteModels.map((item) => ({
          ...item,
          knownProviderModel: knownProviderModelIds.has(item.modelId),
        })),
        enabledCount,
        addedCustomCount,
      };
    });

    await this.writeLog("info", "Remote models discovered for desktop channel", {
      providerType,
      channelId: normalizedChannelId,
      discovered: result.discovered.length,
      enabled: result.enabledCount,
      addedCustom: result.addedCustomCount,
    });

    return result;
  }
}