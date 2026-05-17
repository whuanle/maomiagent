import { describe, expect, test } from "bun:test";

import {
  createMemoryDraft,
  resolveProjectionWorkspaceId,
} from "./helpers";

describe("memory page helpers", () => {
  test("keeps the default records query unbound to a workspace", () => {
    expect(resolveProjectionWorkspaceId("all", "workspace-a")).toBeUndefined();
    expect(resolveProjectionWorkspaceId("global", "workspace-a")).toBeUndefined();
  });

  test("allows workspace scope without forcing a single workspace id", () => {
    expect(resolveProjectionWorkspaceId("workspace", "")).toBeUndefined();
    expect(resolveProjectionWorkspaceId("workspace", " workspace-a ")).toBe("workspace-a");
  });

  test("creates a global draft by default outside workspace-only mode", () => {
    expect(createMemoryDraft("all", "workspace-a")).toMatchObject({
      scope: "global",
      workspaceId: "",
      kind: "note",
    });
  });

  test("reuses the selected workspace when creating a workspace memory", () => {
    expect(createMemoryDraft("workspace", " workspace-a ")).toMatchObject({
      scope: "workspace",
      workspaceId: "workspace-a",
      kind: "note",
    });
  });
});