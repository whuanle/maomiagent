import { describe, expect, test } from "bun:test";

import { createDiscardWorkspaceChangesHandler } from "./direct-session-discard-workspace-changes";

describe("createDiscardWorkspaceChangesHandler", () => {
  test("returns undefined when no workspace is selected", () => {
    expect(createDiscardWorkspaceChangesHandler("")).toBeUndefined();
    expect(createDiscardWorkspaceChangesHandler(undefined)).toBeUndefined();
  });

  test("normalizes unique paths before discarding workspace changes", async () => {
    const calls: Array<{ workspaceId: string; input: { paths: string[] } }> = [];
    const handler = createDiscardWorkspaceChangesHandler(
      "workspace-smoke",
      async (workspaceId, input) => {
        calls.push({
          workspaceId,
          input: {
            paths: [...(input.paths ?? [])],
          },
        });

        return {
          workspaceId,
          ok: true,
        } as never;
      },
    );

    await handler?.([" src/main.ts ", "", "src/main.ts", "src/chat.tsx"]);

    expect(calls).toEqual([
      {
        workspaceId: "workspace-smoke",
        input: {
          paths: ["src/main.ts", "src/chat.tsx"],
        },
      },
    ]);
  });
});
