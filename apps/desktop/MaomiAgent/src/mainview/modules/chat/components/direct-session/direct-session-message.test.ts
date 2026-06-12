import { describe, expect, test } from "bun:test";
import {
  resolveCommandLikeToolHeadline,
  resolveToolDisplayNameFallback,
  resolveToolTraceStatusLabel,
} from "./direct-session-message-tool-trace";
import { shouldRenderToolTraceBody } from "./direct-session-message-tool-trace-body";
import {
  buildToolTraceSummary,
  resolveToolTraceHeaderContent,
} from "./direct-session-message-tool-trace-summary";

describe("resolveCommandLikeToolHeadline", () => {
  test("uses terminal command text instead of the raw terminal_execute tool name", () => {
    expect(resolveCommandLikeToolHeadline({
      toolName: "terminal_execute",
      isEn: true,
      summary: "git status --short",
      output: {
        ok: true,
        sessionId: "term_1",
        cwd: "E:/workspace/MaomiAgent",
      },
    })).toBe("git status --short");
  });

  test("falls back to preview or output text for other terminal tools", () => {
    expect(resolveCommandLikeToolHeadline({
      toolName: "terminal_read_output",
      isEn: true,
      preview: " M apps/desktop/MaomiAgent/src/mainview/modules/chat/chat-page.css\n M apps/desktop/MaomiAgent/src/mainview/modules/chat/components/direct-session/direct-session-message.tsx",
    })).toBe("Modified · chat-page.css");
  });

  test("uses the first preview line for generic command-execution tools", () => {
    expect(resolveCommandLikeToolHeadline({
      toolName: "run_in_terminal",
      isEn: true,
      operationKind: "command_execution",
      command: "git status --short",
      preview: "M apps/desktop/MaomiAgent/src/mainview/modules/chat/chat-page.css\nM apps/desktop/MaomiAgent/src/mainview/modules/chat/components/direct-session/direct-session-message.tsx",
    })).toBe("git status --short");
  });

  test("ignores non-terminal tool names", () => {
    expect(resolveCommandLikeToolHeadline({
      toolName: "workspace_read_file",
      isEn: true,
      summary: "24 项 · 工作区根目录",
    })).toBeUndefined();
  });
});

describe("resolveToolDisplayNameFallback", () => {
  test("localizes known builtin tool ids", () => {
    expect(resolveToolDisplayNameFallback("workspace_read_file", false)).toBe("读取工作区文件");
    expect(resolveToolDisplayNameFallback("workspace_edit_file", false)).toBe("编辑工作区文件");
    expect(resolveToolDisplayNameFallback("workspace_apply_patch", false)).toBe("应用工作区补丁");
    expect(resolveToolDisplayNameFallback("terminal_execute", true)).toBe("Execute terminal command");
  });

  test("humanizes unknown tool ids instead of exposing snake_case", () => {
    expect(resolveToolDisplayNameFallback("custom_unknown_tool", true)).toBe("Custom Unknown Tool");
  });
});

describe("resolveToolTraceStatusLabel", () => {
  test("explains repeated tool-call loops instead of showing a generic tool failure", () => {
    expect(resolveToolTraceStatusLabel({
      toolName: "workspace_write_file",
      status: "failed",
      error: {
        code: "tool_loop_detected",
        message: "Kernel run detected a repeated tool-call batch across consecutive turns",
      },
      isEn: false,
    })).toBe("连续重复调用已中止");
  });
});

describe("projected tool outputs", () => {
  test("uses projected summary text in tool trace headers", () => {
    const projectedOutput = {
      kind: "front-end-tool-output-preview",
      truncated: true,
      summary: "line 1",
      preview: "line 1\nline 2\nline 3",
      sourceKind: "string",
    } as never;

    const part = {
      type: "tool_result",
      toolName: "terminal_read_output",
      toolCall: {
        status: "completed",
        operation: {
          kind: "file_read",
          command: undefined,
        },
        output: projectedOutput,
      },
    } as never;

    expect(buildToolTraceSummary(part, true)).toBe("line 1");
    expect(resolveToolTraceHeaderContent(part, true)).toEqual({
      name: "line 1",
      summary: undefined,
      emphasizeName: true,
    });
  });

  test("keeps a lightweight trace body when full content can still be loaded", () => {
    expect(shouldRenderToolTraceBody({
      command: "",
      cwd: "",
      previewPaths: [],
      preview: undefined,
      canLoadFullOutput: true,
    })).toBe(true);
  });
});
