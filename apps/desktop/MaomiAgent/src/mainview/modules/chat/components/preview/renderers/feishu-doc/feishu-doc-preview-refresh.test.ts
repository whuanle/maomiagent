import { describe, expect, test } from "bun:test";

import {
  normalizeFeishuDocPreviewPaths,
  resolveFeishuDocRuntimeEventFingerprint,
  resolveFeishuDocToolCallFingerprint,
} from "./feishu-doc-preview-refresh";

describe("feishu doc preview refresh helpers", () => {
  test("normalizes the draft-first preview path list with original fallback", () => {
    expect(normalizeFeishuDocPreviewPaths({
      path: ".maomi\\feishu-docs\\drafts\\doc-token.draft.md",
      fallbackPath: "/.maomi/feishu-docs/doc-token.md",
    })).toEqual([
      ".maomi/feishu-docs/drafts/doc-token.draft.md",
      ".maomi/feishu-docs/doc-token.md",
    ]);
  });

  test("refreshes when either the draft or original preview path is written", () => {
    const previewPaths = normalizeFeishuDocPreviewPaths({
      path: ".maomi/feishu-docs/drafts/doc-token.draft.md",
      fallbackPath: ".maomi/feishu-docs/doc-token.md",
    });
    const draftWrite = {
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
        targetPaths: ["E:/workspace/MaomiAgent/.maomi/feishu-docs/drafts/doc-token.draft.md"],
      },
    } as const;
    const originalWrite = {
      ...draftWrite,
      callId: "call-2",
      updatedAt: 3,
      operation: {
        kind: "file_write",
        targetPaths: ["E:/workspace/MaomiAgent/.maomi/feishu-docs/doc-token.md"],
      },
    } as const;

    expect(resolveFeishuDocToolCallFingerprint([draftWrite] as never, previewPaths)).toBe("call-1:2");
    expect(resolveFeishuDocToolCallFingerprint([originalWrite] as never, previewPaths)).toBe("call-2:3");
  });

  test("ignores runtime events that do not touch the draft or original preview paths", () => {
    const previewPaths = normalizeFeishuDocPreviewPaths({
      path: ".maomi/feishu-docs/drafts/doc-token.draft.md",
      fallbackPath: ".maomi/feishu-docs/doc-token.md",
    });
    const events = [{
      type: "tool-call.updated",
      eventId: "event-1",
      occurredAt: 3,
      sessionId: "session-1",
      runId: "run-1",
      toolCall: {
        callId: "call-3",
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
          targetPaths: ["E:/workspace/MaomiAgent/.maomi/feishu-docs/other.md"],
        },
      },
    }];

    expect(resolveFeishuDocRuntimeEventFingerprint(events as never, previewPaths)).toBe("");
  });
});
