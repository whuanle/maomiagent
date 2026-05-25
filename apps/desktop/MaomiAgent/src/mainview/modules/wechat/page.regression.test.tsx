import { afterEach, expect, mock, test } from "bun:test";
import { App as AntdApp } from "antd";
import { Window as HappyDomWindow } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { WechatStateView } from "../../../shared/desktop-wechat";

mock.module("./page.css", () => ({}));
mock.module("./components/runtime-model-select", () => ({
  RuntimeModelSelect: () => <div data-testid="runtime-model-select">runtime-model-select</div>,
}));
mock.module("../../lib/wechat-login-window", () => ({
  reserveWechatLoginWindow: () => ({
    blocked: false,
    open: async () => true,
    close() {},
  }),
}));

const sampleState = {
  transportMode: "long-poll",
  config: {
    baseUrl: "https://ilinkai.weixin.qq.com",
    cdnBaseUrl: "https://novac2c.cdn.weixin.qq.com/c2c",
    selectedWorkspaceId: "workspace-a",
    defaultExecutionWorkspaceId: "workspace-a",
    allowWorkspaceSwitch: false,
    workspaceSwitchScope: "all",
    allowedExecutionWorkspaceIds: [],
  },
  catalog: {
    alignment: "openclaw-weixin",
    transportMode: "long-poll",
    mediaWorkspaceRelativeDir: ".maomi/wechat-media",
    descriptors: [],
  },
  accounts: [{
    accountId: "wechat-account",
    userId: "wxid_123",
    enabled: true,
    configured: true,
    running: true,
    connectionStatus: "connected",
    transportMode: "long-poll",
    baseUrl: "https://ilinkai.weixin.qq.com",
    cdnBaseUrl: "https://novac2c.cdn.weixin.qq.com/c2c",
    updatedAt: "2026-05-19T08:00:00.000Z",
    lastInboundAt: "2026-05-19T08:10:00.000Z",
    lastOutboundAt: "2026-05-19T08:11:00.000Z",
    bindingCount: 1,
    processedMessageCount: 3,
  }],
  bindings: [],
  processedMessages: [],
  loginSessions: [],
  stats: {
    accountCount: 1,
    activeAccountCount: 1,
    bindingCount: 1,
    processedMessageCount: 3,
  },
  updatedAt: "2026-05-19T08:12:00.000Z",
} satisfies WechatStateView;

mock.module("../../lib/desktop-wechat", () => ({
  fetchWechatState: async () => sampleState,
  saveWechatConfig: async () => sampleState,
  startWechatQrLogin: async () => ({
    sessionKey: "session-1",
    message: "二维码已生成",
    item: {
      sessionKey: "session-1",
      status: "wait",
      message: "等待扫码",
      startedAt: "2026-05-19T08:00:00.000Z",
      expiresAt: "2026-05-19T08:05:00.000Z",
      updatedAt: "2026-05-19T08:00:00.000Z",
    },
  }),
  pollWechatQrLogin: async () => ({
    connected: false,
    message: "等待扫码",
    item: {
      sessionKey: "session-1",
      status: "wait",
      message: "等待扫码",
      startedAt: "2026-05-19T08:00:00.000Z",
      expiresAt: "2026-05-19T08:05:00.000Z",
      updatedAt: "2026-05-19T08:00:00.000Z",
    },
    state: sampleState,
  }),
  clearWechatAccountConversations: async () => sampleState,
  removeWechatAccount: async () => sampleState,
  subscribeWechatMutations: () => () => {},
}));
mock.module("../../lib/desktop-workspace", () => ({
  listDesktopWorkspaces: async () => ({
    items: [{
      workspaceId: "workspace-a",
      name: "Workspace A",
      directoryPath: "E:/workspace/a",
      isPinned: false,
      tags: [],
      createdAt: "2026-05-19T08:00:00.000Z",
      updatedAt: "2026-05-19T08:00:00.000Z",
    }],
    meta: {
      total: 1,
      limit: 200,
      offset: 0,
      hasMore: false,
    },
  }),
}));

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
    url: "https://desktop.maomiagent.test/#wechat",
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

async function flushTasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function renderWechatPage() {
  const { WechatPage } = await import("./page");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <AntdApp>
        <WechatPage active language="zh-CN" />
      </AntdApp>,
    );
  });

  await flushTasks();

  return { container, root };
}

async function cleanupWechatPage(root: Root, container: HTMLElement) {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  await flushTasks();
}

afterEach(() => {
  globalThis.document?.body?.replaceChildren?.();
  restoreDomWindow();
});

test("renders only the account list panel on the main area", async () => {
  installDomWindow();

  const { container, root } = await renderWechatPage();

  expect(container.textContent).toContain("接入配置");
  expect(container.textContent).toContain("接入账号记录");
  expect(container.textContent).not.toContain("接入信息");
  expect(container.textContent).not.toContain("在线账号");
  expect(container.textContent).not.toContain("扫码状态");
  expect(container.textContent).not.toContain("默认工作区");
  expect(container.textContent).not.toContain("工作区切换");
  expect(container.textContent).not.toContain("先生成二维码，再使用微信扫码登录");

  await cleanupWechatPage(root, container);
});
