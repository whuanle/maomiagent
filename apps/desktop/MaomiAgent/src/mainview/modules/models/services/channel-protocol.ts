import {
  buildCustomProtocolProviderType,
  readChannelProtocolMetadata,
} from "../../../../shared/desktop-model-channel-protocol";
import type {
  DesktopModelChannelHeaderMap,
  DesktopModelChannelItem,
  DesktopModelChannelProtocolMetadata,
  DesktopModelProviderApiStyle,
  DesktopModelProviderBindingId,
  DesktopModelProviderConfigField,
  DesktopModelProviderConfigValue,
  DesktopModelProviderItem,
  DesktopModelProviderProtocolFamily,
  DesktopModelProviderRuntimeSupport,
} from "../../../../shared/desktop-models";
import type { ModelsChannelFormMode } from "../types";

export type CustomChannelProtocolPresetId =
  | "openai-responses"
  | "openai-chat-completions"
  | "anthropic-messages"
  | "google-generate-content";

export type CustomChannelProtocolPreset = {
  id: CustomChannelProtocolPresetId;
  labelKey: string;
  providerType: string;
  providerBindingId: DesktopModelProviderBindingId;
  sdkProviderPackage: "@ai-sdk/openai" | "@ai-sdk/anthropic" | "@ai-sdk/google";
  protocolFamily: Extract<DesktopModelProviderProtocolFamily, "openai" | "anthropic" | "google">;
  apiStyle: Extract<
    DesktopModelProviderApiStyle,
    "responses" | "chat-completions" | "messages" | "generate-content"
  >;
  defaultBaseUrl: string;
  discoveryKind: "openai-models" | "manual" | "ollama-tags";
  deploymentKind: "direct" | "local-native";
  runtimeSupport: DesktopModelProviderRuntimeSupport;
  configSchema: DesktopModelProviderConfigField[];
};

const API_KEY_FIELD: DesktopModelProviderConfigField = {
  key: "apiKey",
  label: "API Key",
  type: "secret",
  required: true,
  role: "apiKey",
};

const ORGANIZATION_FIELD: DesktopModelProviderConfigField = {
  key: "organization",
  label: "Organization",
  type: "text",
  role: "organization",
};

export const CUSTOM_CHANNEL_PROTOCOL_PRESETS: readonly CustomChannelProtocolPreset[] = [{
  id: "openai-responses",
  labelKey: "模型页.协议.OpenAIResponses",
  providerType: buildCustomProtocolProviderType("openai", "responses"),
  providerBindingId: "openai",
  sdkProviderPackage: "@ai-sdk/openai",
  protocolFamily: "openai",
  apiStyle: "responses",
  defaultBaseUrl: "https://api.openai.com/v1",
  discoveryKind: "openai-models",
  deploymentKind: "direct",
  runtimeSupport: {
    status: "implemented",
    adapterId: "openai-responses",
  },
  configSchema: [API_KEY_FIELD, ORGANIZATION_FIELD],
}, {
  id: "openai-chat-completions",
  labelKey: "模型页.协议.OpenAIChatCompletions",
  providerType: buildCustomProtocolProviderType("openai", "chat-completions"),
  providerBindingId: "openai",
  sdkProviderPackage: "@ai-sdk/openai",
  protocolFamily: "openai",
  apiStyle: "chat-completions",
  defaultBaseUrl: "https://api.openai.com/v1",
  discoveryKind: "openai-models",
  deploymentKind: "direct",
  runtimeSupport: {
    status: "implemented",
    adapterId: "openai-chat-completions",
  },
  configSchema: [API_KEY_FIELD, ORGANIZATION_FIELD],
}, {
  id: "anthropic-messages",
  labelKey: "模型页.协议.AnthropicMessages",
  providerType: buildCustomProtocolProviderType("anthropic", "messages"),
  providerBindingId: "anthropic",
  sdkProviderPackage: "@ai-sdk/anthropic",
  protocolFamily: "anthropic",
  apiStyle: "messages",
  defaultBaseUrl: "https://api.anthropic.com/v1",
  discoveryKind: "manual",
  deploymentKind: "direct",
  runtimeSupport: {
    status: "implemented",
    adapterId: "anthropic-messages",
  },
  configSchema: [API_KEY_FIELD],
}, {
  id: "google-generate-content",
  labelKey: "模型页.协议.GeminiGenerateContent",
  providerType: buildCustomProtocolProviderType("google", "generate-content"),
  providerBindingId: "google",
  sdkProviderPackage: "@ai-sdk/google",
  protocolFamily: "google",
  apiStyle: "generate-content",
  defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
  discoveryKind: "manual",
  deploymentKind: "direct",
  runtimeSupport: {
    status: "implemented",
    adapterId: "google-generate-content",
  },
  configSchema: [API_KEY_FIELD],
}];

