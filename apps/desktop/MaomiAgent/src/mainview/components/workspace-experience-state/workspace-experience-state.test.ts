import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  WORKSPACE_EXPERIENCE_STATE_STORAGE_KEY,
  normalizeWorkspaceExperienceState,
  readWorkspaceExperienceState,
  reconcileChatScene,
  reconcileUiDesignerScene,
  writeWorkspaceExperienceState,
} from "./workspace-experience-state";

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const originalWindow = globalThis.window;

function installStorage() {
  const storage = new Map<string, string>();

  const localStorage: MemoryStorage = {
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
    removeItem(key: string) {
      storage.delete(key);
    },
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      location: { hash: "" },
    },
  });

  return storage;
}

describe("workspace experience state", () => {
  beforeEach(() => {
    installStorage();
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
      return;
    }

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  test("persists and reloads the full shared scene document", () => {
    writeWorkspaceExperienceState({
      version: 1,
      updatedAt: "2026-06-08T12:00:00.000Z",
      chat: {
        openWorkspaceIds: ["workspace-a", "workspace-b"],
        activeWorkspaceId: "workspace-b",
        workspaceSessions: {
          "workspace-a": { selectedSessionId: "session-a" },
          "workspace-b": { selectedSessionId: "session-b" },
        },
      },
      uiDesigner: {
        workspaceId: "workspace-design",
        selectedSessionId: "session-design",
        activeStageKey: "theme",
      },
    });

    const reloaded = readWorkspaceExperienceState();

    expect(reloaded.version).toBe(1);
    expect(reloaded.chat).toEqual({
      openWorkspaceIds: ["workspace-a", "workspace-b"],
      activeWorkspaceId: "workspace-b",
      workspaceSessions: {
        "workspace-a": { selectedSessionId: "session-a" },
        "workspace-b": { selectedSessionId: "session-b" },
      },
    });
    expect(reloaded.uiDesigner).toEqual({
      workspaceId: "workspace-design",
      selectedSessionId: "session-design",
      activeStageKey: "theme",
    });
  });

  test("ignores malformed storage and falls back to an empty normalized document", () => {
    window.localStorage.setItem(WORKSPACE_EXPERIENCE_STATE_STORAGE_KEY, "{bad json");

    expect(readWorkspaceExperienceState()).toEqual(normalizeWorkspaceExperienceState(undefined));
  });

  test("reconciles invalid chat and ui designer ids without replacing valid ones", () => {
    const scene = reconcileChatScene({
      state: normalizeWorkspaceExperienceState({
        version: 1,
        updatedAt: "2026-06-08T12:00:00.000Z",
        chat: {
          openWorkspaceIds: ["workspace-b", "missing"],
          activeWorkspaceId: "workspace-b",
          workspaceSessions: {
            "workspace-b": { selectedSessionId: "session-b" },
            missing: { selectedSessionId: "ghost-session" },
          },
        },
      }),
      workspaces: [{ workspaceId: "workspace-a" }, { workspaceId: "workspace-b" }],
      sessionsByWorkspaceId: {
        "workspace-a": [],
        "workspace-b": [{ sessionId: "session-b" }, { sessionId: "session-c" }],
      },
    });

    expect(scene).toEqual({
      openWorkspaceIds: ["workspace-b"],
      activeWorkspaceId: "workspace-b",
      workspaceSessions: {
        "workspace-b": { selectedSessionId: "session-b" },
      },
    });

    expect(reconcileUiDesignerScene({
      state: normalizeWorkspaceExperienceState({
        version: 1,
        updatedAt: "2026-06-08T12:00:00.000Z",
        uiDesigner: {
          workspaceId: "workspace-design",
          selectedSessionId: "session-design",
          activeStageKey: "theme",
        },
      }),
      workspaces: [{ workspaceId: "workspace-design" }],
      sessions: [{ sessionId: "session-design" }],
      availableStageKeys: ["projectScope", "theme", "pages"],
    })).toEqual({
      workspaceId: "workspace-design",
      selectedSessionId: "session-design",
      activeStageKey: "theme",
    });
  });
});
