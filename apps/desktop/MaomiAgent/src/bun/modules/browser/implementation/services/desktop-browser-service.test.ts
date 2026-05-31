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
  test("navigate updates the selected tab snapshot and active tab", async () => {
    const service = new DesktopBrowserService();
    const initial = await service.getSnapshot();
    const tabId = initial.tabs[0]!.id;

    const snapshot = await service.navigate(tabId, "https://docs.example.com/guide");
    const activeTab = snapshot.tabs.find((tab) => tab.id === snapshot.activeTabId);

    expect(snapshot.activeTabId).toBe(tabId);
    expect(activeTab).toEqual(
      expect.objectContaining({
        id: tabId,
        url: "https://docs.example.com/guide",
        draftUrl: "https://docs.example.com/guide",
        loading: false,
      }),
    );
  });

  test("extract, screenshot, and interact attach results to the current tab context", async () => {
    const service = new DesktopBrowserService();
    const initial = await service.getSnapshot();
    const tabId = initial.tabs[0]!.id;

    const extract = await service.extract(tabId);
    const screenshot = await service.screenshot(tabId);
    const interaction = await service.interact(tabId, {
      kind: "click",
      selector: "[data-testid='submit']",
    });
    const snapshot = await service.getSnapshot();
    const tab = snapshot.tabs.find((item) => item.id === tabId);

    expect(extract.tabId).toBe(tabId);
    expect(screenshot.tabId).toBe(tabId);
    expect(interaction.tabId).toBe(tabId);
    expect(tab?.lastExtractResult).toEqual(extract);
    expect(tab?.lastScreenshotResult).toEqual(screenshot);
    expect(tab?.lastInteractionResult).toEqual(interaction);
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
  });
});