export function getCustomChannelProtocolPreset(
  id: string | undefined,
): CustomChannelProtocolPreset | undefined {
  return CUSTOM_CHANNEL_PROTOCOL_PRESETS.find((item) => item.id === id);
}

export function resolveCustomChannelProtocolPresetId(
  protocolFamily: string | undefined,
  apiStyle: string | undefined,
): CustomChannelProtocolPresetId | undefined {
  const match = CUSTOM_CHANNEL_PROTOCOL_PRESETS.find((item) =>
    item.protocolFamily === protocolFamily && item.apiStyle === apiStyle,
  );
  return match?.id;
}

function resolveProviderProtocolFamily(
  provider: Pick<DesktopModelProviderItem, "protocolFamily" | "providerType"> | undefined,
): Extract<DesktopModelProviderProtocolFamily, "openai" | "anthropic" | "google"> | undefined {
  if (
    provider?.protocolFamily === "openai"
    || provider?.protocolFamily === "anthropic"
    || provider?.protocolFamily === "google"
  ) {
    return provider.protocolFamily;
  }

  const providerType = provider?.providerType.trim().toLowerCase();
  if (providerType === "openai" || providerType === "anthropic" || providerType === "google") {
    return providerType;
  }

  return undefined;
}

export function getPresetProviderProtocolPresets(
  _provider?: Pick<DesktopModelProviderItem, "protocolFamily" | "providerType">,
): CustomChannelProtocolPreset[] {
  return [...CUSTOM_CHANNEL_PROTOCOL_PRESETS];
}

export function resolvePresetProviderProtocolPresetId(
  provider: Pick<DesktopModelProviderItem, "protocolFamily" | "apiStyle" | "providerType"> | undefined,
  channel?: Pick<DesktopModelChannelItem, "providerType" | "metadata">,
): CustomChannelProtocolPresetId | undefined {
  const providerPresets = getPresetProviderProtocolPresets(provider);
  if (providerPresets.length === 0) {
    return undefined;
  }

  const protocol = channel ? readChannelProtocolMetadata(channel) : undefined;
  const protocolFamily = protocol?.protocolFamily ?? resolveProviderProtocolFamily(provider);
  const apiStyle = protocol?.apiStyle ?? provider?.apiStyle;
  const matchedPreset = providerPresets.find((item) =>
    item.protocolFamily === protocolFamily && item.apiStyle === apiStyle,
  );

  return matchedPreset?.id
    ?? providerPresets[0]?.id;
}

export function resolveChannelEditorMode(
  channel: Pick<DesktopModelChannelItem, "providerType" | "metadata">,
): ModelsChannelFormMode {
  return readChannelProtocolMetadata(channel).source === "protocol"
    ? "protocol"
    : "provider";
}

export function resolveCustomChannelPresetFromChannel(
  channel: Pick<DesktopModelChannelItem, "providerType" | "metadata">,
): CustomChannelProtocolPreset | undefined {
  const protocol = readChannelProtocolMetadata(channel);
  return getCustomChannelProtocolPreset(
    resolveCustomChannelProtocolPresetId(protocol.protocolFamily, protocol.apiStyle),
  );
}

export function buildCustomChannelProtocolMetadata(
  preset: CustomChannelProtocolPreset | undefined,
  config: Record<string, DesktopModelProviderConfigValue>,
  headers?: DesktopModelChannelHeaderMap,
): DesktopModelChannelProtocolMetadata | undefined {
  if (!preset) {
    return undefined;
  }

  const normalizedConfig = Object.fromEntries(
    Object.entries(config)
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value] as const)
      .filter(([, value]) => {
        if (typeof value === "string") {
          return value.length > 0;
        }
        return value !== undefined && value !== null;
      }),
  );

  return {
    source: "protocol",
    providerBindingId: preset.providerBindingId,
    protocolFamily: preset.protocolFamily,
    apiStyle: preset.apiStyle,
    deploymentKind: preset.deploymentKind,
    discoveryKind: preset.discoveryKind,
    runtimeSupport: preset.runtimeSupport,
    ...(Object.keys(normalizedConfig).length > 0 ? { config: normalizedConfig } : {}),
    ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
  };
}

