import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const runtimeTestState = {
  persistedState: null,
  workspaceItems: [],
  workspaceLoadPromise: null,
  workspaceLoadQueue: [],
  writeCalls: [],
};

const fakeReactRuntime = {
  current: null,
};

globalThis.__MAOMI_GIT_PAGE_TEST_STATE = runtimeTestState;
globalThis.__MAOMI_GIT_PAGE_FAKE_REACT = fakeReactRuntime;

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalNavigator = globalThis.navigator;
const originalLocalStorage = globalThis.localStorage;
const originalSelf = globalThis.self;

const tempModuleDir = mkdtempSync(join(tmpdir(), "maomi-git-page-persistence-"));
const transpiler = new Bun.Transpiler({
  loader: "tsx",
  tsconfig: JSON.stringify({
    compilerOptions: {
      jsx: "react",
      jsxFactory: "createElement",
      target: "ES2022",
    },
  }),
});

process.on("exit", () => {
  rmSync(tempModuleDir, { force: true, recursive: true });
});

function installTestWindow() {
  const listeners = new Map();
  const localStorage = new Map();

  const windowValue = {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    dispatchEvent(event) {
      const handler = listeners.get(event.type);
      if (!handler) {
        return false;
      }

      handler(event);
      return true;
    },
    setTimeout,
    clearTimeout,
    location: { hash: "#git" },
    localStorage: {
      getItem(key) {
        return localStorage.get(key) ?? null;
      },
      setItem(key, value) {
        localStorage.set(key, value);
      },
      removeItem(key) {
        localStorage.delete(key);
      },
    },
  };

  globalThis.window = windowValue;
  globalThis.document = undefined;
  globalThis.navigator = undefined;
  globalThis.localStorage = windowValue.localStorage;
  globalThis.self = windowValue;
}

function restoreGlobals() {
  globalThis.window = originalWindow;
  globalThis.document = originalDocument;
  globalThis.navigator = originalNavigator;
  globalThis.localStorage = originalLocalStorage;
  globalThis.self = originalSelf;
}

