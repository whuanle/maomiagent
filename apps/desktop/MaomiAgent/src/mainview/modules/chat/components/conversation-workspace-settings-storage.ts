import { useCallback, useEffect, useRef, useState } from "react";

import type {
  DesktopConversationCapabilityPreferences,
  DesktopConversationPermissionRule,
  DesktopConversationPermissionRuleDecision,
  DesktopConversationWorkspaceSettings,
} from "../../../../shared/desktop-conversation";
import {
  DESKTOP_CONVERSATION_CONTEXT_COMPRESSION_THRESHOLD_PERCENT_DEFAULT as DEFAULT_CONTEXT_COMPRESSION_THRESHOLD_PERCENT,
  DESKTOP_CONVERSATION_CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX as CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX,
  DESKTOP_CONVERSATION_CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN as CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN,
  clampDesktopConversationContextCompressionThresholdPercent,
  createDefaultDesktopConversationWorkspaceSettings,
} from "../../../../shared/desktop-conversation";
import type { DesktopConversationSaveWorkspaceSettingsResponse } from "../../../../shared/desktop-conversation";
import type { DesktopTerminalShellKind } from "../../../../shared/desktop-terminals";
import {
  DESKTOP_CONVERSATION_BRIDGE_READY_EVENT,
  getDesktopConversationWorkspaceSettings,
  hasDesktopConversationBridge,
  saveDesktopConversationWorkspaceSettings,
} from "../../../lib/desktop-conversation";

export {
  DEFAULT_CONTEXT_COMPRESSION_THRESHOLD_PERCENT,
  CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MIN,
  CONTEXT_COMPRESSION_THRESHOLD_PERCENT_MAX,
};

export type ConversationWorkspaceSettings = DesktopConversationWorkspaceSettings;

type ConversationWorkspaceSettingsChangedDetail = {
  workspaceId: string;
  settings: ConversationWorkspaceSettings;
  warnings: string[];
};

type SaveConversationWorkspaceSettingsOptions = {
  syncExistingSessions?: boolean;
};

export const CHAT_WORKSPACE_SETTINGS_CHANGED_EVENT = "maomi:chat-workspace-settings-changed";

const workspaceSettingsSaveQueueById = new Map<string, Promise<void>>();

function getConversationWorkspaceSettingsSaveQueue(workspaceId: string) {
  return workspaceSettingsSaveQueueById.get(workspaceId) ?? Promise.resolve();
}

function queueConversationWorkspaceSettingsSave<T>(
  workspaceId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = getConversationWorkspaceSettingsSaveQueue(workspaceId);
  const queued = previous
    .catch(() => undefined)
    .then(operation);
  const settled = queued.then(() => undefined, () => undefined);
  workspaceSettingsSaveQueueById.set(workspaceId, settled);
  void settled.finally(() => {
    if (workspaceSettingsSaveQueueById.get(workspaceId) === settled) {
      workspaceSettingsSaveQueueById.delete(workspaceId);
    }
  });
  return queued;
}

const TERMINAL_SHELL_KINDS = new Set<DesktopTerminalShellKind>(["powershell", "cmd", "bash", "sh"]);

function normalizeWorkspaceId(workspaceId?: string) {
  return workspaceId?.trim() ?? "";
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeBooleanSetting(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeFilePreviewMode(
  value: unknown,
): ConversationWorkspaceSettings["defaultFilePreviewMode"] {
  return value === "source" ? "source" : "preview";
}

function normalizeTerminalShellKind(value: unknown): DesktopTerminalShellKind | undefined {
  return typeof value === "string" && TERMINAL_SHELL_KINDS.has(value as DesktopTerminalShellKind)
    ? value as DesktopTerminalShellKind
    : undefined;
}

function normalizePermissionRuleDecision(value: unknown): DesktopConversationPermissionRuleDecision | undefined {
  return value === "approve_always" || value === "reject" ? value : undefined;
}

function normalizePermissionRule(value: unknown): DesktopConversationPermissionRule | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const permission = normalizeOptionalText(record.permission);
  const scope = normalizeOptionalText(record.scope);
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

function normalizePermissionRules(value: unknown): DesktopConversationPermissionRule[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.flatMap((entry) => {
    const normalized = normalizePermissionRule(entry);
    return normalized ? [normalized] : [];
  });
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

function normalizeWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const warning = normalizeOptionalText(entry);
    return warning ? [warning] : [];
  });
}

