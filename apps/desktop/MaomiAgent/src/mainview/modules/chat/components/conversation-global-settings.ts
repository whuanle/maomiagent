export type ConversationGlobalSettings = {
  approvalAutoEnabled: boolean;
  contextCompressionThresholdPercent: number;
};

type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

type WindowLike = {
  localStorage?: LocalStorageLike;
};

const GLOBAL_SETTINGS_STORAGE_KEY = "maomiagent.chat.global-settings.v1";

export const DEFAULT_CONTEXT_COMPRESSION_THRESHOLD_PERCENT = 80;
export const CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN = 50;
export const CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX = 90;

function createDefaultConversationGlobalSettings(): ConversationGlobalSettings {
  return {
    approvalAutoEnabled: true,
    contextCompressionThresholdPercent: DEFAULT_CONTEXT_COMPRESSION_THRESHOLD_PERCENT,
  };
}

function readGlobalSettingsStorage(windowValue?: WindowLike): LocalStorageLike | undefined {
  return windowValue?.localStorage;
}

export function clampContextCompressionThresholdPercent(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CONTEXT_COMPRESSION_THRESHOLD_PERCENT;
  }

  const normalized = Math.round(value / 5) * 5;
  if (normalized < CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN) {
    return CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN;
  }
  if (normalized > CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX) {
    return CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX;
  }
  return normalized;
}

export function readConversationGlobalSettings(
  windowValue: WindowLike | undefined = typeof window === "undefined" ? undefined : window,
): ConversationGlobalSettings {
  const storage = readGlobalSettingsStorage(windowValue);
  if (!storage) {
    return createDefaultConversationGlobalSettings();
  }

  try {
    const raw = storage.getItem(GLOBAL_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return createDefaultConversationGlobalSettings();
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      approvalAutoEnabled: parsed.approvalAutoEnabled !== false,
      contextCompressionThresholdPercent: clampContextCompressionThresholdPercent(
        parsed.contextCompressionThresholdPercent,
      ),
    };
  } catch {
    return createDefaultConversationGlobalSettings();
  }
}

export function writeConversationGlobalSettings(
  input: Partial<ConversationGlobalSettings>,
  windowValue: WindowLike | undefined = typeof window === "undefined" ? undefined : window,
): ConversationGlobalSettings {
  const currentSettings = readConversationGlobalSettings(windowValue);
  const nextSettings = {
    ...currentSettings,
    ...input,
    contextCompressionThresholdPercent: clampContextCompressionThresholdPercent(
      input.contextCompressionThresholdPercent ?? currentSettings.contextCompressionThresholdPercent,
    ),
  } satisfies ConversationGlobalSettings;

  const storage = readGlobalSettingsStorage(windowValue);
  if (storage) {
    storage.setItem(GLOBAL_SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
  }

  return nextSettings;
}