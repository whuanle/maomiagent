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
      content: expect.stringContaining("Prepared file content"),
    }));
    expect(String(compacted.content)).toContain("`content` field");
    expect((compacted as Record<string, unknown>).contentSummary).toBeUndefined();
  });

  test("summarizes workspace_edit_file tool inputs without changing field names", () => {
    const compacted = compactToolCallHistory({
      toolName: "workspace_edit_file",
      input: {
        path: ".maomi/feishu-docs/drafts/demo.draft.md",
        workspaceId: "workspace-1",
        oldText: "## Old\n" + "A".repeat(2000),
        newText: "## New\n" + "B".repeat(2000),
      },
    }) as Record<string, unknown>;

    expect(compacted).toEqual(expect.objectContaining({
      path: ".maomi/feishu-docs/drafts/demo.draft.md",
      workspaceId: "workspace-1",
      oldText: expect.stringContaining("Matched source fragment"),
      newText: expect.stringContaining("Replacement fragment"),
    }));
  });

  test("summarizes workspace_apply_patch tool inputs without changing field names", () => {
    const compacted = compactToolCallHistory({
      toolName: "workspace_apply_patch",
      input: {
        workspaceId: "workspace-1",
        patchText: "*** Begin Patch\n*** Update File: demo.md\n@@\n-old\n+new\n*** End Patch\n" + "x".repeat(2000),
      },
    }) as Record<string, unknown>;

    expect(compacted).toEqual(expect.objectContaining({
      workspaceId: "workspace-1",
      patchText: expect.stringContaining("Historical patch text"),
    }));
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

  test("keeps workspace file read/write results uncompressed so the model can verify exact content", () => {
    const fileResult = JSON.stringify({
      path: ".maomi/feishu-docs/drafts/demo.draft.md",
      content: "## Title\n\n- item",
      truncated: false,
    });

    expect(compactToolResultHistory({
      toolName: "workspace_read_file",
      text: fileResult,
    })).toBe(fileResult);

    expect(compactToolResultHistory({
      toolName: "workspace_write_file",
      text: fileResult,
    })).toBe(fileResult);

    expect(compactToolResultHistory({
      toolName: "workspace_apply_patch",
      text: fileResult,
    })).toBe(fileResult);

    expect(compactToolResultHistory({
      toolName: "workspace_edit_file",
      text: fileResult,
    })).toBe(fileResult);
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
