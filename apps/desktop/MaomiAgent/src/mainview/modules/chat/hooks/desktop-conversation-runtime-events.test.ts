import { describe, expect, test } from "bun:test";

import type { DesktopConversationSessionDetail } from "../../../../shared/desktop-conversation";
import {
  mergeDesktopConversationRuntimeEvents,
  shouldDeferRuntimeEventsWhileStopping,
} from "./desktop-conversation-runtime-events";

const BASE_TIME = Date.parse("2026-05-04T00:00:00.000Z");

function createDetail(): DesktopConversationSessionDetail {
  return {
    sessionId: "session-1",
    workspaceId: "workspace-1",
    title: "Streaming session",
    status: "active",
    createdAt: "2026-05-04T00:00:00.000Z",
    updatedAt: "2026-05-04T00:00:00.000Z",
    metadata: {
      selectedAgentId: "agent-1",
    },
    runs: [{
      id: "run-1" as never,
      sessionId: "session-1" as never,
      status: "streaming",
      startedAt: 1,
      updatedAt: 1,
      trigger: { kind: "user_message" },
    }],
    messages: [{
      messageId: "message-1",
      sessionId: "session-1",
      runId: "run-1",
      turnId: "turn-1",
      role: "assistant",
      createdAt: 10,
      parts: [],
    }],
    toolCalls: [],
    interactions: [],
    pendingInteractions: [],
    checkpoints: [],
    timeline: [{
      type: "message",
      at: 10,
      message: {
        messageId: "message-1",
        sessionId: "session-1",
        runId: "run-1",
        turnId: "turn-1",
        role: "assistant",
        createdAt: 10,
        parts: [],
      },
    }],
  };
}

