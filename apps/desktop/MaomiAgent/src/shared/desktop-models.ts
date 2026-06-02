export const DESKTOP_MODEL_CHANNEL_ID_RE = /^[A-Za-z0-9_]{2,64}$/;

export function normalizeDesktopModelChannelId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

export function isValidDesktopModelChannelId(value: unknown): boolean {
  const normalized = normalizeDesktopModelChannelId(value);
  return Boolean(normalized && DESKTOP_MODEL_CHANNEL_ID_RE.test(normalized));
}

export type DesktopModelModalities = {
  input: string[];
  output: string[];
};

export type DesktopModelInterleavedConfig = boolean | {
  field?: string;
};

export type DesktopModelProviderProtocolFamily =
  | "openai"
  | "anthropic"
  | "google"
  | "ollama"
  | "custom";

export type DesktopModelProviderApiStyle =
  | "responses"
  | "chat-completions"
  | "messages"
  | "generate-content"
  | "ollama-chat"
  | "ollama-generate"
  | "custom";

export type DesktopModelProviderBindingId =
  | "openai"
  | "anthropic"
  | "google";

export type DesktopModelProviderDeploymentKind =
  | "direct"
  | "azure-openai"
  | "compatible-cloud"
  | "compatible-local"
  | "cloud-wrapper"
  | "local-native"
  | "custom";

export type DesktopModelProviderDiscoveryKind =
  | "openai-models"
  | "ollama-tags"
  | "manual"
  | "custom";

export type DesktopModelProviderRuntimeStatus =
  | "implemented"
  | "catalog-only";

export type DesktopModelProviderRuntimeSupport = {
  status: DesktopModelProviderRuntimeStatus;
  adapterId?: string;
  reason?: string;
};

export type DesktopModelChannelSource = "provider" | "protocol";

export type DesktopModelProviderConfigValue = string | number | boolean;

export type DesktopModelChannelHeaderMap = Record<string, string>;

export type DesktopModelProviderConfigFieldType =
  | "text"
  | "secret"
  | "url"
  | "select"
  | "number"
  | "boolean";

export type DesktopModelProviderConfigFieldRole =
  | "apiKey"
  | "resourceName"
  | "deployment"
  | "organization"
  | "apiVersion"
  | "region"
  | "project"
  | "location"
  | "accessKeyId"
  | "secretAccessKey"
  | "sessionToken"
  | "baseUrlOverride"
  | "customHeader"
  | "custom";

export type DesktopModelProviderConfigFieldOption = {
  label: string;
  value: string;
};

export type DesktopModelProviderConfigField = {
  key: string;
  label: string;
  type: DesktopModelProviderConfigFieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  defaultValue?: DesktopModelProviderConfigValue;
  envKey?: string;
  role?: DesktopModelProviderConfigFieldRole;
  options?: DesktopModelProviderConfigFieldOption[];
};

