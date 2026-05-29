import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
  DesktopConversationCapabilityPreferences,
  DesktopConversationPermissionRule,
  DesktopConversationReadWorkspaceSettingsInput,
  DesktopConversationReadWorkspaceSettingsResponse,
  DesktopConversationSaveWorkspaceSettingsInput,
  DesktopConversationSaveWorkspaceSettingsResponse,
  DesktopConversationWorkspaceFilePreviewMode,
  DesktopConversationWorkspaceSettings,
} from "../../../../../shared/desktop-conversation";
import {
  clampDesktopConversationContextCompressionThresholdPercent,
  createDefaultDesktopConversationWorkspaceSettings,
} from "../../../../../shared/desktop-conversation";
import type { DesktopTerminalShellKind } from "../../../../../shared/desktop-terminals";
import type { DesktopWorkspaceQueryPort } from "../../../workspace";

const DEFAULT_FILE_PREVIEW_MODE: DesktopConversationWorkspaceFilePreviewMode = "preview";
const SETTINGS_RELATIVE_PATH = join(".maomi", "chat", "settings.json");
const TERMINAL_SHELL_KINDS = new Set<DesktopTerminalShellKind>(["powershell", "cmd", "bash", "sh"]);

export const DESKTOP_CONVERSATION_WORKSPACE_SETTINGS_VERSION = 1 as const;
export { createDefaultDesktopConversationWorkspaceSettings } from "../../../../../shared/desktop-conversation";

type DesktopConversationWorkspaceSettingsDocument = {
  version: typeof DESKTOP_CONVERSATION_WORKSPACE_SETTINGS_VERSION;
  updatedAt: string;
  settings: DesktopConversationWorkspaceSettingsDocumentSettings;
};

type DesktopConversationWorkspaceSettingsDocumentSettings = Partial<DesktopConversationWorkspaceSettings>;

type NormalizedWorkspaceSettingsState = {
  settings: DesktopConversationWorkspaceSettings;
  warnings: string[];
};

type WorkspaceSettingsLocation = {
  workspaceId: string;
  workspaceRoot: string;
  path: string;
};

type ReadWorkspaceSettingsState = WorkspaceSettingsLocation & {
  exists: boolean;
  updatedAt?: string;
  settings: DesktopConversationWorkspaceSettings;
  warnings: string[];
};

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return !!error && typeof error === "object" && "code" in error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeContextCompressionThresholdPercent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return clampDesktopConversationContextCompressionThresholdPercent(value);
}

function normalizeTerminalShellKind(value: unknown): DesktopTerminalShellKind | undefined {
  return typeof value === "string" && TERMINAL_SHELL_KINDS.has(value as DesktopTerminalShellKind)
    ? value as DesktopTerminalShellKind
    : undefined;
}

function normalizePermissionRuleDecision(value: unknown): DesktopConversationPermissionRule["decision"] | undefined {
  return value === "approve_always" || value === "reject" ? value : undefined;
}

function normalizePermissionRule(
  value: unknown,
): DesktopConversationPermissionRule | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const permission = normalizeOptionalText(value.permission);
  const scope = normalizeOptionalText(value.scope);
  const decision = normalizePermissionRuleDecision(value.decision);
  if (!permission || !scope || !decision) {
    return undefined;
  }

  const note = normalizeOptionalText(value.note);
  const title = normalizeOptionalText(value.title);
  const resourceSummary = normalizeOptionalText(value.resourceSummary);

  return {
    permission,
    scope,
    decision,
    ...(typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt)
      ? { updatedAt: Math.trunc(value.updatedAt) }
      : {}),
    ...(note ? { note } : {}),
    ...(title ? { title } : {}),
    ...(resourceSummary ? { resourceSummary } : {}),
  };
}

function normalizePermissionRules(
  value: unknown,
): DesktopConversationPermissionRule[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value.flatMap((entry) => {
    const item = normalizePermissionRule(entry);
    return item ? [item] : [];
  });

  return normalized;
}

function normalizeCapabilityPreferences(
  value: unknown,
): DesktopConversationCapabilityPreferences | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const normalizedEntries = Object.entries(value).flatMap(([key, entryValue]) => {
    const capabilityId = normalizeOptionalText(key);
    const enabled = normalizeBoolean(entryValue);
    if (!capabilityId || enabled === undefined) {
      return [];
    }

    return [[capabilityId, enabled] as const];
  });

  if (normalizedEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(normalizedEntries);
}

