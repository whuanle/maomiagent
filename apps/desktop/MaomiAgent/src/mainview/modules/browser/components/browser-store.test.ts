import { describe, expect, test } from "bun:test";

import type {
  DesktopBrowserStateSnapshot,
  DesktopBrowserTabState,
} from "../../../../shared/desktop-browser";
import { createBrowserStore } from "./browser-store";

function createTab(overrides: Partial<DesktopBrowserTabState> = {}): DesktopBrowserTabState {
  return {
    id: "tab-1",
    title: "Example",
    url: "https://example.com",
    draftUrl: "https://example.com",
    loading: false,
    canGoBack: false,
    canGoForward: false,
    ...overrides,
  };
}

function createSnapshot(
  overrides: Partial<DesktopBrowserStateSnapshot> = {},
): DesktopBrowserStateSnapshot {
  return {
    tabs: [createTab()],
    activeTabId: "tab-1",
    toolPanel: "closed",
    ...overrides,
  };
}

describe("browser store", () => {
  test("creating a tab appends a new tab and makes it active", () => {
    const store = createBrowserStore(createSnapshot());

    const nextTab = store.createLocalTab({
      id: "tab-2",
      title: "Second",
    });

    expect(nextTab.id).toBe("tab-2");
    expect(store.getState().tabs).toHaveLength(2);
    expect(store.getState().tabs[1]).toMatchObject({
      id: "tab-2",
      title: "Second",
      url: "",
      draftUrl: "",
      loading: false,
      canGoBack: false,
      canGoForward: false,
    });
    expect(store.getState().activeTabId).toBe("tab-2");
  });

  test("setting the tool panel updates one shared panel state", () => {
    const store = createBrowserStore(createSnapshot({
      tabs: [createTab({ id: "tab-1" }), createTab({ id: "tab-2" })],
      activeTabId: "tab-2",
    }));

    store.setToolPanel("extract");

    expect(store.getState()).toMatchObject({
      activeTabId: "tab-2",
      toolPanel: "extract",
    });
    expect(store.getState().tabs.map((tab) => tab.id)).toEqual(["tab-1", "tab-2"]);
  });
});
