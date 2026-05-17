import type { DesktopModelRuntimeSelectionSnapshot } from "../../../../shared/desktop-models";

const MODEL_KEY_SEPARATOR = "::";
const UNKNOWN_PROVIDER_TYPE = "unknown";

export type DesktopRuntimeModelOption = {
  value: string;
  label: string;
  disabled?: boolean;
  groupLabel: string;
  channelId: string;
  channelLabel: string;
  modelId: string;
  providerType: string;
  searchText: string;
  supportsAttachments?: boolean;
  modalities?: DesktopModelRuntimeSelectionSnapshot["models"][number]["modalities"];
  contextWindow?: number;
  maxOutputTokens?: number;
};

export type DesktopRuntimeModelOptionGroup = {
  label: string;
  options: Array<{
    value: string;
    label: string;
    disabled?: boolean;
    searchText: string;
  }>;
};

function normalizeText(value?: string) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveProviderType(input: {
  snapshot: DesktopModelRuntimeSelectionSnapshot | null;
  channelId?: string;
  modelId?: string;
}) {
  const channelId = normalizeText(input.channelId);
  const modelId = normalizeText(input.modelId);
  if (!channelId || !modelId) {
    return UNKNOWN_PROVIDER_TYPE;
  }

  const candidates = [
    input.snapshot?.models.find((item) => item.channelId === channelId && item.value === modelId)?.providerType,
    input.snapshot?.channels.find((item) => item.value === channelId)?.providerType,
    input.snapshot?.resolvedSelection.channelId === channelId
    && input.snapshot?.resolvedSelection.modelId === modelId
      ? input.snapshot.resolvedSelection.providerType
      : undefined,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return UNKNOWN_PROVIDER_TYPE;
}

export function encodeDesktopRuntimeModelKey(input: {
  providerType: string;
  channelId: string;
  modelId: string;
}) {
  return [input.providerType, input.channelId, input.modelId]
    .map((item) => encodeURIComponent(item))
    .join(MODEL_KEY_SEPARATOR);
}

export function decodeDesktopRuntimeModelKey(value: string) {
  const parts = value.split(MODEL_KEY_SEPARATOR);
  if (parts.length !== 3) {
    return null;
  }

  try {
    const [providerType, channelId, modelId] = parts.map((item) => decodeURIComponent(item));
    if (!providerType || !channelId || !modelId) {
      return null;
    }

    return {
      providerType,
      channelId,
      modelId,
    };
  } catch {
    return null;
  }
}

export function resolveDesktopRuntimeSelectedValue(input: {
  snapshot: DesktopModelRuntimeSelectionSnapshot | null;
  selectedChannelId?: string;
  selectedModelId?: string;
}) {
  const channelId = normalizeText(input.selectedChannelId);
  const modelId = normalizeText(input.selectedModelId);
  if (!channelId || !modelId) {
    return undefined;
  }

  return encodeDesktopRuntimeModelKey({
    providerType: resolveProviderType({
      snapshot: input.snapshot,
      channelId,
      modelId,
    }),
    channelId,
    modelId,
  });
}

export function buildDesktopRuntimeModelOptions(input: {
  snapshot: DesktopModelRuntimeSelectionSnapshot | null;
  selectedChannelId?: string;
  selectedModelId?: string;
}): DesktopRuntimeModelOption[] {
  const selectedValue = resolveDesktopRuntimeSelectedValue(input);
  const channelLabels = new Map(
    (input.snapshot?.channels ?? []).map((item) => [item.value, normalizeText(item.label) || item.value]),
  );
  const options: DesktopRuntimeModelOption[] = [];
  const seen = new Set<string>();

  for (const item of input.snapshot?.models ?? []) {
    const value = encodeDesktopRuntimeModelKey({
      providerType: normalizeText(item.providerType) || UNKNOWN_PROVIDER_TYPE,
      channelId: item.channelId,
      modelId: item.value,
    });
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    if (!item.effectiveEnabled && value !== selectedValue) {
      continue;
    }

    const channelLabel = channelLabels.get(item.channelId) || item.channelId;
    options.push({
      value,
      label: normalizeText(item.label) || item.value,
      disabled: !item.effectiveEnabled,
      groupLabel: channelLabel,
      channelId: item.channelId,
      channelLabel,
      modelId: item.value,
      providerType: normalizeText(item.providerType) || UNKNOWN_PROVIDER_TYPE,
      supportsAttachments: item.supportsAttachments,
      modalities: item.modalities,
      contextWindow: item.contextWindow,
      maxOutputTokens: item.maxOutputTokens,
      searchText: [
        channelLabel,
        item.label,
        item.value,
        item.channelId,
        item.providerType,
        item.providerDisplayName,
      ].filter(Boolean).join(" "),
    });
  }

  const selectedChannelId = normalizeText(input.selectedChannelId);
  const selectedModelId = normalizeText(input.selectedModelId);
  if (
    selectedValue
    && selectedChannelId
    && selectedModelId
    && !options.some((item) => item.value === selectedValue)
  ) {
    const providerType = resolveProviderType({
      snapshot: input.snapshot,
      channelId: selectedChannelId,
      modelId: selectedModelId,
    });
    const channelLabel = channelLabels.get(selectedChannelId) || selectedChannelId;
    options.unshift({
      value: selectedValue,
      label: selectedModelId,
      disabled: true,
      groupLabel: channelLabel,
      channelId: selectedChannelId,
      channelLabel,
      modelId: selectedModelId,
      providerType,
      searchText: [channelLabel, selectedModelId, selectedChannelId, providerType].join(" "),
    });
  }

  return options;
}

export function buildDesktopRuntimeModelOptionGroups(
  options: DesktopRuntimeModelOption[],
): DesktopRuntimeModelOptionGroup[] {
  const groups = new Map<string, DesktopRuntimeModelOptionGroup["options"]>();
  const order: string[] = [];

  for (const item of options) {
    const groupLabel = normalizeText(item.groupLabel) || "Models";
    if (!groups.has(groupLabel)) {
      groups.set(groupLabel, []);
      order.push(groupLabel);
    }

    groups.get(groupLabel)?.push({
      value: item.value,
      label: item.label,
      disabled: item.disabled,
      searchText: item.searchText,
    });
  }

  return order.map((label) => ({
    label,
    options: groups.get(label) ?? [],
  }));
}

export function resolveDesktopRuntimeSelectionLabel(input: {
  options: DesktopRuntimeModelOption[];
  snapshot: DesktopModelRuntimeSelectionSnapshot | null;
  selectedValue?: string;
  fallback: string;
}) {
  const selectedValue = normalizeText(input.selectedValue);
  if (selectedValue) {
    const matched = input.options.find((item) => item.value === selectedValue);
    if (matched) {
      return matched.label;
    }

    const decoded = decodeDesktopRuntimeModelKey(selectedValue);
    if (decoded?.modelId) {
      return decoded.modelId;
    }
  }

  const resolvedChannelId = normalizeText(input.snapshot?.resolvedSelection.channelId);
  const resolvedModelId = normalizeText(input.snapshot?.resolvedSelection.modelId);
  if (!resolvedModelId) {
    return input.fallback;
  }

  return input.snapshot?.models.find((item) =>
    item.value === resolvedModelId
    && (!resolvedChannelId || item.channelId === resolvedChannelId))?.label
    || resolvedModelId
    || input.fallback;
}

export function resolveDesktopRuntimeSelectionPatch(value?: string) {
  const decoded = value ? decodeDesktopRuntimeModelKey(value) : null;
  return {
    selectedChannelId: decoded?.channelId,
    selectedModelId: decoded?.modelId,
  };
}