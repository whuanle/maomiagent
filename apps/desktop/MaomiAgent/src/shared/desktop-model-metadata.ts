import type {
  DesktopModelChannelItem,
  DesktopModelChannelStateItem,
  DesktopModelInterleavedConfig,
  DesktopModelModalities,
  DesktopModelProviderItem,
} from "./desktop-models";

export type DesktopChannelModelMetadata = {
  modelId: string;
  displayName?: string;
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
  contextWindow?: number;
  maxOutputTokens?: number;
  cost?: Record<string, number>;
};

export type DesktopModelKind =
  | "conversation"
  | "embedding"
  | "transcription"
  | "image-generation";

export const PREFERRED_DESKTOP_CHAT_DEFAULT_SELECTION = {
  channelId: "right",
  modelId: "gpt-5.4",
} as const;

const PREFERRED_DESKTOP_CHAT_DEFAULT_SELECTION_CANDIDATES = [
  PREFERRED_DESKTOP_CHAT_DEFAULT_SELECTION,
  {
    channelId: "openaigmn",
    modelId: "gpt-5.4",
  },
] as const;

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

function normalizeComparableToken(value?: string): string {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeModalityToken(value: string): string {
  return value.trim().toLowerCase();
}

function mergeUniqueStrings(...groups: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const group of groups) {
    for (const item of group ?? []) {
      const normalized = normalizeOptionalString(item);
      if (!normalized) {
        continue;
      }

      const token = normalizeModalityToken(normalized);
      if (seen.has(token)) {
        continue;
      }

      seen.add(token);
      result.push(normalized);
    }
  }

  return result;
}

function inferKnownModelMetadata(modelId: string): Partial<DesktopChannelModelMetadata> | undefined {
  const normalized = normalizeComparableToken(modelId);
  if (!normalized) {
    return undefined;
  }

  if (
    normalized.includes("gpt-4.1")
    || normalized.includes("gpt-4o")
    || normalized.includes("gpt-5")
  ) {
    return {
      supportsAttachments: true,
      modalities: {
        input: ["text", "image"],
        output: ["text"],
      },
    };
  }

  return undefined;
}

function compareChannelItems(
  left: Pick<DesktopModelChannelItem, "channelId" | "providerType">,
  right: Pick<DesktopModelChannelItem, "channelId" | "providerType">,
) {
  const channelCompare = left.channelId.localeCompare(right.channelId, "en", {
    sensitivity: "base",
  });
  if (channelCompare !== 0) {
    return channelCompare;
  }

  return left.providerType.localeCompare(right.providerType, "en", {
    sensitivity: "base",
  });
}

function compareModelStates(
  left: Pick<DesktopModelChannelStateItem, "modelId">,
  right: Pick<DesktopModelChannelStateItem, "modelId">,
) {
  return left.modelId.localeCompare(right.modelId, "en", {
    sensitivity: "base",
    numeric: true,
  });
}

function hasOutputModality(
  model: Pick<DesktopChannelModelMetadata, "modalities">,
  modality: string,
): boolean {
  const normalized = normalizeModalityToken(modality);
  return (model.modalities?.output ?? []).some((item) => normalizeModalityToken(item) === normalized);
}

function extractCustomDesktopChannelModels(
  channel: Pick<DesktopModelChannelItem, "metadata">,
): DesktopChannelModelMetadata[] {
  const raw = channel.metadata && typeof channel.metadata === "object"
    ? (channel.metadata.customModels as unknown)
    : undefined;

  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const models: DesktopChannelModelMetadata[] = [];

  for (const entry of raw) {
    if (typeof entry === "string") {
      const modelId = normalizeOptionalString(entry);
      if (!modelId || seen.has(modelId)) {
        continue;
      }

      seen.add(modelId);
      models.push({
        modelId,
        displayName: modelId,
      });
      continue;
    }

    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const item = entry as Record<string, unknown>;
    const modelId = normalizeOptionalString(item.modelId);
    if (!modelId || seen.has(modelId)) {
      continue;
    }

    seen.add(modelId);
    models.push({
      modelId,
      displayName: normalizeOptionalString(item.displayName) ?? modelId,
      family: normalizeOptionalString(item.family),
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
      contextWindow: normalizeOptionalPositiveNumber(item.contextWindow),
      maxOutputTokens: normalizeOptionalPositiveNumber(item.maxOutputTokens),
      cost: normalizeNumericRecord(item.cost),
    });
  }

  return models;
}

