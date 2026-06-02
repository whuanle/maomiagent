import {
  inferDesktopModelKind,
  resolveDesktopChannelModelMetadata,
  type DesktopModelKind,
} from "../../../../shared/desktop-model-metadata";
import type {
  DesktopModelChannelItem,
  DesktopModelInterleavedConfig,
  DesktopModelModalities,
  DesktopModelProviderItem,
} from "../../../../shared/desktop-models";

export type DesktopChannelModelRow = {
  key: string;
  modelId: string;
  displayName: string;
  family?: string;
  kind: DesktopModelKind;
  enabled: boolean;
  knownProviderModel: boolean;
  customModel: boolean;
  supportsAttachments?: boolean;
  supportsReasoning?: boolean;
  supportsFunctionCall?: boolean;
  supportsStructuredOutput?: boolean;
  supportsTemperature?: boolean;
  interleaved?: DesktopModelInterleavedConfig;
  modalities?: DesktopModelModalities;
  contextWindow?: number;
  maxOutputTokens?: number;
  searchText: string;
};

function normalizeText(value?: string) {
  return typeof value === "string" ? value.trim() : "";
}

export function extractCustomChannelModelIds(channel: Pick<DesktopModelChannelItem, "metadata">) {
  const raw = channel.metadata && typeof channel.metadata === "object"
    ? (channel.metadata.customModels as unknown)
    : undefined;

  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const next: string[] = [];

  for (const entry of raw) {
    const modelId = typeof entry === "string"
      ? normalizeText(entry)
      : entry && typeof entry === "object"
        ? normalizeText((entry as { modelId?: string }).modelId)
        : "";
    if (!modelId || seen.has(modelId)) {
      continue;
    }

    seen.add(modelId);
    next.push(modelId);
  }

  return next;
}

export function buildDesktopChannelModelRows(
  providers: DesktopModelProviderItem[],
  channel: DesktopModelChannelItem,
): DesktopChannelModelRow[] {
  const provider = providers.find((item) => item.providerType === channel.providerType);
  const knownProviderIds = new Set(provider?.models.map((item) => item.modelId) ?? []);
  const enabledIds = new Set(channel.models.filter((item) => item.enabled).map((item) => item.modelId));
  const customIds = new Set(extractCustomChannelModelIds(channel));
  const allIds = new Set<string>([
    ...knownProviderIds,
    ...enabledIds,
    ...customIds,
  ]);

  return [...allIds]
    .sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base", numeric: true }))
    .map((modelId) => {
      const metadata = resolveDesktopChannelModelMetadata(providers, channel, modelId) ?? { modelId };
      return {
        key: modelId,
        modelId,
        displayName: metadata.displayName ?? modelId,
        family: metadata.family,
        kind: inferDesktopModelKind(metadata),
        enabled: enabledIds.has(modelId),
        knownProviderModel: knownProviderIds.has(modelId),
        customModel: customIds.has(modelId),
        supportsAttachments: metadata.supportsAttachments,
        supportsReasoning: metadata.supportsReasoning,
        supportsFunctionCall: metadata.supportsFunctionCall,
        supportsStructuredOutput: metadata.supportsStructuredOutput,
        supportsTemperature: metadata.supportsTemperature,
        interleaved: metadata.interleaved,
        modalities: metadata.modalities,
        contextWindow: metadata.contextWindow,
        maxOutputTokens: metadata.maxOutputTokens,
        searchText: [
          metadata.displayName,
          modelId,
          metadata.family,
          channel.name,
          channel.channelId,
          channel.providerType,
        ].filter(Boolean).join(" "),
      };
    });
}
