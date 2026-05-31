import { afterEach, describe, expect, mock, test } from "bun:test";
import { App as AntdApp } from "antd";
import { Window as HappyDomWindow } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type {
  DesktopBrowserInteractionRequest,
  DesktopBrowserStateSnapshot,
  DesktopBrowserTabState,
} from "../../../../shared/desktop-browser";
import { BrowserProvider } from "./browser-provider";
import { BrowserShell } from "./browser-shell";
import { createBrowserStore, type BrowserStore } from "./browser-store";

const originalDomGlobals = {
  window: globalThis.window,
  document: globalThis.document,
  navigator: globalThis.navigator,
  localStorage: globalThis.localStorage,
  self: globalThis.self,
  Document: globalThis.Document,
  DocumentFragment: globalThis.DocumentFragment,
  Element: globalThis.Element,
  HTMLElement: globalThis.HTMLElement,
  HTMLInputElement: globalThis.HTMLInputElement,
  HTMLTextAreaElement: globalThis.HTMLTextAreaElement,
  Text: globalThis.Text,
  Comment: globalThis.Comment,
  CustomEvent: globalThis.CustomEvent,
  Event: globalThis.Event,
  EventTarget: globalThis.EventTarget,
  KeyboardEvent: globalThis.KeyboardEvent,
  MouseEvent: globalThis.MouseEvent,
  Node: globalThis.Node,
  SVGElement: globalThis.SVGElement,
  MutationObserver: globalThis.MutationObserver,
  ShadowRoot: globalThis.ShadowRoot,
  requestAnimationFrame: globalThis.requestAnimationFrame,
  cancelAnimationFrame: globalThis.cancelAnimationFrame,
  getComputedStyle: globalThis.getComputedStyle,
  ResizeObserver: (globalThis as Record<string, unknown>).ResizeObserver,
  matchMedia: (globalThis as Record<string, unknown>).matchMedia,
  IS_REACT_ACT_ENVIRONMENT: (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT,
};

function installDomWindow() {
  const testWindow = new HappyDomWindow({
    url: "https://desktop.maomiagent.test/#browser",
  });
  const requestAnimationFrame = testWindow.requestAnimationFrame?.bind(testWindow)
    ?? ((callback: FrameRequestCallback) => testWindow.setTimeout(() => callback(Date.now()), 0));
  const cancelAnimationFrame = testWindow.cancelAnimationFrame?.bind(testWindow)
    ?? ((handle: ReturnType<typeof testWindow.setTimeout>) => testWindow.clearTimeout(handle));

  Object.assign(testWindow, {
    SyntaxError: globalThis.SyntaxError,
  });

  Object.assign(globalThis, {
    window: testWindow,
    document: testWindow.document,
    navigator: testWindow.navigator,
    localStorage: testWindow.localStorage,
    self: testWindow,
    Document: testWindow.Document,
    DocumentFragment: testWindow.DocumentFragment,
    Element: testWindow.Element,
    HTMLElement: testWindow.HTMLElement,
    HTMLInputElement: testWindow.HTMLInputElement,
    HTMLTextAreaElement: testWindow.HTMLTextAreaElement,
    Text: testWindow.Text,
    Comment: testWindow.Comment,
    CustomEvent: testWindow.CustomEvent,
    Event: testWindow.Event,
    EventTarget: testWindow.EventTarget,
    KeyboardEvent: testWindow.KeyboardEvent,
    MouseEvent: testWindow.MouseEvent,
    Node: testWindow.Node,
    SVGElement: testWindow.SVGElement,
    MutationObserver: testWindow.MutationObserver,
    ShadowRoot: testWindow.ShadowRoot ?? class ShadowRoot {},
    requestAnimationFrame,
    cancelAnimationFrame,
    getComputedStyle: testWindow.getComputedStyle.bind(testWindow),
    ResizeObserver: class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
    matchMedia: () => ({
      matches: false,
      media: "",
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    }),
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  if (globalThis.HTMLElement?.prototype) {
    Object.defineProperty(globalThis.HTMLElement.prototype, "scrollIntoView", {
      value() {},
      configurable: true,
      writable: true,
    });
  }
}

function restoreDomWindow() {
  const target = globalThis as Record<string, unknown>;
  for (const [key, value] of Object.entries(originalDomGlobals)) {
    if (value === undefined) {
      delete target[key];
      continue;
    }

    target[key] = value;
  }
}

function createTab(overrides: Partial<DesktopBrowserTabState> = {}): DesktopBrowserTabState {
  return {
    id: "tab-1",
    title: "首页",
    url: "https://example.com",
    draftUrl: "https://example.com",
    loading: false,
    canGoBack: false,
    canGoForward: false,
    ...overrides,
  };
}

function createSnapshot(
  overrides: Partial<DesktopBrowserStateSnapshot> = {},
): DesktopBrowserStateSnapshot {
  return {
    tabs: [createTab()],
    activeTabId: "tab-1",
    toolPanel: "closed",
    ...overrides,
  };
}

function createRpc(store: BrowserStore) {
  return {
    createTab: mock(async () => {
      const current = store.getState();
      const nextId = `tab-${current.tabs.length + 1}`;
      return {
        ...current,
        tabs: [
          ...current.tabs,
          createTab({
            id: nextId,
            title: "新建页卡",
            url: "",
            draftUrl: "",
          }),
        ],
        activeTabId: nextId,
      };
    }),
    activateTab: mock(async (tabId: string) => ({
      ...store.getState(),
      activeTabId: tabId,
    })),
    closeTab: mock(async (tabId: string) => {
      const current = store.getState();
      const tabs = current.tabs.filter((tab) => tab.id !== tabId);
      return {
        ...current,
        tabs,
        activeTabId: tabs[0]?.id ?? null,
      };
    }),
    getSnapshot: mock(async () => store.getState()),
    navigate: mock(async (tabId: string, url: string) => ({
      ...store.getState(),
      tabs: store.getState().tabs.map((tab) => tab.id === tabId
        ? {
          ...tab,
          title: url.includes("bun.sh") ? "Bun" : "页面",
          url,
          draftUrl: url,
          canGoBack: true,
          canGoForward: false,
        }
        : tab),
    })),
    goBack: mock(async (tabId: string) => ({
      ...store.getState(),
      tabs: store.getState().tabs.map((tab) => tab.id === tabId
        ? {
          ...tab,
          url: "https://example.com/back",
          draftUrl: "https://example.com/back",
          canGoBack: false,
          canGoForward: true,
        }
        : tab),
    })),
    goForward: mock(async (tabId: string) => ({
      ...store.getState(),
      tabs: store.getState().tabs.map((tab) => tab.id === tabId
        ? {
          ...tab,
          url: "https://example.com/forward",
          draftUrl: "https://example.com/forward",
          canGoBack: true,
          canGoForward: false,
        }
        : tab),
    })),
    refresh: mock(async (tabId: string) => ({
      ...store.getState(),
      tabs: store.getState().tabs.map((tab) => tab.id === tabId
        ? {
          ...tab,
          loading: false,
        }
        : tab),
    })),
    extract: mock(async (tabId: string) => ({
      tabId,
      url: store.getState().tabs.find((tab) => tab.id === tabId)?.url ?? "",
      title: "Bun",
      text: "Bun docs text",
      links: [{
        text: "Install",
        url: "https://bun.sh/docs/installation",
      }],
      capturedAt: "2026-05-31T10:00:00.000Z",
    })),
    screenshot: mock(async (tabId: string) => ({
      tabId,
      dataUrl: "data:image/png;base64,abc",
      capturedAt: "2026-05-31T10:01:00.000Z",
    })),
    interact: mock(async (tabId: string, request: DesktopBrowserInteractionRequest) => ({
      tabId,
      ok: true,
      message: request.kind === "click"
        ? `click ${request.selector}`
        : request.kind === "type"
          ? `type ${request.selector}`
          : request.kind === "scroll"
            ? "scroll"
            : "wait",
      capturedAt: "2026-05-31T10:02:00.000Z",
    })),
  };
}

async function flushTasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function renderBrowserShell(initialState: DesktopBrowserStateSnapshot) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const store = createBrowserStore(initialState);
  const rpc = createRpc(store);

  await act(async () => {
    root.render(
      <AntdApp>
        <BrowserProvider store={store} rpc={rpc}>
          <BrowserShell active language="zh-CN" />
        </BrowserProvider>
      </AntdApp>,
    );
  });

  await flushTasks();

  return { container, root, store, rpc };
}

async function cleanup(root: Root, container: HTMLElement) {
  await act(async () => {
    root.unmount();
  });

  container.remove();
  await flushTasks();
}

function getAddressInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[aria-label="地址栏"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Address input not found.");
  }

  return input;
}

async function clickElement(element: HTMLElement) {
  await act(async () => {
    element.click();
  });

  await flushTasks();
}

async function clickButtonByAriaLabel(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll("button"))
    .find((node) => node.getAttribute("aria-label") === label);

  if (!(button instanceof HTMLElement)) {
    throw new Error(`Button not found: ${label}`);
  }

  await clickElement(button);
}