function writeStubModules() {
  writeFileSync(join(tempModuleDir, "react.stub.mjs"), `
const runtime = globalThis.__MAOMI_GIT_PAGE_FAKE_REACT;

function areDepsEqual(nextDeps, prevDeps) {
  if (!nextDeps || !prevDeps || nextDeps.length !== prevDeps.length) {
    return false;
  }

  return nextDeps.every((dep, index) => dep === prevDeps[index]);
}

export function createElement(type, props, ...children) {
  const normalizedChildren = children.length <= 1 ? children[0] ?? null : children;
  return {
    type,
    props: {
      ...(props ?? {}),
      children: normalizedChildren,
    },
  };
}

export function forwardRef(render) {
  return function ForwardRefComponent(props) {
    return render(props, null);
  };
}

export function useState(initialValue) {
  const ctx = runtime.current;
  const hookIndex = ctx.hookIndex++;

  if (!(hookIndex in ctx.hooks)) {
    ctx.hooks[hookIndex] = typeof initialValue === "function" ? initialValue() : initialValue;
  }

  const setState = (nextValue) => {
    const currentValue = ctx.hooks[hookIndex];
    const resolvedValue = typeof nextValue === "function" ? nextValue(currentValue) : nextValue;
    if (resolvedValue !== currentValue) {
      ctx.hooks[hookIndex] = resolvedValue;
      ctx.dirty = true;
    }
  };

  return [ctx.hooks[hookIndex], setState];
}

export function useRef(initialValue) {
  const ctx = runtime.current;
  const hookIndex = ctx.hookIndex++;

  if (!(hookIndex in ctx.hooks)) {
    ctx.hooks[hookIndex] = { current: initialValue };
  }

  return ctx.hooks[hookIndex];
}

export function useEffect(effect, deps) {
  const ctx = runtime.current;
  const hookIndex = ctx.hookIndex++;
  const previous = ctx.hooks[hookIndex];

  if (!previous || !areDepsEqual(deps, previous.deps)) {
    ctx.pendingEffects.push(effect);
  }

  ctx.hooks[hookIndex] = { deps };
}

export function useCallback(callback) {
  const ctx = runtime.current;
  ctx.hookIndex++;
  return callback;
}

export function useMemo(factory, deps) {
  const ctx = runtime.current;
  const hookIndex = ctx.hookIndex++;
  const previous = ctx.hooks[hookIndex];

  if (previous && areDepsEqual(deps, previous.deps)) {
    return previous.value;
  }

  const value = factory();
  ctx.hooks[hookIndex] = { deps, value };
  return value;
}

export function useImperativeHandle() {
  const ctx = runtime.current;
  ctx.hookIndex++;
}
`);

  writeFileSync(join(tempModuleDir, "antd-icons.stub.mjs"), `
import { createElement } from "./react.stub.mjs";

export function ReloadOutlined() {
  return createElement("reload-icon", {});
}
`);

  writeFileSync(join(tempModuleDir, "antd.stub.mjs"), `
import { createElement } from "./react.stub.mjs";

export function App(props) {
  return props.children;
}

App.useApp = () => ({
  message: {
    error() {},
  },
});

export function Button(props) {
  return createElement("button", props, props.children);
}

export function Empty(props) {
  return createElement("empty", props, props.description);
}

export const Modal = {
  useModal() {
    return [{ confirm: async () => true }, null];
  },
};

export function Select(props) {
  return createElement("select", props, null);
}

export function Tabs(props) {
  const activeItem = props.items.find((item) => item.key === props.activeKey);
  return createElement(
    "tabs",
    { className: props.className },
    props.tabBarExtraContent?.left ?? null,
    activeItem?.children ?? null,
  );
}
`);

  writeFileSync(join(tempModuleDir, "branch-copy.stub.mjs"), `
export function createGitBranchCopy() {
  return {};
}
`);

  writeFileSync(join(tempModuleDir, "branch-workbench.stub.mjs"), `
import { createElement } from "./react.stub.mjs";

export function GitBranchWorkbench(props) {
  return createElement("git-branch-workbench", { workspaceId: props.workspaceId });
}
`);

  writeFileSync(join(tempModuleDir, "changes-workbench.stub.mjs"), `
import { createElement } from "./react.stub.mjs";

export function GitChangesWorkbench(props) {
  return createElement("git-changes-workbench", { workspaceId: props.workspaceId });
}
`);

  writeFileSync(join(tempModuleDir, "commit-review-workbench.stub.mjs"), `
import { createElement } from "./react.stub.mjs";

export function GitCommitReviewWorkbench(props) {
  return createElement("git-commit-review-workbench", { workspaceId: props.workspaceId });
}
`);

  writeFileSync(join(tempModuleDir, "git-ai-review-workbench-next.stub.mjs"), `
export function hasGitReviewWorkbenchCachedResults() {
  return false;
}
`);

  writeFileSync(join(tempModuleDir, "desktop-git.stub.mjs"), `
export const DESKTOP_GIT_BRIDGE_READY_EVENT = "maomi.desktop.git-bridge-ready";

export async function getDesktopGitModuleSnapshot(workspaceId) {
  return {
    workspaceId,
    changes: null,
  };
}

export function hasDesktopGitBridge() {
  return true;
}
`);

  writeFileSync(join(tempModuleDir, "desktop-workspace.stub.mjs"), `
const state = globalThis.__MAOMI_GIT_PAGE_TEST_STATE;

export async function listDesktopWorkspaces() {
  const queuedLoad = state.workspaceLoadQueue.shift();

  if (queuedLoad?.promise) {
    await queuedLoad.promise;
  } else if (state.workspaceLoadPromise) {
    await state.workspaceLoadPromise;
  }

  const items = queuedLoad?.items ?? state.workspaceItems;

  return {
    items: items.map((item) => ({
      workspaceId: item.workspaceId,
      name: item.name,
      directoryPath: \`E:/workspace/\${item.workspaceId}\`,
      isPinned: false,
      tags: [],
      createdAt: "2026-05-31T00:00:00.000Z",
      updatedAt: "2026-05-31T00:00:00.000Z",
    })),
    meta: {
      total: state.workspaceItems.length,
      limit: 200,
      offset: 0,
      hasMore: false,
    },
  };
}
`);

  writeFileSync(join(tempModuleDir, "desktop-workspace-filter.stub.mjs"), `
export function filterSelectableDesktopWorkspaces(items) {
  return items.filter((item) => {
    const workspaceId = item.workspaceId.trim().toLowerCase();
    const directoryPath = (item.directoryPath ?? "").trim().replace(/\\\\/g, "/").toLowerCase();
    if (workspaceId.startsWith("wechat-") || workspaceId.startsWith("feishu-")) {
      return false;
    }

    return !directoryPath.includes("/desktop/workspaces/channels/wechat/")
      && !directoryPath.includes("/desktop/workspaces/channels/feishu/");
  });
}
`);

  writeFileSync(join(tempModuleDir, "git-page-ui-state.stub.mjs"), `
const state = globalThis.__MAOMI_GIT_PAGE_TEST_STATE;

export function readGitPageUiState() {
  return state.persistedState;
}

export function writeGitPageUiState(nextState) {
  state.writeCalls.push(nextState);
}
`);

  writeFileSync(join(tempModuleDir, "i18n.stub.mjs"), `
export function createGitTranslator() {
  return {
    loadFailed: "Load failed",
    workspacePlaceholder: "Select workspace",
    refresh: "Refresh",
    changesTab: "Changes",
    branchesTab: "Branches",
      worktreesTab: "Worktrees",
    settingsTab: "Settings",
    commitReviewTab: "Commit Review",
    emptyNoBridge: "No bridge",
    emptyNoWorkspace: "No workspace",
  };
}
`);

  writeFileSync(join(tempModuleDir, "page.css.stub.mjs"), "export {};\n");
}