function normalizeFilePreviewMode(value: unknown): DesktopConversationWorkspaceFilePreviewMode | undefined {
  if (value === "preview" || value === "source") {
    return value;
  }
  return undefined;
}

function normalizeWorkspaceSettings(
  value: unknown,
  warningPrefix: string,
): NormalizedWorkspaceSettingsState {
  const warnings: string[] = [];
  const defaults = createDefaultDesktopConversationWorkspaceSettings();
  const record = isRecord(value) ? value : {};

  if (value !== undefined && !isRecord(value)) {
    warnings.push(`${warningPrefix} settings must be an object. Using defaults.`);
  }

  const approvalAutoEnabled = normalizeBoolean(record.approvalAutoEnabled);
  if (record.approvalAutoEnabled !== undefined && approvalAutoEnabled === undefined) {
    warnings.push(`${warningPrefix} approvalAutoEnabled is invalid. Using default.`);
  }

  const contextCompressionThresholdPercent = normalizeContextCompressionThresholdPercent(
    record.contextCompressionThresholdPercent,
  );
  if (
    record.contextCompressionThresholdPercent !== undefined
    && contextCompressionThresholdPercent === undefined
  ) {
    warnings.push(`${warningPrefix} contextCompressionThresholdPercent is invalid. Using default.`);
  }

  const defaultFilePreviewMode = normalizeFilePreviewMode(record.defaultFilePreviewMode);
  if (record.defaultFilePreviewMode !== undefined && defaultFilePreviewMode === undefined) {
    warnings.push(`${warningPrefix} defaultFilePreviewMode is invalid. Using default.`);
  }

  const defaultTerminalShellKind = normalizeTerminalShellKind(record.defaultTerminalShellKind);
  if (record.defaultTerminalShellKind !== undefined && defaultTerminalShellKind === undefined) {
    warnings.push(`${warningPrefix} defaultTerminalShellKind is invalid. Ignoring value.`);
  }

  const selectedChannelId = normalizeOptionalText(record.selectedChannelId);
  if (record.selectedChannelId !== undefined && selectedChannelId === undefined) {
    warnings.push(`${warningPrefix} selectedChannelId is invalid. Ignoring value.`);
  }

  const selectedModelId = normalizeOptionalText(record.selectedModelId);
  if (record.selectedModelId !== undefined && selectedModelId === undefined) {
    warnings.push(`${warningPrefix} selectedModelId is invalid. Ignoring value.`);
  }
  if (
    (selectedChannelId && !selectedModelId)
    || (!selectedChannelId && selectedModelId)
  ) {
    warnings.push(`${warningPrefix} selectedChannelId and selectedModelId must be saved together. Ignoring value.`);
  }

  const thinkingEnabled = normalizeBoolean(record.thinkingEnabled);
  if (record.thinkingEnabled !== undefined && thinkingEnabled === undefined) {
    warnings.push(`${warningPrefix} thinkingEnabled is invalid. Using default.`);
  }

  const managedExecutionEnabled = normalizeBoolean(record.managedExecutionEnabled);
  if (record.managedExecutionEnabled !== undefined && managedExecutionEnabled === undefined) {
    warnings.push(`${warningPrefix} managedExecutionEnabled is invalid. Using default.`);
  }

  const permissionRules = normalizePermissionRules(record.permissionRules);
  if (record.permissionRules !== undefined && permissionRules === undefined) {
    warnings.push(`${warningPrefix} permissionRules is invalid. Ignoring value.`);
  }

  const memoryEnabled = normalizeBoolean(record.memoryEnabled);
  if (record.memoryEnabled !== undefined && memoryEnabled === undefined) {
    warnings.push(`${warningPrefix} memoryEnabled is invalid. Using default.`);
  }

  const sandboxEnabled = normalizeBoolean(record.sandboxEnabled);
  if (record.sandboxEnabled !== undefined && sandboxEnabled === undefined) {
    warnings.push(`${warningPrefix} sandboxEnabled is invalid. Using default.`);
  }

  const feishuSmartAssistantEnabled = normalizeBoolean(record.feishuSmartAssistantEnabled);
  if (record.feishuSmartAssistantEnabled !== undefined && feishuSmartAssistantEnabled === undefined) {
    warnings.push(`${warningPrefix} feishuSmartAssistantEnabled is invalid. Using default.`);
  }

  const capabilityPreferences = normalizeCapabilityPreferences(record.capabilityPreferences);
  if (record.capabilityPreferences !== undefined && capabilityPreferences === undefined) {
    warnings.push(`${warningPrefix} capabilityPreferences is invalid. Using defaults.`);
  }

  return {
    settings: {
      approvalAutoEnabled: approvalAutoEnabled ?? defaults.approvalAutoEnabled,
      contextCompressionThresholdPercent: contextCompressionThresholdPercent
        ?? defaults.contextCompressionThresholdPercent,
      defaultFilePreviewMode: defaultFilePreviewMode ?? defaults.defaultFilePreviewMode,
      ...(defaultTerminalShellKind ? { defaultTerminalShellKind } : {}),
      ...(selectedChannelId && selectedModelId
        ? {
            selectedChannelId,
            selectedModelId,
          }
        : {}),
      thinkingEnabled: thinkingEnabled ?? defaults.thinkingEnabled,
      managedExecutionEnabled: managedExecutionEnabled ?? defaults.managedExecutionEnabled,
      ...(permissionRules !== undefined ? { permissionRules } : {}),
      memoryEnabled: memoryEnabled ?? defaults.memoryEnabled,
      sandboxEnabled: sandboxEnabled ?? defaults.sandboxEnabled,
      feishuSmartAssistantEnabled: feishuSmartAssistantEnabled ?? defaults.feishuSmartAssistantEnabled,
      capabilityPreferences: {
        ...defaults.capabilityPreferences,
        ...(capabilityPreferences ?? {}),
      },
    },
    warnings,
  };
}

