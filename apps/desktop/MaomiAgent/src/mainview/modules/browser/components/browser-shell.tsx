import { App as AntdApp } from "antd";
import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type {
  DesktopBrowserStateSnapshot,
  DesktopBrowserInteractionRequest,
  DesktopBrowserTabState,
  DesktopBrowserToolPanel,
} from "../../../../shared/desktop-browser";
import type { LanguageCode } from "../../../config/titlebar";
import { BrowserDomainContext } from "./browser-provider";
import {
  createBrowserShellCopy,
  normalizeBrowserError,
  normalizeBrowserUrl,
} from "./browser-shell-copy";
import { BrowserTabStrip } from "./browser-tab-strip";
import { BrowserToolPanel } from "./browser-tool-panel";
import { BrowserToolbar } from "./browser-toolbar";
import { BrowserWebviewSurface } from "./browser-webview-surface";

type BrowserShellProps = {
  active: boolean;
  language: LanguageCode;
};

function resolveActiveTab(
  tabs: DesktopBrowserTabState[],
  activeTabId: string | null,
): DesktopBrowserTabState | null {
  if (!activeTabId) {
    return tabs[0] ?? null;
  }

  return tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null;
}

function useBrowserDomainSnapshot() {
  const context = useContext(BrowserDomainContext);
  const lastSerializedRef = useRef<string>("");
  const lastSnapshotRef = useRef<DesktopBrowserStateSnapshot | null>(null);

  if (!context) {
    throw new Error("BrowserProvider is required.");
  }

  const state = useSyncExternalStore(
    context.store.subscribe,
    () => {
      const nextSnapshot = context.store.getState();
      const serialized = JSON.stringify(nextSnapshot);

      if (serialized === lastSerializedRef.current && lastSnapshotRef.current) {
        return lastSnapshotRef.current;
      }

      lastSerializedRef.current = serialized;
      lastSnapshotRef.current = nextSnapshot;
      return nextSnapshot;
    },
    () => {
      if (lastSnapshotRef.current) {
        return lastSnapshotRef.current;
      }

      const nextSnapshot = context.store.getState();
      lastSerializedRef.current = JSON.stringify(nextSnapshot);
      lastSnapshotRef.current = nextSnapshot;
      return nextSnapshot;
    },
  );

  return {
    state,
    store: context.store,
    controller: context.controller,
  };
}