export function buildPresetProviderChannelMetadata(input: {
  channel?: DesktopModelChannelItem;
  provider?: DesktopModelProviderItem;
  providerProtocolId?: string;
  config: Record<string, DesktopModelProviderConfigValue>;
  configSchema?: DesktopModelProviderItem["configSchema"];
}): DesktopModelChannelProtocolMetadata | undefined {
  const {
    channel,
    provider,
    providerProtocolId,
    config,
    configSchema,
  } = input;
  const normalizedConfig = Object.fromEntries(
    Object.entries(config)
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value] as const)
      .filter(([, value]) => {
        if (typeof value === "string") {
          return value.length > 0;
        }

        return value !== undefined && value !== null;
      }),
  );
  const allowedConfigKeys = configSchema?.map((field) => field.key) ?? [];
  const nextConfig = allowedConfigKeys.length > 0
    ? Object.fromEntries(
        Object.entries(normalizedConfig).filter(([key]) => allowedConfigKeys.includes(key)),
      )
    : normalizedConfig;
  const existing = channel?.metadata && typeof channel.metadata === "object" && !Array.isArray(channel.metadata)
    ? { ...channel.metadata }
    : {};

  if (Object.keys(nextConfig).length > 0) {
    existing.config = nextConfig;
  } else {
    delete existing.config;
  }

  const existingEnv = existing.env && typeof existing.env === "object" && !Array.isArray(existing.env)
    ? Object.fromEntries(
        Object.entries(existing.env as Record<string, unknown>)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      )
    : {};
  const managedEnvKeys = new Set(
    (configSchema ?? [])
      .map((field) => field.envKey)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  const nextEnv = Object.fromEntries(
    Object.entries(existingEnv).filter(([key]) => !managedEnvKeys.has(key)),
  ) as Record<string, string>;

  for (const field of configSchema ?? []) {
    if (!field.envKey) {
      continue;
    }

    const value = nextConfig[field.key];
    if (typeof value === "string" && value.length > 0) {
      nextEnv[field.envKey] = value;
      continue;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      nextEnv[field.envKey] = String(value);
    }
  }

  if (Object.keys(nextEnv).length > 0) {
    existing.env = nextEnv;
  } else {
    delete existing.env;
  }

  const providerPreset = getPresetProviderProtocolPresets(provider)
    .find((item) => item.id === providerProtocolId)
    ?? getCustomChannelProtocolPreset(resolvePresetProviderProtocolPresetId(provider, channel));

  existing.source = "provider";
  if (providerPreset) {
    existing.providerBindingId = providerPreset.providerBindingId;
    existing.protocolFamily = providerPreset.protocolFamily;
    existing.apiStyle = providerPreset.apiStyle;
    existing.deploymentKind = providerPreset.deploymentKind;
    existing.discoveryKind = providerPreset.discoveryKind;
    existing.runtimeSupport = providerPreset.runtimeSupport;
  } else {
    delete existing.providerBindingId;
    if (provider?.protocolFamily) {
      existing.protocolFamily = provider.protocolFamily;
    } else {
      delete existing.protocolFamily;
    }
    if (provider?.apiStyle) {
      existing.apiStyle = provider.apiStyle;
    } else {
      delete existing.apiStyle;
    }
  }

  if (!providerPreset) {
    if (provider?.deploymentKind) {
      existing.deploymentKind = provider.deploymentKind;
    } else {
      delete existing.deploymentKind;
    }
    if (provider?.discoveryKind) {
      existing.discoveryKind = provider.discoveryKind;
    } else {
      delete existing.discoveryKind;
    }
    if (provider?.runtimeSupport) {
      existing.runtimeSupport = provider.runtimeSupport;
    } else {
      delete existing.runtimeSupport;
    }
  }

  return Object.keys(existing).length > 0 ? existing : undefined;
}

export function resolveChannelProtocolLabelKey(
  channel: Pick<DesktopModelChannelItem, "providerType" | "metadata">,
): string | undefined {
  const preset = resolveCustomChannelPresetFromChannel(channel);
  return preset?.labelKey;
}
