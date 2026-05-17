import { afterEach, describe, expect, mock, test } from "bun:test";
import { App as AntdApp } from "antd";
import { Window as HappyDomWindow } from "happy-dom";
import { act } from "react";
import { createRoot } from "react-dom/client";

type ProjectionCall = {
  workspaceId?: string;
  query?: Record<string, unknown>;
};

type SearchCall = {
  workspaceId?: string;
  query?: Record<string, unknown>;
};

const projectionCalls: ProjectionCall[] = [];
const searchCalls: SearchCall[] = [];
const workspaceListCalls: Array<Record<string, unknown>> = [];
const maintenanceCalls: Array<Record<string, unknown>> = [];

mock.module("./page.css", () => ({}));

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
    url: "https://desktop.maomiagent.test/#memory",
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

function installDesktopBridges() {
  const windowWithBridges = window as typeof window & {
    maomiDesktopMemory: Record<string, unknown>;
    maomiDesktopWorkspace: Record<string, unknown>;
  };

  windowWithBridges.maomiDesktopWorkspace = {
    listDesktopWorkspaces: async (query: Record<string, unknown> = {}) => {
      workspaceListCalls.push(query);
      return {
        items: [{
          workspaceId: "workspace-a",
          name: "Workspace A",
          directoryPath: "C:/workspace-a",
          isPinned: false,
          tags: [],
          createdAt: "2026-05-16T00:00:00.000Z",
          updatedAt: "2026-05-16T00:00:00.000Z",
        }],
        meta: { total: 1, limit: 200, offset: 0, hasMore: false },
      };
    },
    getDesktopWorkspace: async () => null,
    getDesktopWorkspaceFileTree: async () => ({
      workspaceId: "workspace-a",
      rootPath: "C:/workspace-a",
      path: "",
      nodes: [],
    }),
    getDesktopWorkspaceFileContent: async () => ({
      workspaceId: "workspace-a",
      rootPath: "C:/workspace-a",
      path: "",
      absolutePath: "C:/workspace-a",
      content: "",
      binary: false,
      truncated: false,
    }),
    createDesktopWorkspace: async () => ({
      item: {
        workspaceId: "workspace-a",
        name: "Workspace A",
        directoryPath: "C:/workspace-a",
        isPinned: false,
        tags: [],
        createdAt: "2026-05-16T00:00:00.000Z",
        updatedAt: "2026-05-16T00:00:00.000Z",
      },
      created: true,
    }),
    updateDesktopWorkspace: async () => null,
    removeDesktopWorkspace: async () => ({ removed: false }),
  };

  windowWithBridges.maomiDesktopMemory = {
    listDesktopMemoryUnits: async () => ({
      items: [],
      meta: { total: 0, limit: 200, offset: 0, hasMore: false },
    }),
    getDesktopMemoryProjection: async (params: ProjectionCall = {}) => {
      projectionCalls.push({ workspaceId: params.workspaceId, query: params.query });
      return {
        workspaceId: params.workspaceId,
        units: {
          items: [],
          meta: { total: 0, limit: 200, offset: 0, hasMore: false },
        },
        traces: {
          items: [],
          limit: 20,
        },
        runtimeContext: {
          query: "当前会话偏好",
          items: [
            {
              unitId: "runtime-1",
              summary: "用户偏好简洁回答",
              kind: "preference",
              tier: "long",
              sourceScope: "global",
              score: 0.92,
            },
          ],
        },
        summary: {
          unitTotal: 0,
          traceCount: 0,
          runtimeItems: 1,
        },
      };
    },
    appendDesktopMemory: async () => ({
      unitId: "memory-1",
      scope: "global",
      tier: "mid",
      kind: "note",
      rawContent: "",
      status: "active",
      createdAt: "2026-05-16T00:00:00.000Z",
      updatedAt: "2026-05-16T00:00:00.000Z",
    }),
    patchDesktopMemoryUnit: async () => ({
      unitId: "memory-1",
      scope: "global",
      tier: "mid",
      kind: "note",
      rawContent: "",
      status: "active",
      createdAt: "2026-05-16T00:00:00.000Z",
      updatedAt: "2026-05-16T00:00:00.000Z",
    }),
    removeDesktopMemoryUnit: async () => ({ deleted: true, unitId: "memory-1" }),
    searchDesktopMemory: async (params: SearchCall = {}) => {
      searchCalls.push(params);
      return { traceId: "trace-1", items: [] };
    },
    listDesktopMemoryTraces: async () => ({ items: [] }),
    getDesktopMemoryRuntimeContext: async () => ({ query: "", items: [] }),
    previewDesktopMemoryMaintenance: async (params: Record<string, unknown> = {}) => {
      maintenanceCalls.push(params);
      return {
        runId: "run-1",
        mode: "preview",
        action: "organize",
        summary: { scanned: 0, selected: 0, action: "organize", olderThanDays: 30 },
        selected: [],
      };
    },
    applyDesktopMemoryMaintenance: async () => ({ runId: "run-1", applied: 0, status: "completed" }),
    pullDesktopMemoryWorkingSet: async () => ({ frameVersion: 0, frameSnapshot: [], items: [] }),
    pushDesktopMemoryWorkingSet: async () => ({ frameId: "frame-1", frameVersion: 1, accepted: 0, ackTraceId: "trace-1" }),
  };
}