function buildRunnablePageModule() {
  writeStubModules();

  const source = readFileSync(join(import.meta.dir, "page.tsx"), "utf8")
    .replace(
      `import {\n  forwardRef,\n  useCallback,\n  useEffect,\n  useImperativeHandle,\n  useMemo,\n  useRef,\n  useState,\n} from "react";`,
      `import {\n  createElement,\n  forwardRef,\n  useCallback,\n  useEffect,\n  useImperativeHandle,\n  useMemo,\n  useRef,\n  useState,\n} from "./react.stub.mjs";`,
    )
    .replace(`import { ReloadOutlined } from "@ant-design/icons";`, `import { ReloadOutlined } from "./antd-icons.stub.mjs";`)
    .replace(
      `import {\n  App as AntdApp,\n  Button,\n  Empty,\n  Modal,\n  Select,\n  Tabs,\n} from "antd";`,
      `import {\n  App as AntdApp,\n  Button,\n  Empty,\n  Modal,\n  Select,\n  Tabs,\n} from "./antd.stub.mjs";`,
    )
    .replace(`import { listDesktopWorkspaces } from "../../lib/desktop-workspace";`, `import { listDesktopWorkspaces } from "./desktop-workspace.stub.mjs";`)
    .replace(`import { filterSelectableDesktopWorkspaces } from "../../lib/desktop-workspace-filter";`, `import { filterSelectableDesktopWorkspaces } from "./desktop-workspace-filter.stub.mjs";`)
    .replace(`} from "../../lib/desktop-git";`, `} from "./desktop-git.stub.mjs";`)
    .replace(`import { createGitBranchCopy } from "./branch-copy";`, `import { createGitBranchCopy } from "./branch-copy.stub.mjs";`)
    .replace(`import { GitBranchWorkbench } from "./components/branch-workbench";`, `import { GitBranchWorkbench } from "./branch-workbench.stub.mjs";`)
    .replace(`import { GitChangesWorkbench } from "./components/changes-workbench";`, `import { GitChangesWorkbench } from "./changes-workbench.stub.mjs";`)
    .replace(`import { GitCommitReviewWorkbench } from "./components/git-commit-review-workbench";`, `import { GitCommitReviewWorkbench } from "./commit-review-workbench.stub.mjs";`)
    .replace(`import { hasGitReviewWorkbenchCachedResults } from "./components/git-ai-review-workbench-next";`, `import { hasGitReviewWorkbenchCachedResults } from "./git-ai-review-workbench-next.stub.mjs";`)
    .replace(`} from "./git-page-ui-state";`, `} from "./git-page-ui-state.stub.mjs";`)
    .replace(`import { createGitTranslator } from "./i18n";`, `import { createGitTranslator } from "./i18n.stub.mjs";`)
    .replace(`import "./page.css";`, `import "./page.css.stub.mjs";`);

  const compiled = transpiler.transformSync(source);
  const pageModulePath = join(tempModuleDir, "page.runtime.mjs");
  writeFileSync(pageModulePath, compiled);
  return pageModulePath;
}