function normalizeConversationWorkspaceSettings(
  value?: Partial<ConversationWorkspaceSettings> | null,
): ConversationWorkspaceSettings {
  const defaults = createDefaultDesktopConversationWorkspaceSettings();
  const selectedChannelId = normalizeOptionalText(value?.selectedChannelId);
  const selectedModelId = normalizeOptionalText(value?.selectedModelId);

  return {
    approvalAutoEnabled: normalizeBooleanSetting(value?.approvalAutoEnabled) ?? defaults.approvalAutoEnabled,
    contextCompressionThresholdPercent: clampDesktopConversationContextCompressionThresholdPercent(
      value?.contextCompressionThresholdPercent ?? defaults.contextCompressionThresholdPercent,
    ),
    defaultFilePreviewMode: normalizeFilePreviewMode(value?.defaultFilePreviewMode),
    ...(normalizeTerminalShellKind(value?.defaultTerminalShellKind)
      ? { defaultTerminalShellKind: normalizeTerminalShellKind(value?.defaultTerminalShellKind) }
      : {}),
    ...(selectedChannelId && selectedModelId
      ? {
          selectedChannelId,
          selectedModelId,
        }
      : {}),
    thinkingEnabled: normalizeBooleanSetting(value?.thinkingEnabled) ?? defaults.thinkingEnabled,
    managedExecutionEnabled: normalizeBooleanSetting(value?.managedExecutionEnabled)
      ?? defaults.managedExecutionEnabled,
    ...(normalizePermissionRules(value?.permissionRules) !== undefined
      ? { permissionRules: normalizePermissionRules(value?.permissionRules) }
      : {}),
    memoryEnabled: normalizeBooleanSetting(value?.memoryEnabled) ?? defaults.memoryEnabled,
    sandboxEnabled: normalizeBooleanSetting(value?.sandboxEnabled) ?? defaults.sandboxEnabled,
    feishuSmartAssistantEnabled: normalizeBooleanSetting(value?.feishuSmartAssistantEnabled)
      ?? defaults.feishuSmartAssistantEnabled,
    capabilityPreferences: {
      ...defaults.capabilityPreferences,
      ...(normalizeCapabilityPreferences(value?.capabilityPreferences) ?? {}),
    },
  };
}

function serializeConversationWorkspaceSettings(settings: ConversationWorkspaceSettings) {
  return JSON.stringify(settings);
}

function serializeWarnings(warnings: string[]) {
  return JSON.stringify(warnings);
}

function areConversationWorkspaceSettingsEqual(
  left: ConversationWorkspaceSettings,
  right: ConversationWorkspaceSettings,
) {
  return serializeConversationWorkspaceSettings(left) === serializeConversationWorkspaceSettings(right);
}

function areWarningsEqual(left: string[], right: string[]) {
  return serializeWarnings(left) === serializeWarnings(right);
}

export function clampContextCompressionThresholdPercent(value: unknown) {
  return clampDesktopConversationContextCompressionThresholdPercent(value);
}

export function waitForConversationWorkspaceSettingsSaves(workspaceId?: string): Promise<void> {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  if (!normalizedWorkspaceId) {
    return Promise.resolve();
  }

  return getConversationWorkspaceSettingsSaveQueue(normalizedWorkspaceId)
    .catch(() => undefined);
}

function emitConversationWorkspaceSettingsChanged(detail: ConversationWorkspaceSettingsChangedDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<ConversationWorkspaceSettingsChangedDetail>(
    CHAT_WORKSPACE_SETTINGS_CHANGED_EVENT,
    { detail },
  ));
}

function resolveRuntimeSettingsErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "未知错误";
}