async function flushTasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function renderMemoryPage() {
  const { MemoryPage } = await import("./page");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <AntdApp>
        <MemoryPage active language="zh-CN" />
      </AntdApp>,
    );
  });

  await flushTasks();

  return { container, root };
}

async function cleanupMemoryPage(root: ReturnType<typeof createRoot>, container: HTMLElement) {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  await flushTasks();
}

function getTopEntryLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll(".memory-page-entry-tabs .ant-tabs-tab-btn"))
    .map((node) => node.textContent?.trim() ?? "")
    .filter(Boolean);
}

afterEach(() => {
  projectionCalls.length = 0;
  searchCalls.length = 0;
  workspaceListCalls.length = 0;
  maintenanceCalls.length = 0;
  globalThis.document?.body?.replaceChildren?.();
  restoreDomWindow();
});

async function clickEntryTab(container: HTMLElement, label: string) {
  const tab = Array.from(container.querySelectorAll(".memory-page-entry-tabs .ant-tabs-tab-btn"))
    .find((node) => node.textContent?.trim() === label);

  if (!(tab instanceof HTMLElement)) {
    throw new Error(`Entry tab not found: ${label}`);
  }

  await act(async () => {
    tab.click();
  });

  await flushTasks();
}

function getButtonCount(container: HTMLElement, label: string): number {
  return Array.from(container.querySelectorAll("button"))
    .filter((node) => node.textContent?.trim() === label)
    .length;
}

async function clickButton(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll("button"))
    .find((node) => node.textContent?.trim() === label);

  if (!(button instanceof HTMLElement)) {
    throw new Error(`Button not found: ${label}`);
  }

  await act(async () => {
    button.click();
  });

  await flushTasks();
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

async function openSelectDropdown(select: HTMLElement) {
  const trigger = select.querySelector(".ant-select-selector") ?? select;

  await act(async () => {
    trigger.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
    trigger.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true }));
    trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });

  await flushTasks();
}

async function selectDropdownOption(select: HTMLElement, label: string) {
  await openSelectDropdown(select);

  const option = Array.from(document.body.querySelectorAll(".ant-select-item-option"))
    .find((node) => node.textContent?.replace(/\s+/g, " ").trim() === label);

  if (!(option instanceof HTMLElement)) {
    throw new Error(`Select option not found: ${label}`);
  }

  await act(async () => {
    option.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
    option.click();
  });

  await flushTasks();
}

