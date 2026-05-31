import { describe, expect, test } from "bun:test";
import type {
  DesktopBrowserExtractResult,
  DesktopBrowserInteractionRequest,
  DesktopBrowserInteractionResult,
  DesktopBrowserScreenshotResult,
  DesktopBrowserStateSnapshot,
  DesktopBrowserTabState,
} from "../../../../../shared/desktop-browser";
import type { DesktopBrowserServicePort } from "../../abstraction/ports/desktop-browser-service.port";
import type {
  DesktopBrowserRPC,
  DesktopRendererRPC,
} from "../../../../../shared/desktop-rpc";
import { DesktopBrowserService } from "./desktop-browser-service";

type BrowserRequestName = keyof DesktopBrowserRPC["requests"];
type RendererBrowserRequestName = `browser.${BrowserRequestName}`;

function createSnapshot(): DesktopBrowserStateSnapshot {
  return {
    tabs: [createTabState()],
    activeTabId: "tab-1",
    toolPanel: "closed",
  };
}

function createTabState(): DesktopBrowserTabState {
  return {
    id: "tab-1",
    title: "Example",
    url: "https://example.com",
    draftUrl: "https://example.com",
    loading: false,
    canGoBack: false,
    canGoForward: false,
    lastExtractResult: undefined,
    lastScreenshotResult: undefined,
    lastInteractionResult: undefined,
  };
}

function createExtractResult(tab: DesktopBrowserTabState): DesktopBrowserExtractResult {
  return {
    tabId: tab.id,
    url: tab.url,
    title: tab.title,
    text: "Example Domain",
    links: [],
    capturedAt: "2026-05-31T00:00:00.000Z",
  };
}

function createScreenshotResult(tabId: string): DesktopBrowserScreenshotResult {
  return {
    tabId,
    dataUrl: "data:image/png;base64,AAAA",
    capturedAt: "2026-05-31T00:00:00.000Z",
  };
}

function createInteractionResult(tabId: string): DesktopBrowserInteractionResult {
  return {
    tabId,
    ok: true,
    message: "completed",
    capturedAt: "2026-05-31T00:00:00.000Z",
  };
}

function expectFreshTab(tab: DesktopBrowserTabState) {
  expect(tab).toEqual(
    expect.objectContaining({
      title: "New Tab",
      url: "",
      draftUrl: "",
      loading: false,
      canGoBack: false,
      canGoForward: false,
      lastExtractResult: undefined,
      lastScreenshotResult: undefined,
      lastInteractionResult: undefined,
    }),
  );
}

describe("desktop browser shared contract", () => {
  test("shared types describe one global active browser state", () => {
    const tab = createTabState();
    const extract = createExtractResult(tab);
    const screenshot = createScreenshotResult(tab.id);

    const interaction: DesktopBrowserInteractionRequest = {
      kind: "click",
      selector: "button.primary",
    };

    expect(extract.tabId).toBe(tab.id);
    expect(screenshot.tabId).toBe(tab.id);
    expect(interaction.kind).toBe("click");
  });

  test("browser service port exposes the full multi-tab contract", () => {
    const snapshot = createSnapshot();
    const tab = snapshot.tabs[0]!;

    const service: DesktopBrowserServicePort = {
      createTab: async () => snapshot,
      activateTab: async () => snapshot,
      closeTab: async () => snapshot,
      getSnapshot: async () => snapshot,
      navigate: async () => snapshot,
      goBack: async () => snapshot,
      goForward: async () => snapshot,
      refresh: async () => snapshot,
      extract: async () => createExtractResult(tab),
      screenshot: async () => createScreenshotResult(tab.id),
      interact: async () => createInteractionResult(tab.id),
    };

    expect(Object.keys(service).sort()).toEqual([
      "activateTab",
      "closeTab",
      "createTab",
      "extract",
      "getSnapshot",
      "goBack",
      "goForward",
      "interact",
      "navigate",
      "refresh",
      "screenshot",
    ]);
  });

  test("browser rpc requests stay aligned with renderer bun requests", () => {
    const snapshot = createSnapshot();
    const tab = snapshot.tabs[0]!;

    const browserRequests: DesktopBrowserRPC["requests"] = {
      createTab: {
        params: undefined,
        response: snapshot,
      },
      activateTab: {
        params: { tabId: tab.id },
        response: snapshot,
      },
      closeTab: {
        params: { tabId: tab.id },
        response: snapshot,
      },
      getSnapshot: {
        params: undefined,
        response: snapshot,
      },
      navigate: {
        params: {
          tabId: tab.id,
          url: tab.url,
        },
        response: snapshot,
      },
      goBack: {
        params: { tabId: tab.id },
        response: snapshot,
      },
      goForward: {
        params: { tabId: tab.id },
        response: snapshot,
      },
      refresh: {
        params: { tabId: tab.id },
        response: snapshot,
      },
      extract: {
        params: { tabId: tab.id },
        response: createExtractResult(tab),
      },
      screenshot: {
        params: { tabId: tab.id },
        response: createScreenshotResult(tab.id),
      },
      interact: {
        params: {
          tabId: tab.id,
          request: {
            kind: "click",
            selector: "button.primary",
          },
        },
        response: createInteractionResult(tab.id),
      },
    };

    const rendererBrowserRequests: Pick<
      DesktopRendererRPC["bun"]["requests"],
      RendererBrowserRequestName
    > = {
      "browser.createTab": browserRequests.createTab,
      "browser.activateTab": browserRequests.activateTab,
      "browser.closeTab": browserRequests.closeTab,
      "browser.getSnapshot": browserRequests.getSnapshot,
      "browser.navigate": browserRequests.navigate,
      "browser.goBack": browserRequests.goBack,
      "browser.goForward": browserRequests.goForward,
      "browser.refresh": browserRequests.refresh,
      "browser.extract": browserRequests.extract,
      "browser.screenshot": browserRequests.screenshot,
      "browser.interact": browserRequests.interact,
    };

    expect(Object.keys(browserRequests).sort()).toEqual([
      "activateTab",
      "closeTab",
      "createTab",
      "extract",
      "getSnapshot",
      "goBack",
      "goForward",
      "interact",
      "navigate",
      "refresh",
      "screenshot",
    ]);
    expect(Object.keys(rendererBrowserRequests).sort()).toEqual([
      "browser.activateTab",
      "browser.closeTab",
      "browser.createTab",
      "browser.extract",
      "browser.getSnapshot",
      "browser.goBack",
      "browser.goForward",
      "browser.interact",
      "browser.navigate",
      "browser.refresh",
      "browser.screenshot",
    ]);
  });
});

