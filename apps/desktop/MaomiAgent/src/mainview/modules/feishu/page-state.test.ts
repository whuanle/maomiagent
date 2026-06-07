import { afterEach, describe, expect, test } from "bun:test";
import type { WorkspaceRestoreState } from "../../lib/workspace";

import {
  mergeFeishuDocsUiStateWithWorkspaceRestore,
  readFeishuPagePersistentState,
  readSavedFeishuActiveWorkspaceId,
  writeFeishuPagePersistentState,
  writeSavedFeishuActiveWorkspaceId,
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

function createRestoreState(ui: Record<string, unknown>): WorkspaceRestoreState {
  return {
    workspaceId: "workspace_1",
    version: "1",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ui,
  };
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
      createRestoreState({
        feishuDocsWorkspace: {
          treeQuery: TEST_ROOT_TOKEN,
          treeRootDocId: TEST_ROOT_TOKEN,
          workspaceMode: "workspace",
        },
      }),
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

  test("round-trips tree snapshot state for docs workspace recovery", () => {
    installWindowStorage();

    writeFeishuPagePersistentState("workspace_1", {
      pageView: "docs-workspace",
      docs: {
        activeDocId: "doc_1",
        treeQuery: TEST_ROOT_TOKEN,
        treeRootDocId: TEST_ROOT_TOKEN,
        workspaceMode: "workspace",
        expandedKeys: ["folder_1"],
        checkedTreeKeys: ["doc_1"],
        treeNodes: [
          {
            key: "folder_1",
            title: "测试目录",
            loaded: true,
            isLeaf: false,
            doc: {
              id: "folder_1",
              token: "folder_1",
              docId: "folder_1",
              title: "测试目录",
              kind: "wiki_node",
              hasChild: true,
            },
            children: [
              {
                key: "doc_1",
                title: "测试文档",
                loaded: true,
                isLeaf: true,
                doc: {
                  id: "doc_1",
                  token: "doc_1",
                  docId: "doc_1",
                  title: "测试文档",
                  kind: "document",
                  hasChild: false,
                },
              },
            ],
          },
        ],
      },
    });

    expect(readFeishuPagePersistentState("workspace_1").docs).toMatchObject({
      activeDocId: "doc_1",
      expandedKeys: ["folder_1"],
      checkedTreeKeys: ["doc_1"],
      treeNodes: [
        {
          key: "folder_1",
          title: "测试目录",
          children: [
            {
              key: "doc_1",
              title: "测试文档",
            },
          ],
        },
      ],
    });
  });

  test("keeps local tree snapshot when merging workspace restore state", () => {
    const mergedState = mergeFeishuDocsUiStateWithWorkspaceRestore(
      {
        treeQuery: "",
        treeRootDocId: "",
        workspaceMode: "workspace",
        expandedKeys: ["folder_1"],
        checkedTreeKeys: ["doc_1"],
        treeNodes: [
          {
            key: "folder_1",
            title: "测试目录",
            loaded: true,
          },
        ],
      },
      {
        ...createRestoreState({
          feishuDocsWorkspace: {
            treeQuery: TEST_ROOT_TOKEN,
            treeRootDocId: TEST_ROOT_TOKEN,
            workspaceMode: "workspace",
          },
        }),
      },
    );

    expect(mergedState).toMatchObject({
      treeQuery: TEST_ROOT_TOKEN,
      treeRootDocId: TEST_ROOT_TOKEN,
      expandedKeys: ["folder_1"],
      checkedTreeKeys: ["doc_1"],
      treeNodes: [
        {
          key: "folder_1",
          title: "测试目录",
        },
      ],
    });
  });

  test("remembers the last active workspace id for docs workspace restore", () => {
    installWindowStorage();

    writeSavedFeishuActiveWorkspaceId("workspace_1");
    writeSavedFeishuActiveWorkspaceId("");

    expect(readSavedFeishuActiveWorkspaceId()).toBe("workspace_1");
  });

  test("restores checked tree keys from workspace restore state when local state is empty", () => {
    const mergedState = mergeFeishuDocsUiStateWithWorkspaceRestore(
      { treeQuery: "", treeRootDocId: "", workspaceMode: "workspace" },
      {
        ...createRestoreState({
          feishuDocsWorkspace: {
            treeQuery: TEST_ROOT_TOKEN,
            treeRootDocId: TEST_ROOT_TOKEN,
            workspaceMode: "workspace",
            checkedTreeKeys: ["doc_2", "doc_3"],
          },
        }),
      },
    );

    expect(mergedState).toMatchObject({
      treeQuery: TEST_ROOT_TOKEN,
      treeRootDocId: TEST_ROOT_TOKEN,
      checkedTreeKeys: ["doc_2", "doc_3"],
    });
  });
});
