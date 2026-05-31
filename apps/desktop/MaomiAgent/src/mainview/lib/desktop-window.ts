export type DesktopWindowAction = "minimize" | "toggleMaximize" | "restoreForDrag" | "exitFullScreen" | "close";

export type DesktopWindowDragPointer = {
  offsetX: number;
  offsetY: number;
  windowWidth: number;
};

import type {
  DesktopDirectoryDialogOptions,
  DesktopMainViewRefreshResult,
  DesktopSaveTextFileDialogInput,
  DesktopSaveTextFileDialogResult,
} from "../../shared/desktop-rpc";

export const DESKTOP_WINDOW_BRIDGE_READY_EVENT = "maomi:desktop-window-bridge-ready";

type DesktopWindowBridge = {
  getWindowState: () => Promise<{ maximized: boolean }>;
  windowControl: (
    action: DesktopWindowAction,
    dragPointer?: DesktopWindowDragPointer,
  ) => Promise<{ maximized: boolean }>;
  refreshMainView: () => Promise<DesktopMainViewRefreshResult>;
  chooseDirectory: (options?: DesktopDirectoryDialogOptions) => Promise<string | null>;
  saveTextFileWithDialog: (input: DesktopSaveTextFileDialogInput) => Promise<DesktopSaveTextFileDialogResult>;
  openPathInFileManager: (path: string) => Promise<{ opened: boolean }>;
  openExternalUrl: (url: string) => Promise<{ opened: boolean }>;
};

declare global {
  interface Window {
    maomiDesktopWindow?: DesktopWindowBridge;
  }
}

export function hasDesktopWindowBridge(): boolean {
  return Boolean(window.maomiDesktopWindow);
}

export function notifyDesktopWindowBridgeReady(): void {
  window.dispatchEvent(new CustomEvent(DESKTOP_WINDOW_BRIDGE_READY_EVENT));
}

export async function isWindowMaximized(): Promise<boolean> {
  return (await window.maomiDesktopWindow?.getWindowState())?.maximized ?? false;
}

export async function runDesktopWindowAction(
  action: DesktopWindowAction,
  dragPointer?: DesktopWindowDragPointer,
): Promise<{ maximized: boolean }> {
  const bridge = window.maomiDesktopWindow;
  if (!bridge) {
    if (action === "close") {
      window.close();
    }
    return { maximized: false };
  }
  return bridge.windowControl(action, dragPointer);
}

export async function refreshDesktopMainView(): Promise<DesktopMainViewRefreshResult> {
  const bridge = window.maomiDesktopWindow;
  if (!bridge) {
    window.location.reload();
    return {
      url: window.location.href,
      usedDevServer: false,
      rebuilt: false,
    };
  }

  return bridge.refreshMainView();
}

export async function chooseDesktopDirectory(
  options: DesktopDirectoryDialogOptions = {},
): Promise<string | null> {
  const bridge = window.maomiDesktopWindow;
  if (!bridge) {
    throw new Error("Desktop window bridge is unavailable.");
  }

  return bridge.chooseDirectory(options);
}

export async function saveDesktopTextFileWithDialog(
  input: DesktopSaveTextFileDialogInput,
): Promise<DesktopSaveTextFileDialogResult> {
  const bridge = window.maomiDesktopWindow;
  if (!bridge) {
    throw new Error("Desktop window bridge is unavailable.");
  }

  return bridge.saveTextFileWithDialog(input);
}

export async function openDesktopPathInFileManager(path: string): Promise<void> {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    throw new Error("Path is required.");
  }

  const bridge = window.maomiDesktopWindow;
  if (!bridge) {
    throw new Error("Desktop window bridge is unavailable.");
  }

  await bridge.openPathInFileManager(normalizedPath);
}

const DESKTOP_EXTERNAL_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

function normalizeDesktopExternalUrl(url: string) {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) {
    throw new Error("URL is required.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch {
    throw new Error(`Invalid external URL: ${normalizedUrl}`);
  }

  if (!DESKTOP_EXTERNAL_URL_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new Error(`Unsupported external URL protocol: ${parsedUrl.protocol}`);
  }

  return parsedUrl.toString();
}

export async function openDesktopExternalUrl(url: string): Promise<void> {
  const normalizedUrl = normalizeDesktopExternalUrl(url);
  const bridge = window.maomiDesktopWindow;
  if (!bridge) {
    window.open(normalizedUrl, "_blank", "noopener,noreferrer");
    return;
  }

  await bridge.openExternalUrl(normalizedUrl);
}
