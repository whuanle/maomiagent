import { describe, expect, test } from "bun:test";

import {
  formatCompletedExecutionFileCount,
  formatCompletedExecutionTitle,
  formatCompletedExecutionToolCount,
  resolveDirectSessionCompletedExecutionDigest,
} from "./direct-session-message-completed-execution";

describe("resolveDirectSessionCompletedExecutionDigest", () => {
  test("collapses completed execution steps behind the final assistant answer", () => {
    const digest = resolveDirectSessionCompletedExecutionDigest({
      role: "assistant",
      language: "zh-CN",
      isStreaming: false,
      modifiedFileCount: 2,
      parts: [
        {
          type: "text",
          partId: "part-1",
          text: "先检查聊天消息列表和详情渲染。",
        },
        {
          type: "reasoning",
          partId: "part-2",
          text: "检查渲染链路\n确认可以在前端层做摘要和折叠。",
        },
        {
          type: "tool_result",
          partId: "part-3",
          toolCallId: "call-1",
          toolName: "workspace_read_file",
          toolCall: {
            status: "completed",
            operation: {
              kind: "file_read",
              targetPaths: ["apps/desktop/MaomiAgent/src/mainview/modules/chat/components/direct-session/direct-session-message.tsx"],
            },
          },
        },
        {
          type: "tool_result",
          partId: "part-4",
          toolCallId: "call-2",
          toolName: "workspace_edit_file",
          toolCall: {
            status: "completed",
            operation: {
              kind: "file_write",
              targetPaths: ["apps/desktop/MaomiAgent/src/mainview/modules/chat/chat-page.css"],
            },
          },
        },
        {
          type: "text",
          partId: "part-5",
          text: "已补上完成摘要，并把执行过程折叠到一处。",
        },
      ] as never,
    });

    expect(digest).toEqual({
      visiblePartStartIndex: 4,
      stepCount: 3,
      toolCallCount: 2,
      modifiedFileCount: 2,
      preview: "检查渲染链路 · direct-session-message.tsx · chat-page.css",
      highlights: [
        "检查渲染链路",
        "direct-session-message.tsx",
        "chat-page.css",
      ],
    });
  });

  test("does not collapse when the execution has not completed cleanly", () => {
    expect(resolveDirectSessionCompletedExecutionDigest({
      role: "assistant",
      language: "zh-CN",
      isStreaming: false,
      parts: [
        {
          type: "tool_result",
          partId: "part-1",
          toolCallId: "call-1",
          toolName: "terminal_execute",
          toolCall: {
            status: "failed",
            operation: {
              kind: "command_execution",
              command: "git status --short",
            },
          },
        },
        {
          type: "text",
          partId: "part-2",
          text: "执行失败，请检查输出。",
        },
      ] as never,
    })).toBeUndefined();
  });

  test("does not collapse when there is no final answer tail", () => {
    expect(resolveDirectSessionCompletedExecutionDigest({
      role: "assistant",
      language: "zh-CN",
      isStreaming: false,
      parts: [
        {
          type: "reasoning",
          partId: "part-1",
          text: "检查渲染链路",
        },
        {
          type: "tool_result",
          partId: "part-2",
          toolCallId: "call-1",
          toolName: "workspace_read_file",
          toolCall: {
            status: "completed",
            operation: {
              kind: "file_read",
              targetPaths: ["direct-session-message.tsx"],
            },
          },
        },
      ] as never,
    })).toBeUndefined();
  });
});

describe("completed execution label formatting", () => {
  test("formats summary labels in Chinese", () => {
    expect(formatCompletedExecutionTitle(3, "zh-CN")).toBe("已执行 3 步");
    expect(formatCompletedExecutionToolCount(2, "zh-CN")).toBe("2 次工具调用");
    expect(formatCompletedExecutionFileCount(4, "zh-CN")).toBe("修改 4 个文件");
  });

  test("formats summary labels in English", () => {
    expect(formatCompletedExecutionTitle(1, "en-US")).toBe("1 step completed");
    expect(formatCompletedExecutionToolCount(1, "en-US")).toBe("1 tool");
    expect(formatCompletedExecutionFileCount(1, "en-US")).toBe("1 file changed");
  });
});
