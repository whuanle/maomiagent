import {
  getDesktopWorkspace,
  listDesktopWorkspaces,
} from "./desktop-workspace";

export type WorkspaceRestoreState = {
  workspaceId: string;
  version: string;
  updatedAt: string;
  conversation?: Record<string, unknown>;
  ui?: Record<string, unknown>;
};

const RESTORE_STATE_STORAGE_PREFIX = "maomi.workspace.restore";
const CHAT_WORKSPACE_TABS_STORAGE_KEY = "maomiagent.chat.workspace-tabs.v1";
const WORKSPACE_EXPERIENCE_STATE_STORAGE_KEY = "maomiagent.workspace-experience-state.v1";

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStoredActiveWorkspaceId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const experienceRaw = window.localStorage.getItem(WORKSPACE_EXPERIENCE_STATE_STORAGE_KEY);
  if (experienceRaw) {
    try {
      const parsed = JSON.parse(experienceRaw) as {
        chat?: {
          activeWorkspaceId?: unknown;
        };
      } | null;
      const activeWorkspaceId = normalizeText(parsed?.chat?.activeWorkspaceId);
      if (activeWorkspaceId) {
        return activeWorkspaceId;
      }
    } catch {
      // Fall back to legacy key parsing.
    }
  }

  const raw = window.localStorage.getItem(CHAT_WORKSPACE_TABS_STORAGE_KEY);
  if (!raw) {
    return "";
  }

  try {
    const parsed = JSON.parse(raw) as { activeWorkspaceId?: unknown } | null;
    return normalizeText(parsed?.activeWorkspaceId);
  } catch {
    return "";
  }
}

function buildRestoreStorageKey(workspaceId: string): string {
  return `${RESTORE_STATE_STORAGE_PREFIX}:${workspaceId}`;
}

export async function fetchWorkspaces(_runtimeUrl: string, input: {
  includeUnavailable?: boolean;
  limit?: number;
  offset?: number;
}) {
  return listDesktopWorkspaces({
    limit: input.limit,
    offset: input.offset,
  });
}

export async function fetchActiveWorkspace(_runtimeUrl: string): Promise<{
  item: Awaited<ReturnType<typeof getDesktopWorkspace>>;
  active: Awaited<ReturnType<typeof getDesktopWorkspace>>;
}> {
  const storedActiveWorkspaceId = readStoredActiveWorkspaceId();
  if (storedActiveWorkspaceId) {
    try {
      const activeItem = await getDesktopWorkspace(storedActiveWorkspaceId);
      if (activeItem) {
        return {
          item: activeItem,
          active: activeItem,
        };
      }
    } catch {
      // Fall back to the workspace list when a previously selected workspace no longer resolves.
    }
  }

  const list = await listDesktopWorkspaces({
    limit: 1,
    offset: 0,
  });
  const item = list.items[0] ?? null;
  return {
    item,
    active: item,
  };
}

export async function fetchWorkspaceRestoreState(
  _runtimeUrl: string,
  workspaceId: string,
): Promise<WorkspaceRestoreState | null> {
  const key = buildRestoreStorageKey(workspaceId);
  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as WorkspaceRestoreState;
  } catch {
    return null;
  }
}

export async function saveWorkspaceRestoreState(
  _runtimeUrl: string,
  workspaceId: string,
  patch: Partial<WorkspaceRestoreState>,
): Promise<WorkspaceRestoreState> {
  const previous = await fetchWorkspaceRestoreState(_runtimeUrl, workspaceId);
  const next: WorkspaceRestoreState = {
    workspaceId,
    version: previous?.version ?? "1",
    updatedAt: new Date().toISOString(),
    conversation: previous?.conversation ?? {},
    ui: {
      ...(previous?.ui ?? {}),
      ...(patch.ui ?? {}),
    },
    ...patch,
  };

  window.localStorage.setItem(buildRestoreStorageKey(workspaceId), JSON.stringify(next));
  return next;
}
