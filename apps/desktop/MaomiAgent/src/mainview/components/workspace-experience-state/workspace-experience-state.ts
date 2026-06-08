import type { UiDesignerStageKey } from "../../modules/ui-designer/services/stage-view-model-resolver";

export const WORKSPACE_EXPERIENCE_STATE_STORAGE_KEY = "maomiagent.workspace-experience-state.v1";
const WORKSPACE_EXPERIENCE_STATE_VERSION = 1 as const;
const EMPTY_UPDATED_AT = new Date(0).toISOString();

export type WorkspaceExperienceChatScene = {
  openWorkspaceIds: string[];
  activeWorkspaceId?: string;
  workspaceSessions: Record<string, {
    selectedSessionId?: string;
  }>;
};

export type WorkspaceExperienceUiDesignerScene = {
  workspaceId?: string;
  selectedSessionId?: string;
  activeStageKey?: UiDesignerStageKey;
};

export type WorkspaceExperienceState = {
  version: typeof WORKSPACE_EXPERIENCE_STATE_VERSION;
  updatedAt: string;
  chat: WorkspaceExperienceChatScene;
  uiDesigner: WorkspaceExperienceUiDesignerScene;
};

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function isUiDesignerStageKey(value: unknown): value is UiDesignerStageKey {
  return value === "projectScope"
    || value === "stack"
    || value === "theme"
    || value === "patterns"
    || value === "layouts"
    || value === "pages"
    || value === "spec";
}

function normalizeWorkspaceIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) {
    return [];
  }

  const seen = new Set<string>();
  const next: string[] = [];

  for (const item of ids) {
    const workspaceId = normalizeOptionalText(item);
    if (!workspaceId || seen.has(workspaceId)) {
      continue;
    }

    seen.add(workspaceId);
    next.push(workspaceId);
  }

  return next;
}

function normalizeChatScene(value: unknown): WorkspaceExperienceChatScene {
  const record = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const openWorkspaceIds = normalizeWorkspaceIds(record.openWorkspaceIds);
  const activeWorkspaceId = normalizeOptionalText(record.activeWorkspaceId);
  const rawWorkspaceSessions = record.workspaceSessions && typeof record.workspaceSessions === "object"
    ? record.workspaceSessions as Record<string, unknown>
    : {};

  const workspaceSessions = Object.fromEntries(
    Object.entries(rawWorkspaceSessions).flatMap(([workspaceId, rawSession]) => {
      const normalizedWorkspaceId = normalizeOptionalText(workspaceId);
      if (!normalizedWorkspaceId) {
        return [];
      }

      const selectedSessionId = rawSession && typeof rawSession === "object"
        ? normalizeOptionalText((rawSession as Record<string, unknown>).selectedSessionId)
        : undefined;

      return [[normalizedWorkspaceId, { selectedSessionId }] as const];
    }),
  );

  return {
    openWorkspaceIds,
    activeWorkspaceId,
    workspaceSessions,
  };
}

function normalizeUiDesignerScene(value: unknown): WorkspaceExperienceUiDesignerScene {
  const record = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};

  const activeStageKey = isUiDesignerStageKey(record.activeStageKey)
    ? record.activeStageKey
    : undefined;

  return {
    workspaceId: normalizeOptionalText(record.workspaceId),
    selectedSessionId: normalizeOptionalText(record.selectedSessionId),
    activeStageKey,
  };
}

export function normalizeWorkspaceExperienceState(
  value?: Partial<WorkspaceExperienceState> | null,
): WorkspaceExperienceState {
  return {
    version: WORKSPACE_EXPERIENCE_STATE_VERSION,
    updatedAt: normalizeOptionalText(value?.updatedAt) ?? EMPTY_UPDATED_AT,
    chat: normalizeChatScene(value?.chat),
    uiDesigner: normalizeUiDesignerScene(value?.uiDesigner),
  };
}

