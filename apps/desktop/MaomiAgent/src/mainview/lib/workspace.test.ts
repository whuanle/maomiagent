import { afterEach, describe, expect, mock, test } from "bun:test";

type WorkspaceItem = {
  workspaceId: string;
  name: string;
  directoryPath: string;
  isPinned: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

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

const workspaceAlpha: WorkspaceItem = {
  workspaceId: "workspace-alpha",
  name: "Workspace Alpha",
  directoryPath: "E:/demo/alpha",
  isPinned: false,
  tags: [],
  createdAt: "2026-05-26T08:00:00.000Z",
  updatedAt: "2026-05-26T08:00:00.000Z",
};

const workspaceBeta: WorkspaceItem = {
  workspaceId: "workspace-beta",
  name: "Workspace Beta",
  directoryPath: "E:/demo/autowork",
  isPinned: false,
  tags: [],
  createdAt: "2026-05-26T08:00:00.000Z",
  updatedAt: "2026-05-26T08:00:00.000Z",
};

let listDesktopWorkspacesImpl = async () => ({
  items: [workspaceAlpha],
  meta: {
    total: 1,
    limit: 1,
    offset: 0,
    hasMore: false,
  },
});

let getDesktopWorkspaceImpl = async (_workspaceId: string) => null as WorkspaceItem | null;

mock.module("./desktop-workspace", () => ({
  listDesktopWorkspaces: (query?: unknown) => listDesktopWorkspacesImpl(query),
  getDesktopWorkspace: (workspaceId: string) => getDesktopWorkspaceImpl(workspaceId),
}));

const { fetchActiveWorkspace } = await import("./workspace");

function installWindowStorage(): MemoryStorage {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: storage,
    },
  });
  return storage;
}

describe("workspace helpers", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
    listDesktopWorkspacesImpl = async () => ({
      items: [workspaceAlpha],
      meta: {
        total: 1,
        limit: 1,
        offset: 0,
        hasMore: false,
      },
    });
    getDesktopWorkspaceImpl = async () => null;
  });

  test("fetchActiveWorkspace prefers the active workspace from chat workspace tabs state", async () => {
    const storage = installWindowStorage();
    storage.setItem("maomiagent.chat.workspace-tabs.v1", JSON.stringify({
      openWorkspaceIds: [workspaceAlpha.workspaceId, workspaceBeta.workspaceId],
      activeWorkspaceId: workspaceBeta.workspaceId,
    }));

    listDesktopWorkspacesImpl = async () => ({
      items: [workspaceAlpha],
      meta: {
        total: 2,
        limit: 1,
        offset: 0,
        hasMore: true,
      },
    });
    getDesktopWorkspaceImpl = async (workspaceId: string) => (
      workspaceId === workspaceBeta.workspaceId ? workspaceBeta : null
    );

    await expect(fetchActiveWorkspace("desktop://feishu")).resolves.toEqual({
      item: workspaceBeta,
      active: workspaceBeta,
    });
  });

  test("fetchActiveWorkspace falls back to the first listed workspace when the stored active workspace is unavailable", async () => {
    const storage = installWindowStorage();
    storage.setItem("maomiagent.chat.workspace-tabs.v1", JSON.stringify({
      openWorkspaceIds: [workspaceBeta.workspaceId],
      activeWorkspaceId: workspaceBeta.workspaceId,
    }));

    listDesktopWorkspacesImpl = async () => ({
      items: [workspaceAlpha],
      meta: {
        total: 1,
        limit: 1,
        offset: 0,
        hasMore: false,
      },
    });
    getDesktopWorkspaceImpl = async () => null;

    await expect(fetchActiveWorkspace("desktop://feishu")).resolves.toEqual({
      item: workspaceAlpha,
      active: workspaceAlpha,
    });
  });

  test("fetchActiveWorkspace falls back to the first listed workspace when reading the stored active workspace fails", async () => {
    const storage = installWindowStorage();
    storage.setItem("maomiagent.chat.workspace-tabs.v1", JSON.stringify({
      openWorkspaceIds: [workspaceBeta.workspaceId],
      activeWorkspaceId: workspaceBeta.workspaceId,
    }));

    listDesktopWorkspacesImpl = async () => ({
      items: [workspaceAlpha],
      meta: {
        total: 1,
        limit: 1,
        offset: 0,
        hasMore: false,
      },
    });
    getDesktopWorkspaceImpl = async () => {
      throw new Error("lookup failed");
    };

    await expect(fetchActiveWorkspace("desktop://feishu")).resolves.toEqual({
      item: workspaceAlpha,
      active: workspaceAlpha,
    });
  });
});