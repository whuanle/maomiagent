import type {
  DesktopBrowserExtractResult,
  DesktopBrowserInteractionRequest,
  DesktopBrowserInteractionResult,
  DesktopBrowserScreenshotResult,
  DesktopBrowserStateSnapshot,
  DesktopBrowserToolPanel,
} from "../../../../shared/desktop-browser";
import {
  getBrowserBridge,
  type BrowserBridge,
} from "./browser-bridge";
import type { BrowserStore } from "./browser-store";

export type BrowserControllerRpc = BrowserBridge;

export type BrowserController = {
  getState: () => DesktopBrowserStateSnapshot;
  replaceState: (snapshot: DesktopBrowserStateSnapshot) => DesktopBrowserStateSnapshot;
  setToolPanel: (toolPanel: DesktopBrowserToolPanel) => DesktopBrowserStateSnapshot;
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

export function createBrowserController(input: {
  store: BrowserStore;
  rpc?: BrowserControllerRpc;
}): BrowserController {
  const rpc = input.rpc ?? getBrowserBridge();

  const syncSnapshot = (snapshot: DesktopBrowserStateSnapshot) => {
    return input.store.replaceState(snapshot);
  };

  return {
    getState: () => input.store.getState(),
    replaceState: (snapshot) => input.store.replaceState(snapshot),
    setToolPanel: (toolPanel) => input.store.setToolPanel(toolPanel),
    async createTab() {
      return syncSnapshot(await rpc.createTab());
    },
    async activateTab(tabId) {
      return syncSnapshot(await rpc.activateTab(tabId));
    },
    async closeTab(tabId) {
      return syncSnapshot(await rpc.closeTab(tabId));
    },
    async getSnapshot() {
      return syncSnapshot(await rpc.getSnapshot());
    },
    async navigate(tabId, url) {
      return syncSnapshot(await rpc.navigate(tabId, url));
    },
    async goBack(tabId) {
      return syncSnapshot(await rpc.goBack(tabId));
    },
    async goForward(tabId) {
      return syncSnapshot(await rpc.goForward(tabId));
    },
    async refresh(tabId) {
      return syncSnapshot(await rpc.refresh(tabId));
    },
    async extract(tabId) {
      const result = await rpc.extract(tabId);
      input.store.updateTab(tabId, {
        lastExtractResult: result,
      });
      return result;
    },
    async screenshot(tabId) {
      const result = await rpc.screenshot(tabId);
      input.store.updateTab(tabId, {
        lastScreenshotResult: result,
      });
      return result;
    },
    async interact(tabId, request) {
      const result = await rpc.interact(tabId, request);
      input.store.updateTab(tabId, {
        lastInteractionResult: result,
      });
      return result;
    },
  };
}
