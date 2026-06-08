import type { DesktopWorkspaceItem } from "../../../../shared/desktop-workspace";
import {
  readWorkspaceExperienceState,
  updateWorkspaceExperienceState,
} from "../../../components/workspace-experience-state/workspace-experience-state";

export const CHAT_WORKSPACE_TABS_STORAGE_KEY = "maomiagent.chat.workspace-tabs.v1";

export type WorkspaceTabsState = {
  openWorkspaceIds: string[];
  activeWorkspaceId?: string;
};

function trimOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export function normalizeWorkspaceTabsState(state: WorkspaceTabsState): WorkspaceTabsState {
  const seen = new Set<string>();
  const openWorkspaceIds: string[] = [];

  for (const id of state.openWorkspaceIds) {
    const workspaceId = trimOptionalText(id);
    if (!workspaceId || seen.has(workspaceId)) {
      continue;
    }

    seen.add(workspaceId);
    openWorkspaceIds.push(workspaceId);
  }

  const activeWorkspaceId = trimOptionalText(state.activeWorkspaceId);
  if (activeWorkspaceId && !seen.has(activeWorkspaceId)) {
    openWorkspaceIds.push(activeWorkspaceId);
  }

  return {
    openWorkspaceIds,
    activeWorkspaceId: activeWorkspaceId || undefined,
  };
}

export function parseWorkspaceTabsState(raw: string | null | undefined): WorkspaceTabsState {
  if (!raw) {
    return normalizeWorkspaceTabsState({
      openWorkspaceIds: [],
    });
  }

  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceTabsState> | null;
    return normalizeWorkspaceTabsState({
      openWorkspaceIds: Array.isArray(parsed?.openWorkspaceIds)
        ? parsed.openWorkspaceIds.filter((item): item is string => typeof item === "string")
        : [],
      activeWorkspaceId: typeof parsed?.activeWorkspaceId === "string"
        ? parsed.activeWorkspaceId
        : undefined,
    });
  } catch {
    return normalizeWorkspaceTabsState({
      openWorkspaceIds: [],
    });
  }
}

export function readWorkspaceTabsState(): WorkspaceTabsState {
  if (typeof window === "undefined") {
    return normalizeWorkspaceTabsState({
      openWorkspaceIds: [],
    });
  }

  const state = readWorkspaceExperienceState();
  const nextState = normalizeWorkspaceTabsState({
    openWorkspaceIds: state.chat.openWorkspaceIds,
    activeWorkspaceId: state.chat.activeWorkspaceId,
  });
  if (nextState.openWorkspaceIds.length > 0 || nextState.activeWorkspaceId) {
    window.localStorage.removeItem(CHAT_WORKSPACE_TABS_STORAGE_KEY);
    return nextState;
  }

  const legacyState = parseWorkspaceTabsState(window.localStorage.getItem(CHAT_WORKSPACE_TABS_STORAGE_KEY));
  if (legacyState.openWorkspaceIds.length === 0 && !legacyState.activeWorkspaceId) {
    return legacyState;
  }

  writeWorkspaceTabsState(legacyState);
  window.localStorage.removeItem(CHAT_WORKSPACE_TABS_STORAGE_KEY);
  return legacyState;
}

export function writeWorkspaceTabsState(state: WorkspaceTabsState) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeWorkspaceTabsState(state);
  updateWorkspaceExperienceState((current) => ({
    ...current,
    chat: {
      ...current.chat,
      openWorkspaceIds: normalized.openWorkspaceIds,
      activeWorkspaceId: normalized.activeWorkspaceId,
    },
  }));
  window.localStorage.removeItem(CHAT_WORKSPACE_TABS_STORAGE_KEY);
}

export function shouldReconcileWorkspaceTabsState(input: {
  workspaceListHydrated: boolean;
  state: WorkspaceTabsState;
}) {
  if (input.workspaceListHydrated) {
    return true;
  }

  return normalizeWorkspaceTabsState(input.state).openWorkspaceIds.length === 0;
}

export function normalizeWorkspaceIds(ids: string[], items: Array<Pick<DesktopWorkspaceItem, "workspaceId">>) {
  const allowed = new Set(items.map((item) => item.workspaceId));
  const seen = new Set<string>();
  const next: string[] = [];

  for (const id of ids) {
    const workspaceId = trimOptionalText(id);
    if (!workspaceId || seen.has(workspaceId) || !allowed.has(workspaceId)) {
      continue;
    }

    seen.add(workspaceId);
    next.push(workspaceId);
  }

  return next;
}

