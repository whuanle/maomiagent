import { describe, expect, test } from "bun:test";

import {
  resolveNextSessionId,
  resolvePreferredSessionIdForRuntimeReload,
} from "./session-selection";

describe("session selection", () => {
  test("keeps the current session when a background runtime update arrives", () => {
    expect(resolvePreferredSessionIdForRuntimeReload({
      currentSessionId: "session-current",
      runtimeSessionId: "session-background",
    })).toBeUndefined();
  });

  test("allows runtime reload to keep focus when no session is selected yet", () => {
    expect(resolvePreferredSessionIdForRuntimeReload({
      currentSessionId: undefined,
      runtimeSessionId: "session-streaming",
    })).toBe("session-streaming");
  });

  test("resolveNextSessionId still prefers the requested session when allowed", () => {
    expect(resolveNextSessionId([
      {
        sessionId: "session-a",
        workspaceId: "workspace-1",
        title: "A",
        status: "idle",
        createdAt: "2026-05-06T00:00:00.000Z",
        updatedAt: "2026-05-06T00:00:00.000Z",
      },
      {
        sessionId: "session-b",
        workspaceId: "workspace-1",
        title: "B",
        status: "active",
        createdAt: "2026-05-06T00:00:00.000Z",
        updatedAt: "2026-05-06T00:00:01.000Z",
      },
    ], "session-a", "session-b")).toBe("session-b");
  });
});