describe("DesktopBrowserService", () => {
  test("fresh tabs use an empty-tab model on startup, createTab, and last-tab replacement", async () => {
    const service = new DesktopBrowserService();
    const initial = await service.getSnapshot();
    const initialTab = initial.tabs[0]!;

    expect(initial.tabs).toHaveLength(1);
    expect(initial.activeTabId).toBe(initialTab.id);
    expectFreshTab(initialTab);

    const created = await service.createTab();
    const createdTab = created.tabs.find((tab) => tab.id === created.activeTabId)!;
    expectFreshTab(createdTab);

    const replaced = await service.closeTab(createdTab.id);
    const refreshed = await service.closeTab(initialTab.id);
    const replacementTab = refreshed.tabs[0]!;

    expect(replaced.tabs).toHaveLength(1);
    expect(refreshed.tabs).toHaveLength(1);
    expect(refreshed.activeTabId).toBe(replacementTab.id);
    expect(replacementTab.id).not.toBe(initialTab.id);
    expectFreshTab(replacementTab);
  });

  test("navigate, back, forward, and truncation keep history flags coherent", async () => {
    const service = new DesktopBrowserService();
    const initial = await service.getSnapshot();
    const tabId = initial.tabs[0]!.id;

    const afterFirstNavigate = await service.navigate(tabId, "https://example.com/a");
    const firstTab = afterFirstNavigate.tabs[0]!;
    expect(firstTab.url).toBe("https://example.com/a");
    expect(firstTab.canGoBack).toBe(true);
    expect(firstTab.canGoForward).toBe(false);

    const afterSecondNavigate = await service.navigate(tabId, "https://example.com/b");
    const secondTab = afterSecondNavigate.tabs[0]!;
    expect(secondTab.url).toBe("https://example.com/b");
    expect(secondTab.canGoBack).toBe(true);
    expect(secondTab.canGoForward).toBe(false);

    const afterBack = await service.goBack(tabId);
    const backedTab = afterBack.tabs[0]!;
    expect(backedTab.url).toBe("https://example.com/a");
    expect(backedTab.canGoBack).toBe(true);
    expect(backedTab.canGoForward).toBe(true);

    const afterTruncateNavigate = await service.navigate(tabId, "https://example.com/c");
    const truncatedTab = afterTruncateNavigate.tabs[0]!;
    expect(truncatedTab.url).toBe("https://example.com/c");
    expect(truncatedTab.canGoBack).toBe(true);
    expect(truncatedTab.canGoForward).toBe(false);

    const afterBackToA = await service.goBack(tabId);
    expect(afterBackToA.tabs[0]!.url).toBe("https://example.com/a");
    expect(afterBackToA.tabs[0]!.canGoForward).toBe(true);

    const afterBackToEmpty = await service.goBack(tabId);
    expect(afterBackToEmpty.tabs[0]!.url).toBe("");
    expect(afterBackToEmpty.tabs[0]!.title).toBe("New Tab");
    expect(afterBackToEmpty.tabs[0]!.canGoBack).toBe(false);
    expect(afterBackToEmpty.tabs[0]!.canGoForward).toBe(true);

    const afterForward = await service.goForward(tabId);
    expect(afterForward.tabs[0]!.url).toBe("https://example.com/a");
    expect(afterForward.tabs[0]!.canGoBack).toBe(true);
    expect(afterForward.tabs[0]!.canGoForward).toBe(true);
  });

  test("tool methods fail explicitly until a live browser runtime is connected", async () => {
    const service = new DesktopBrowserService();
    const initial = await service.getSnapshot();
    const firstTabId = initial.tabs[0]!.id;
    const created = await service.createTab();
    const secondTabId = created.activeTabId!;

    await service.activateTab(firstTabId);

    await expect(service.extract(secondTabId)).rejects.toThrow(
      "Browser tool execution is not connected to a live browser session yet.",
    );
    await expect(service.screenshot(secondTabId)).rejects.toThrow(
      "Browser tool execution is not connected to a live browser session yet.",
    );
    await expect(service.interact(secondTabId, {
      kind: "click",
      selector: "[data-testid='submit']",
    })).rejects.toThrow(
      "Browser tool execution is not connected to a live browser session yet.",
    );
    const snapshot = await service.getSnapshot();
    const secondTab = snapshot.tabs.find((tab) => tab.id === secondTabId);

    expect(snapshot.activeTabId).toBe(firstTabId);
    expect(snapshot.toolPanel).toBe("closed");
    expect(secondTab?.lastExtractResult).toBeUndefined();
    expect(secondTab?.lastScreenshotResult).toBeUndefined();
    expect(secondTab?.lastInteractionResult).toBeUndefined();
  });

  test("navigation and refresh clear stale tab tool artifacts", async () => {
    const service = new DesktopBrowserService();
    const initial = await service.getSnapshot();
    const tabId = initial.tabs[0]!.id;

    await service.navigate(tabId, "https://example.com/a");
    await expect(service.extract(tabId)).rejects.toThrow(
      "Browser tool execution is not connected to a live browser session yet.",
    );
    await expect(service.screenshot(tabId)).rejects.toThrow(
      "Browser tool execution is not connected to a live browser session yet.",
    );
    await expect(service.interact(tabId, {
      kind: "click",
      selector: "#submit",
    })).rejects.toThrow(
      "Browser tool execution is not connected to a live browser session yet.",
    );

    const afterRefresh = await service.refresh(tabId);
    expect(afterRefresh.tabs[0]).toMatchObject({
      id: tabId,
      url: "https://example.com/a",
      draftUrl: "https://example.com/a",
      lastExtractResult: undefined,
      lastScreenshotResult: undefined,
      lastInteractionResult: undefined,
    });

    await service.navigate(tabId, "https://example.com/b");
    await expect(service.extract(tabId)).rejects.toThrow(
      "Browser tool execution is not connected to a live browser session yet.",
    );
    const afterBack = await service.goBack(tabId);
    expect(afterBack.tabs[0]).toMatchObject({
      id: tabId,
      url: "https://example.com/a",
      draftUrl: "https://example.com/a",
      lastExtractResult: undefined,
      lastScreenshotResult: undefined,
      lastInteractionResult: undefined,
    });
  });

  test("getSnapshot returns clones that cannot mutate service state", async () => {
    const service = new DesktopBrowserService();
    const initial = await service.getSnapshot();
    const tabId = initial.tabs[0]!.id;

    await service.navigate(tabId, "https://example.com/immutable");

    const snapshot = await service.getSnapshot();
    snapshot.activeTabId = "mutated";
    snapshot.tabs[0]!.url = "https://evil.example";
    snapshot.tabs[0]!.draftUrl = "https://evil.example";

    const fresh = await service.getSnapshot();

    expect(fresh.activeTabId).toBe(tabId);
    expect(fresh.tabs[0]!.url).toBe("https://example.com/immutable");
    expect(fresh.tabs[0]!.draftUrl).toBe("https://example.com/immutable");
    expect(fresh.tabs[0]!.lastExtractResult).toBeUndefined();
  });

  test("tab lifecycle methods keep the snapshot coherent", async () => {
    const service = new DesktopBrowserService();

    const initial = await service.getSnapshot();
    const firstTabId = initial.tabs[0]!.id;

    const created = await service.createTab();
    const secondTabId = created.activeTabId;

    expect(created.tabs).toHaveLength(2);
    expect(secondTabId).not.toBe(firstTabId);

    const activated = await service.activateTab(firstTabId);
    expect(activated.activeTabId).toBe(firstTabId);

    const closedActive = await service.closeTab(firstTabId);
    expect(closedActive.tabs.map((tab) => tab.id)).not.toContain(firstTabId);
    expect(closedActive.activeTabId).toBe(secondTabId);

    const closedLast = await service.closeTab(secondTabId!);
    expect(closedLast.tabs).toHaveLength(1);
    expect(closedLast.activeTabId).toBe(closedLast.tabs[0]!.id);
    expectFreshTab(closedLast.tabs[0]!);
  });

  test("navigate rejects empty URLs", async () => {
    const service = new DesktopBrowserService();
    const tabId = (await service.getSnapshot()).tabs[0]!.id;

    await expect(service.navigate(tabId, "   ")).rejects.toThrow(
      "Browser navigation URL is required.",
    );
  });

  test("tab-targeted methods reject invalid tab ids", async () => {
    const service = new DesktopBrowserService();

    await expect(service.extract("missing-tab")).rejects.toThrow(
      "Browser tab not found: missing-tab",
    );
  });
});