const pageModulePath = buildRunnablePageModule();

function findNodeByType(node, type) {
  if (!node || typeof node !== "object") {
    return null;
  }

  if (node.type === type) {
    return node;
  }

  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const match = findNodeByType(child, type);
      if (match) {
        return match;
      }
    }
    return null;
  }

  return findNodeByType(children, type);
}

function resolveRenderedTree(node) {
  if (!node || typeof node !== "object") {
    return node;
  }

  if (typeof node.type === "function") {
    return resolveRenderedTree(node.type(node.props ?? {}));
  }

  const children = node.props?.children;
  const resolvedChildren = Array.isArray(children)
    ? children.map((child) => resolveRenderedTree(child))
    : resolveRenderedTree(children);

  return {
    ...node,
    props: {
      ...(node.props ?? {}),
      children: resolvedChildren,
    },
  };
}

async function renderGitPage(props = { active: true, language: "en-US" }) {
  installTestWindow();

  const module = await import(`${pathToFileURL(pageModulePath).href}?t=${Date.now()}-${Math.random()}`);
  let currentProps = props;
  const instance = {
    hooks: [],
    hookIndex: 0,
    pendingEffects: [],
    dirty: false,
  };

  const session = {
    tree: null,
    async flush(maxIterations = 10) {
      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        instance.hookIndex = 0;
        instance.pendingEffects = [];
        instance.dirty = false;
        fakeReactRuntime.current = instance;
        session.tree = resolveRenderedTree(module.GitPage(currentProps));
        fakeReactRuntime.current = null;

        for (const effect of instance.pendingEffects) {
          effect();
        }

        await Promise.resolve();
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        if (!instance.dirty) {
          break;
        }
      }

      return session.tree;
    },
    setProps(nextProps) {
      currentProps = {
        ...currentProps,
        ...nextProps,
      };
    },
  };

  await session.flush();
  return session;
}

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

afterEach(() => {
  runtimeTestState.persistedState = null;
  runtimeTestState.workspaceItems = [];
  runtimeTestState.workspaceLoadPromise = null;
  runtimeTestState.workspaceLoadQueue = [];
  runtimeTestState.writeCalls.length = 0;
  restoreGlobals();
});

test("restores the persisted workspace when it still exists", async () => {
  runtimeTestState.persistedState = {
    workspaceId: "workspace-b",
  };
  runtimeTestState.workspaceItems = [
    { workspaceId: "workspace-a", name: "Workspace A" },
    { workspaceId: "workspace-b", name: "Workspace B" },
  ];

  const page = await renderGitPage();
  const changesWorkbench = findNodeByType(page.tree, "git-changes-workbench");

  expect(changesWorkbench?.props.workspaceId).toBe("workspace-b");
  expect(runtimeTestState.writeCalls.at(-1)?.workspaceId).toBe("workspace-b");
});

