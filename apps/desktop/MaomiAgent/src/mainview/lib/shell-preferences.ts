import type { LanguageCode } from "../config/titlebar";
import {
  DEFAULT_THEME_MODE,
  THEME_STORAGE_COMPAT_KEYS,
  normalizeThemeMode,
  type AppThemeMode,
} from "../theme/antd-theme";

const SHELL_PREFERENCES_STORAGE_KEYS = ["maomiagent.shell-preferences"] as const;
const SHELL_PREFERENCES_VERSION = 1;
const LANGUAGE_STORAGE_KEYS = ["maomiagent.language"] as const;

type StoredShellPreferences = {
  version?: number;
  themeMode?: AppThemeMode;
  language?: LanguageCode;
};

export type ShellPreferences = {
  version: number;
  themeMode: AppThemeMode;
  language: LanguageCode;
};

function normalizeLanguage(value: unknown): LanguageCode {
  return value === "en-US" ? "en-US" : "zh-CN";
}

function readFirstStorageValue(keys: readonly string[]) {
  if (typeof window === "undefined") {
    return null;
  }

  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

export function readShellPreferences(): ShellPreferences {
  if (typeof window === "undefined") {
    return {
      version: SHELL_PREFERENCES_VERSION,
      themeMode: DEFAULT_THEME_MODE,
      language: "zh-CN",
    };
  }

  try {
    const rawValue = readFirstStorageValue(SHELL_PREFERENCES_STORAGE_KEYS);
    if (rawValue) {
      const parsed = JSON.parse(rawValue) as StoredShellPreferences | null;
      if (parsed && typeof parsed === "object") {
        return {
          version: SHELL_PREFERENCES_VERSION,
          themeMode: normalizeThemeMode(parsed.themeMode),
          language: normalizeLanguage(parsed.language),
        };
      }
    }
  } catch {
    // Fall back to legacy single-key storage.
  }

  return {
    version: SHELL_PREFERENCES_VERSION,
    themeMode: normalizeThemeMode(readFirstStorageValue(THEME_STORAGE_COMPAT_KEYS)),
    language: normalizeLanguage(readFirstStorageValue(LANGUAGE_STORAGE_KEYS)),
  };
}

export function writeShellPreferences(preferences: ShellPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized: ShellPreferences = {
    version: SHELL_PREFERENCES_VERSION,
    themeMode: normalizeThemeMode(preferences.themeMode),
    language: normalizeLanguage(preferences.language),
  };

  for (const key of SHELL_PREFERENCES_STORAGE_KEYS) {
    window.localStorage.setItem(key, JSON.stringify(normalized));
  }

  for (const key of THEME_STORAGE_COMPAT_KEYS) {
    window.localStorage.setItem(key, normalized.themeMode);
  }

  for (const key of LANGUAGE_STORAGE_KEYS) {
    window.localStorage.setItem(key, normalized.language);
  }
}