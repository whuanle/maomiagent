import { describe, expect, test } from "bun:test";

import {
  compactToolCallHistory,
  compactToolResultHistory,
} from "../implementation/shared/tool-history-compaction";

describe("tool history compaction", () => {
  test("summarizes workspace_write_file tool inputs", () => {
    const compacted = compactToolCallHistory({
      toolName: "workspace_write_file",
      input: {
        path: "docs/demo.md",
        workspaceId: "workspace-1",
        content: "# Title\n" + "A".repeat(5000),
      },
    }) as Record<string, unknown>;

    expect(compacted).toEqual(expect.objectContaining({
      path: "docs/demo.md",
      workspaceId: "workspace-1",
      contentSummary: expect.stringContaining("Prepared file content"),
    }));
    expect(compacted.content).toBeUndefined();
  });

  test("summarizes terminal output into metadata and short status text", () => {
    const compacted = compactToolResultHistory({
      toolName: "terminal_read_output",
      text: JSON.stringify({
        exitCode: 1,
        stdout: "",
        stderr: "IndentationError\n" + "x".repeat(8000),
      }),
    });

    expect(compacted).toContain("IndentationError");
    expect(compacted).not.toContain("x".repeat(300));
  });

  test("leaves non-targeted tools unchanged", () => {
    const input = {
      path: ".",
    };
    const result = "working tree clean";

    expect(compactToolCallHistory({
      toolName: "git.status",
      input,
    })).toEqual(input);
    expect(compactToolResultHistory({
      toolName: "git.status",
      text: result,
    })).toBe(result);
  });
});