test("filters dedicated channel workspaces from the selector options", async () => {
  runtimeTestState.persistedState = {
    workspaceId: "workspace-a",
  };
  runtimeTestState.workspaceItems = [
    { workspaceId: "wechat-user-1", name: "WeChat User" },
    { workspaceId: "workspace-a", name: "Workspace A" },
    { workspaceId: "feishu-user-1", name: "Feishu User" },
  ];

  const page = await renderGitPage();
  const select = findNodeByType(page.tree, "select");

  expect(select?.props.options).toEqual([
    { label: "Workspace A (workspace-a)", value: "workspace-a" },
  ]);
  expect(findNodeByType(page.tree, "git-changes-workbench")?.props.workspaceId).toBe("workspace-a");
});

test("falls back to the first workspace when the persisted workspace is missing", async () => {
  runtimeTestState.persistedState = {
    workspaceId: "workspace-missing",
  };
  runtimeTestState.workspaceItems = [
    { workspaceId: "workspace-a", name: "Workspace A" },
    { workspaceId: "workspace-b", name: "Workspace B" },
  ];

  const page = await renderGitPage();
  const changesWorkbench = findNodeByType(page.tree, "git-changes-workbench");

  expect(changesWorkbench?.props.workspaceId).toBe("workspace-a");
  expect(runtimeTestState.writeCalls.at(-1)?.workspaceId).toBe("workspace-a");
});

test("falls back to the rendered tabs when hydration restores a legacy code-review tab", async () => {
  runtimeTestState.persistedState = {
    workspaceId: "workspace-b",
    activeTab: "code-review",
    codeReview: {
      selectedFilePath: "legacy.ts",
    },
  };
  runtimeTestState.workspaceItems = [
    { workspaceId: "workspace-a", name: "Workspace A" },
    { workspaceId: "workspace-b", name: "Workspace B" },
  ];

  const page = await renderGitPage();
  const changesWorkbench = findNodeByType(page.tree, "git-changes-workbench");

  expect(changesWorkbench?.props.workspaceId).toBe("workspace-b");
  expect(runtimeTestState.writeCalls.at(-1)?.activeTab).toBe("changes");
});

test("does not write an empty workspace before restore resolution completes", async () => {
  const deferred = createDeferred();
  runtimeTestState.persistedState = {
    workspaceId: "workspace-b",
  };
  runtimeTestState.workspaceItems = [
    { workspaceId: "workspace-a", name: "Workspace A" },
    { workspaceId: "workspace-b", name: "Workspace B" },
  ];
  runtimeTestState.workspaceLoadPromise = deferred.promise;

  const page = await renderGitPage();

  expect(runtimeTestState.writeCalls).toHaveLength(0);

  deferred.resolve();
  await page.flush();
  const changesWorkbench = findNodeByType(page.tree, "git-changes-workbench");

  expect(changesWorkbench?.props.workspaceId).toBe("workspace-b");
  expect(runtimeTestState.writeCalls.at(-1)?.workspaceId).toBe("workspace-b");
});

