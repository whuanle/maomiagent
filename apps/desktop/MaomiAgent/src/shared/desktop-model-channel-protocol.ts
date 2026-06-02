import type {
  DesktopModelChannelHeaderMap,
  DesktopModelChannelItem,
  DesktopModelChannelProtocolMetadata,
  DesktopModelProviderApiStyle,
  DesktopModelProviderBindingId,
  DesktopModelProviderDeploymentKind,
  DesktopModelProviderDiscoveryKind,
  DesktopModelProviderProtocolFamily,
  DesktopModelProviderRuntimeSupport,
} from "./desktop-models";

export type DesktopChannelProtocolSnapshot = {
  source: "provider" | "protocol";
  providerType: string;
  providerBindingId?: DesktopModelProviderBindingId;
  protocolFamily?: DesktopModelProviderProtocolFamily;
  apiStyle?: DesktopModelProviderApiStyle;
  deploymentKind?: DesktopModelProviderDeploymentKind;
  discoveryKind?: DesktopModelProviderDiscoveryKind;
  runtimeSupport?: DesktopModelProviderRuntimeSupport;
  headers?: DesktopModelChannelHeaderMap;
};

const CUSTOM_PROVIDER_PREFIX = "custom-";
const KNOWN_PROTOCOL_FAMILIES = new Set<DesktopModelProviderProtocolFamily>([
  "openai",
  "anthropic",
  "google",
  "ollama",
  "custom",
]);

const KNOWN_API_STYLES = new Set<DesktopModelProviderApiStyle>([
  "responses",
  "chat-completions",
  "messages",
  "generate-content",
  "ollama-chat",
  "ollama-generate",
  "custom",
]);

const KNOWN_PROVIDER_BINDINGS = new Set<DesktopModelProviderBindingId>([
  "openai",
  "anthropic",
  "google",
]);

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeProtocolFamily(value: unknown): DesktopModelProviderProtocolFamily | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized || !KNOWN_PROTOCOL_FAMILIES.has(normalized as DesktopModelProviderProtocolFamily)) {
    return undefined;
  }

  return normalized as DesktopModelProviderProtocolFamily;
}

function normalizeApiStyle(value: unknown): DesktopModelProviderApiStyle | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized || !KNOWN_API_STYLES.has(normalized as DesktopModelProviderApiStyle)) {
    return undefined;
  }

  return normalized as DesktopModelProviderApiStyle;
}

function normalizeProviderBindingId(value: unknown): DesktopModelProviderBindingId | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }

  return KNOWN_PROVIDER_BINDINGS.has(normalized as DesktopModelProviderBindingId)
    ? normalized as DesktopModelProviderBindingId
    : undefined;
}

function resolveProviderBindingFromProtocolFamily(
  protocolFamily: DesktopModelProviderProtocolFamily | undefined,
): DesktopModelProviderBindingId | undefined {
  if (
    protocolFamily === "openai"
    || protocolFamily === "anthropic"
    || protocolFamily === "google"
  ) {
    return protocolFamily;
  }

  return undefined;
}

function resolveProtocolFamilyFromProviderBinding(
  providerBindingId: DesktopModelProviderBindingId | undefined,
): DesktopModelProviderProtocolFamily | undefined {
  if (!providerBindingId) {
    return undefined;
  }

  return providerBindingId;
}

function getMetadata(
  metadata: DesktopModelChannelItem["metadata"],
): DesktopModelChannelProtocolMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata as DesktopModelChannelProtocolMetadata;
}

function normalizeHeaderMap(value: unknown): DesktopModelChannelHeaderMap | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value)
    .filter((entry): entry is [string, string] => (
      typeof entry[0] === "string"
      && entry[0].trim().length > 0
      && typeof entry[1] === "string"
    ))
    .map(([key, headerValue]) => [key.trim(), headerValue.trim()] as const)
    .filter(([, headerValue]) => headerValue.length > 0);

  return entries.length > 0
    ? Object.fromEntries(entries)
    : undefined;
}

function isLegacyOllamaProtocolSnapshot(input: {
  providerType: string;
  protocolFamily?: DesktopModelProviderProtocolFamily;
  apiStyle?: DesktopModelProviderApiStyle;
}): boolean {
  const normalizedProviderType = normalizeOptionalString(input.providerType)?.toLowerCase();
  return (
    (
      normalizedProviderType === "ollama"
      || normalizedProviderType === "ollama-cloud"
      || Boolean(normalizedProviderType?.startsWith("custom-ollama-"))
    )
    && (
      input.protocolFamily === "ollama"
      || input.apiStyle === "ollama-chat"
      || input.apiStyle === "ollama-generate"
    )
  );
}

function normalizeLegacyOllamaProtocolSnapshot(input: {
  providerType: string;
  providerBindingId?: DesktopModelProviderBindingId;
  protocolFamily?: DesktopModelProviderProtocolFamily;
  apiStyle?: DesktopModelProviderApiStyle;
  runtimeSupport?: DesktopModelProviderRuntimeSupport;
}): Pick<
  DesktopChannelProtocolSnapshot,
  "providerBindingId" | "protocolFamily" | "apiStyle" | "runtimeSupport"
