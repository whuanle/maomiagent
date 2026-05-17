import { describe, expect, test } from "bun:test";

import {
  normalizePreviewPath,
  resolveRuntimeEventFingerprint,
  resolveToolCallFingerprint,
  toolCallTargetsPreviewPath,
} from "./workspace-file-preview-refresh";

describe("workspace file preview refresh helpers", () => {
  test("normalizes preview paths for stable matching", () => {
    expect(normalizePreviewPath(".\\Docs\\Plan.md")).toBe("docs/plan.md");
    expect(normalizePreviewPath("/docs/plan.md")).toBe("docs/plan.md");
  });

  test("matches relative preview paths against absolute tool targets", () => {
    const previewPath = normalizePreviewPath("docs/plan.md");
    const toolCall = {
      callId: "call-1",
      sessionId: "session-1",
      runId: "run-1",
      turnId: "turn-1",
      messageId: "message-1",
      toolName: "apply_patch",
      status: "completed",
      input: {},
      startedAt: 1,
      updatedAt: 2,
      operation: {
        kind: "file_write",
        targetPaths: ["E:/workspace/MaomiAgent/docs/plan.md"],
      },
    } as const;

    expect(toolCallTargetsPreviewPath(toolCall as never, previewPath)).toBe(true);
    expect(resolveToolCallFingerprint([toolCall] as never, previewPath)).toBe("call-1:2");
  });

  test("ignores failed writes and read-only tool calls", () => {
    const previewPath = normalizePreviewPath("docs/plan.md");
    const failedWrite = {
      callId: "call-2",
      sessionId: "session-1",
      runId: "run-1",
      turnId: "turn-1",
      messageId: "message-1",
      toolName: "apply_patch",
      status: "failed",
      input: {},
      error: {
        code: "write_failed",
        message: "permission denied",
      },
      startedAt: 1,
      updatedAt: 3,
      operation: {
        kind: "file_write",
        targetPaths: ["docs/plan.md"],
      },
    } as const;
    const readCall = {
      callId: "call-3",
      sessionId: "session-1",
      runId: "run-1",
      turnId: "turn-1",
      messageId: "message-1",
      toolName: "read_file",
      status: "completed",
      input: {},
      startedAt: 1,
      updatedAt: 4,
      operation: {
        kind: "file_read",
        targetPaths: ["docs/plan.md"],
      },
    } as const;

    expect(toolCallTargetsPreviewPath(failedWrite as never, previewPath)).toBe(false);
    expect(toolCallTargetsPreviewPath(readCall as never, previewPath)).toBe(false);
    expect(resolveToolCallFingerprint([failedWrite, readCall] as never, previewPath)).toBe("");
  });

  test("ignores runtime events that do not touch the open preview path", () => {
    const previewPath = normalizePreviewPath("docs/plan.md");
    const events = [{
      type: "tool-call.updated",
      eventId: "event-1",
      occurredAt: 3,
      sessionId: "session-1",
      runId: "run-1",
      toolCall: {
        callId: "call-2",
        sessionId: "session-1",
        runId: "run-1",
        turnId: "turn-1",
        messageId: "message-1",
        toolName: "apply_patch",
        status: "completed",
        input: {},
        startedAt: 1,
        updatedAt: 4,
        operation: {
          kind: "file_write",
          targetPaths: ["docs/other.md"],
        },
      },
    }];

    expect(resolveRuntimeEventFingerprint(events as never, previewPath)).toBe("");
  });
});