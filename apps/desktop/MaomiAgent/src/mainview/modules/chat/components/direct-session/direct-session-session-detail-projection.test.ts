import { describe, expect, test } from "bun:test";

import type { DesktopConversationSessionDetail } from "../../../../../shared/desktop-conversation";
import {
  isProjectedConversationToolOutput,
  projectConversationSessionDetail,
  readProjectedConversationSessionPreviewWindow,
  readProjectedConversationToolOutputPreview,
  readProjectedConversationToolOutputSummary,
  resolveSessionDetailProjectionMode,
} from "./direct-session-session-detail-projection";

function createSessionDetail(overrides: Partial<DesktopConversationSessionDetail> = {}) {
  const longOutput = `line 1\n${"x".repeat(2600)}`;

  return {
    sessionId: "session-1",
    workspaceId: "workspace-1",
    title: "Session",
    status: "failed",
    createdAt: "2026-05-08T00:00:00.000Z",
    updatedAt: "2026-05-08T00:00:00.000Z",
    runs: [{
      id: "run-1",
      sessionId: "session-1",
      status: "completed",
      startedAt: 1,
      updatedAt: 2,
      trigger: { kind: "user_message" },
      boundary: { kind: "done" },
    } as never],
    messages: [
      {
        messageId: "msg-1",
        sessionId: "session-1",
        runId: "run-1",
        role: "assistant",
        createdAt: 1,
        parts: [{ type: "text", partId: "part-1", text: "one" }],
      } as never,
      {
        messageId: "msg-2",
        sessionId: "session-1",
        runId: "run-1",
        role: "assistant",
        createdAt: 2,
        parts: [{ type: "text", partId: "part-2", text: "two" }],
      } as never,
      {
        messageId: "msg-3",
        sessionId: "session-1",
        runId: "run-1",
        role: "assistant",
        createdAt: 3,
        parts: [{ type: "text", partId: "part-3", text: "three" }],
      } as never,
      {
        messageId: "msg-4",
        sessionId: "session-1",
        runId: "run-1",
        role: "tool",
        createdAt: 4,
        parts: [{
          type: "tool_result",
          partId: "part-4",
          toolCallId: "call-1",
          toolName: "terminal_read_output",
        }],
      } as never,
      {
        messageId: "msg-5",
        sessionId: "session-1",
        runId: "run-1",
        role: "assistant",
        createdAt: 5,
        parts: [{ type: "text", partId: "part-5", text: "five" }],
      } as never,
      {
        messageId: "msg-6",
        sessionId: "session-1",
        runId: "run-1",
        role: "assistant",
        createdAt: 6,
        parts: [{ type: "text", partId: "part-6", text: "six" }],
      } as never,
    ],
    toolCalls: [{
      callId: "call-1",
      runId: "run-1",
      toolName: "terminal_read_output",
      status: "completed",
      operation: {
        kind: "file_read",
        label: "Read output",
        cwd: "E:/workspace/MaomiAgent",
        targetPaths: [],
      },
      output: longOutput,
    } as never],
    interactions: [],
    pendingInteractions: [],
    checkpoints: [],
    timeline: [],
    ...overrides,
  } as DesktopConversationSessionDetail;
}

describe("session detail projection", () => {
  test("resolves projection modes for active and expanded sessions", () => {
    expect(resolveSessionDetailProjectionMode({
      detailSessionId: "session-1",
      selectedSessionId: "session-1",
      expandedSessionDetailSessionId: "session-1",
    })).toBe("full");

    expect(resolveSessionDetailProjectionMode({
      detailSessionId: "session-1",
      selectedSessionId: "session-1",
    })).toBe("active-preview");

    expect(resolveSessionDetailProjectionMode({
      detailSessionId: "session-2",
      selectedSessionId: "session-1",
    })).toBe("inactive-preview");
  });

  test("keeps full detail untouched but compacts settled completed tool outputs to summaries", () => {
    const detail = createSessionDetail();

    expect(projectConversationSessionDetail(detail, "full")).toBe(detail);

    const projected = projectConversationSessionDetail(detail, "inactive-preview");
    expect(projected).not.toBe(detail);
    expect(projected.messages.map((message) => message.messageId)).toEqual([
      "msg-3",
      "msg-4",
      "msg-5",
      "msg-6",
    ]);

    const projectedOutput = projected.toolCalls[0]?.output;
    expect(isProjectedConversationToolOutput(projectedOutput)).toBe(true);
    expect(readProjectedConversationToolOutputSummary(projectedOutput)).toBe("line 1");
    expect(readProjectedConversationToolOutputPreview(projectedOutput)).toBeUndefined();
  });

  test("keeps preview text for active sessions while execution is still in progress", () => {
    const detail = createSessionDetail({
      status: "active",
    });

    const projected = projectConversationSessionDetail(detail, "active-preview");
    const projectedOutput = projected.toolCalls[0]?.output;

    expect(isProjectedConversationToolOutput(projectedOutput)).toBe(true);
    expect(readProjectedConversationToolOutputSummary(projectedOutput)).toBe("line 1");
    expect(readProjectedConversationToolOutputPreview(projectedOutput)?.startsWith("line 1")).toBe(true);
  });

  test("limits active preview to a bounded recent tail and exposes a folded history summary", () => {
    const detail = createSessionDetail({
      status: "active",
      messages: Array.from({ length: 32 }, (_, index) => ({
        messageId: `msg-${index + 1}`,
        sessionId: "session-1",
        runId: "run-1",
        role: "assistant",
        createdAt: index + 1,
        parts: [{
          type: "text",
          partId: `part-${index + 1}`,
          text: `message ${index + 1}`,
        }],
      })) as never,
      toolCalls: [],
    });

    const projected = projectConversationSessionDetail(detail, "active-preview");

    expect(projected.messages).toHaveLength(24);
    expect(projected.messages[0]?.messageId).toBe("msg-9");
    expect(projected.messages.at(-1)?.messageId).toBe("msg-32");
    expect(readProjectedConversationSessionPreviewWindow(projected)).toEqual({
      kind: "front-end-session-detail",
      mode: "active-preview",
      hiddenMessageCount: 8,
    });

    expect(projectConversationSessionDetail(projected, "active-preview")).toBe(projected);
  });

  test("preserves the active checkpoint summary message when the visible window is compacted", () => {
    const detail = createSessionDetail({
      status: "active",
      messages: Array.from({ length: 32 }, (_, index) => ({
        messageId: `msg-${index + 1}`,
        sessionId: "session-1",
        runId: "run-1",
        role: "assistant",
        createdAt: index + 1,
        parts: [{
          type: "text",
          partId: `part-${index + 1}`,
          text: `message ${index + 1}`,
        }],
      })) as never,
      toolCalls: [],
      checkpoints: [{
        checkpointId: "checkpoint-1",
        sessionId: "session-1",
        kind: "summary",
        replacesThroughMessageId: "msg-4",
        summaryMessageId: "msg-1",
        createdAt: 5,
      } as never],
    });

    const projected = projectConversationSessionDetail(detail, "active-preview");

    expect(projected.messages[0]?.messageId).toBe("msg-1");
    expect(projected.messages[1]?.messageId).toBe("msg-9");
    expect(projected.messages).toHaveLength(25);
    expect(readProjectedConversationSessionPreviewWindow(projected)?.hiddenMessageCount).toBe(4);
  });
});