> {
  if (!isLegacyOllamaProtocolSnapshot(input)) {
    return {
      providerBindingId: input.providerBindingId,
      protocolFamily: input.protocolFamily,
      apiStyle: input.apiStyle,
      runtimeSupport: input.runtimeSupport,
    };
  }

  const normalizedRuntimeSupport =
    input.runtimeSupport?.status === "implemented"
      ? input.runtimeSupport
      : {
          status: "implemented" as const,
          adapterId: "openai-chat-completions",
        };

  return {
    providerBindingId: "openai",
    protocolFamily: "openai",
    apiStyle: "chat-completions",
    runtimeSupport: normalizedRuntimeSupport,
  };
}

function parseCustomProviderType(providerType: string): {
  protocolFamily?: DesktopModelProviderProtocolFamily;
  apiStyle?: DesktopModelProviderApiStyle;
} {
  const normalizedProviderType = normalizeOptionalString(providerType)?.toLowerCase();
  if (!normalizedProviderType || !normalizedProviderType.startsWith(CUSTOM_PROVIDER_PREFIX)) {
    return {};
  }

  const rest = normalizedProviderType.slice(CUSTOM_PROVIDER_PREFIX.length);
  for (const protocolFamily of KNOWN_PROTOCOL_FAMILIES) {
    const prefix = `${protocolFamily}-`;
    if (!rest.startsWith(prefix)) {
      continue;
    }

    const apiStyle = normalizeApiStyle(rest.slice(prefix.length));
    return {
      protocolFamily,
      apiStyle,
    };
  }

  return {};
}

export function isCustomProtocolProviderType(providerType: string): boolean {
  return normalizeOptionalString(providerType)?.toLowerCase().startsWith(CUSTOM_PROVIDER_PREFIX) ?? false;
}

export function buildCustomProtocolProviderType(
  protocolFamily: DesktopModelProviderProtocolFamily,
  apiStyle: DesktopModelProviderApiStyle,
): string {
  return `${CUSTOM_PROVIDER_PREFIX}${protocolFamily}-${apiStyle}`;
}

export function readChannelProtocolMetadata(
  channel: Pick<DesktopModelChannelItem, "providerType" | "metadata">,
): DesktopChannelProtocolSnapshot {
  const metadata = getMetadata(channel.metadata);
  const fallback = parseCustomProviderType(channel.providerType);
  const metadataBindingId = normalizeProviderBindingId(metadata.providerBindingId);
  const protocolFamily =
    normalizeProtocolFamily(metadata.protocolFamily)
    ?? resolveProtocolFamilyFromProviderBinding(metadataBindingId)
    ?? fallback.protocolFamily;
  const apiStyle =
    normalizeApiStyle(metadata.apiStyle)
    ?? fallback.apiStyle;
  const providerBindingId =
    metadataBindingId
    ?? resolveProviderBindingFromProtocolFamily(protocolFamily);
  const normalizedProtocol = normalizeLegacyOllamaProtocolSnapshot({
    providerType: channel.providerType,
    providerBindingId,
    protocolFamily,
    apiStyle,
    runtimeSupport: metadata.runtimeSupport,
  });

  if (metadata.source === "protocol") {
    return {
      source: "protocol",
      providerType: channel.providerType,
      providerBindingId: normalizedProtocol.providerBindingId,
      protocolFamily: normalizedProtocol.protocolFamily,
      apiStyle: normalizedProtocol.apiStyle,
      deploymentKind: metadata.deploymentKind,
      discoveryKind: metadata.discoveryKind,
      runtimeSupport: normalizedProtocol.runtimeSupport,
      headers: normalizeHeaderMap(metadata.headers),
    };
  }

  if (isCustomProtocolProviderType(channel.providerType)) {
    return {
      source: "protocol",
      providerType: channel.providerType,
      providerBindingId: normalizedProtocol.providerBindingId,
      protocolFamily: normalizedProtocol.protocolFamily,
      apiStyle: normalizedProtocol.apiStyle,
      deploymentKind: metadata.deploymentKind,
      discoveryKind: metadata.discoveryKind,
      runtimeSupport: normalizedProtocol.runtimeSupport,
      headers: normalizeHeaderMap(metadata.headers),
    };
  }

  return {
    source: "provider",
    providerType: channel.providerType,
    providerBindingId: normalizedProtocol.providerBindingId,
    protocolFamily: normalizedProtocol.protocolFamily,
    apiStyle: normalizedProtocol.apiStyle,
    deploymentKind: metadata.deploymentKind,
    discoveryKind: metadata.discoveryKind,
    runtimeSupport: normalizedProtocol.runtimeSupport,
    headers: normalizeHeaderMap(metadata.headers),
  };
}
