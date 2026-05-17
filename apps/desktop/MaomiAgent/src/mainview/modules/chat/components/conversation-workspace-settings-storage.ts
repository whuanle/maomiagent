import { useCallback, useEffect, useState } from "react";

import type {
  DesktopConversationCapabilityPreferences,
  DesktopConversationPermissionRule,
  DesktopConversationPermissionRuleDecision,
} from "../../../../shared/desktop-conversation";
import type { DesktopTerminalShellKind } from "../../../../shared/desktop-terminals";
import {
  clampContextCompressionThresholdPercent,
  readConversationGlobalSettings,
  writeConversationGlobalSettings,
} from "./conversation-global-settings";
import type { ConversationGlobalSettings } from "./conversation-global-settings";

export {
  clampContextCompressionThresholdPercent,
  readConversationGlobalSettings,
  writeConversationGlobalSettings,
  DEFAULT_CONTEXT_COMPRESSION_THRESHOLD_PERCENT,
  CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN,
  CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX,
} from "./conversation-global-settings";
export type { ConversationGlobalSettings } from "./conversation-global-settings";

export type ConversationWorkspaceFilePreviewMode = "preview" | "source";

export type ConversationWorkspaceSettings = {
  defaultFilePreviewMode: ConversationWorkspaceFilePreviewMode;
  defaultTerminalShellKind?: DesktopTerminalShellKind;
  selectedChannelId?: string;
  selectedModelId?: string;
  managedExecutionEnabled?: boolean;
  permissionRules?: DesktopConversationPermissionRule[];
  memoryEnabled?: boolean;
  sandboxEnabled?: boolean;
  feishuSmartAssistantEnabled?: boolean;
  capabilityPreferences?: DesktopConversationCapabilityPreferences;
};

type ConversationWorkspaceSettingsChangedDetail = {
  workspaceId: string;
  settings: ConversationWorkspaceSettings;
};

const STORAGE_KEY_PREFIX = "maomiagent.chat.workspace.settings.v1:";
export const CHAT_WORKSPACE_SETTINGS_CHANGED_EVENT = "maomi:chat-workspace-settings-changed";

const TERMINAL_SHELL_KINDS = new Set<DesktopTerminalShellKind>(["powershell", "cmd", "bash", "sh"]);

function normalizeWorkspaceId(workspaceId?: string) {
  return workspaceId?.trim() ?? "";
}

function resolveStorageKey(workspaceId: string) {
  return `${STORAGE_KEY_PREFIX}${workspaceId}`;
}

function normalizeFilePreviewMode(value: unknown): ConversationWorkspaceFilePreviewMode {
  return value === "source" ? "source" : "preview";
}

function normalizeTerminalShellKind(value: unknown): DesktopTerminalShellKind | undefined {
  return typeof value === "string" && TERMINAL_SHELL_KINDS.has(value as DesktopTerminalShellKind)
    ? value as DesktopTerminalShellKind
    : undefined;
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeBooleanSetting(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizePermissionRuleDecision(value: unknown): DesktopConversationPermissionRuleDecision | undefined {
  return value === "approve_always" || value === "reject" ? value : undefined;
}

function normalizeCapabilityPreferences(
  value: unknown,
): DesktopConversationCapabilityPreferences | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const normalizedEntries = Object.entries(value).flatMap(([key, entryValue]) => {
    const capabilityId = key.trim();
    if (!capabilityId || typeof entryValue !== "boolean") {
      return [];
    }

    return [[capabilityId, entryValue] as const];
  });

  if (normalizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(normalizedEntries);
}

function normalizePermissionRule(
  value: unknown,
): DesktopConversationPermissionRule | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const permission = typeof record.permission === "string" && record.permission.trim()
    ? record.permission.trim()
    : undefined;
  const scope = typeof record.scope === "string" && record.scope.trim()
    ? record.scope.trim()
    : undefined;
  const decision = normalizePermissionRuleDecision(record.decision);
  if (!permission || !scope || !decision) {
    return undefined;
  }

  return {
    permission,
    scope,
    decision,
    ...(typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt)
      ? { updatedAt: Math.trunc(record.updatedAt) }
      : {}),
    ...(typeof record.note === "string" && record.note.trim() ? { note: record.note.trim() } : {}),
    ...(typeof record.title === "string" && record.title.trim() ? { title: record.title.trim() } : {}),
    ...(typeof record.resourceSummary === "string" && record.resourceSummary.trim()
      ? { resourceSummary: record.resourceSummary.trim() }
      : {}),
  };
}

function normalizePermissionRules(
  value: unknown,
): DesktopConversationPermissionRule[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((entry) => {
    const normalized = normalizePermissionRule(entry);
    return normalized ? [normalized] : [];
  });
}

export function useConversationGlobalSettings() {
  const [settings, setSettings] = useState<ConversationGlobalSettings>(() => readConversationGlobalSettings());

  const updateSettings = useCallback((input: Partial<ConversationGlobalSettings>) => {
    const nextSettings = writeConversationGlobalSettings(input);
    setSettings(nextSettings);
    return nextSettings;
  }, []);

  return {
    settings,
    updateSettings,
  };
}

