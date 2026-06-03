import { describe, expect, mock, test } from "bun:test";

import {
  createChatStreamingRendererDiagnostics,
  resolveChatStreamingRendererCorrelation,
} from "./chat-streaming-diagnostics";

describe("chat streaming renderer diagnostics", () => {
  test("records first renderer receipt and first merge only once per run", async () => {
    const writes: Array<Record<string, unknown> | undefined> = [];
    const diagnostics = createChatStreamingRendererDiagnostics({
      writeLog: mock(async (record) => {
        writes.push(record.context);
        return undefined;
      }),
    });

    const correlation = {
      sessionId: "session-1",
      workspaceId: "workspace-1",
      runId: "run-1",
      turnId: "turn-1",
    };

    diagnostics.recordFirstRuntimeEventReceived(correlation);
    diagnostics.recordFirstRuntimeEventReceived(correlation);
    diagnostics.recordFirstRuntimeEventMerged(correlation);
    diagnostics.recordFirstRuntimeEventMerged(correlation);

    await Promise.resolve();

    expect(writes.map((item) => item?.phase)).toEqual([
      "renderer.first_runtime_event_received",
      "renderer.first_runtime_event_merged",
    ]);
  });

  test("derives renderer correlation from runtime event payloads", () => {
    expect(resolveChatStreamingRendererCorrelation({
      sessionId: "session-1",
      workspaceId: "workspace-1",
      events: [{
        type: "message.parts.appended",
        eventId: "event-1",
        occurredAt: 1,
        sessionId: "session-1",
        runId: "run-1",
        message: {
          messageId: "message-1",
          sessionId: "session-1",
          runId: "run-1",
          turnId: "turn-1",
          role: "assistant",
          createdAt: 1,
          parts: [],
        },
      }],
    })).toEqual({
      sessionId: "session-1",
      workspaceId: "workspace-1",
      runId: "run-1",
      turnId: "turn-1",
    });
  });
});
