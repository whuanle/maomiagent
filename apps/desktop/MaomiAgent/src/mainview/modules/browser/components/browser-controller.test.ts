import { describe, expect, mock, test } from "bun:test";

import type {
  DesktopBrowserExtractResult,
  DesktopBrowserInteractionRequest,
  DesktopBrowserInteractionResult,
  DesktopBrowserScreenshotResult,
  DesktopBrowserStateSnapshot,
  DesktopBrowserTabState,
} from "../../../../shared/desktop-browser";
import { createBrowserController } from "./browser-controller";
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

function createExtractResult(tabId: string): DesktopBrowserExtractResult {
  return {
    tabId,
    url: "https://example.com",
    title: "Example",
    text: "hello",
    links: [],
    capturedAt: "2026-05-31T00:00:00.000Z",
  };
}

function createScreenshotResult(tabId: string): DesktopBrowserScreenshotResult {
  return {
    tabId,
    dataUrl: "data:image/png;base64,abc",
    capturedAt: "2026-05-31T00:00:00.000Z",
  };
}

function createInteractionResult(tabId: string): DesktopBrowserInteractionResult {
  return {
    tabId,
    ok: true,
    message: "clicked",
    capturedAt: "2026-05-31T00:00:00.000Z",
  };
}

describe("browser controller", () => {
  test("hydrates the store from snapshot-returning rpc calls", async () => {
    const store = createBrowserStore();
    const snapshot = createSnapshot({
      tabs: [createTab({ id: "tab-2", title: "Two" })],
      activeTabId: "tab-2",
      toolPanel: "extract",
    });
    const rpc = {
      createTab: mock(async () => snapshot),
      activateTab: mock(async () => snapshot),
      closeTab: mock(async () => snapshot),
      getSnapshot: mock(async () => snapshot),
      navigate: mock(async () => snapshot),
      goBack: mock(async () => snapshot),
      goForward: mock(async () => snapshot),
      refresh: mock(async () => snapshot),
      extract: mock(async () => createExtractResult("tab-2")),
      screenshot: mock(async () => createScreenshotResult("tab-2")),
      interact: mock(async (_tabId: string, _request: DesktopBrowserInteractionRequest) =>
        createInteractionResult("tab-2")),
    };
    const controller = createBrowserController({ store, rpc });

    await controller.getSnapshot();
    await controller.activateTab("tab-2");
    await controller.navigate("tab-2", "https://example.com/next");

    expect(rpc.getSnapshot).toHaveBeenCalledTimes(1);
    expect(rpc.activateTab).toHaveBeenCalledWith("tab-2");
    expect(rpc.navigate).toHaveBeenCalledWith("tab-2", "https://example.com/next");
    expect(store.getState()).toEqual(snapshot);
  });

  test("persists tool results onto the target tab in the shared store", async () => {
    const store = createBrowserStore(createSnapshot());
    const extractResult = createExtractResult("tab-1");
    const screenshotResult = createScreenshotResult("tab-1");
    const interactionResult = createInteractionResult("tab-1");
    const rpc = {
      createTab: mock(async () => createSnapshot()),
      activateTab: mock(async () => createSnapshot()),
      closeTab: mock(async () => createSnapshot()),
      getSnapshot: mock(async () => createSnapshot()),
      navigate: mock(async () => createSnapshot()),
      goBack: mock(async () => createSnapshot()),
      goForward: mock(async () => createSnapshot()),
      refresh: mock(async () => createSnapshot()),
      extract: mock(async () => extractResult),
      screenshot: mock(async () => screenshotResult),
      interact: mock(async (_tabId: string, _request: DesktopBrowserInteractionRequest) =>
        interactionResult),
    };
    const controller = createBrowserController({ store, rpc });

    const interactionRequest: DesktopBrowserInteractionRequest = {
      kind: "click",
      selector: "#submit",
    };

    await expect(controller.extract("tab-1")).resolves.toEqual(extractResult);
    await expect(controller.screenshot("tab-1")).resolves.toEqual(screenshotResult);
    await expect(controller.interact("tab-1", interactionRequest)).resolves.toEqual(interactionResult);

    expect(store.getState().tabs[0]).toMatchObject({
      id: "tab-1",
      lastExtractResult: extractResult,
      lastScreenshotResult: screenshotResult,
      lastInteractionResult: interactionResult,
    });
    expect(rpc.interact).toHaveBeenCalledWith("tab-1", interactionRequest);
  });
});