describe("MemoryPage regression", () => {
  test("mounts one real top tab strip and keeps the default records view on all-scope memory", async () => {
    installDomWindow();
    installDesktopBridges();

    const { container, root } = await renderMemoryPage();

    expect(container.querySelectorAll(".memory-page-entry-tabs")).toHaveLength(1);
    expect(getTopEntryLabels(container)).toEqual(["记忆记录", "理解记忆", "整理记忆"]);
    expect(container.textContent).toContain("手动添加");

    expect(workspaceListCalls).toHaveLength(1);
    expect(projectionCalls).toHaveLength(1);
    expect(projectionCalls[0]).toMatchObject({
      workspaceId: undefined,
      query: {
        scopeFilter: "all",
      },
    });

    await cleanupMemoryPage(root, container);
  });

  test("understand entry uses the single toolbar query surface and calls bridge search with current scope semantics", async () => {
    installDomWindow();
    installDesktopBridges();

    const { container, root } = await renderMemoryPage();

    await clickEntryTab(container, "理解记忆");

    expect(container.querySelectorAll('input[placeholder="输入一句话，看看系统会想起哪些记忆"]').length).toBe(1);
    expect(container.querySelectorAll(".memory-page-compact-input")).toHaveLength(1);
    expect(getButtonCount(container, "查看会想起什么")).toBe(1);
    expect(container.querySelectorAll(".memory-page-inline-controls")).toHaveLength(0);
    expect(container.textContent).toContain("输入一句话，看看系统会想起哪些记忆。");
    expect(container.textContent).toContain("当前相关记忆");
    expect(container.textContent).toContain("用户偏好简洁回答");
    expect(container.textContent).toContain("暂无检索结果");

    const understandInput = container.querySelector(
      'input[placeholder="输入一句话，看看系统会想起哪些记忆"]',
    );
    if (!(understandInput instanceof HTMLInputElement)) {
      throw new Error("Understand input not found.");
    }

    await typeIntoInput(understandInput, "当前会话偏好");

    await act(async () => {
      (Array.from(container.querySelectorAll("button"))
        .find((node) => node.textContent?.trim() === "查看会想起什么") as HTMLButtonElement).click();
    });
    await flushTasks();

    expect(searchCalls).toHaveLength(1);
    expect(searchCalls[0]).toEqual({
      workspaceId: undefined,
      query: {
        query: "当前会话偏好",
        topK: 10,
        scopeFilter: "all",
      },
    });

    await cleanupMemoryPage(root, container);
  });

  test("organize entry keeps a single toolbar action surface and renders preview output in body", async () => {
    installDomWindow();
    installDesktopBridges();

    const { container, root } = await renderMemoryPage();

    await clickEntryTab(container, "整理记忆");

    expect(container.querySelectorAll(".memory-page-compact-input")).toHaveLength(1);
    expect(getButtonCount(container, "开始整理")).toBe(1);
    expect(container.querySelectorAll(".memory-page-inline-controls")).toHaveLength(0);
    expect(container.textContent).toContain("按时间范围预览可以整理的记忆。");
    expect(container.textContent).toContain("目前没有需要整理的记忆。");

    await act(async () => {
      (Array.from(container.querySelectorAll("button"))
        .find((node) => node.textContent?.trim() === "开始整理") as HTMLButtonElement).click();
    });
    await flushTasks();

    expect(maintenanceCalls).toHaveLength(1);
    expect(container.textContent).toContain("0 条记忆将按当前规则整理。");

    await cleanupMemoryPage(root, container);
  });

  test("editor dialog shows workspace options loaded by the page when switching to workspace memory", async () => {
    installDomWindow();
    installDesktopBridges();

    const { container, root } = await renderMemoryPage();

    await clickButton(container, "手动添加");

    const modalSelects = Array.from(container.querySelectorAll(".memory-page-modal .ant-select"));
    const scopeSelect = modalSelects[1];

    if (!(scopeSelect instanceof HTMLElement)) {
      throw new Error("Scope select not found in editor dialog.");
    }

    await selectDropdownOption(scopeSelect, "工作区记忆");

    const workspaceSelect = container.querySelector(".memory-page-modal .memory-page-workspace-select");
    if (!(workspaceSelect instanceof HTMLElement)) {
      throw new Error("Workspace select not found in editor dialog.");
    }

    await openSelectDropdown(workspaceSelect);

    const optionTexts = Array.from(document.body.querySelectorAll(".ant-select-item-option"))
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter(Boolean);

    expect(optionTexts).toContain("Workspace A (workspace-a)");

    await selectDropdownOption(workspaceSelect, "Workspace A (workspace-a)");
    expect(workspaceSelect.textContent).toContain("Workspace A (workspace-a)");

    await cleanupMemoryPage(root, container);
  });
});
