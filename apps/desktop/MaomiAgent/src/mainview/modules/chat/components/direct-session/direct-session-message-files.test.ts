import { describe, expect, test } from "bun:test";

import type { ConversationMessagePartView } from "#maomiagent/kernel/src/host/application";

import { resolveModifiedMessageFiles } from "./direct-session-message-files";

function createToolResultPart(input: {
  toolName: string;
  targetPaths: string[];
  toolInput?: unknown;
  toolOutput?: unknown;
}) {
  return {
    type: "tool_result",
    partId: `${input.toolName}-part`,
    toolCallId: `${input.toolName}-call`,
    toolName: input.toolName,
    input: input.toolInput,
    toolCall: {
      status: "completed",
      input: input.toolInput,
      output: input.toolOutput,
      operation: {
        kind: "file_write",
        targetPaths: input.targetPaths,
      },
    },
  } as unknown as ConversationMessagePartView;
}

describe("resolveModifiedMessageFiles", () => {
  test("extracts create action and line count from content writes", () => {
    const files = resolveModifiedMessageFiles([
      createToolResultPart({
        toolName: "create_file",
        targetPaths: ["docs/guide.md"],
        toolInput: {
          content: "# title\n\nbody",
        },
      }),
    ]);

    expect(files).toEqual([
      {
        path: "docs/guide.md",
        action: "create",
        additions: 3,
        deletions: 0,
        affectedLines: 3,
      },
    ]);
  });

  test("extracts patch additions and deletions into affected lines", () => {
    const files = resolveModifiedMessageFiles([
      createToolResultPart({
        toolName: "apply_patch",
        targetPaths: ["README.md"],
        toolOutput: {
          patch: "@@ -1,2 +1,3 @@\n-old\n+new\n+extra",
        },
      }),
    ]);

    expect(files).toEqual([
      {
        path: "README.md",
        action: "modify",
        additions: 2,
        deletions: 1,
        affectedLines: 3,
      },
    ]);
  });

  test("collects unique file targets from successful write results", () => {
    const files = resolveModifiedMessageFiles([
      {
        type: "tool_result",
        toolName: "apply_patch",
        toolCall: {
          callId: "call-1",
          status: "completed",
          operation: {
            kind: "file_write",
            targetPaths: ["src/app.ts", "src/app.ts", "src/ui.tsx"],
          },
        },
      } as never,
      {
        type: "tool_result",
        toolName: "read_file",
        toolCall: {
          callId: "call-2",
          status: "completed",
          operation: {
            kind: "file_read",
            targetPaths: ["src/ignored.ts"],
          },
        },
      } as never,
    ]);

    expect(files).toEqual([
      {
        path: "src/app.ts",
        action: "modify",
        additions: undefined,
        deletions: undefined,
        affectedLines: undefined,
      },
      {
        path: "src/ui.tsx",
        action: "modify",
        additions: undefined,
        deletions: undefined,
        affectedLines: undefined,
      },
    ]);
  });

  test("falls back to write-like tool names when operation kind is generic", () => {
    const files = resolveModifiedMessageFiles([
      {
        type: "tool_result",
        toolName: "create_file",
        toolCall: {
          callId: "call-3",
          status: "completed",
          operation: {
            kind: "tool_execution",
            targetPaths: ["docs/plan.md"],
          },
        },
      } as never,
    ]);

    expect(files).toEqual([
      {
        path: "docs/plan.md",
        action: "create",
        additions: undefined,
        deletions: undefined,
        affectedLines: undefined,
      },
    ]);
  });

  test("ignores tool call parts and failed write results", () => {
    const files = resolveModifiedMessageFiles([
      {
        type: "tool_call",
        toolName: "apply_patch",
        toolCall: {
          callId: "call-4",
          status: "completed",
          operation: {
            kind: "file_write",
            targetPaths: ["src/pending.ts"],
          },
        },
      } as never,
      {
        type: "tool_result",
        toolName: "apply_patch",
        toolCall: {
          callId: "call-5",
          status: "failed",
          error: {
            code: "write_failed",
            message: "disk full",
          },
          operation: {
            kind: "file_write",
            targetPaths: ["src/failed.ts"],
          },
        },
      } as never,
    ]);

    expect(files).toEqual([]);
  });

  test("ignores tool parts without normalized target paths", () => {
    const files = resolveModifiedMessageFiles([
      {
        type: "tool_result",
        toolName: "apply_patch",
        toolCall: {
          callId: "call-6",
          status: "completed",
          operation: {
            kind: "file_write",
            targetPaths: ["   ", ""],
          },
        },
      } as never,
    ]);

    expect(files).toEqual([]);
  });
});
