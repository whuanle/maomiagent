import { afterEach, describe, expect, mock, test } from "bun:test";

import type { DesktopWorkspaceItem } from "../../shared/desktop-workspace";

function createWorkspace(overrides: Partial<DesktopWorkspaceItem>): DesktopWorkspaceItem {
  return {
    workspaceId: "workspace-a",
    name: "Workspace A",
    directoryPath: "E:/workspace/a",
    isPinned: false,
    tags: [],
    createdAt: "2026-06-07T00:00:00.000Z",
    updatedAt: "2026-06-07T00:00:00.000Z",
    ...overrides,
  };
}

let listDesktopWorkspacesImpl = async () => ({
  items: [
    createWorkspace({ workspaceId: "workspace-a", name: "Project A" }),
    createWorkspace({
      workspaceId: "wechat-user-1",
      name: "WeChat User",
      directoryPath: "C:/Users/demo/.maomiagent/desktop/workspaces/channels/wechat/user-1",
    }),
    createWorkspace({
      workspaceId: "feishu-user-1",
      name: "Feishu User",
      directoryPath: "C:/Users/demo/.maomiagent/desktop/workspaces/channels/feishu/user-1",
    }),
  ],
  meta: {
    total: 3,
    limit: 200,
    offset: 0,
    hasMore: false,
  },
});

mock.module("../lib/desktop-workspace", () => ({
  listDesktopWorkspaces: () => listDesktopWorkspacesImpl(),
}));

const {
  getAllWorkspaces,
  getNormalWorkspaces,
  toWorkspaceOptions,
} = await import("./workspace-query-service");

describe("workspace query service", () => {
  afterEach(() => {
    listDesktopWorkspacesImpl = async () => ({
      items: [
        createWorkspace({ workspaceId: "workspace-a", name: "Project A" }),
        createWorkspace({
          workspaceId: "wechat-user-1",
          name: "WeChat User",
          directoryPath: "C:/Users/demo/.maomiagent/desktop/workspaces/channels/wechat/user-1",
        }),
        createWorkspace({
          workspaceId: "feishu-user-1",
          name: "Feishu User",
          directoryPath: "C:/Users/demo/.maomiagent/desktop/workspaces/channels/feishu/user-1",
        }),
      ],
      meta: {
        total: 3,
        limit: 200,
        offset: 0,
        hasMore: false,
      },
    });
  });

  test("getAllWorkspaces returns every workspace from the bridge", async () => {
    await expect(getAllWorkspaces({ limit: 200, offset: 0 })).resolves.toEqual([
      createWorkspace({ workspaceId: "workspace-a", name: "Project A" }),
      createWorkspace({
        workspaceId: "wechat-user-1",
        name: "WeChat User",
        directoryPath: "C:/Users/demo/.maomiagent/desktop/workspaces/channels/wechat/user-1",
      }),
      createWorkspace({
        workspaceId: "feishu-user-1",
        name: "Feishu User",
        directoryPath: "C:/Users/demo/.maomiagent/desktop/workspaces/channels/feishu/user-1",
      }),
    ]);
  });

  test("getNormalWorkspaces filters dedicated channel workspaces", async () => {
    await expect(getNormalWorkspaces({ limit: 200, offset: 0 })).resolves.toEqual([
      createWorkspace({ workspaceId: "workspace-a", name: "Project A" }),
    ]);
  });

  test("toWorkspaceOptions builds stable labels and values", () => {
    expect(toWorkspaceOptions([
      createWorkspace({ workspaceId: "workspace-a", name: "Project A" }),
    ])).toEqual([
      { label: "Project A (workspace-a)", value: "workspace-a" },
    ]);
  });
});
