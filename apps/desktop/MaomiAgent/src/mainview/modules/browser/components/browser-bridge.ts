import type {
  DesktopBrowserExtractResult,
  DesktopBrowserInteractionRequest,
  DesktopBrowserInteractionResult,
  DesktopBrowserScreenshotResult,
  DesktopBrowserStateSnapshot,
} from "../../../../shared/desktop-browser";

export type BrowserBridge = {
  createTab: () => Promise<DesktopBrowserStateSnapshot>;
  activateTab: (tabId: string) => Promise<DesktopBrowserStateSnapshot>;
  closeTab: (tabId: string) => Promise<DesktopBrowserStateSnapshot>;
  getSnapshot: () => Promise<DesktopBrowserStateSnapshot>;
  navigate: (tabId: string, url: string) => Promise<DesktopBrowserStateSnapshot>;
  goBack: (tabId: string) => Promise<DesktopBrowserStateSnapshot>;
  goForward: (tabId: string) => Promise<DesktopBrowserStateSnapshot>;
  refresh: (tabId: string) => Promise<DesktopBrowserStateSnapshot>;
  extract: (tabId: string) => Promise<DesktopBrowserExtractResult>;
  screenshot: (tabId: string) => Promise<DesktopBrowserScreenshotResult>;
  interact: (
    tabId: string,
    request: DesktopBrowserInteractionRequest,
  ) => Promise<DesktopBrowserInteractionResult>;
};

declare global {
  interface Window {
    maomiDesktopBrowser?: BrowserBridge;
  }
}

export function getBrowserBridge(): BrowserBridge {
  const bridge = window.maomiDesktopBrowser;
  if (!bridge) {
    throw new Error("Desktop browser bridge is unavailable.");
  }

  return bridge;
}
