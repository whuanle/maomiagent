import type {
  DesktopBrowserStateSnapshot,
  DesktopBrowserTabState,
  DesktopBrowserToolPanel,
} from "../../../../shared/desktop-browser";

export type BrowserStore = {
  getState: () => DesktopBrowserStateSnapshot;
  subscribe: (listener: () => void) => () => void;
  replaceState: (snapshot: DesktopBrowserStateSnapshot) => DesktopBrowserStateSnapshot;
  createLocalTab: (overrides?: Partial<DesktopBrowserTabState>) => DesktopBrowserTabState;
  updateTab: (
    tabId: string,
    patch: Partial<DesktopBrowserTabState>,
  ) => DesktopBrowserTabState | null;
  setToolPanel: (toolPanel: DesktopBrowserToolPanel) => DesktopBrowserStateSnapshot;
};

const DEFAULT_TOOL_PANEL: DesktopBrowserToolPanel = "closed";
const DEFAULT_TAB_TITLE = "New Tab";

export function createBrowserStore(
  initialState: DesktopBrowserStateSnapshot = createEmptyBrowserStateSnapshot(),
): BrowserStore {
  let state = cloneSnapshot(initialState);
  let nextLocalTabNumber = state.tabs.length + 1;
  const listeners = new Set<() => void>();

  function emit() {
    for (const listener of listeners) {
      listener();
    }
  }

  function setState(nextState: DesktopBrowserStateSnapshot) {
    state = nextState;
    emit();
    return state;
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    replaceState(snapshot) {
      return setState(cloneSnapshot(snapshot));
    },
    createLocalTab(overrides = {}) {
      const tab = cloneTabState({
        ...createDefaultTabState(`local-tab-${nextLocalTabNumber++}`),
        ...overrides,
      });
      setState({
        ...state,
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
      });
      return tab;
    },
    updateTab(tabId, patch) {
      const currentTab = state.tabs.find((tab) => tab.id === tabId);
      if (!currentTab) {
        return null;
      }

      const nextTab = cloneTabState({
        ...currentTab,
        ...patch,
      });
      setState({
        ...state,
        tabs: state.tabs.map((tab) => tab.id === tabId ? nextTab : tab),
      });
      return nextTab;
    },
    setToolPanel(toolPanel) {
      if (state.toolPanel === toolPanel) {
        return state;
      }

      return setState({
        ...state,
        toolPanel,
      });
    },
  };
}

export function createEmptyBrowserStateSnapshot(): DesktopBrowserStateSnapshot {
  return {
    tabs: [],
    activeTabId: null,
    toolPanel: DEFAULT_TOOL_PANEL,
  };
}

function createDefaultTabState(id: string): DesktopBrowserTabState {
  return {
    id,
    title: DEFAULT_TAB_TITLE,
    url: "",
    draftUrl: "",
    loading: false,
    canGoBack: false,
    canGoForward: false,
  };
}

function cloneSnapshot(snapshot: DesktopBrowserStateSnapshot): DesktopBrowserStateSnapshot {
  return {
    activeTabId: snapshot.activeTabId,
    toolPanel: snapshot.toolPanel,
    tabs: snapshot.tabs.map(cloneTabState),
  };
}

function cloneTabState(tab: DesktopBrowserTabState): DesktopBrowserTabState {
  return {
    ...tab,
    lastExtractResult: tab.lastExtractResult
      ? {
        ...tab.lastExtractResult,
        links: tab.lastExtractResult.links.map((link) => ({ ...link })),
      }
      : undefined,
    lastScreenshotResult: tab.lastScreenshotResult
      ? { ...tab.lastScreenshotResult }
      : undefined,
    lastInteractionResult: tab.lastInteractionResult
      ? { ...tab.lastInteractionResult }
      : undefined,
  };
}
