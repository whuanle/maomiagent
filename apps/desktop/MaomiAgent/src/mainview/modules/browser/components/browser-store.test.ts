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

  test("hydrating local tabs recomputes the next local tab id", () => {
    const store = createBrowserStore(createSnapshot({
      tabs: [createTab({ id: "local-tab-1" })],
      activeTabId: "local-tab-1",
    }));

    store.replaceState(createSnapshot({
      tabs: [
        createTab({ id: "tab-1" }),
        createTab({ id: "local-tab-3" }),
        createTab({ id: "local-tab-7" }),
      ],
      activeTabId: "local-tab-7",
    }));

    const nextTab = store.createLocalTab();

    expect(nextTab.id).toBe("local-tab-8");
    expect(store.getState().tabs.map((tab) => tab.id)).toEqual([
      "tab-1",
      "local-tab-3",
      "local-tab-7",
      "local-tab-8",
    ]);
  });

  test("returned snapshots and tabs cannot mutate store internals", () => {
    const store = createBrowserStore(createSnapshot({
      tabs: [createTab({
        lastExtractResult: {
          tabId: "tab-1",
          url: "https://example.com",
          title: "Example",
          text: "initial",
          links: [{ text: "Example", url: "https://example.com" }],
          capturedAt: "2026-05-31T00:00:00.000Z",
        },
      })],
    }));

    const readState = store.getState();
    readState.tabs[0]!.title = "Mutated outside";
    readState.tabs[0]!.lastExtractResult!.links[0]!.text = "Changed";
    readState.tabs.push(createTab({ id: "tab-2" }));

    const createdTab = store.createLocalTab();
    createdTab.title = "Mutated created tab";

    const updatedTab = store.updateTab("tab-1", {
      title: "Updated title",
    });
    if (!updatedTab) {
      throw new Error("Expected tab to update");
    }
    updatedTab.title = "Mutated updated tab";

    const latestState = store.getState();
    expect(latestState.tabs).toHaveLength(2);
    expect(latestState.tabs[0]).toMatchObject({
      id: "tab-1",
      title: "Updated title",
    });
    expect(latestState.tabs[0]?.lastExtractResult?.links[0]?.text).toBe("Example");
    expect(latestState.tabs[1]).toMatchObject({
      id: "local-tab-1",
      title: "New Tab",
    });
  });
});
