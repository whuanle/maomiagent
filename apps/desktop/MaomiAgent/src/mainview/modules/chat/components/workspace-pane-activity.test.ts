import { describe, expect, test } from "bun:test";

import { resolveWorkspacePaneActivity } from "./workspace-pane-activity";

describe("resolveWorkspacePaneActivity", () => {
  test("keeps hidden workspace conversations active while the chat page stays open", () => {
    expect(resolveWorkspacePaneActivity({
      pageActive: true,
      workspaceId: "workspace-background",
      visibleWorkspaceId: "workspace-visible",
    })).toEqual({
      isVisible: false,
      conversationActive: true,
      viewActive: false,
    });
  });

  test("deactivates both conversation and view state when the chat page is hidden", () => {
    expect(resolveWorkspacePaneActivity({
      pageActive: false,
      workspaceId: "workspace-background",
      visibleWorkspaceId: "workspace-visible",
    })).toEqual({
      isVisible: false,
      conversationActive: false,
      viewActive: false,
    });
  });
});