async function clickTab(container: HTMLElement, title: string) {
  const tabButton = Array.from(container.querySelectorAll(".browser-tab-button"))
    .find((node) => node.textContent?.includes(title));

  if (!(tabButton instanceof HTMLElement)) {
    throw new Error(`Tab not found: ${title}`);
  }

  await clickElement(tabButton);
}

function getReactProps(node: HTMLElement): Record<string, unknown> | null {
  const reactPropsKey = Object.keys(node).find((key) => key.startsWith("__reactProps$"));
  if (!reactPropsKey) {
    return null;
  }

  return (node as unknown as Record<string, unknown>)[reactPropsKey] as Record<string, unknown>;
}

async function typeIntoInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    input.focus();
    const valueSetter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(input),
      "value",
    )?.set;

    valueSetter?.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    input.dispatchEvent(new window.Event("change", { bubbles: true }));

    const reactProps = getReactProps(input) as {
      onChange?: (event: { target: HTMLInputElement; currentTarget: HTMLInputElement }) => void;
    } | null;
    reactProps?.onChange?.({ target: input, currentTarget: input });
  });

  await flushTasks();
}

async function pressEnter(input: HTMLInputElement) {
  await act(async () => {
    input.dispatchEvent(new window.KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
    }));

    const reactProps = getReactProps(input) as {
      onKeyDown?: (event: { key: string; currentTarget: HTMLInputElement }) => void;
    } | null;
    reactProps?.onKeyDown?.({ key: "Enter", currentTarget: input });
  });

  await flushTasks();
}

