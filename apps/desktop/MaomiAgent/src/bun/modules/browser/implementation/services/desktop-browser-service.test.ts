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
