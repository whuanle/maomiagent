export type DesktopBrowserToolPanel =
  | "closed"
  | "extract"
  | "screenshot"
  | "interact";

export type DesktopBrowserInteractionRequest =
  | { kind: "click"; selector: string }
  | { kind: "type"; selector: string; value: string }
  | { kind: "scroll"; x?: number; y?: number }
  | { kind: "wait"; selector?: string; timeoutMs?: number };

export type DesktopBrowserInteractionResult = {
  tabId: string;
  ok: boolean;
  message: string;
  capturedAt: string;
};

export type DesktopBrowserExtractResult = {
  tabId: string;
  url: string;
  title: string;
  text: string;
  links: Array<{
    text: string;
    url: string;
  }>;
  capturedAt: string;
};

export type DesktopBrowserScreenshotResult = {
  tabId: string;
  dataUrl: string;
  capturedAt: string;
};

export type DesktopBrowserTabState = {
  id: string;
  title: string;
  url: string;
  draftUrl: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  faviconUrl?: string;
  lastExtractResult?: DesktopBrowserExtractResult;
  lastScreenshotResult?: DesktopBrowserScreenshotResult;
  lastInteractionResult?: DesktopBrowserInteractionResult;
};

export type DesktopBrowserStateSnapshot = {
  tabs: DesktopBrowserTabState[];
  activeTabId: string | null;
  toolPanel: DesktopBrowserToolPanel;
};
