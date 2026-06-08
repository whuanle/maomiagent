import { describe, expect, test } from "bun:test";

import { readWorkspaceExperienceState } from "../../../components/workspace-experience-state/workspace-experience-state";
import {
  CHAT_WORKSPACE_TABS_STORAGE_KEY,
  closeWorkspaceTabState,
  normalizeWorkspaceTabsState,
  openWorkspaceTab,
  parseWorkspaceTabsState,
  readWorkspaceTabsState,
  resolveConversationTargetWorkspaceId,
  resolveVisibleWorkspaceId,
  resolveWorkspaceRefreshState,
  shouldReconcileWorkspaceTabsState,
  writeWorkspaceTabsState,
} from "./chat-workspace-shell-state";

function createWorkspace(workspaceId: string, name?: string) {
  return {
    workspaceId,
    name: name ?? workspaceId,
    directoryPath: `E:/workspace/${workspaceId}`,
    tags: [],
    isPinned: false,
    createdAt: "2026-05-03T00:00:00.000Z",
    updatedAt: "2026-05-03T00:00:00.000Z",
    status: "ready" as const,
  };
}

describe("chat workspace shell state", () => {
  test("writes chat workspace tabs into the shared workspace experience state document", () => {
    const originalWindow = globalThis.window;
    const storage = new Map<string, string>();

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem(key: string) {
            return storage.get(key) ?? null;
          },
          setItem(key: string, value: string) {
            storage.set(key, value);
          },
          removeItem(key: string) {
            storage.delete(key);
          },
        },
      },
    });

    try {
      writeWorkspaceTabsState({
        openWorkspaceIds: ["alpha", "beta"],
        activeWorkspaceId: "beta",
      });

      expect(readWorkspaceExperienceState().chat).toEqual({
        openWorkspaceIds: ["alpha", "beta"],
        activeWorkspaceId: "beta",
        workspaceSessions: {},
      });
      expect(readWorkspaceTabsState()).toEqual({
        openWorkspaceIds: ["alpha", "beta"],
        activeWorkspaceId: "beta",
      });
    } finally {
      if (originalWindow === undefined) {
        Reflect.deleteProperty(globalThis, "window");
      } else {
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: originalWindow,
        });
      }
    }
  });

  test("migrates legacy chat workspace tabs from the old localStorage key", () => {
    const originalWindow = globalThis.window;
    const storage = new Map<string, string>();

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem(key: string) {
            return storage.get(key) ?? null;
          },
          setItem(key: string, value: string) {
            storage.set(key, value);
          },
          removeItem(key: string) {
            storage.delete(key);
          },
        },
      },
    });

    try {
      window.localStorage.setItem(CHAT_WORKSPACE_TABS_STORAGE_KEY, JSON.stringify({
        openWorkspaceIds: ["alpha", "beta"],
        activeWorkspaceId: "beta",
      }));

      expect(readWorkspaceTabsState()).toEqual({
        openWorkspaceIds: ["alpha", "beta"],
        activeWorkspaceId: "beta",
      });
      expect(window.localStorage.getItem(CHAT_WORKSPACE_TABS_STORAGE_KEY)).toBeNull();
      expect(readWorkspaceExperienceState().chat).toEqual({
        openWorkspaceIds: ["alpha", "beta"],
        activeWorkspaceId: "beta",
        workspaceSessions: {},
      });
    } finally {
      if (originalWindow === undefined) {
        Reflect.deleteProperty(globalThis, "window");
      } else {
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: originalWindow,
        });
      }
    }
  });

  test("normalizes duplicate open tabs and preserves the active tab", () => {
    expect(normalizeWorkspaceTabsState({
      openWorkspaceIds: ["", "alpha", " alpha ", "beta", "beta"],
      activeWorkspaceId: " beta ",
    })).toEqual({
      openWorkspaceIds: ["alpha", "beta"],
      activeWorkspaceId: "beta",
    });
  });

  test("parses stored tab state and appends a missing active workspace", () => {
    expect(parseWorkspaceTabsState(JSON.stringify({
      openWorkspaceIds: ["alpha"],
      activeWorkspaceId: "beta",
    }))).toEqual({
      openWorkspaceIds: ["alpha", "beta"],
      activeWorkspaceId: "beta",
    });
  });

  test("opens a workspace tab once and resolves the next active tab on close", () => {
    const opened = openWorkspaceTab(["alpha"], " beta ");
    expect(opened).toEqual(["alpha", "beta"]);
    expect(openWorkspaceTab(opened, "beta")).toBe(opened);

    expect(closeWorkspaceTabState({
      openWorkspaceIds: ["alpha", "beta", "gamma"],
      activeWorkspaceId: "beta",
      workspaceId: "beta",
    })).toEqual({
      openWorkspaceIds: ["alpha", "gamma"],
      activeWorkspaceId: "gamma",
    });
  });

  test("restores persisted open tabs against the current workspace list", () => {
    expect(resolveWorkspaceRefreshState({
      items: [createWorkspace("alpha"), createWorkspace("beta"), createWorkspace("gamma")],
      runtimeActiveWorkspaceId: "alpha",
      openWorkspaceIds: ["gamma", "missing", "beta"],
      activeWorkspaceId: "gamma",
    })).toEqual({
      openWorkspaceIds: ["gamma", "beta"],
      activeWorkspaceId: "gamma",
    });
  });

  test("falls back to the runtime active workspace when the stored active tab is gone", () => {
    expect(resolveWorkspaceRefreshState({
      items: [createWorkspace("alpha"), createWorkspace("beta")],
      runtimeActiveWorkspaceId: "beta",
      openWorkspaceIds: ["missing"],
      activeWorkspaceId: "missing",
    })).toEqual({
      openWorkspaceIds: ["beta"],
      activeWorkspaceId: "beta",
    });
  });

  test("keeps persisted workspace tabs until the workspace list has hydrated", () => {
    expect(shouldReconcileWorkspaceTabsState({
      workspaceListHydrated: false,
      state: {
        openWorkspaceIds: ["alpha", "beta"],
        activeWorkspaceId: "beta",
      },
    })).toBe(false);

    expect(shouldReconcileWorkspaceTabsState({
      workspaceListHydrated: false,
      state: {
        openWorkspaceIds: [],
        activeWorkspaceId: undefined,
      },
    })).toBe(true);

    expect(shouldReconcileWorkspaceTabsState({
      workspaceListHydrated: true,
      state: {
        openWorkspaceIds: ["alpha"],
        activeWorkspaceId: "alpha",
      },
    })).toBe(true);
  });

  test("resolves the visible workspace from the active tab first", () => {
    expect(resolveVisibleWorkspaceId({
      activeWorkspaceId: "beta",
      openWorkspaceIds: ["alpha", "beta"],
    })).toBe("beta");

    expect(resolveVisibleWorkspaceId({
      activeWorkspaceId: "missing",
      openWorkspaceIds: ["alpha", "beta"],
    })).toBe("alpha");
  });

  test("prefers requested then active then opened workspace when resolving a conversation target", () => {
    const workspaceItems = [createWorkspace("alpha"), createWorkspace("beta"), createWorkspace("gamma")];

    expect(resolveConversationTargetWorkspaceId({
      requestedWorkspaceId: " gamma ",
      activeWorkspaceId: "beta",
      openWorkspaceIds: ["alpha", "beta"],
      workspaceItems,
    })).toBe("gamma");

    expect(resolveConversationTargetWorkspaceId({
      requestedWorkspaceId: "missing",
      activeWorkspaceId: "beta",
      openWorkspaceIds: ["alpha", "gamma"],
      workspaceItems,
    })).toBe("beta");

    expect(resolveConversationTargetWorkspaceId({
      requestedWorkspaceId: "missing",
      activeWorkspaceId: "missing",
      openWorkspaceIds: ["ghost", "gamma"],
      workspaceItems,
    })).toBe("gamma");
  });
});
