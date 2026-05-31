import { App as AntdApp } from "antd";
import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";

import type {
  DesktopBrowserStateSnapshot,
  DesktopBrowserTabState,
} from "../../../../shared/desktop-browser";
import type { LanguageCode } from "../../../config/titlebar";
import { BrowserDomainContext } from "./browser-provider";
import {
  createBrowserShellCopy,
  normalizeBrowserError,
  normalizeBrowserUrl,
} from "./browser-shell-copy";
import { BrowserTabStrip } from "./browser-tab-strip";
import { BrowserToolbar } from "./browser-toolbar";
import { BrowserWebviewSurface } from "./browser-webview-surface";
import "../page.css";

type BrowserShellProps = {
  active: boolean;
  language: LanguageCode;
  presentation?: "page" | "panel";
};

type PendingByTabId = Record<string, number>;

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
  const { state, controller } = useBrowserDomainSnapshot();
  const copy = useMemo(() => createBrowserShellCopy(props.language), [props.language]);
  const [syncing, setSyncing] = useState(false);
  const [creatingTab, setCreatingTab] = useState(false);
  const [closingTabId, setClosingTabId] = useState<string | null>(null);
  const [refreshingByTabId, setRefreshingByTabId] = useState<PendingByTabId>({});

  const activeTab = useMemo(() => resolveActiveTab(state.tabs, state.activeTabId), [state.activeTabId, state.tabs]);
  const addressValue = activeTab?.draftUrl || activeTab?.url || "";
  const activeTabId = activeTab?.id ?? null;
  const refreshing = activeTabId ? Boolean(refreshingByTabId[activeTabId]) : false;

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

  const handleFailure = (error: unknown) => {
    message.error(`${copy.actionFailed}: ${normalizeBrowserError(error)}`);
  };

  const beginPending = (
    setPendingState: Dispatch<SetStateAction<PendingByTabId>>,
    tabId: string,
  ) => {
    setPendingState((current) => ({
      ...current,
      [tabId]: (current[tabId] ?? 0) + 1,
    }));
  };

  const endPending = (
    setPendingState: Dispatch<SetStateAction<PendingByTabId>>,
    tabId: string,
  ) => {
    setPendingState((current) => {
      const nextCount = (current[tabId] ?? 0) - 1;
      if (nextCount > 0) {
        return {
          ...current,
          [tabId]: nextCount,
        };
      }

      const {
        [tabId]: _ignored,
        ...rest
      } = current;
      return rest;
    });
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

    controller.updateDraftUrl(activeTab.id, nextUrl);
    void controller.navigate(activeTab.id, nextUrl)
      .catch(handleFailure);
  };

  const handlePageNavigate = (url: string) => {
    if (!activeTab) {
      return;
    }

    const nextUrl = normalizeBrowserUrl(url);
    if (!nextUrl) {
      return;
    }

    if (nextUrl === activeTab.url && nextUrl === activeTab.draftUrl) {
      return;
    }

    controller.updateDraftUrl(activeTab.id, nextUrl);
    void controller.navigate(activeTab.id, nextUrl)
      .catch(handleFailure);
  };

  const handleBack = () => {
    if (!activeTab) {
      return;
    }

    void controller.goBack(activeTab.id)
      .catch(handleFailure);
  };

  const handleForward = () => {
    if (!activeTab) {
      return;
    }

    void controller.goForward(activeTab.id)
      .catch(handleFailure);
  };

  const handleRefresh = () => {
    if (!activeTab) {
      return;
    }

    beginPending(setRefreshingByTabId, activeTab.id);
    void controller.refresh(activeTab.id)
      .catch(handleFailure)
      .finally(() => endPending(setRefreshingByTabId, activeTab.id));
  };

  return (
    <div className={`browser-shell${props.presentation === "panel" ? " browser-shell-panel" : ""}`}>
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
        refreshing={refreshing}
        onAddressChange={(value) => {
          if (!activeTab) {
            return;
          }

          controller.updateDraftUrl(activeTab.id, value);
        }}
        onNavigate={handleNavigate}
        onBack={handleBack}
        onForward={handleForward}
        onRefresh={handleRefresh}
      />

      <div className="browser-shell-main">
        <BrowserWebviewSurface
          active={props.active}
          copy={copy}
          tab={activeTab}
          syncing={syncing}
          onPageNavigate={handlePageNavigate}
        />
      </div>
    </div>
  );
}
