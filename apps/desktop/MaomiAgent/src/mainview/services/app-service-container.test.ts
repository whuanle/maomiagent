import { afterEach, describe, expect, test } from "bun:test";

import {
  registerAppServiceConversationLauncher,
  useAppService,
} from "./app-service-container";

type MemoryStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function createMemoryStorage(): MemoryStorage {
  const store = new Map<string, string>();
  return {
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

function installTestWindow() {
  const localStorage = createMemoryStorage();
  let hashValue = "";
  const testWindow = {
    localStorage,
    location: {
      get hash() {
        return hashValue;
      },
      set hash(value: string) {
        hashValue = value ? (value.startsWith("#") ? value : `#${value}`) : "";
      },
    },
  } as unknown as Window & typeof globalThis;

  Object.defineProperty(globalThis, "window", {
    value: testWindow,
    configurable: true,
    writable: true,
  });

  return testWindow;
}

const originalWindow = (globalThis as Record<string, unknown>).window;

describe("app service container", () => {
  afterEach(() => {
    registerAppServiceConversationLauncher(null);

    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
      return;
    }

    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
  });

  test("uses the registered conversation launcher when available", async () => {
    const calls: string[] = [];
    registerAppServiceConversationLauncher({
      async openConversation(input) {
        calls.push(input?.draftText ?? "");
      },
    });

    await useAppService(Symbol("conversation")).openConversation({
      draftText: "from-feishu",
    });

    expect(calls).toEqual(["from-feishu"]);
  });

  test("fallback launcher navigates to chat and stores the one-shot draft", async () => {
    const testWindow = installTestWindow();

    await useAppService(Symbol("conversation")).openConversation({
      draftText: "hello chat",
    });

    expect(testWindow.location.hash).toBe("#chat");
    expect(testWindow.localStorage.getItem("maomi.chat.draft")).toBe("hello chat");
  });
});
