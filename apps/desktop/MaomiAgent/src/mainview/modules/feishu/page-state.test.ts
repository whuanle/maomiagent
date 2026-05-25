import { afterEach, describe, expect, test } from "bun:test";

import {
  mergeFeishuDocsUiStateWithWorkspaceRestore,
  readFeishuPagePersistentState,
  writeFeishuPagePersistentState,
} from "./page-state";

const TEST_ROOT_TOKEN = "GkfewPcB0ibJMMkXGZucdgR8nhh";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

function installWindowStorage(): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: new MemoryStorage(),
    },
  });
}

describe("Feishu page state helpers", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  test("keeps a saved docs root token when a later UI write carries empty tree state", () => {
    installWindowStorage();

    writeFeishuPagePersistentState("workspace_1", {
      pageView: "docs-workspace",
      docs: {
        treeQuery: TEST_ROOT_TOKEN,
        treeRootDocId: TEST_ROOT_TOKEN,
        workspaceMode: "workspace",
      },
    });
    writeFeishuPagePersistentState("workspace_1", {
      pageView: "docs-workspace",
      docs: {
        activeDocId: "doc_1",
        treeQuery: "",
        treeRootDocId: "",
        workspaceMode: "workspace",
      },
    });

    expect(readFeishuPagePersistentState("workspace_1").docs).toMatchObject({
      activeDocId: "doc_1",
      treeQuery: TEST_ROOT_TOKEN,
      treeRootDocId: TEST_ROOT_TOKEN,
    });
  });

  test("restores a docs root token from workspace UI state when local state is empty", () => {
    const mergedState = mergeFeishuDocsUiStateWithWorkspaceRestore(
      { treeQuery: "", treeRootDocId: "", workspaceMode: "workspace" },
      {
        ui: {
          feishuDocsWorkspace: {
            treeQuery: TEST_ROOT_TOKEN,
            treeRootDocId: TEST_ROOT_TOKEN,
            workspaceMode: "workspace",
          },
        },
      },
    );

    expect(mergedState).toMatchObject({
      treeQuery: TEST_ROOT_TOKEN,
      treeRootDocId: TEST_ROOT_TOKEN,
    });
  });

  test("restores the last saved docs root token when the active workspace has no page-state yet", () => {
    installWindowStorage();

    writeFeishuPagePersistentState("global", {
      pageView: "docs-workspace",
      docs: {
        treeQuery: TEST_ROOT_TOKEN,
        treeRootDocId: TEST_ROOT_TOKEN,
        workspaceMode: "workspace",
      },
    });

    expect(readFeishuPagePersistentState("workspace_without_state").docs).toMatchObject({
      treeQuery: TEST_ROOT_TOKEN,
      treeRootDocId: TEST_ROOT_TOKEN,
    });
  });

  test("restores the last saved docs root token when workspace page-state only has an active doc", () => {
    installWindowStorage();

    writeFeishuPagePersistentState("workspace_1", {
      pageView: "docs-workspace",
      docs: {
        treeQuery: TEST_ROOT_TOKEN,
        treeRootDocId: TEST_ROOT_TOKEN,
        workspaceMode: "workspace",
      },
    });
    window.localStorage.setItem("maomi.feishu.page-state:workspace_2", JSON.stringify({
      pageView: "docs-workspace",
      docs: {
        activeDocId: "doc_1",
        treeQuery: "",
        treeRootDocId: "",
        workspaceMode: "workspace",
      },
    }));

    expect(readFeishuPagePersistentState("workspace_2").docs).toMatchObject({
      activeDocId: "doc_1",
      treeQuery: TEST_ROOT_TOKEN,
      treeRootDocId: TEST_ROOT_TOKEN,
    });
  });
});