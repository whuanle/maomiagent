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
