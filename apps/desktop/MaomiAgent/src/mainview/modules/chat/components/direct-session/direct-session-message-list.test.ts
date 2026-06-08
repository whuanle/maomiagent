import { describe, expect, test } from "bun:test";

import { groupDirectSessionMessagesForDisplay } from "./direct-session-message-list-grouping";
import { buildDirectSessionRenderItems } from "./direct-session-message-list-items";

describe("groupDirectSessionMessagesForDisplay", () => {
  test("merges consecutive assistant and tool batches into one display message", () => {
    const groups = groupDirectSessionMessagesForDisplay([
      {
        messageId: "assistant-1",
        sessionId: "session-1",
        role: "assistant",
        createdAt: 1,
        parts: [{ type: "text", partId: "part-1", text: "Planning" }],
      } as never,
      {
        messageId: "tool-1",
        sessionId: "session-1",
        role: "tool",
        createdAt: 2,
        parts: [{ type: "tool_result", partId: "part-2", toolCallId: "call-1", toolName: "workspace_read_file" }],
      } as never,
      {
        messageId: "assistant-2",
        sessionId: "session-1",
        role: "assistant",
        createdAt: 3,
        parts: [{ type: "text", partId: "part-3", text: "Done" }],
      } as never,
      {
        messageId: "user-1",
        sessionId: "session-1",
        role: "user",
        createdAt: 4,
        parts: [{ type: "text", partId: "part-4", text: "next" }],
      } as never,
    ], "assistant-2");

    expect(groups).toHaveLength(2);
    expect(groups[0]?.message.role).toBe("assistant");
    expect(groups[0]?.message.messageId).toBe("assistant-1");
    expect(groups[0]?.message.parts).toHaveLength(3);
    expect(groups[0]?.previewSourceMessage.messageId).toBe("assistant-2");
    expect(groups[0]?.containsLatestMessage).toBe(true);
    expect(groups[1]?.message.role).toBe("user");
  });

  test("keeps separated assistant groups around user boundaries", () => {
    const groups = groupDirectSessionMessagesForDisplay([
      {
        messageId: "tool-1",
        sessionId: "session-1",
        role: "tool",
        createdAt: 1,
        parts: [{ type: "tool_result", partId: "part-1", toolCallId: "call-1", toolName: "terminal_execute" }],
      } as never,
      {
        messageId: "user-1",
        sessionId: "session-1",
        role: "user",
        createdAt: 2,
        parts: [{ type: "text", partId: "part-2", text: "retry" }],
      } as never,
      {
        messageId: "tool-2",
        sessionId: "session-1",
        role: "tool",
        createdAt: 3,
        parts: [{ type: "tool_result", partId: "part-3", toolCallId: "call-2", toolName: "terminal_execute" }],
      } as never,
    ]);

    expect(groups).toHaveLength(3);
    expect(groups[0]?.message.role).toBe("assistant");
    expect(groups[1]?.message.role).toBe("user");
    expect(groups[2]?.message.role).toBe("assistant");
  });

  test("drops tool output text parts when tool messages are merged into assistant display groups", () => {
    const groups = groupDirectSessionMessagesForDisplay([
      {
        messageId: "assistant-1",
        sessionId: "session-1",
        role: "assistant",
        createdAt: 1,
        parts: [{ type: "text", partId: "part-1", text: "Planning" }],
      } as never,
      {
        messageId: "tool-1",
        sessionId: "session-1",
        role: "tool",
        createdAt: 2,
        parts: [
          { type: "tool_result", partId: "part-2", toolCallId: "call-1", toolName: "terminal_execute" },
          { type: "text", partId: "part-3", text: '{"ok":true,"cwd":"E:/demo/autowork"}' },
        ],
      } as never,
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.message.parts).toEqual([
      { type: "text", partId: "part-1", text: "Planning" },
      { type: "tool_result", partId: "part-2", toolCallId: "call-1", toolName: "terminal_execute" },
    ]);
  });

  test("preserves stable message identity for standalone assistant messages", () => {
    const assistantMessage = {
      messageId: "assistant-1",
      sessionId: "session-1",
      role: "assistant",
      createdAt: 1,
      parts: [{ type: "text", partId: "part-1", text: "Stable" }],
    } as never;

    const groups = groupDirectSessionMessagesForDisplay([assistantMessage]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.message).toBe(assistantMessage);
  });

  test("reuses merged assistant groups when source messages are unchanged", () => {
    const messages = [
      {
        messageId: "assistant-1",
        sessionId: "session-1",
        role: "assistant",
        createdAt: 1,
        parts: [{ type: "text", partId: "part-1", text: "Planning" }],
      } as never,
      {
        messageId: "tool-1",
        sessionId: "session-1",
        role: "tool",
        createdAt: 2,
        parts: [{ type: "tool_result", partId: "part-2", toolCallId: "call-1", toolName: "workspace_read_file" }],
      } as never,
      {
        messageId: "assistant-2",
        sessionId: "session-1",
        role: "assistant",
        createdAt: 3,
        parts: [{ type: "text", partId: "part-3", text: "Done" }],
      } as never,
    ];

    const firstGroups = groupDirectSessionMessagesForDisplay(messages, "assistant-2");
    const secondGroups = groupDirectSessionMessagesForDisplay(messages, "assistant-2", {
      previousGroups: firstGroups,
    });

    expect(secondGroups).toHaveLength(1);
    expect(secondGroups[0]).toBe(firstGroups[0]);
    expect(secondGroups[0]?.message).toBe(firstGroups[0]?.message);
  });

  test("preserves paragraph boundaries between consecutive assistant text batches", () => {
    const groups = groupDirectSessionMessagesForDisplay([
      {
        messageId: "assistant-1",
        sessionId: "session-1",
        role: "assistant",
        createdAt: 1,
        parts: [{ type: "text", partId: "part-1", text: "I need approval to update local files before continuing." }],
      } as never,
      {
        messageId: "assistant-2",
        sessionId: "session-1",
        role: "assistant",
        createdAt: 2,
        parts: [{ type: "text", partId: "part-2", text: "Permission confirmed. I need the deployment target before continuing." }],
      } as never,
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.message.parts).toEqual([
      { type: "text", partId: "part-1", text: "I need approval to update local files before continuing." },
      { type: "text", partId: "part-2", text: "\n\nPermission confirmed. I need the deployment target before continuing." },
    ]);
  });

  test("keeps a checkpoint summary message isolated and inserts a folded archive card after it", () => {
    const groups = groupDirectSessionMessagesForDisplay([
      {
        messageId: "summary-1",
        sessionId: "session-1",
        role: "assistant",
        createdAt: 1,
        parts: [{ type: "text", partId: "part-1", text: "Compaction summary" }],
      } as never,
      {
        messageId: "assistant-2",
        sessionId: "session-1",
        role: "assistant",
        createdAt: 2,
        parts: [{ type: "text", partId: "part-2", text: "Fresh response" }],
      } as never,
    ], undefined, {
      preserveBoundaryMessageIds: ["summary-1"],
    });

    expect(groups).toHaveLength(2);
    expect(groups[0]?.messageIds).toEqual(["summary-1"]);
    expect(groups[1]?.messageIds).toEqual(["assistant-2"]);

    const items = buildDirectSessionRenderItems({
      groups,
      checkpoints: [{
        checkpointId: "checkpoint-1",
        sessionId: "session-1",
        kind: "summary",
        replacesThroughMessageId: "user-1",
        summaryMessageId: "summary-1",
        createdAt: 3,
        metadata: {
          reason: "budget_exceeded",
          prunedMessageIds: ["user-1", "assistant-1"],
          prunedTokens: 2048,
        },
      } as never],
      language: "zh-CN",
    });

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ kind: "message", key: "summary-1" });
    expect(items[1]).toMatchObject({
      kind: "checkpoint",
      key: "checkpoint:checkpoint-1",
      label: "较早上下文已压缩",
      detail: "达到阈值后自动压缩 · 已折叠 2 条较早消息 · 约回收 2048 tokens",
    });
    expect(items[2]).toMatchObject({ kind: "message", key: "assistant-2" });
  });

  test("falls back to the group message id when messageIds is missing", () => {
    const items = buildDirectSessionRenderItems({
      groups: [{
        key: "summary-1",
        message: {
          messageId: "summary-1",
          sessionId: "session-1",
          role: "assistant",
          createdAt: 1,
          parts: [{ type: "text", partId: "part-1", text: "Compaction summary" }],
        },
        previewSourceMessage: {
          messageId: "summary-1",
          sessionId: "session-1",
          role: "assistant",
          createdAt: 1,
          parts: [{ type: "text", partId: "part-1", text: "Compaction summary" }],
        },
        containsLatestMessage: false,
        streamingPartIds: [],
      } as never],
      checkpoints: [{
        checkpointId: "checkpoint-1",
        sessionId: "session-1",
        kind: "summary",
        replacesThroughMessageId: "user-1",
        summaryMessageId: "summary-1",
        createdAt: 3,
        metadata: {
          prunedMessageIds: ["user-1"],
        },
      } as never],
      language: "zh-CN",
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "message", key: "summary-1" });
    expect(items[1]).toMatchObject({ kind: "checkpoint", key: "checkpoint:checkpoint-1" });
  });
});
