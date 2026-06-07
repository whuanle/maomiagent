import { describe, expect, test } from "bun:test";

import type { DesktopWorkspaceItem } from "../../shared/desktop-workspace";
import {
  filterSelectableDesktopWorkspaces,
  isDedicatedExternalWorkspace,
} from "./desktop-workspace-filter";

function createWorkspace(overrides: Partial<DesktopWorkspaceItem>): DesktopWorkspaceItem {
  return {
    workspaceId: "workspace-a",
    name: "Workspace A",
    directoryPath: "E:/workspace/a",
    isPinned: false,
    tags: [],
    createdAt: "2026-06-05T00:00:00.000Z",
    updatedAt: "2026-06-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("desktop workspace filter", () => {
  test("keeps ordinary workspaces selectable", () => {
    expect(isDedicatedExternalWorkspace(createWorkspace({}))).toBe(false);
  });

  test("filters WeChat and Feishu dedicated workspaces by directory path", () => {
    const items = filterSelectableDesktopWorkspaces([
      createWorkspace({ workspaceId: "workspace-a" }),
      createWorkspace({
        workspaceId: "workspace-b",
        directoryPath: "C:\\Users\\demo\\.maomiagent\\desktop\\workspaces\\channels\\wechat\\wechat-user-1",
      }),
      createWorkspace({
        workspaceId: "workspace-c",
        directoryPath: "C:/Users/demo/.maomiagent/desktop/workspaces/channels/feishu/feishu-user-1",
      }),
    ]);

    expect(items.map((item) => item.workspaceId)).toEqual(["workspace-a"]);
  });

  test("filters historical dedicated workspaces by workspace id prefix", () => {
    const items = filterSelectableDesktopWorkspaces([
      createWorkspace({ workspaceId: "wechat-user-legacy", directoryPath: "E:/workspace/wechat-legacy" }),
      createWorkspace({ workspaceId: "feishu-session-legacy", directoryPath: "E:/workspace/feishu-legacy" }),
      createWorkspace({ workspaceId: "workspace-z", directoryPath: "E:/workspace/z" }),
    ]);

    expect(items.map((item) => item.workspaceId)).toEqual(["workspace-z"]);
  });
});