afterEach(() => {
  globalThis.document?.body?.replaceChildren?.();
  restoreDomWindow();
});

describe("BrowserShell", () => {
  test("renders a codex-style blank browser shell when no tab exists", async () => {
    installDomWindow();

    const { container, root } = await renderBrowserShell({
      tabs: [],
      activeTabId: null,
      toolPanel: "closed",
    });

    expect(container.querySelector(".browser-webview-empty-card")).toBeNull();
    expect(container.querySelector(".browser-webview-empty-state")).not.toBeNull();
    expect(container.textContent).toContain("开始浏览");
    expect(container.textContent).toContain("输入 URL 以打开页面");
    expect(container.querySelector('input[placeholder="输入 URL"]')).not.toBeNull();

    await cleanup(root, container);
  });

  test("uses the shared browser state for tabs and new-tab actions", async () => {
    installDomWindow();

    const initialState = createSnapshot({
      tabs: [
        createTab({ id: "tab-1", title: "首页", url: "https://example.com", draftUrl: "https://example.com" }),
        createTab({ id: "tab-2", title: "文档", url: "https://docs.example.com", draftUrl: "https://docs.example.com" }),
      ],
      activeTabId: "tab-2",
    });

    const { container, root, store, rpc } = await renderBrowserShell(initialState);

    expect(getAddressInput(container).value).toBe("https://docs.example.com");
    expect(getAddressInput(container).getAttribute("placeholder")).toBe("输入 URL");
    expect(container.textContent).not.toContain("浏览器会话");
    expect(container.querySelector(".browser-tab-url")).toBeNull();
    expect(container.querySelector(".browser-tab-add-icon")).not.toBeNull();

    await clickTab(container, "首页");
    expect(rpc.activateTab).toHaveBeenCalledWith("tab-1");
    expect(store.getState().activeTabId).toBe("tab-1");
    expect(getAddressInput(container).value).toBe("https://example.com");

    await clickButtonByAriaLabel(container, "新建页卡");
    expect(rpc.createTab).toHaveBeenCalledTimes(1);
    expect(store.getState().tabs).toHaveLength(3);
    expect(store.getState().activeTabId).toBe("tab-3");

    await cleanup(root, container);
  });

  test("drives navigation through the shared controller", async () => {
    installDomWindow();

    const initialState = createSnapshot({
      tabs: [createTab({
        id: "tab-1",
        title: "首页",
        url: "https://example.com",
        draftUrl: "https://example.com",
        canGoBack: true,
      })],
    });

    const { container, root, store, rpc } = await renderBrowserShell(initialState);

    const addressInput = getAddressInput(container);
    await typeIntoInput(addressInput, "bun.sh");
    await pressEnter(addressInput);

    expect(rpc.navigate).toHaveBeenCalledWith("tab-1", "https://bun.sh");
    expect(store.getState().tabs[0]).toMatchObject({
      id: "tab-1",
      url: "https://bun.sh",
      draftUrl: "https://bun.sh",
      title: "Bun",
    });

    await clickButtonByAriaLabel(container, "后退");
    expect(rpc.goBack).toHaveBeenCalledWith("tab-1");

    await clickButtonByAriaLabel(container, "刷新");
    expect(rpc.refresh).toHaveBeenCalledWith("tab-1");

    await cleanup(root, container);
  });
});
