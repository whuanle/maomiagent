import { describe, expect, test } from "bun:test";
import type {
  DesktopBrowserExtractResult,
  DesktopBrowserInteractionRequest,
  DesktopBrowserScreenshotResult,
  DesktopBrowserTabState,
} from "../../../../../shared/desktop-browser";

describe("desktop browser shared contract", () => {
  test("shared types describe one global active browser state", () => {
    const tab: DesktopBrowserTabState = {
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

    const extract: DesktopBrowserExtractResult = {
      tabId: tab.id,
      url: tab.url,
      title: tab.title,
      text: "Example Domain",
      links: [],
      capturedAt: "2026-05-31T00:00:00.000Z",
    };

    const screenshot: DesktopBrowserScreenshotResult = {
      tabId: tab.id,
      dataUrl: "data:image/png;base64,AAAA",
      capturedAt: "2026-05-31T00:00:00.000Z",
    };

    const interaction: DesktopBrowserInteractionRequest = {
      kind: "click",
      selector: "button.primary",
    };

    expect(extract.tabId).toBe(tab.id);
    expect(screenshot.tabId).toBe(tab.id);
    expect(interaction.kind).toBe("click");
  });
});