export function useConversationWorkspaceSettings(workspaceId?: string) {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const [bridgeRevision, setBridgeRevision] = useState(0);
  const defaultSettingsRef = useRef<ConversationWorkspaceSettings>(normalizeConversationWorkspaceSettings());
  const settingsRef = useRef<ConversationWorkspaceSettings>(defaultSettingsRef.current);
  const warningsRef = useRef<string[]>([]);
  const loadRequestIdRef = useRef(0);
  const [settings, setSettings] = useState<ConversationWorkspaceSettings>(
    () => defaultSettingsRef.current,
  );
  const [warnings, setWarnings] = useState<string[]>(() => warningsRef.current);
  const [loadingCount, setLoadingCount] = useState(0);
  const [savingCount, setSavingCount] = useState(0);
  const [error, setError] = useState("");

  const applySettingsState = useCallback((nextSettings: ConversationWorkspaceSettings, nextWarnings: string[]) => {
    settingsRef.current = nextSettings;
    warningsRef.current = nextWarnings;
    setSettings((current) => areConversationWorkspaceSettingsEqual(current, nextSettings)
      ? current
      : nextSettings);
    setWarnings((current) => areWarningsEqual(current, nextWarnings)
      ? current
      : nextWarnings);
  }, []);

  const invalidatePendingLoads = useCallback(() => {
    loadRequestIdRef.current += 1;
  }, []);

  const loadSettings = useCallback(async () => {
    if (!normalizedWorkspaceId) {
      const defaults = normalizeConversationWorkspaceSettings();
      applySettingsState(defaults, []);
      setError("");
      setLoadingCount(0);
      return defaults;
    }

    if (!hasDesktopConversationBridge()) {
      setLoadingCount(0);
      return settingsRef.current;
    }

    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setLoadingCount((current) => current + 1);

    try {
      await waitForConversationWorkspaceSettingsSaves(normalizedWorkspaceId);
      const response = await getDesktopConversationWorkspaceSettings({
        workspaceId: normalizedWorkspaceId,
      });
      if (requestId !== loadRequestIdRef.current) {
        return settingsRef.current;
      }

      const nextSettings = normalizeConversationWorkspaceSettings(response.settings);
      const nextWarnings = normalizeWarnings(response.warnings);
      applySettingsState(nextSettings, nextWarnings);
      setError("");
      return nextSettings;
    } catch (loadError) {
      if (requestId === loadRequestIdRef.current) {
        setError(resolveRuntimeSettingsErrorMessage(loadError));
      }
      return settingsRef.current;
    } finally {
      setLoadingCount((current) => Math.max(0, current - 1));
    }
  }, [applySettingsState, normalizedWorkspaceId]);

  const refreshSettings = useCallback(async () => {
    return loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleBridgeReady = () => {
      setBridgeRevision((current) => current + 1);
    };

    window.addEventListener(DESKTOP_CONVERSATION_BRIDGE_READY_EVENT, handleBridgeReady as EventListener);
    return () => {
      window.removeEventListener(DESKTOP_CONVERSATION_BRIDGE_READY_EVENT, handleBridgeReady as EventListener);
    };
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [bridgeRevision, loadSettings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleSettingsChanged = (event: Event) => {
      const detail = (event as CustomEvent<ConversationWorkspaceSettingsChangedDetail>).detail;
      if (!detail || detail.workspaceId !== normalizedWorkspaceId) {
        return;
      }

      invalidatePendingLoads();
      applySettingsState(
        normalizeConversationWorkspaceSettings(detail.settings),
        normalizeWarnings(detail.warnings),
      );
      setError("");
    };

    window.addEventListener(CHAT_WORKSPACE_SETTINGS_CHANGED_EVENT, handleSettingsChanged as EventListener);
    return () => {
      window.removeEventListener(CHAT_WORKSPACE_SETTINGS_CHANGED_EVENT, handleSettingsChanged as EventListener);
    };
  }, [applySettingsState, invalidatePendingLoads, normalizedWorkspaceId]);

  const saveSettings = useCallback(async (
    patch: Partial<ConversationWorkspaceSettings>,
    options: SaveConversationWorkspaceSettingsOptions = {},
  ): Promise<DesktopConversationSaveWorkspaceSettingsResponse | null> => {
    if (!normalizedWorkspaceId) {
      return null;
    }

    if (!hasDesktopConversationBridge()) {
      throw new Error("Desktop chat settings are unavailable in the current runtime.");
    }

    invalidatePendingLoads();
    setSavingCount((current) => current + 1);
    try {
      const response = await queueConversationWorkspaceSettingsSave(normalizedWorkspaceId, () =>
        saveDesktopConversationWorkspaceSettings({
          workspaceId: normalizedWorkspaceId,
          patch,
          syncExistingSessions: options.syncExistingSessions,
        }));
      const nextSettings = normalizeConversationWorkspaceSettings(response.settings);
      const nextWarnings = normalizeWarnings(response.warnings);
      applySettingsState(nextSettings, nextWarnings);
      setError("");
      emitConversationWorkspaceSettingsChanged({
        workspaceId: normalizedWorkspaceId,
        settings: nextSettings,
        warnings: nextWarnings,
      });
      return response;
    } catch (saveError) {
      setError(resolveRuntimeSettingsErrorMessage(saveError));
      throw saveError;
    } finally {
      setSavingCount((current) => Math.max(0, current - 1));
    }
  }, [applySettingsState, invalidatePendingLoads, normalizedWorkspaceId]);

  const loading = loadingCount > 0;
  const saving = savingCount > 0;

  return {
    workspaceId: normalizedWorkspaceId,
    settings,
    warnings,
    loading,
    saving,
    error,
    refreshSettings,
    saveSettings,
  };
}
