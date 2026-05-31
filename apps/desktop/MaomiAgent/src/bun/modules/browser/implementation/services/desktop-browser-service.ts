import type {
  DesktopBrowserExtractResult,
  DesktopBrowserInteractionRequest,
  DesktopBrowserInteractionResult,
  DesktopBrowserScreenshotResult,
  DesktopBrowserStateSnapshot,
  DesktopBrowserTabState,
} from "../../../../../shared/desktop-browser";
import type { DesktopBrowserServicePort } from "../../abstraction/ports/desktop-browser-service.port";

type BrowserTabHistory = {
  entries: string[];
  index: number;
};

const DEFAULT_TAB_URL = "about:blank";
const DEFAULT_TAB_TITLE = "New Tab";
const DEFAULT_TOOL_PANEL = "closed";

export class DesktopBrowserService implements DesktopBrowserServicePort {
  private nextTabNumber = 1;
  private operationSequence = 0;
  private snapshot: DesktopBrowserStateSnapshot;
  private readonly tabHistories = new Map<string, BrowserTabHistory>();

  constructor() {
    const initialTab = this.createDefaultTabState();
    this.tabHistories.set(initialTab.id, {
      entries: [initialTab.url],
      index: 0,
    });
    this.snapshot = {
      tabs: [initialTab],
      activeTabId: initialTab.id,
      toolPanel: DEFAULT_TOOL_PANEL,
    };
  }

  async createTab(): Promise<DesktopBrowserStateSnapshot> {
    const tab = this.createDefaultTabState();
    this.tabHistories.set(tab.id, {
      entries: [tab.url],
      index: 0,
    });

    this.snapshot = {
      ...this.snapshot,
      tabs: [...this.snapshot.tabs, tab],
      activeTabId: tab.id,
    };

    return this.getSnapshot();
  }

  async activateTab(tabId: string): Promise<DesktopBrowserStateSnapshot> {
    this.requireTab(tabId);
    this.snapshot = {
      ...this.snapshot,
      activeTabId: tabId,
    };
    return this.getSnapshot();
  }

  async closeTab(tabId: string): Promise<DesktopBrowserStateSnapshot> {
    const currentTabs = this.snapshot.tabs;
    const closedIndex = currentTabs.findIndex((tab) => tab.id === tabId);
    if (closedIndex === -1) {
      throw new Error(`Browser tab not found: ${tabId}`);
    }

    this.tabHistories.delete(tabId);

    if (currentTabs.length === 1) {
      const replacementTab = this.createDefaultTabState();
      this.tabHistories.set(replacementTab.id, {
        entries: [replacementTab.url],
        index: 0,
      });
      this.snapshot = {
        ...this.snapshot,
        tabs: [replacementTab],
        activeTabId: replacementTab.id,
      };
      return this.getSnapshot();
    }

    const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
    const nextActiveTabId = this.snapshot.activeTabId === tabId
      ? nextTabs[Math.max(0, closedIndex - 1)]?.id ?? nextTabs[0]!.id
      : this.snapshot.activeTabId;

    this.snapshot = {
      ...this.snapshot,
      tabs: nextTabs,
      activeTabId: nextActiveTabId,
    };

    return this.getSnapshot();
  }

  async getSnapshot(): Promise<DesktopBrowserStateSnapshot> {
    return cloneSnapshot(this.snapshot);
  }

  async navigate(tabId: string, url: string): Promise<DesktopBrowserStateSnapshot> {
    const normalizedUrl = normalizeUrl(url);
    const history = this.requireHistory(tabId);
    const nextEntries = history.entries.slice(0, history.index + 1);
    nextEntries.push(normalizedUrl);
    this.tabHistories.set(tabId, {
      entries: nextEntries,
      index: nextEntries.length - 1,
    });

    this.replaceTab(tabId, {
      url: normalizedUrl,
      draftUrl: normalizedUrl,
      title: deriveTitle(normalizedUrl),
      loading: false,
      ...toHistoryFlags(this.tabHistories.get(tabId)!),
    });

    return this.getSnapshot();
  }

  async goBack(tabId: string): Promise<DesktopBrowserStateSnapshot> {
    const history = this.requireHistory(tabId);
    const nextIndex = Math.max(0, history.index - 1);
    this.tabHistories.set(tabId, {
      ...history,
      index: nextIndex,
    });

    const nextHistory = this.tabHistories.get(tabId)!;
    const nextUrl = nextHistory.entries[nextHistory.index]!;
    this.replaceTab(tabId, {
      url: nextUrl,
      draftUrl: nextUrl,
      title: deriveTitle(nextUrl),
      loading: false,
      ...toHistoryFlags(nextHistory),
    });

    return this.getSnapshot();
  }

  async goForward(tabId: string): Promise<DesktopBrowserStateSnapshot> {
    const history = this.requireHistory(tabId);
    const nextIndex = Math.min(history.entries.length - 1, history.index + 1);
    this.tabHistories.set(tabId, {
      ...history,
      index: nextIndex,
    });

    const nextHistory = this.tabHistories.get(tabId)!;
    const nextUrl = nextHistory.entries[nextHistory.index]!;
    this.replaceTab(tabId, {
      url: nextUrl,
      draftUrl: nextUrl,
      title: deriveTitle(nextUrl),
      loading: false,
      ...toHistoryFlags(nextHistory),
    });

    return this.getSnapshot();
  }

