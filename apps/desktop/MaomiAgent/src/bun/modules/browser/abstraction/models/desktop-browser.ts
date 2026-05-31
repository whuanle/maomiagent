import type {
  DesktopBrowserExtractResult,
  DesktopBrowserInteractionResult,
  DesktopBrowserScreenshotResult,
  DesktopBrowserStateSnapshot,
  DesktopBrowserToolPanel,
} from "../../../../../shared/desktop-browser";

export type DesktopBrowserRuntimeTab = {
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

export type DesktopBrowserRuntimeState = DesktopBrowserStateSnapshot & {
  tabs: DesktopBrowserRuntimeTab[];
  toolPanel: DesktopBrowserToolPanel;
};