export function readWorkspaceExperienceState(): WorkspaceExperienceState {
  if (typeof window === "undefined") {
    return normalizeWorkspaceExperienceState(undefined);
  }

  try {
    const raw = window.localStorage.getItem(WORKSPACE_EXPERIENCE_STATE_STORAGE_KEY);
    if (!raw) {
      return normalizeWorkspaceExperienceState(undefined);
    }

    return normalizeWorkspaceExperienceState(JSON.parse(raw) as Partial<WorkspaceExperienceState>);
  } catch {
    return normalizeWorkspaceExperienceState(undefined);
  }
}

export function writeWorkspaceExperienceState(
  state: WorkspaceExperienceState,
): WorkspaceExperienceState {
  const normalized = normalizeWorkspaceExperienceState({
    ...state,
    updatedAt: new Date().toISOString(),
  });

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      WORKSPACE_EXPERIENCE_STATE_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  }

  return normalized;
}

export function reconcileChatScene(input: {
  state: WorkspaceExperienceState;
  workspaces: Array<{ workspaceId: string }>;
  sessionsByWorkspaceId: Record<string, Array<{ sessionId: string }>>;
}): WorkspaceExperienceChatScene {
  const allowedWorkspaceIds = new Set(
    input.workspaces
      .map((item) => normalizeOptionalText(item.workspaceId))
      .filter((value): value is string => Boolean(value)),
  );
  const openWorkspaceIds = input.state.chat.openWorkspaceIds
    .filter((workspaceId) => allowedWorkspaceIds.has(workspaceId));
  const activeWorkspaceId = (
    input.state.chat.activeWorkspaceId
    && openWorkspaceIds.includes(input.state.chat.activeWorkspaceId)
      ? input.state.chat.activeWorkspaceId
      : undefined
  ) ?? openWorkspaceIds[0] ?? normalizeOptionalText(input.workspaces[0]?.workspaceId);

  const nextOpenWorkspaceIds = openWorkspaceIds.length > 0
    ? openWorkspaceIds
    : (activeWorkspaceId ? [activeWorkspaceId] : []);

  const workspaceSessions = Object.fromEntries(
    nextOpenWorkspaceIds.map((workspaceId) => {
      const preferredSessionId = input.state.chat.workspaceSessions[workspaceId]?.selectedSessionId;
      const allowedSessionIds = new Set(
        (input.sessionsByWorkspaceId[workspaceId] ?? [])
          .map((item) => normalizeOptionalText(item.sessionId))
          .filter((value): value is string => Boolean(value)),
      );

      return [workspaceId, {
        selectedSessionId: preferredSessionId && allowedSessionIds.has(preferredSessionId)
          ? preferredSessionId
          : undefined,
      }] as const;
    }),
  );

  return {
    openWorkspaceIds: nextOpenWorkspaceIds,
    activeWorkspaceId,
    workspaceSessions,
  };
}

export function reconcileUiDesignerScene(input: {
  state: WorkspaceExperienceState;
  workspaces: Array<{ workspaceId: string }>;
  sessions: Array<{ sessionId: string }>;
  availableStageKeys: readonly UiDesignerStageKey[];
}): WorkspaceExperienceUiDesignerScene {
  const allowedWorkspaceIds = new Set(
    input.workspaces
      .map((item) => normalizeOptionalText(item.workspaceId))
      .filter((value): value is string => Boolean(value)),
  );
  const allowedSessionIds = new Set(
    input.sessions
      .map((item) => normalizeOptionalText(item.sessionId))
      .filter((value): value is string => Boolean(value)),
  );

  const workspaceId = input.state.uiDesigner.workspaceId
    && allowedWorkspaceIds.has(input.state.uiDesigner.workspaceId)
    ? input.state.uiDesigner.workspaceId
    : normalizeOptionalText(input.workspaces[0]?.workspaceId);
  const selectedSessionId = input.state.uiDesigner.selectedSessionId
    && allowedSessionIds.has(input.state.uiDesigner.selectedSessionId)
    ? input.state.uiDesigner.selectedSessionId
    : normalizeOptionalText(input.sessions[0]?.sessionId);
  const activeStageKey = input.state.uiDesigner.activeStageKey
    && input.availableStageKeys.includes(input.state.uiDesigner.activeStageKey)
    ? input.state.uiDesigner.activeStageKey
    : input.availableStageKeys[0];

  return {
    workspaceId,
    selectedSessionId,
    activeStageKey,
  };
}
