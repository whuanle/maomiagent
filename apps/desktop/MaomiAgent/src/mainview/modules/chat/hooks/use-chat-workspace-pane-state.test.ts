import { afterEach, describe, expect, test } from "bun:test";

import {
  writeConversationGlobalSettings,
} from "../components/conversation-global-settings";
import {
  writeConversationWorkspaceSettings,
} from "../components/conversation-workspace-settings-storage";
import { buildConversationSessionDefaultMetadata } from "./use-chat-workspace-pane-state";

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
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage,
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

describe("buildConversationSessionDefaultMetadata", () => {
  test("includes the stored workspace model selection in new session defaults", () => {
    installTestWindow(createMemoryLocalStorage());

    writeConversationGlobalSettings({
      approvalAutoEnabled: false,
      contextCompressionThresholdPercent: 85,
    });
    writeConversationWorkspaceSettings("workspace-1", {
      selectedChannelId: "kimi",
      selectedModelId: "moonshot-v1-8k",
      managedExecutionEnabled: true,
    });

    expect(buildConversationSessionDefaultMetadata("workspace-1")).toEqual({
      selectedChannelId: "kimi",
      selectedModelId: "moonshot-v1-8k",
      interactionGovernance: {
        approvalMode: "manual",
      },
      conversationSettings: {
        contextCompressionThresholdPercent: 85,
        managedExecutionEnabled: true,
      },
    });
  });

  test("omits incomplete workspace model defaults from new session metadata", () => {
    installTestWindow(createMemoryLocalStorage());

    writeConversationWorkspaceSettings("workspace-1", {
      selectedChannelId: "kimi",
    });

    expect(buildConversationSessionDefaultMetadata("workspace-1")).toEqual({
      interactionGovernance: {
        approvalMode: "auto",
      },
      conversationSettings: {
        contextCompressionThresholdPercent: 80,
      },
    });
  });
});