  async refresh(tabId: string): Promise<DesktopBrowserStateSnapshot> {
    const tab = this.requireTab(tabId);
    this.replaceTab(tabId, {
      draftUrl: tab.url,
      loading: false,
      ...toHistoryFlags(this.requireHistory(tabId)),
    });
    return this.getSnapshot();
  }

  async extract(tabId: string): Promise<DesktopBrowserExtractResult> {
    const tab = this.requireTab(tabId);
    const result: DesktopBrowserExtractResult = {
      tabId,
      url: tab.url,
      title: tab.title,
      text: `Stub extract for ${tab.title}`,
      links: tab.url === DEFAULT_TAB_URL
        ? []
        : [{ text: tab.title, url: tab.url }],
      capturedAt: this.nextTimestamp(),
    };

    this.replaceTab(tabId, {
      lastExtractResult: result,
    }, "extract");

    return result;
  }

  async screenshot(tabId: string): Promise<DesktopBrowserScreenshotResult> {
    const tab = this.requireTab(tabId);
    const result: DesktopBrowserScreenshotResult = {
      tabId,
      dataUrl: `data:image/png;base64,${Buffer.from(`${tab.id}:${tab.url}`).toString("base64")}`,
      capturedAt: this.nextTimestamp(),
    };

    this.replaceTab(tabId, {
      lastScreenshotResult: result,
    }, "screenshot");

    return result;
  }

  async interact(
    tabId: string,
    request: DesktopBrowserInteractionRequest,
  ): Promise<DesktopBrowserInteractionResult> {
    this.requireTab(tabId);
    const result: DesktopBrowserInteractionResult = {
      tabId,
      ok: true,
      message: describeInteraction(request),
      capturedAt: this.nextTimestamp(),
    };

    this.replaceTab(tabId, {
      lastInteractionResult: result,
    }, "interact");

    return result;
  }

  private createDefaultTabState(): DesktopBrowserTabState {
    const id = `tab-${this.nextTabNumber++}`;
    return {
      id,
      title: DEFAULT_TAB_TITLE,
      url: DEFAULT_TAB_URL,
      draftUrl: DEFAULT_TAB_URL,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      lastExtractResult: undefined,
      lastScreenshotResult: undefined,
      lastInteractionResult: undefined,
    };
  }

  private requireTab(tabId: string): DesktopBrowserTabState {
    const tab = this.snapshot.tabs.find((item) => item.id === tabId);
    if (!tab) {
      throw new Error(`Browser tab not found: ${tabId}`);
    }
    return tab;
  }

  private requireHistory(tabId: string): BrowserTabHistory {
    const history = this.tabHistories.get(tabId);
    if (!history) {
      throw new Error(`Browser tab history not found: ${tabId}`);
    }
    return history;
  }

  private replaceTab(
    tabId: string,
    patch: Partial<DesktopBrowserTabState>,
    toolPanel: DesktopBrowserStateSnapshot["toolPanel"] = this.snapshot.toolPanel,
  ): void {
    const previous = this.requireTab(tabId);
    this.snapshot = {
      ...this.snapshot,
      activeTabId: tabId,
      toolPanel,
      tabs: this.snapshot.tabs.map((tab) => tab.id === tabId ? { ...previous, ...patch } : tab),
    };
  }

  private nextTimestamp(): string {
    const timestamp = new Date(Date.UTC(2026, 4, 31, 0, 0, this.operationSequence)).toISOString();
    this.operationSequence += 1;
    return timestamp;
  }
}

function normalizeUrl(url: string): string {
  const normalized = url.trim();
  if (!normalized) {
    throw new Error("Browser navigation URL is required.");
  }
  return normalized;
}

function deriveTitle(url: string): string {
  if (url === DEFAULT_TAB_URL) {
    return DEFAULT_TAB_TITLE;
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname || parsed.href;
  } catch {
    return url;
  }
}

function describeInteraction(request: DesktopBrowserInteractionRequest): string {
  if (request.kind === "click") {
    return `Clicked ${request.selector}`;
  }

  if (request.kind === "type") {
    return `Typed into ${request.selector}`;
  }

  if (request.kind === "scroll") {
    return `Scrolled to ${request.x ?? 0},${request.y ?? 0}`;
  }

  return request.selector
    ? `Waited for ${request.selector}`
    : `Waited for ${request.timeoutMs ?? 0}ms`;
}

function toHistoryFlags(history: BrowserTabHistory): Pick<
  DesktopBrowserTabState,
  "canGoBack" | "canGoForward"
> {
  return {
    canGoBack: history.index > 0,
    canGoForward: history.index < history.entries.length - 1,
  };
}

function cloneSnapshot(snapshot: DesktopBrowserStateSnapshot): DesktopBrowserStateSnapshot {
  return {
    ...snapshot,
    tabs: snapshot.tabs.map((tab) => ({
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
    })),
  };
}