test("ignores a stale in-flight workspace load after deactivation and reactivation", async () => {
  const staleLoad = createDeferred();
  const currentLoad = createDeferred();

  runtimeTestState.persistedState = {
    workspaceId: "workspace-stale",
  };
  runtimeTestState.workspaceItems = [
    { workspaceId: "workspace-stale", name: "Workspace Stale" },
    { workspaceId: "workspace-a", name: "Workspace A" },
  ];
  runtimeTestState.workspaceLoadPromise = staleLoad.promise;

  const page = await renderGitPage();
  expect(runtimeTestState.writeCalls).toHaveLength(0);

  page.setProps({ active: false });
  await page.flush();

  runtimeTestState.persistedState = {
    workspaceId: "workspace-b",
  };
  runtimeTestState.workspaceItems = [
    { workspaceId: "workspace-a", name: "Workspace A" },
    { workspaceId: "workspace-b", name: "Workspace B" },
  ];
  runtimeTestState.workspaceLoadPromise = currentLoad.promise;

  page.setProps({ active: true });
  await page.flush();
  expect(runtimeTestState.writeCalls).toHaveLength(0);

  staleLoad.resolve();
  await page.flush();
  expect(runtimeTestState.writeCalls).toHaveLength(0);

  currentLoad.resolve();
  await page.flush();

  const changesWorkbench = findNodeByType(page.tree, "git-changes-workbench");
  expect(changesWorkbench?.props.workspaceId).toBe("workspace-b");
  expect(runtimeTestState.writeCalls.at(-1)?.workspaceId).toBe("workspace-b");
});

test("prefers the restored workspace over the previous cycle workspace on reactivation", async () => {
  runtimeTestState.persistedState = {
    workspaceId: "workspace-a",
  };
  runtimeTestState.workspaceItems = [
    { workspaceId: "workspace-a", name: "Workspace A" },
    { workspaceId: "workspace-b", name: "Workspace B" },
  ];

  const page = await renderGitPage();
  expect(findNodeByType(page.tree, "git-changes-workbench")?.props.workspaceId).toBe("workspace-a");

  page.setProps({ active: false });
  await page.flush();

  runtimeTestState.persistedState = {
    workspaceId: "workspace-b",
  };
  runtimeTestState.workspaceItems = [
    { workspaceId: "workspace-a", name: "Workspace A" },
    { workspaceId: "workspace-b", name: "Workspace B" },
  ];

  page.setProps({ active: true });
  await page.flush();

  const changesWorkbench = findNodeByType(page.tree, "git-changes-workbench");
  expect(changesWorkbench?.props.workspaceId).toBe("workspace-b");
  expect(runtimeTestState.writeCalls.at(-1)?.workspaceId).toBe("workspace-b");
});

test("ignores an older overlapping workspace load after a newer refresh in the same cycle", async () => {
  const olderLoad = createDeferred();
  const newerLoad = createDeferred();

  runtimeTestState.persistedState = {
    workspaceId: "workspace-b",
  };
  runtimeTestState.workspaceItems = [
    { workspaceId: "workspace-a", name: "Workspace A" },
    { workspaceId: "workspace-b", name: "Workspace B" },
  ];

  const page = await renderGitPage();
  expect(findNodeByType(page.tree, "git-changes-workbench")?.props.workspaceId).toBe("workspace-b");

  runtimeTestState.workspaceLoadQueue = [
    {
      items: [{ workspaceId: "workspace-a", name: "Workspace A" }],
      promise: olderLoad.promise,
    },
    {
      items: [
        { workspaceId: "workspace-a", name: "Workspace A" },
        { workspaceId: "workspace-b", name: "Workspace B" },
      ],
      promise: newerLoad.promise,
    },
  ];

  const refreshButton = findNodeByType(page.tree, "button");
  refreshButton?.props.onClick?.();
  refreshButton?.props.onClick?.();

  newerLoad.resolve();
  await page.flush();

  let changesWorkbench = findNodeByType(page.tree, "git-changes-workbench");
  expect(changesWorkbench?.props.workspaceId).toBe("workspace-b");
  expect(runtimeTestState.writeCalls.at(-1)?.workspaceId).toBe("workspace-b");

  olderLoad.resolve();
  await page.flush();

  changesWorkbench = findNodeByType(page.tree, "git-changes-workbench");
  expect(changesWorkbench?.props.workspaceId).toBe("workspace-b");
  expect(runtimeTestState.writeCalls.at(-1)?.workspaceId).toBe("workspace-b");
});