export type DesktopModelProviderModelItem = {
  providerType: string;
  modelId: string;
  displayName: string;
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

export type DesktopModelProviderItem = {
  providerType: string;
  displayName: string;
  defaultBaseUrl?: string;
  protocolFamily?: DesktopModelProviderProtocolFamily;
  apiStyle?: DesktopModelProviderApiStyle;
  deploymentKind?: DesktopModelProviderDeploymentKind;
  discoveryKind?: DesktopModelProviderDiscoveryKind;
  runtimeSupport?: DesktopModelProviderRuntimeSupport;
  env?: string[];
  configSchema?: DesktopModelProviderConfigField[];
  doc?: string;
  supportsRemoteModelDiscovery?: boolean;
  models: DesktopModelProviderModelItem[];
};

export type DesktopModelChannelStateItem = {
  providerType: string;
  channelId: string;
  modelId: string;
  enabled: boolean;
  updatedAt: string;
};

export type DesktopModelChannelItem = {
  providerType: string;
  channelId: string;
  name: string;
  baseUrl?: string;
  enabled: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  models: DesktopModelChannelStateItem[];
};

export type DesktopModelChannelProtocolMetadata = {
  source?: DesktopModelChannelSource;
  providerBindingId?: DesktopModelProviderBindingId;
  protocolFamily?: DesktopModelProviderProtocolFamily;
  apiStyle?: DesktopModelProviderApiStyle;
  deploymentKind?: DesktopModelProviderDeploymentKind;
  discoveryKind?: DesktopModelProviderDiscoveryKind;
  runtimeSupport?: DesktopModelProviderRuntimeSupport;
  config?: Record<string, DesktopModelProviderConfigValue>;
  headers?: DesktopModelChannelHeaderMap;
};

export type DesktopModelsSnapshot = {
  providers: DesktopModelProviderItem[];
  channels: DesktopModelChannelItem[];
};

export type DesktopModelScope = "global" | "workspace";

export type DesktopModelSelectionResolution =
  | "none"
  | "as-requested"
  | "resolved-from-model";

export type DesktopModelRuntimeSelectionSnapshot = {
  scope: DesktopModelScope;
  workspaceId?: string;
  generatedAt: string;
  etag: string;
  channels: Array<{
    value: string;
    label: string;
    providerType: string;
    enabled: boolean;
  }>;
  models: Array<{
    value: string;
    label: string;
    providerType: string;
    providerDisplayName?: string;
    runtimeSupport?: DesktopModelProviderRuntimeSupport;
    channelId: string;
    effectiveEnabled: boolean;
    family?: string;
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
    contextWindow?: number;
    maxOutputTokens?: number;
  }>;
  defaultSelection: {
    channelId?: string;
    modelId?: string;
  };
  requestedSelection: {
    channelId?: string;
    modelId?: string;
  };
  resolvedSelection: {
    providerType?: string;
    channelId?: string;
    modelId?: string;
    runtimeSupport?: DesktopModelProviderRuntimeSupport;
    resolution: DesktopModelSelectionResolution;
  };
};

export type DesktopModelCreateChannelInput = {
  channelId?: string;
  name?: string;
  baseUrl?: string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
};

export type DesktopModelUpdateChannelInput = {
  name?: string;
  baseUrl?: string;
  metadata?: Record<string, unknown>;
};

export type DesktopModelBatchToggleInput = {
  modelId: string;
  enabled: boolean;
};

export type DesktopDiscoveredChannelModel = {
  modelId: string;
  displayName: string;
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
  knownProviderModel: boolean;
};

export type DesktopModelProviderListResponse = {
  items: DesktopModelProviderItem[];
};

export type DesktopModelChannelListQuery = {
  providerType?: string;
};

export type DesktopModelChannelListResponse = {
  items: DesktopModelChannelItem[];
};

export type DesktopModelChannelModelsResponse = {
  items: DesktopModelChannelStateItem[];
};

export type DesktopModelRuntimeSelectionQuery = {
  scope?: DesktopModelScope;
  workspaceId?: string;
  selectedChannelId?: string;
  selectedModelId?: string;
};

export type DesktopModelRuntimeSelectionResponse = {
  item: DesktopModelRuntimeSelectionSnapshot;
};

export type DesktopModelCreateChannelResponse = {
  item: DesktopModelChannelItem;
  created: boolean;
};

export type DesktopModelDiscoveryResponse = {
  item: DesktopModelChannelItem;
  discovered: DesktopDiscoveredChannelModel[];
  enabledCount: number;
  addedCustomCount: number;
};

export type DesktopModelDeleteChannelResponse = {
  deleted: boolean;
  channelId: string;
};

export type DesktopModelsMutationAction =
  | "channel.created"
  | "channel.updated"
  | "channel.enabled"
  | "channel.disabled"
  | "channel.deleted"
  | "model.enabled"
  | "model.disabled"
  | "model.batch-updated"
  | "model.discovered";

export type DesktopModelsMutationEvent = {
  action: DesktopModelsMutationAction;
  providerType: string;
  channelId?: string;
  modelId?: string;
  at: string;
};