export function BrowserShell(props: BrowserShellProps) {
  const { message } = AntdApp.useApp();
  const { state, store, controller } = useBrowserDomainSnapshot();
  const copy = useMemo(() => createBrowserShellCopy(props.language), [props.language]);
  const [syncing, setSyncing] = useState(false);
  const [creatingTab, setCreatingTab] = useState(false);
  const [closingTabId, setClosingTabId] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [screenshotting, setScreenshotting] = useState(false);
  const [interacting, setInteracting] = useState(false);

  const activeTab = useMemo(() => resolveActiveTab(state.tabs, state.activeTabId), [state.activeTabId, state.tabs]);
  const addressValue = activeTab?.draftUrl || activeTab?.url || "";

  useEffect(() => {
    if (!props.active) {
      return;
    }

    let cancelled = false;
    setSyncing(true);

    void controller.getSnapshot()
      .catch((error) => {
        if (!cancelled) {
          message.error(`${copy.loadFailed}: ${normalizeBrowserError(error)}`);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSyncing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [controller, copy.loadFailed, message, props.active]);

  useEffect(() => {
    if (!activeTab && state.toolPanel !== "closed") {
      controller.setToolPanel("closed");
    }
  }, [activeTab, controller, state.toolPanel]);

  const handleFailure = (error: unknown) => {
    message.error(`${copy.actionFailed}: ${normalizeBrowserError(error)}`);
  };

  const handleCreateTab = () => {
    setCreatingTab(true);
    void controller.createTab()
      .catch(handleFailure)
      .finally(() => setCreatingTab(false));
  };

  const handleActivateTab = (tabId: string) => {
    if (tabId === state.activeTabId) {
      return;
    }

    void controller.activateTab(tabId).catch(handleFailure);
  };

  const handleCloseTab = (tabId: string) => {
    setClosingTabId(tabId);
    void controller.closeTab(tabId)
      .catch(handleFailure)
      .finally(() => setClosingTabId((current) => current === tabId ? null : current));
  };

  const handleNavigate = () => {
    if (!activeTab) {
      return;
    }

    const nextUrl = normalizeBrowserUrl(activeTab.draftUrl || activeTab.url);
    if (!nextUrl) {
      return;
    }

    store.updateTab(activeTab.id, {
      draftUrl: nextUrl,
    });

    setNavigating(true);
    void controller.navigate(activeTab.id, nextUrl)
      .catch(handleFailure)
      .finally(() => setNavigating(false));
  };

  const handleBack = () => {
    if (!activeTab) {
      return;
    }

    setNavigating(true);
    void controller.goBack(activeTab.id)
      .catch(handleFailure)
      .finally(() => setNavigating(false));
  };

  const handleForward = () => {
    if (!activeTab) {
      return;
    }

    setNavigating(true);
    void controller.goForward(activeTab.id)
      .catch(handleFailure)
      .finally(() => setNavigating(false));
  };

  const handleRefresh = () => {
    if (!activeTab) {
      return;
    }

    setRefreshing(true);
    void controller.refresh(activeTab.id)
      .catch(handleFailure)
      .finally(() => setRefreshing(false));
  };

  const handleSelectToolPanel = (toolPanel: Exclude<DesktopBrowserToolPanel, "closed">) => {
    controller.setToolPanel(state.toolPanel === toolPanel ? "closed" : toolPanel);
  };

  const handleExtract = () => {
    if (!activeTab) {
      return;
    }

    controller.setToolPanel("extract");
    setExtracting(true);
    void controller.extract(activeTab.id)
      .catch(handleFailure)
      .finally(() => setExtracting(false));
  };

  const handleScreenshot = () => {
    if (!activeTab) {
      return;
    }

    controller.setToolPanel("screenshot");
    setScreenshotting(true);
    void controller.screenshot(activeTab.id)
      .catch(handleFailure)
      .finally(() => setScreenshotting(false));
  };

  const handleInteract = (request: DesktopBrowserInteractionRequest) => {
    if (!activeTab) {
      return;
    }

    controller.setToolPanel("interact");
    setInteracting(true);
    void controller.interact(activeTab.id, request)
      .catch(handleFailure)
      .finally(() => setInteracting(false));
  };

  return (
    <div className="browser-shell">
      <BrowserTabStrip
        copy={copy}
        tabs={state.tabs}
        activeTabId={activeTab?.id ?? null}
        creating={creatingTab}
        closingTabId={closingTabId}
        onActivate={handleActivateTab}
        onClose={handleCloseTab}
        onCreate={handleCreateTab}
      />

      <BrowserToolbar
        copy={copy}
        addressValue={addressValue}
        canGoBack={activeTab?.canGoBack ?? false}
        canGoForward={activeTab?.canGoForward ?? false}
        hasActiveTab={Boolean(activeTab)}
        toolPanel={state.toolPanel}
        refreshing={refreshing}
        onAddressChange={(value) => {
          if (!activeTab) {
            return;
          }

          store.updateTab(activeTab.id, {
            draftUrl: value,
          });
        }}
        onNavigate={handleNavigate}
        onBack={handleBack}
        onForward={handleForward}
        onRefresh={handleRefresh}
        onSelectTool={handleSelectToolPanel}
      />

      <div className="browser-shell-main">
        <BrowserWebviewSurface
          copy={copy}
          tab={activeTab}
          syncing={syncing}
          toolPanel={state.toolPanel}
          onCreateTab={handleCreateTab}
        />
        <BrowserToolPanel
          copy={copy}
          tab={activeTab}
          panel={state.toolPanel}
          extracting={extracting}
          screenshotting={screenshotting}
          interacting={interacting}
          onSelectPanel={(toolPanel) => controller.setToolPanel(toolPanel)}
          onClose={() => controller.setToolPanel("closed")}
          onExtract={handleExtract}
          onScreenshot={handleScreenshot}
          onInteract={handleInteract}
        />
      </div>
    </div>
  );
}
