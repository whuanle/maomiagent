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
  updateDraftUrl: (tabId: string, draftUrl: string) => DesktopBrowserStateSnapshot;
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
  let latestAppliedSnapshotOrder = 0;
  let nextSnapshotOrder = 0;

  const resolveRpc = () => input.rpc ?? getBrowserBridge();

  const markLocalStateChange = () => {
    latestAppliedSnapshotOrder = ++nextSnapshotOrder;
  };

  const syncSnapshot = (snapshot: DesktopBrowserStateSnapshot, requestOrder: number) => {
    if (requestOrder < latestAppliedSnapshotOrder) {
      return input.store.getState();
    }

    latestAppliedSnapshotOrder = requestOrder;
    return input.store.replaceState(snapshot);
  };

  const runSnapshotRequest = async (
    request: (rpc: BrowserControllerRpc) => Promise<DesktopBrowserStateSnapshot>,
  ) => {
    const requestOrder = ++nextSnapshotOrder;
    const snapshot = await request(resolveRpc());
    return syncSnapshot(snapshot, requestOrder);
  };

  const readTabUrl = (tabId: string) => {
    return input.store.getState().tabs.find((tab) => tab.id === tabId)?.url ?? null;
  };

  const canApplyToolResult = (tabId: string, requestedUrl: string | null) => {
    const currentUrl = readTabUrl(tabId);
    return currentUrl !== null && currentUrl === requestedUrl;
  };

  return {
    getState: () => input.store.getState(),
    replaceState: (snapshot) => {
      markLocalStateChange();
      return input.store.replaceState(snapshot);
    },
    setToolPanel: (toolPanel) => {
      markLocalStateChange();
      return input.store.setToolPanel(toolPanel);
    },
    updateDraftUrl: (tabId, draftUrl) => {
      markLocalStateChange();
      input.store.updateTab(tabId, {
        draftUrl,
      });
      return input.store.getState();
    },
    async createTab() {
      return runSnapshotRequest((rpc) => rpc.createTab());
    },
    async activateTab(tabId) {
      return runSnapshotRequest((rpc) => rpc.activateTab(tabId));
    },
    async closeTab(tabId) {
      return runSnapshotRequest((rpc) => rpc.closeTab(tabId));
    },
    async getSnapshot() {
      return runSnapshotRequest((rpc) => rpc.getSnapshot());
    },
    async navigate(tabId, url) {
      return runSnapshotRequest((rpc) => rpc.navigate(tabId, url));
    },
    async goBack(tabId) {
      return runSnapshotRequest((rpc) => rpc.goBack(tabId));
    },
    async goForward(tabId) {
      return runSnapshotRequest((rpc) => rpc.goForward(tabId));
    },
    async refresh(tabId) {
      return runSnapshotRequest((rpc) => rpc.refresh(tabId));
    },
    async extract(tabId) {
      const requestedUrl = readTabUrl(tabId);
      const result = await resolveRpc().extract(tabId);
      if (canApplyToolResult(tabId, requestedUrl)) {
        input.store.updateTab(tabId, {
          lastExtractResult: result,
        });
      }
      return result;
    },
    async screenshot(tabId) {
      const requestedUrl = readTabUrl(tabId);
      const result = await resolveRpc().screenshot(tabId);
      if (canApplyToolResult(tabId, requestedUrl)) {
        input.store.updateTab(tabId, {
          lastScreenshotResult: result,
        });
      }
      return result;
    },
    async interact(tabId, request) {
      const requestedUrl = readTabUrl(tabId);
      const result = await resolveRpc().interact(tabId, request);
      if (canApplyToolResult(tabId, requestedUrl)) {
        input.store.updateTab(tabId, {
          lastInteractionResult: result,
        });
      }
      return result;
    },
  };
}