export function resolveConversationTargetWorkspaceId(input: {
  requestedWorkspaceId?: string;
  activeWorkspaceId?: string;
  openWorkspaceIds: string[];
  workspaceItems: Array<Pick<DesktopWorkspaceItem, "workspaceId">>;
}) {
  const allowed = new Set(input.workspaceItems.map((item) => item.workspaceId));
  const requestedWorkspaceId = trimOptionalText(input.requestedWorkspaceId);
  if (requestedWorkspaceId && allowed.has(requestedWorkspaceId)) {
    return requestedWorkspaceId;
  }

  const activeWorkspaceId = trimOptionalText(input.activeWorkspaceId);
  if (activeWorkspaceId && allowed.has(activeWorkspaceId)) {
    return activeWorkspaceId;
  }

  const openedWorkspaceIds = normalizeWorkspaceIds(input.openWorkspaceIds, input.workspaceItems);
  return openedWorkspaceIds[0] || input.workspaceItems[0]?.workspaceId || undefined;
}

export function openWorkspaceTab(openWorkspaceIds: string[], workspaceId: string) {
  const nextWorkspaceId = trimOptionalText(workspaceId);
  if (!nextWorkspaceId || openWorkspaceIds.includes(nextWorkspaceId)) {
    return openWorkspaceIds;
  }

  return [...openWorkspaceIds, nextWorkspaceId];
}

export function closeWorkspaceTabState(input: {
  openWorkspaceIds: string[];
  activeWorkspaceId?: string;
  workspaceId: string;
}): WorkspaceTabsState {
  const targetWorkspaceId = trimOptionalText(input.workspaceId);
  if (!targetWorkspaceId || !input.openWorkspaceIds.includes(targetWorkspaceId)) {
    return {
      openWorkspaceIds: input.openWorkspaceIds,
      activeWorkspaceId: trimOptionalText(input.activeWorkspaceId) || undefined,
    };
  }

  const currentIndex = input.openWorkspaceIds.indexOf(targetWorkspaceId);
  const nextOpenWorkspaceIds = input.openWorkspaceIds.filter((item) => item !== targetWorkspaceId);
  const currentActiveWorkspaceId = trimOptionalText(input.activeWorkspaceId);
  const nextActiveWorkspaceId = currentActiveWorkspaceId === targetWorkspaceId
    ? (
        nextOpenWorkspaceIds[currentIndex]
        ?? nextOpenWorkspaceIds[currentIndex - 1]
        ?? nextOpenWorkspaceIds[0]
        ?? ""
      )
    : currentActiveWorkspaceId;

  return {
    openWorkspaceIds: nextOpenWorkspaceIds,
    activeWorkspaceId: nextActiveWorkspaceId || undefined,
  };
}

export function resolveWorkspaceRefreshState(input: {
  items: DesktopWorkspaceItem[];
  runtimeActiveWorkspaceId?: string;
  openWorkspaceIds: string[];
  activeWorkspaceId?: string;
}): WorkspaceTabsState {
  const normalizedOpen = normalizeWorkspaceIds(input.openWorkspaceIds, input.items);
  const runtimeActiveWorkspaceId = trimOptionalText(input.runtimeActiveWorkspaceId);
  const currentActiveWorkspaceId = trimOptionalText(input.activeWorkspaceId);
  const fallbackWorkspaceId = runtimeActiveWorkspaceId
    || normalizedOpen[0]
    || input.items[0]?.workspaceId
    || "";
  const nextOpenWorkspaceIds = normalizedOpen.length > 0
    ? normalizedOpen
    : (fallbackWorkspaceId ? [fallbackWorkspaceId] : []);
  const nextActiveWorkspaceId = currentActiveWorkspaceId && nextOpenWorkspaceIds.includes(currentActiveWorkspaceId)
    ? currentActiveWorkspaceId
    : fallbackWorkspaceId;

  return {
    openWorkspaceIds: nextOpenWorkspaceIds,
    activeWorkspaceId: nextActiveWorkspaceId || undefined,
  };
}

export function resolveVisibleWorkspaceId(input: {
  activeWorkspaceId?: string;
  openWorkspaceIds: string[];
}) {
  const activeWorkspaceId = trimOptionalText(input.activeWorkspaceId);
  return (
    (activeWorkspaceId && input.openWorkspaceIds.includes(activeWorkspaceId) ? activeWorkspaceId : "")
    || input.openWorkspaceIds[0]
    || ""
  );
}