function normalizeConversationWorkspaceSettings(
  value?: Partial<ConversationWorkspaceSettings> | null,
): ConversationWorkspaceSettings {
  const selectedChannelId = normalizeOptionalText(value?.selectedChannelId);
  const selectedModelId = normalizeOptionalText(value?.selectedModelId);

  return {
    defaultFilePreviewMode: normalizeFilePreviewMode(value?.defaultFilePreviewMode),
    defaultTerminalShellKind: normalizeTerminalShellKind(value?.defaultTerminalShellKind),
    selectedChannelId: selectedChannelId && selectedModelId ? selectedChannelId : undefined,
    selectedModelId: selectedChannelId && selectedModelId ? selectedModelId : undefined,
    managedExecutionEnabled: normalizeBooleanSetting(value?.managedExecutionEnabled),
    permissionRules: normalizePermissionRules(value?.permissionRules),
    memoryEnabled: normalizeBooleanSetting(value?.memoryEnabled),
    sandboxEnabled: normalizeBooleanSetting(value?.sandboxEnabled),
    feishuSmartAssistantEnabled: normalizeBooleanSetting(value?.feishuSmartAssistantEnabled),
    capabilityPreferences: normalizeCapabilityPreferences(value?.capabilityPreferences),
  };
}

function serializeConversationWorkspaceSettings(settings: ConversationWorkspaceSettings) {
  return JSON.stringify(settings);
}

function areConversationWorkspaceSettingsEqual(
  left: ConversationWorkspaceSettings,
  right: ConversationWorkspaceSettings,
) {
  return serializeConversationWorkspaceSettings(left) === serializeConversationWorkspaceSettings(right);
}

export function readConversationWorkspaceSettings(workspaceId?: string): ConversationWorkspaceSettings {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  if (!normalizedWorkspaceId || typeof window === "undefined") {
    return normalizeConversationWorkspaceSettings();
  }

  try {
    const raw = window.localStorage.getItem(resolveStorageKey(normalizedWorkspaceId));
    if (!raw) {
      return normalizeConversationWorkspaceSettings();
    }

    return normalizeConversationWorkspaceSettings(JSON.parse(raw) as Partial<ConversationWorkspaceSettings>);
  } catch {
    return normalizeConversationWorkspaceSettings();
  }
}

export function writeConversationWorkspaceSettings(
  workspaceId: string,
  input: Partial<ConversationWorkspaceSettings>,
): ConversationWorkspaceSettings {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  if (!normalizedWorkspaceId || typeof window === "undefined") {
    return normalizeConversationWorkspaceSettings(input);
  }

  const previousSettings = readConversationWorkspaceSettings(normalizedWorkspaceId);
  const nextSettings = normalizeConversationWorkspaceSettings({
    ...previousSettings,
    ...input,
  });
  if (areConversationWorkspaceSettingsEqual(previousSettings, nextSettings)) {
    return previousSettings;
  }

  window.localStorage.setItem(resolveStorageKey(normalizedWorkspaceId), JSON.stringify(nextSettings));
  window.dispatchEvent(new CustomEvent<ConversationWorkspaceSettingsChangedDetail>(
    CHAT_WORKSPACE_SETTINGS_CHANGED_EVENT,
    {
      detail: {
        workspaceId: normalizedWorkspaceId,
        settings: nextSettings,
      },
    },
  ));
  return nextSettings;
}

export function useConversationWorkspaceSettings(workspaceId?: string) {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const [settings, setSettings] = useState<ConversationWorkspaceSettings>(() => readConversationWorkspaceSettings(normalizedWorkspaceId));

  useEffect(() => {
    const nextSettings = readConversationWorkspaceSettings(normalizedWorkspaceId);
    setSettings((current) => areConversationWorkspaceSettingsEqual(current, nextSettings)
      ? current
      : nextSettings);
  }, [normalizedWorkspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleSettingsChanged = (event: Event) => {
      const detail = (event as CustomEvent<ConversationWorkspaceSettingsChangedDetail>).detail;
      if (!detail) {
        const nextSettings = readConversationWorkspaceSettings(normalizedWorkspaceId);
        setSettings((current) => areConversationWorkspaceSettingsEqual(current, nextSettings)
          ? current
          : nextSettings);
        return;
      }

      if (!normalizedWorkspaceId || detail.workspaceId === normalizedWorkspaceId) {
        setSettings((current) => areConversationWorkspaceSettingsEqual(current, detail.settings)
          ? current
          : detail.settings);
      }
    };

    window.addEventListener(CHAT_WORKSPACE_SETTINGS_CHANGED_EVENT, handleSettingsChanged as EventListener);
    return () => window.removeEventListener(CHAT_WORKSPACE_SETTINGS_CHANGED_EVENT, handleSettingsChanged as EventListener);
  }, [normalizedWorkspaceId]);

  const updateSettings = useCallback((input: Partial<ConversationWorkspaceSettings>) => {
    if (!normalizedWorkspaceId) {
      return normalizeConversationWorkspaceSettings(input);
    }

    const nextSettings = writeConversationWorkspaceSettings(normalizedWorkspaceId, input);
    setSettings((current) => areConversationWorkspaceSettingsEqual(current, nextSettings)
      ? current
      : nextSettings);
    return nextSettings;
  }, [normalizedWorkspaceId]);

  return {
    workspaceId: normalizedWorkspaceId,
    settings,
    updateSettings,
  };
}