function mergeCapabilityPreferences(
  current: DesktopConversationCapabilityPreferences,
  patch: unknown,
): DesktopConversationCapabilityPreferences {
  if (!isRecord(patch)) {
    return { ...current };
  }

  const next: DesktopConversationCapabilityPreferences = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    const normalizedKey = normalizeOptionalText(key);
    if (!normalizedKey) {
      continue;
    }

    const normalizedValue = normalizeBoolean(value);
    if (normalizedValue === undefined) {
      delete next[normalizedKey];
      continue;
    }

    next[normalizedKey] = normalizedValue;
  }

  return next;
}

function mergeWorkspaceSettingsPatch(
  current: DesktopConversationWorkspaceSettings,
  patch: Partial<DesktopConversationWorkspaceSettings>,
): DesktopConversationWorkspaceSettingsDocumentSettings {
  const next: DesktopConversationWorkspaceSettingsDocumentSettings = {
    ...current,
  };

  const assign = <TKey extends keyof DesktopConversationWorkspaceSettings>(
    key: TKey,
    fallbackValue: DesktopConversationWorkspaceSettings[TKey],
  ) => {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) {
      return;
    }

    const value = patch[key];
    if (value === undefined) {
      next[key] = fallbackValue;
      return;
    }

    next[key] = value;
  };

  assign("approvalAutoEnabled", current.approvalAutoEnabled);
  assign("contextCompressionThresholdPercent", current.contextCompressionThresholdPercent);
  assign("defaultFilePreviewMode", current.defaultFilePreviewMode);
  assign("thinkingEnabled", current.thinkingEnabled);
  assign("managedExecutionEnabled", current.managedExecutionEnabled);
  assign("memoryEnabled", current.memoryEnabled);
  assign("sandboxEnabled", current.sandboxEnabled);
  assign("feishuSmartAssistantEnabled", current.feishuSmartAssistantEnabled);

  if (Object.prototype.hasOwnProperty.call(patch, "defaultTerminalShellKind")) {
    if (patch.defaultTerminalShellKind === undefined) {
      delete next.defaultTerminalShellKind;
    } else {
      next.defaultTerminalShellKind = patch.defaultTerminalShellKind;
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(patch, "selectedChannelId")
    || Object.prototype.hasOwnProperty.call(patch, "selectedModelId")
  ) {
    delete next.selectedChannelId;
    delete next.selectedModelId;

    const nextSelectedChannelId = normalizeOptionalText(patch.selectedChannelId);
    const nextSelectedModelId = normalizeOptionalText(patch.selectedModelId);
    if (nextSelectedChannelId && nextSelectedModelId) {
      next.selectedChannelId = nextSelectedChannelId;
      next.selectedModelId = nextSelectedModelId;
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "permissionRules")) {
    if (patch.permissionRules === undefined) {
      delete next.permissionRules;
    } else {
      next.permissionRules = patch.permissionRules;
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "capabilityPreferences")) {
    next.capabilityPreferences = mergeCapabilityPreferences(
      current.capabilityPreferences,
      patch.capabilityPreferences,
    );
  }

  return next;
}