describe("mergeDesktopConversationRuntimeEvents", () => {
  test("defers high-frequency streaming updates while a stop request is pending", () => {
    expect(shouldDeferRuntimeEventsWhileStopping({
      stoppingSessionId: "session-1",
      update: {
        workspaceId: "workspace-1",
        sessionId: "session-1",
        events: [{
          type: "message.parts.appended",
          eventId: "event-stop-1",
          occurredAt: BASE_TIME + 5,
          sessionId: "session-1",
          runId: "run-1",
          message: {
            messageId: "message-1",
            sessionId: "session-1",
            runId: "run-1",
            turnId: "turn-1",
            role: "assistant",
            createdAt: 10,
            parts: [{
              type: "text",
              partId: "part-stop-1",
              text: "partial",
            }],
          },
        }],
      },
    })).toBe(true);

    expect(shouldDeferRuntimeEventsWhileStopping({
      stoppingSessionId: "session-1",
      update: {
        workspaceId: "workspace-1",
        sessionId: "session-1",
        events: [{
          type: "compaction.started",
          eventId: "event-stop-2",
          occurredAt: BASE_TIME + 6,
          sessionId: "session-1",
          runId: "run-1",
          run: {
            runId: "run-1",
            sessionId: "session-1",
            status: "awaiting_compaction",
            startedAt: 1,
            updatedAt: BASE_TIME + 6,
            trigger: { kind: "user_message" },
          },
          compaction: {
            status: "running",
            attempt: 1,
            reason: "context_overflow",
            startedAt: BASE_TIME + 6,
          },
        }],
      },
    })).toBe(false);
  });

  test("appends streamed assistant parts without requiring a detail reload", () => {
    const detail = createDetail();

    const result = mergeDesktopConversationRuntimeEvents(detail, [{
      type: "message.parts.appended",
      eventId: "event-1",
      occurredAt: BASE_TIME + 20,
      sessionId: "session-1",
      runId: "run-1",
      message: {
        messageId: "message-1",
        sessionId: "session-1",
        runId: "run-1",
        turnId: "turn-1",
        role: "assistant",
        createdAt: 10,
        parts: [{
          type: "text",
          partId: "part-1",
          text: "hello stream",
        }],
      },
    }]);

    expect(result.requiresReload).toBe(false);
    expect(result.detail.messages[0]?.parts).toEqual([{
      type: "text",
      partId: "part-1",
      text: "hello stream",
    }]);
    expect(result.detail.updatedAt).toBe("2026-05-04T00:00:00.020Z");
  });

  test("keeps pending interactions locally in sync", () => {
    const detail = createDetail();

    const result = mergeDesktopConversationRuntimeEvents(detail, [{
      type: "interaction.updated",
      eventId: "event-2",
      occurredAt: BASE_TIME + 30,
      sessionId: "session-1",
      runId: "run-1",
      interaction: {
        interactionId: "interaction-1",
        sessionId: "session-1",
        runId: "run-1",
        kind: "question",
        status: "pending",
        request: {
          kind: "question",
          items: [],
        },
        createdAt: BASE_TIME + 30,
        updatedAt: BASE_TIME + 30,
      },
    }]);

    expect(result.requiresReload).toBe(false);
    expect(result.detail.interactions).toHaveLength(1);
    expect(result.detail.pendingInteractions).toHaveLength(1);
    expect(result.detail.pendingInteractions[0]?.interactionId).toBe("interaction-1");
  });

  test("clears pending interactions after an interaction response update", () => {
    const detail = createDetail();

    const withPendingInteraction = mergeDesktopConversationRuntimeEvents(detail, [{
      type: "interaction.updated",
      eventId: "event-pending",
      occurredAt: BASE_TIME + 30,
      sessionId: "session-1",
      runId: "run-1",
      interaction: {
        interactionId: "interaction-1",
        sessionId: "session-1",
        runId: "run-1",
        kind: "form",
        status: "pending",
        request: {
          kind: "form",
          title: "Confirm action",
          fields: [{
            key: "strategy",
            label: "Strategy",
            kind: "text",
            required: true,
          }],
        },
        createdAt: BASE_TIME + 30,
        updatedAt: BASE_TIME + 30,
      },
    }]).detail;

    const result = mergeDesktopConversationRuntimeEvents(withPendingInteraction, [{
      type: "interaction.updated",
      eventId: "event-answered",
      occurredAt: BASE_TIME + 40,
      sessionId: "session-1",
      runId: "run-1",
      interaction: {
        interactionId: "interaction-1",
        sessionId: "session-1",
        runId: "run-1",
        kind: "form",
        status: "answered",
        request: {
          kind: "form",
          title: "Confirm action",
          fields: [{
            key: "strategy",
            label: "Strategy",
            kind: "text",
            required: true,
          }],
        },
        response: {
          kind: "form",
          values: {
            strategy: "tests",
          },
        },
        createdAt: BASE_TIME + 30,
        updatedAt: BASE_TIME + 40,
      },
    }]);

    expect(result.requiresReload).toBe(false);
    expect(result.detail.interactions).toHaveLength(1);
    expect(result.detail.interactions[0]?.status).toBe("answered");
    expect(result.detail.pendingInteractions).toHaveLength(0);
    expect(result.detail.timeline.filter((entry) => entry.type === "interaction")).toHaveLength(1);
    expect(result.detail.updatedAt).toBe("2026-05-04T00:00:00.040Z");
  });

  test("enriches message and timeline tool parts after tool-call updates arrive", () => {
    const detail = createDetail();
    const withToolPart = mergeDesktopConversationRuntimeEvents(detail, [{
      type: "message.parts.appended",
      eventId: "event-3",
      occurredAt: BASE_TIME + 40,
      sessionId: "session-1",
      runId: "run-1",
      message: {
        messageId: "message-1",
        sessionId: "session-1",
        runId: "run-1",
        turnId: "turn-1",
        role: "assistant",
        createdAt: 10,
        parts: [
          {
            type: "tool_call",
            partId: "part-tool-call",
            toolCallId: "call-1",
            toolName: "apply_patch",
          },
          {
            type: "tool_result",
            partId: "part-tool-result",
            toolCallId: "call-1",
            toolName: "apply_patch",
          },
        ],
      },
    }]).detail;

    const result = mergeDesktopConversationRuntimeEvents(withToolPart, [{
      type: "tool-call.updated",
      eventId: "event-4",
      occurredAt: BASE_TIME + 50,
      sessionId: "session-1",
      runId: "run-1",
      toolCall: {
        callId: "call-1",
        sessionId: "session-1",
        runId: "run-1",
        turnId: "turn-1",
        messageId: "message-1",
        toolName: "apply_patch",
        status: "completed",
        input: { path: "docs/plan.md" },
        output: {
          path: "docs/plan.md",
        },
        startedAt: BASE_TIME + 50,
        updatedAt: BASE_TIME + 50,
        completedAt: BASE_TIME + 51,
        operation: {
          kind: "file_write",
          targetPaths: ["docs/plan.md"],
        },
      },
    }]);

    const messageParts = result.detail.messages[0]?.parts;
    const timelineMessageParts = result.detail.timeline[0]?.type === "message"
      ? result.detail.timeline[0].message.parts
      : [];

    expect(result.requiresReload).toBe(false);
    expect(messageParts).toHaveLength(2);
    expect(messageParts?.every((part) =>
      (part.type === "tool_call" || part.type === "tool_result")
        && part.toolCall?.callId === "call-1"
        && part.toolCall?.status === "completed"
        && part.toolCall?.operation.kind === "file_write")).toBe(true);
    expect(timelineMessageParts).toHaveLength(2);
    expect(timelineMessageParts.every((part) =>
      (part.type === "tool_call" || part.type === "tool_result")
        && part.toolCall?.callId === "call-1"
        && part.toolCall?.status === "completed"
        && part.toolCall?.operation.kind === "file_write")).toBe(true);
  });

  test("preserves message and timeline identity when a tool-call update is not referenced by visible parts", () => {
    const detail = createDetail();

    const result = mergeDesktopConversationRuntimeEvents(detail, [{
      type: "tool-call.updated",
      eventId: "event-4b",
      occurredAt: BASE_TIME + 55,
      sessionId: "session-1",
      runId: "run-1",
      toolCall: {
        callId: "call-unreferenced",
        sessionId: "session-1",
        runId: "run-1",
        turnId: "turn-1",
        messageId: "message-1",
        toolName: "apply_patch",
        status: "completed",
        input: { path: "docs/plan.md" },
        output: { path: "docs/plan.md" },
        startedAt: BASE_TIME + 55,
        updatedAt: BASE_TIME + 55,
        completedAt: BASE_TIME + 56,
        operation: {
          kind: "file_write",
          targetPaths: ["docs/plan.md"],
        },
      },
    }]);

    expect(result.requiresReload).toBe(false);
    expect(result.detail.messages).toBe(detail.messages);
    expect(result.detail.timeline[0]).toBe(detail.timeline[0]);
    expect(result.detail.toolCalls).toHaveLength(1);
  });

  test("merges compaction started into the current run without requiring a detail reload", () => {
    const detail = createDetail();

    const result = mergeDesktopConversationRuntimeEvents(detail, [{
      type: "compaction.started",
      eventId: "event-compaction-start",
      occurredAt: BASE_TIME + 60,
      sessionId: "session-1",
      runId: "run-1",
      run: {
        runId: "run-1",
        sessionId: "session-1",
        status: "awaiting_compaction",
        startedAt: 1,
        updatedAt: BASE_TIME + 60,
        trigger: { kind: "user_message" },
        metadata: {
          compaction: {
            status: "running",
            attempt: 1,
            reason: "budget_exceeded",
            startedAt: BASE_TIME + 60,
          },
        },
      },
      compaction: {
        status: "running",
        attempt: 1,
        reason: "budget_exceeded",
        startedAt: BASE_TIME + 60,
      },
    }]);

    expect(result.requiresReload).toBe(false);
    expect(result.detail.runs.at(-1)).toEqual(expect.objectContaining({
      status: "awaiting_compaction",
      boundary: {
        kind: "awaiting_compaction",
        reason: "budget_exceeded",
      },
      metadata: expect.objectContaining({
        compaction: expect.objectContaining({
          status: "running",
          attempt: 1,
        }),
      }),
    }));
  });

  test("clears the visible compaction state when compaction completes", () => {
    const detail = createDetail();
    detail.currentContextBudget = {
      runId: "run-1",
      estimatedPromptTokens: 2048,
      contextWindowTokens: 128000,
      shouldAutoCompress: false,
      breakdown: {
        systemTokens: 20,
        contextTokens: 10,
        messageTokens: 2018,
        toolTokens: 0,
        outputSchemaTokens: 0,
      },
      compaction: {
        status: "running",
        attempt: 1,
        reason: "budget_exceeded",
        startedAt: "2026-05-04T00:00:00.060Z",
      },
    };

    const withRunningCompaction = mergeDesktopConversationRuntimeEvents(detail, [{
      type: "compaction.started",
      eventId: "event-compaction-running",
      occurredAt: BASE_TIME + 60,
      sessionId: "session-1",
      runId: "run-1",
      run: {
        runId: "run-1",
        sessionId: "session-1",
        status: "awaiting_compaction",
        startedAt: 1,
        updatedAt: BASE_TIME + 60,
        trigger: { kind: "user_message" },
        metadata: {
          compaction: {
            status: "running",
            attempt: 1,
            reason: "budget_exceeded",
            startedAt: BASE_TIME + 60,
          },
        },
      },
      compaction: {
        status: "running",
        attempt: 1,
        reason: "budget_exceeded",
        startedAt: BASE_TIME + 60,
      },
    }]).detail;

    const result = mergeDesktopConversationRuntimeEvents(withRunningCompaction, [{
      type: "compaction.completed",
      eventId: "event-compaction-complete",
      occurredAt: BASE_TIME + 80,
      sessionId: "session-1",
      runId: "run-1",
      run: {
        runId: "run-1",
        sessionId: "session-1",
        status: "planning",
        startedAt: 1,
        updatedAt: BASE_TIME + 80,
        trigger: { kind: "user_message" },
        metadata: {
          compaction: {
            status: "completed",
            attempt: 1,
            reason: "budget_exceeded",
            startedAt: BASE_TIME + 60,
            completedAt: BASE_TIME + 80,
            summaryMessageId: "message-summary-1",
            checkpointId: "checkpoint-1",
            continuationKind: "system_continue",
            prunedMessageCount: 4,
            protectedMessageCount: 1,
            protectedToolNames: [],
          },
        },
      },
      compaction: {
        status: "completed",
        attempt: 1,
        reason: "budget_exceeded",
        startedAt: BASE_TIME + 60,
        completedAt: BASE_TIME + 80,
        summaryMessageId: "message-summary-1",
        checkpointId: "checkpoint-1",
        continuationKind: "system_continue",
        prunedMessageCount: 4,
        protectedMessageCount: 1,
        protectedToolNames: [],
      },
    }]);

    expect(result.requiresReload).toBe(false);
    expect(result.detail.runs.at(-1)).toEqual(expect.objectContaining({
      status: "planning",
      boundary: undefined,
      metadata: expect.objectContaining({
        compaction: expect.objectContaining({
          status: "completed",
        }),
      }),
    }));
    expect(result.detail.currentContextBudget?.compaction).toEqual(expect.objectContaining({
      status: "completed",
      completedAt: "2026-05-04T00:00:00.080Z",
    }));
  });

  test("ignores stale compaction started events that arrive after a newer terminal compaction state", () => {
    const detail = mergeDesktopConversationRuntimeEvents(createDetail(), [{
      type: "compaction.completed",
      eventId: "event-compaction-newer",
      occurredAt: BASE_TIME + 100,
      sessionId: "session-1",
      runId: "run-1",
      run: {
        runId: "run-1",
        sessionId: "session-1",
        status: "planning",
        startedAt: 1,
        updatedAt: BASE_TIME + 100,
        trigger: { kind: "user_message" },
        metadata: {
          compaction: {
            status: "completed",
            attempt: 1,
            reason: "budget_exceeded",
            startedAt: BASE_TIME + 60,
            completedAt: BASE_TIME + 100,
            summaryMessageId: "message-summary-1",
            checkpointId: "checkpoint-1",
            continuationKind: "system_continue",
            prunedMessageCount: 4,
            protectedMessageCount: 1,
            protectedToolNames: [],
          },
        },
      },
      compaction: {
        status: "completed",
        attempt: 1,
        reason: "budget_exceeded",
        startedAt: BASE_TIME + 60,
        completedAt: BASE_TIME + 100,
        summaryMessageId: "message-summary-1",
        checkpointId: "checkpoint-1",
        continuationKind: "system_continue",
        prunedMessageCount: 4,
        protectedMessageCount: 1,
        protectedToolNames: [],
      },
    }]).detail;

    const result = mergeDesktopConversationRuntimeEvents(detail, [{
      type: "compaction.started",
      eventId: "event-compaction-stale",
      occurredAt: BASE_TIME + 90,
      sessionId: "session-1",
      runId: "run-1",
      run: {
        runId: "run-1",
        sessionId: "session-1",
        status: "awaiting_compaction",
        startedAt: 1,
        updatedAt: BASE_TIME + 90,
        trigger: { kind: "user_message" },
        metadata: {
          compaction: {
            status: "running",
            attempt: 1,
            reason: "budget_exceeded",
            startedAt: BASE_TIME + 90,
          },
        },
      },
      compaction: {
        status: "running",
        attempt: 1,
        reason: "budget_exceeded",
        startedAt: BASE_TIME + 90,
      },
    }]);

    expect(result.requiresReload).toBe(false);
    expect(result.detail.runs.at(-1)).toEqual(expect.objectContaining({
      status: "planning",
      metadata: expect.objectContaining({
        compaction: expect.objectContaining({
          status: "completed",
        }),
      }),
    }));
  });
});
