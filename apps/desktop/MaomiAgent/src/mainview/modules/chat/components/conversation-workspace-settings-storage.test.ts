import { afterEach, describe, expect, test } from "bun:test";

import {
  clampContextCompressionThresholdPercent,
  DEFAULT_CONTEXT_COMPRESSION_THRESHOLD_PERCENT,
  readConversationGlobalSettings,
  writeConversationGlobalSettings,
} from "./conversation-global-settings";
import {
  readConversationWorkspaceSettings,
  writeConversationWorkspaceSettings,
  CHAT_WORKSPACE_SETTINGS_CHANGED_EVENT,
} from "./conversation-workspace-settings-storage";

const originalWindow = globalThis.window;

type LocalStorageLike = {
  readonly length: number;
  clear: () => void;
  getItem: (key: string) => string | null;
  key: (index: number) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

type TestWindow = Window & typeof globalThis & {
  localStorage: LocalStorageLike;
};

function createMemoryLocalStorage(initialEntries?: Record<string, string>): LocalStorageLike {
  const store = new Map(Object.entries(initialEntries ?? {}));

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.get(key) ?? null;
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

function installTestWindow(localStorage: LocalStorageLike) {
  const listeners = new Map<string, Set<EventListener>>();

  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage,
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        const handler = typeof listener === "function"
          ? listener
          : listener.handleEvent.bind(listener);
        const current = listeners.get(type) ?? new Set<EventListener>();
        current.add(handler);
        listeners.set(type, current);
      },
      removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        const handler = typeof listener === "function"
          ? listener
          : listener.handleEvent.bind(listener);
        listeners.get(type)?.delete(handler);
      },
      dispatchEvent(event: Event) {
        listeners.get(event.type)?.forEach((listener) => listener(event));
        return true;
      },
    } satisfies Partial<TestWindow>,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  if (typeof originalWindow === "undefined") {
    delete (globalThis as { window?: Window }).window;
    return;
  }

  Object.defineProperty(globalThis, "window", {
    value: originalWindow,
    configurable: true,
    writable: true,
  });
});

describe("conversation workspace settings storage", () => {
  test("defaults context compression threshold to 80 percent", () => {
    installTestWindow(createMemoryLocalStorage());

    expect(DEFAULT_CONTEXT_COMPRESSION_THRESHOLD_PERCENT).toBe(80);
    expect(readConversationGlobalSettings()).toEqual({
      approvalAutoEnabled: true,
      contextCompressionThresholdPercent: 80,
    });
  });

  test("clamps context compression thresholds into the supported 50 to 90 percent range", () => {
    expect(clampContextCompressionThresholdPercent(30)).toBe(50);
    expect(clampContextCompressionThresholdPercent(83)).toBe(85);
    expect(clampContextCompressionThresholdPercent(95)).toBe(90);
    expect(clampContextCompressionThresholdPercent(undefined)).toBe(80);
  });

  test("reads and writes clamped context compression thresholds through local storage", () => {
    installTestWindow(createMemoryLocalStorage({
      "maomiagent.chat.global-settings.v1": JSON.stringify({
        approvalAutoEnabled: false,
        contextCompressionThresholdPercent: 30,
      }),
    }));

    expect(readConversationGlobalSettings()).toEqual({
      approvalAutoEnabled: false,
      contextCompressionThresholdPercent: 50,
    });

    expect(writeConversationGlobalSettings({
      contextCompressionThresholdPercent: 93,
    })).toEqual({
      approvalAutoEnabled: false,
      contextCompressionThresholdPercent: 90,
    });

    expect(readConversationGlobalSettings()).toEqual({
      approvalAutoEnabled: false,
      contextCompressionThresholdPercent: 90,
    });
  });

  test("reads and writes stored composer model defaults through workspace settings storage", () => {
    installTestWindow(createMemoryLocalStorage({
      "maomiagent.chat.workspace.settings.v1:workspace-1": JSON.stringify({
        defaultFilePreviewMode: "preview",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      }),
    }));

    expect(readConversationWorkspaceSettings("workspace-1")).toEqual({
      defaultFilePreviewMode: "preview",
      selectedChannelId: "kimi",
      selectedModelId: "moonshot-v1-8k",
    });

    expect(writeConversationWorkspaceSettings("workspace-1", {
      selectedChannelId: "openai",
      selectedModelId: "gpt-4.1",
    })).toEqual({
      defaultFilePreviewMode: "preview",
      selectedChannelId: "openai",
      selectedModelId: "gpt-4.1",
    });

    expect(readConversationWorkspaceSettings("workspace-1")).toEqual({
      defaultFilePreviewMode: "preview",
      selectedChannelId: "openai",
      selectedModelId: "gpt-4.1",
    });
  });

  test("drops incomplete stored composer model defaults", () => {
    installTestWindow(createMemoryLocalStorage({
      "maomiagent.chat.workspace.settings.v1:workspace-1": JSON.stringify({
        defaultFilePreviewMode: "preview",
        selectedChannelId: "kimi",
      }),
    }));

    expect(readConversationWorkspaceSettings("workspace-1")).toEqual({
      defaultFilePreviewMode: "preview",
    });
  });

  test("reads and writes the workspace thinking default", () => {
    installTestWindow(createMemoryLocalStorage());

    expect(writeConversationWorkspaceSettings("workspace-1", {
      thinkingEnabled: false,
    })).toEqual({
      defaultFilePreviewMode: "preview",
      thinkingEnabled: false,
    });

    expect(readConversationWorkspaceSettings("workspace-1")).toEqual({
      defaultFilePreviewMode: "preview",
      thinkingEnabled: false,
    });
  });

  test("skips writing and dispatching workspace setting events for no-op updates", () => {
    installTestWindow(createMemoryLocalStorage({
      "maomiagent.chat.workspace.settings.v1:workspace-1": JSON.stringify({
        defaultFilePreviewMode: "preview",
        selectedChannelId: "kimi",
        selectedModelId: "moonshot-v1-8k",
      }),
    }));

    let eventCount = 0;
    window.addEventListener(CHAT_WORKSPACE_SETTINGS_CHANGED_EVENT, () => {
      eventCount += 1;
    });

    const nextSettings = writeConversationWorkspaceSettings("workspace-1", {
      selectedChannelId: "kimi",
      selectedModelId: "moonshot-v1-8k",
    });

    expect(nextSettings).toEqual({
      defaultFilePreviewMode: "preview",
      selectedChannelId: "kimi",
      selectedModelId: "moonshot-v1-8k",
    });
    expect(eventCount).toBe(0);
  });
});