function serializeWorkspaceSettingsDocument(document: DesktopConversationWorkspaceSettingsDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export class DesktopConversationWorkspaceSettingsService {
  private saveQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly workspaceQuery: Pick<DesktopWorkspaceQueryPort, "get">,
  ) {}

  async read(
    input: DesktopConversationReadWorkspaceSettingsInput,
  ): Promise<DesktopConversationReadWorkspaceSettingsResponse> {
    const state = await this.readState(input.workspaceId);
    return {
      workspaceId: state.workspaceId,
      version: DESKTOP_CONVERSATION_WORKSPACE_SETTINGS_VERSION,
      path: state.path,
      exists: state.exists,
      updatedAt: state.updatedAt,
      settings: state.settings,
      warnings: state.warnings,
    };
  }

  async save(
    input: DesktopConversationSaveWorkspaceSettingsInput,
  ): Promise<DesktopConversationSaveWorkspaceSettingsResponse> {
    const operation = this.saveQueue
      .catch(() => undefined)
      .then(() => this.saveInternal(input));
    this.saveQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async saveInternal(
    input: DesktopConversationSaveWorkspaceSettingsInput,
  ): Promise<DesktopConversationSaveWorkspaceSettingsResponse> {
    const current = await this.readState(input.workspaceId);
    const merged = mergeWorkspaceSettingsPatch(current.settings, input.patch);
    const normalized = normalizeWorkspaceSettings(merged, "Workspace chat settings");
    const updatedAt = new Date().toISOString();
    const document: DesktopConversationWorkspaceSettingsDocument = {
      version: DESKTOP_CONVERSATION_WORKSPACE_SETTINGS_VERSION,
      updatedAt,
      settings: normalized.settings,
    };

    await this.writeAtomically(current.path, serializeWorkspaceSettingsDocument(document));

    return {
      workspaceId: current.workspaceId,
      version: DESKTOP_CONVERSATION_WORKSPACE_SETTINGS_VERSION,
      path: current.path,
      updatedAt,
      settings: normalized.settings,
      warnings: normalized.warnings,
      syncedSessionCount: 0,
    };
  }

  private async readState(workspaceIdInput: string): Promise<ReadWorkspaceSettingsState> {
    const location = await this.resolveLocation(workspaceIdInput);
    let raw: string;

    try {
      raw = await readFile(location.path, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return {
          ...location,
          exists: false,
          settings: createDefaultDesktopConversationWorkspaceSettings(),
          warnings: [],
        };
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return {
        ...location,
        exists: true,
        settings: createDefaultDesktopConversationWorkspaceSettings(),
        warnings: [
          "Workspace chat settings JSON is malformed. Using built-in defaults.",
        ],
      };
    }

    if (!isRecord(parsed)) {
      return {
        ...location,
        exists: true,
        settings: createDefaultDesktopConversationWorkspaceSettings(),
        warnings: [
          "Workspace chat settings document must be an object. Using built-in defaults.",
        ],
      };
    }

    const warnings: string[] = [];
    if (parsed.version !== DESKTOP_CONVERSATION_WORKSPACE_SETTINGS_VERSION) {
      warnings.push(
        `Workspace chat settings document version is invalid. Expected ${DESKTOP_CONVERSATION_WORKSPACE_SETTINGS_VERSION}.`,
      );
    }

    const normalized = normalizeWorkspaceSettings(parsed.settings, "Workspace chat settings");
    const updatedAt = normalizeOptionalText(parsed.updatedAt);
    if (parsed.updatedAt !== undefined && !updatedAt) {
      warnings.push("Workspace chat settings updatedAt is invalid. Ignoring value.");
    }

    return {
      ...location,
      exists: true,
      updatedAt,
      settings: normalized.settings,
      warnings: [...warnings, ...normalized.warnings],
    };
  }

  private async resolveLocation(workspaceIdInput: string): Promise<WorkspaceSettingsLocation> {
    const workspaceId = normalizeOptionalText(workspaceIdInput);
    if (!workspaceId) {
      throw new Error("workspaceId is required");
    }

    const workspace = await this.workspaceQuery.get(workspaceId);
    if (!workspace) {
      throw new Error(`workspace not found: ${workspaceId}`);
    }

    return {
      workspaceId,
      workspaceRoot: workspace.directoryPath,
      path: join(workspace.directoryPath, SETTINGS_RELATIVE_PATH),
    };
  }

  private async writeAtomically(path: string, content: string): Promise<void> {
    const tempPath = `${path}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(tempPath, content, "utf8");
    await rename(tempPath, path);
  }
}