export function resolveDesktopChannelModelMetadata(
  providers: DesktopModelProviderItem[],
  channel: Pick<DesktopModelChannelItem, "providerType" | "metadata">,
  modelId: string,
): DesktopChannelModelMetadata | undefined {
  const provider = providers.find((item) => item.providerType === channel.providerType);
  const providerModel = provider?.models.find((item) => item.modelId === modelId);
  const customModel = extractCustomDesktopChannelModels(channel).find((item) => item.modelId === modelId);
  const inferred = inferKnownModelMetadata(modelId);

  if (!providerModel && !customModel && !inferred) {
    return undefined;
  }

  const mergedInputModalities = mergeUniqueStrings(
    inferred?.modalities?.input,
    providerModel?.modalities?.input,
    customModel?.modalities?.input,
  );
  const mergedOutputModalities = mergeUniqueStrings(
    inferred?.modalities?.output,
    providerModel?.modalities?.output,
    customModel?.modalities?.output,
  );
  const modalities =
    mergedInputModalities.length > 0 || mergedOutputModalities.length > 0
      ? {
          input: mergedInputModalities,
          output: mergedOutputModalities,
        }
      : undefined;

  return {
    modelId,
    displayName: customModel?.displayName ?? providerModel?.displayName ?? inferred?.displayName ?? modelId,
    family: customModel?.family ?? providerModel?.family ?? inferred?.family,
    supportsAttachments:
      customModel?.supportsAttachments ?? providerModel?.supportsAttachments ?? inferred?.supportsAttachments,
    supportsReasoning: customModel?.supportsReasoning ?? providerModel?.supportsReasoning ?? inferred?.supportsReasoning,
    supportsFunctionCall:
      customModel?.supportsFunctionCall ?? providerModel?.supportsFunctionCall ?? inferred?.supportsFunctionCall,
    supportsStructuredOutput:
      customModel?.supportsStructuredOutput
      ?? providerModel?.supportsStructuredOutput
      ?? inferred?.supportsStructuredOutput,
    supportsTemperature:
      customModel?.supportsTemperature ?? providerModel?.supportsTemperature ?? inferred?.supportsTemperature,
    interleaved: customModel?.interleaved ?? providerModel?.interleaved ?? inferred?.interleaved,
    knowledgeCutoff: customModel?.knowledgeCutoff ?? providerModel?.knowledgeCutoff ?? inferred?.knowledgeCutoff,
    releaseDate: customModel?.releaseDate ?? providerModel?.releaseDate ?? inferred?.releaseDate,
    lastUpdated: customModel?.lastUpdated ?? providerModel?.lastUpdated ?? inferred?.lastUpdated,
    modalities,
    openWeights: customModel?.openWeights ?? providerModel?.openWeights ?? inferred?.openWeights,
    contextWindow: customModel?.contextWindow ?? providerModel?.contextWindow ?? inferred?.contextWindow,
    maxOutputTokens:
      customModel?.maxOutputTokens ?? providerModel?.maxOutputTokens ?? inferred?.maxOutputTokens,
    cost: customModel?.cost ?? providerModel?.cost ?? inferred?.cost,
  };
}

export function inferDesktopModelKind(
  model: Pick<
    DesktopChannelModelMetadata,
    | "modelId"
    | "family"
    | "modalities"
    | "supportsFunctionCall"
    | "supportsStructuredOutput"
    | "supportsReasoning"
  >,
): DesktopModelKind {
  const family = normalizeComparableToken(model.family);
  const modelId = normalizeComparableToken(model.modelId);

  if (
    family.includes("embedding")
    || /(^|[-_/])(?:text-)?embedding(?:$|[-_/0-9])/i.test(modelId)
    || hasOutputModality(model, "embedding")
    || hasOutputModality(model, "vector")
  ) {
    return "embedding";
  }

  if (family.includes("whisper") || /(^|[-_/])whisper(?:$|[-_/0-9])/i.test(modelId)) {
    return "transcription";
  }

  if (
    hasOutputModality(model, "image")
    && !hasOutputModality(model, "text")
    && model.supportsFunctionCall !== true
    && model.supportsStructuredOutput !== true
    && model.supportsReasoning !== true
  ) {
    return "image-generation";
  }

  return "conversation";
}

export function isDesktopChannelModelConversational(
  providers: DesktopModelProviderItem[],
  channel: Pick<DesktopModelChannelItem, "providerType" | "metadata">,
  modelId: string,
): boolean {
  return inferDesktopModelKind(
    resolveDesktopChannelModelMetadata(providers, channel, modelId) ?? { modelId },
  ) === "conversation";
}

export function listConversationalEnabledDesktopChannelModels(
  providers: DesktopModelProviderItem[],
  channel: DesktopModelChannelItem,
): DesktopModelChannelStateItem[] {
  return channel.models.filter((item) =>
    item.enabled && isDesktopChannelModelConversational(providers, channel, item.modelId)
  );
}

export function resolvePreferredDesktopConversationalDefaultSelection(
  providers: DesktopModelProviderItem[],
  channels: DesktopModelChannelItem[],
): {
  providerType: string;
  channelId: string;
  modelId: string;
} | undefined {
  const enabledChannels = [...channels]
    .filter((item) => item.enabled && listConversationalEnabledDesktopChannelModels(providers, item).length > 0)
    .sort(compareChannelItems);

  for (const preferred of PREFERRED_DESKTOP_CHAT_DEFAULT_SELECTION_CANDIDATES) {
    for (const channel of enabledChannels) {
      if (channel.channelId !== preferred.channelId) {
        continue;
      }

      if (listConversationalEnabledDesktopChannelModels(providers, channel)
        .some((item) => item.modelId === preferred.modelId)) {
        return {
          providerType: channel.providerType,
          channelId: channel.channelId,
          modelId: preferred.modelId,
        };
      }
    }
  }

  for (const channel of enabledChannels) {
    if (listConversationalEnabledDesktopChannelModels(providers, channel)
      .some((item) => item.modelId === PREFERRED_DESKTOP_CHAT_DEFAULT_SELECTION.modelId)) {
      return {
        providerType: channel.providerType,
        channelId: channel.channelId,
        modelId: PREFERRED_DESKTOP_CHAT_DEFAULT_SELECTION.modelId,
      };
    }
  }

  const fallbackChannel = enabledChannels[0];
  if (!fallbackChannel) {
    return undefined;
  }

  const fallbackModel = [...listConversationalEnabledDesktopChannelModels(providers, fallbackChannel)]
    .sort(compareModelStates)[0];
  if (!fallbackModel) {
    return undefined;
  }

  return {
    providerType: fallbackChannel.providerType,
    channelId: fallbackChannel.channelId,
    modelId: fallbackModel.modelId,
  };
}
