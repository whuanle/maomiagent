import type {
  DesktopModelChannelItem,
  DesktopModelInterleavedConfig,
  DesktopModelModalities,
} from "../../../../shared/desktop-models";

export type EditableCustomChannelModel = {
  modelId: string;
  displayName: string;
  family?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  supportsAttachments: boolean;
  supportsReasoning: boolean;
  supportsFunctionCall: boolean;
  supportsStructuredOutput: boolean;
  supportsTemperature: boolean;
  interleaved?: DesktopModelInterleavedConfig;
  modalities: DesktopModelModalities;
};

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeOptionalPositiveNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return value;
}

function normalizeUniqueTokens(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const normalized = item.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    tokens.push(normalized);
  }

  return tokens;
}

function normalizeModalities(value: unknown): DesktopModelModalities {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      input: [],
      output: [],
    };
  }

  const item = value as { input?: unknown; output?: unknown };
  return {
    input: normalizeUniqueTokens(item.input),
    output: normalizeUniqueTokens(item.output),
  };
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

function cloneMetadata(metadata: DesktopModelChannelItem["metadata"]): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return { ...metadata };
}

function readRawCustomModels(metadata: DesktopModelChannelItem["metadata"]): unknown[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }

  const raw = metadata.customModels;
  return Array.isArray(raw) ? [...raw] : [];
}

function getRawCustomModelId(entry: unknown): string | undefined {
  if (typeof entry === "string") {
    return normalizeOptionalString(entry);
  }

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return undefined;
  }

  return normalizeOptionalString((entry as { modelId?: unknown }).modelId);
}

function toEditableCustomChannelModel(entry: unknown): EditableCustomChannelModel | null {
  if (typeof entry === "string") {
    const modelId = normalizeOptionalString(entry);
    if (!modelId) {
      return null;
    }

    return {
      modelId,
      displayName: modelId,
      supportsAttachments: false,
      supportsReasoning: false,
      supportsFunctionCall: false,
      supportsStructuredOutput: false,
      supportsTemperature: false,
      interleaved: undefined,
      modalities: {
        input: [],
        output: [],
      },
    };
  }

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const item = entry as Record<string, unknown>;
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
    modalities: normalizeModalities(item.modalities),
  };
}

function buildSerializedCustomModel(
  existingEntry: unknown,
  model: EditableCustomChannelModel,
): Record<string, unknown> {
  const nextEntry =
    existingEntry && typeof existingEntry === "object" && !Array.isArray(existingEntry)
      ? { ...(existingEntry as Record<string, unknown>) }
      : {};

  const displayName = normalizeOptionalString(model.displayName) ?? model.modelId;
  const family = normalizeOptionalString(model.family);
  const contextWindow = normalizeOptionalPositiveNumber(model.contextWindow);
  const maxOutputTokens = normalizeOptionalPositiveNumber(model.maxOutputTokens);
  const modalities = {
    input: normalizeUniqueTokens(model.modalities.input),
    output: normalizeUniqueTokens(model.modalities.output),
  };

  nextEntry.modelId = model.modelId;
  nextEntry.displayName = displayName;

  if (family) {
    nextEntry.family = family;
  } else {
    delete nextEntry.family;
  }

  if (contextWindow) {
    nextEntry.contextWindow = contextWindow;
  } else {
    delete nextEntry.contextWindow;
  }

  if (maxOutputTokens) {
    nextEntry.maxOutputTokens = maxOutputTokens;
  } else {
    delete nextEntry.maxOutputTokens;
  }

  if (model.supportsAttachments) {
    nextEntry.supportsAttachments = true;
  } else {
    delete nextEntry.supportsAttachments;
  }

  if (model.supportsReasoning) {
    nextEntry.supportsReasoning = true;
  } else {
    delete nextEntry.supportsReasoning;
  }

  if (model.supportsFunctionCall) {
    nextEntry.supportsFunctionCall = true;
  } else {
    delete nextEntry.supportsFunctionCall;
  }

  if (model.supportsStructuredOutput) {
    nextEntry.supportsStructuredOutput = true;
  } else {
    delete nextEntry.supportsStructuredOutput;
  }

  if (model.supportsTemperature) {
    nextEntry.supportsTemperature = true;
  } else {
    delete nextEntry.supportsTemperature;
  }

  if (model.interleaved === true) {
    nextEntry.interleaved = true;
  } else if (model.interleaved && typeof model.interleaved === "object") {
    nextEntry.interleaved = model.interleaved.field
      ? { field: model.interleaved.field }
      : {};
  } else {
    delete nextEntry.interleaved;
  }

  if (modalities.input.length > 0 || modalities.output.length > 0) {
    nextEntry.modalities = modalities;
  } else {
    delete nextEntry.modalities;
  }

  return nextEntry;
}

export function readCustomChannelModelForEdit(
  channel: Pick<DesktopModelChannelItem, "metadata">,
  modelId: string,
): EditableCustomChannelModel | null {
  const normalizedModelId = normalizeOptionalString(modelId);
  if (!normalizedModelId) {
    return null;
  }

  for (const entry of readRawCustomModels(channel.metadata)) {
    if (getRawCustomModelId(entry) !== normalizedModelId) {
      continue;
    }

    return toEditableCustomChannelModel(entry);
  }

  return null;
}

export function mergeCustomChannelModelMetadata(
  metadata: DesktopModelChannelItem["metadata"],
  model: EditableCustomChannelModel,
): Record<string, unknown> {
  const nextMetadata = cloneMetadata(metadata);
  const rawCustomModels = readRawCustomModels(metadata);
  const nextCustomModels: unknown[] = [];
  let replaced = false;

  for (const entry of rawCustomModels) {
    if (getRawCustomModelId(entry) !== model.modelId) {
      nextCustomModels.push(entry);
      continue;
    }

    if (!replaced) {
      nextCustomModels.push(buildSerializedCustomModel(entry, model));
      replaced = true;
    }
  }

  if (!replaced) {
    nextCustomModels.push(buildSerializedCustomModel(undefined, model));
  }

  nextMetadata.customModels = nextCustomModels;
  return nextMetadata;
}

export function removeCustomChannelModelMetadata(
  metadata: DesktopModelChannelItem["metadata"],
  modelId: string,
): Record<string, unknown> {
  const normalizedModelId = normalizeOptionalString(modelId);
  const nextMetadata = cloneMetadata(metadata);

  if (!normalizedModelId) {
    return nextMetadata;
  }

  const nextCustomModels = readRawCustomModels(metadata)
    .filter((entry) => getRawCustomModelId(entry) !== normalizedModelId);

  if (nextCustomModels.length > 0) {
    nextMetadata.customModels = nextCustomModels;
  } else {
    delete nextMetadata.customModels;
  }

  return nextMetadata;
}

export function stripCustomModelsMetadata(
  metadata: DesktopModelChannelItem["metadata"],
): Record<string, unknown> {
  const nextMetadata = cloneMetadata(metadata);
  delete nextMetadata.customModels;
  return nextMetadata;
}
