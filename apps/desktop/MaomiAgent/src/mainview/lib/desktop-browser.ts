import type {
  DesktopBrowserExtractResult,
  DesktopBrowserInteractionRequest,
  DesktopBrowserInteractionResult,
  DesktopBrowserScreenshotResult,
  DesktopBrowserStateSnapshot,
} from "../../shared/desktop-browser";
import { DESKTOP_WINDOW_BRIDGE_READY_EVENT } from "./desktop-window";

export type DesktopBrowserBridge = {
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
    maomiDesktopBrowser?: DesktopBrowserBridge;
  }
}

export const DESKTOP_BROWSER_BRIDGE_READY_EVENT = DESKTOP_WINDOW_BRIDGE_READY_EVENT;

export function hasDesktopBrowserBridge(): boolean {
  return Boolean(window.maomiDesktopBrowser);
}

export function getDesktopBrowserBridge(): DesktopBrowserBridge {
  const bridge = window.maomiDesktopBrowser;
  if (!bridge) {
    throw new Error("Desktop browser bridge is unavailable.");
  }

  return bridge;
}
