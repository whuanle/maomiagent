import { describe, expect, test } from "bun:test";

import {
  buildSessionHistoryCompaction,
  type SessionHistoryCompactionMode,
} from "../implementation/shared/session-history-compaction";
import type { AiTurnRequest } from "../kernel-bridge";

type PromptMessage = AiTurnRequest["prompt"]["messages"][number];
type PromptMessagePart = PromptMessage["parts"][number];

function createMessage(
  role: PromptMessage["message"]["role"],
  id: string,
  parts: PromptMessagePart[],
): PromptMessage {
  return {
    message: {
      id: id as PromptMessage["message"]["id"],
      sessionId: "session-1" as PromptMessage["message"]["sessionId"],
      role,
      createdAt: 1,
    },
    parts,
  };
}

describe("buildSessionHistoryCompaction", () => {
  test("switches to summary mode for heavy older history while keeping the recent tail", () => {
    const result = buildSessionHistoryCompaction({
      messages: [
        createMessage("user", "u1", [{
          id: "u1-text" as PromptMessagePart["id"],
          type: "text",
          text: "请生成业务财务一体化文档",
        }]),
        createMessage("assistant", "a1", [{
          id: "a1-reason" as PromptMessagePart["id"],
          type: "reasoning",
          text: "r".repeat(10_000),
        }, {
          id: "a1-tool" as PromptMessagePart["id"],
          type: "tool_call_ref",
          toolCallId: "tool-1" as never,
          toolName: "workspace_write_file",
          input: {
            path: ".maomi/docs/plan.md",
            content: "x".repeat(20_000),
          },
        }]),
        createMessage("tool", "t1", [{
          id: "t1-tool-result" as PromptMessagePart["id"],
          type: "tool_result_ref",
          toolCallId: "tool-1" as never,
          toolName: "workspace_write_file",
          output: {
            path: ".maomi/docs/plan.md",
          },
        }, {
          id: "t1-text" as PromptMessagePart["id"],
          type: "text",
          text: "已写入 1429 行 Markdown",
        }]),
        createMessage("user", "u2", [{
          id: "u2-text" as PromptMessagePart["id"],
          type: "text",
          text: "调整成飞书格式",
        }]),
        createMessage("assistant", "a2", [{
          id: "a2-text" as PromptMessagePart["id"],
          type: "text",
          text: "我会重新调整标题、列表和空格。",
        }]),
        createMessage("user", "u3", [{
          id: "u3-text" as PromptMessagePart["id"],
          type: "text",
          text: "保留所有飞书原生块",
        }]),
      ],
      maxRecentUserTurns: 2,
      summaryTriggerChars: 12_000,
    });

    expect(result.mode satisfies SessionHistoryCompactionMode).toBe("summary_with_recent_tail");
    expect(result.summaryText).toContain("Session Summary");
    expect(result.summaryText).toContain(".maomi/docs/plan.md");
    expect(result.messages.map((message) => message.message.id)).toEqual(["u2", "a2", "u3"]);
  });

  test("stays in raw mode for short conversations", () => {
    const result = buildSessionHistoryCompaction({
      messages: [
        createMessage("user", "u1", [{
          id: "u1-text" as PromptMessagePart["id"],
          type: "text",
          text: "你好",
        }]),
        createMessage("assistant", "a1", [{
          id: "a1-text" as PromptMessagePart["id"],
          type: "text",
          text: "你好，我在。",
        }]),
      ],
      maxRecentUserTurns: 2,
      summaryTriggerChars: 12_000,
    });

    expect(result.mode).toBe("raw");
    expect(result.summaryText).toBeUndefined();
    expect(result.messages.map((message) => message.message.id)).toEqual(["u1", "a1"]);
  });
});
