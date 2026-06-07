import { describe, expect, test } from "bun:test";

import { partitionConversationOpenRequestsByWorkspace } from "./conversation-open-resolution";

describe("partitionConversationOpenRequestsByWorkspace", () => {
  test("keeps requests unresolved until the requested workspace appears", () => {
    expect(partitionConversationOpenRequestsByWorkspace({
      requests: [{
        workspaceId: "workspace-a",
        createSession: true,
        draftText: "read original markdown first",
      }],
      activeWorkspaceId: undefined,
      openWorkspaceIds: [],
      workspaceItems: [],
    })).toEqual({
      ready: [],
      unresolved: [{
        workspaceId: "workspace-a",
        createSession: true,
        draftText: "read original markdown first",
      }],
    });
  });

  test("releases queued requests once the requested workspace is available", () => {
    expect(partitionConversationOpenRequestsByWorkspace({
      requests: [{
        workspaceId: "workspace-a",
        createSession: true,
        draftText: "read original markdown first",
      }],
      activeWorkspaceId: "workspace-a",
      openWorkspaceIds: ["workspace-a"],
      workspaceItems: [{ workspaceId: "workspace-a" }],
    })).toEqual({
      ready: [{
        workspaceId: "workspace-a",
        request: {
          workspaceId: "workspace-a",
          createSession: true,
          draftText: "read original markdown first",
        },
      }],
      unresolved: [],
    });
  });

  test("preserves selectedAgentId when releasing queued requests", () => {
    expect(partitionConversationOpenRequestsByWorkspace({
      requests: [{
        workspaceId: "workspace-a",
        createSession: true,
        draftText: "read original markdown first",
        selectedAgentId: "feishu-doc-writer",
      }],
      activeWorkspaceId: "workspace-a",
      openWorkspaceIds: ["workspace-a"],
      workspaceItems: [{ workspaceId: "workspace-a" }],
    })).toEqual({
      ready: [{
        workspaceId: "workspace-a",
        request: {
          workspaceId: "workspace-a",
          createSession: true,
          draftText: "read original markdown first",
          selectedAgentId: "feishu-doc-writer",
        },
      }],
      unresolved: [],
    });
  });
});
