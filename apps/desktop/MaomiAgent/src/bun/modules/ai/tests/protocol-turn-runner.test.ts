import { describe, expect, test } from "bun:test";

import type { DesktopAiProviderTelemetryStage } from "../abstraction/models/desktop-ai-runtime.models";
import type {
  DesktopAiProtocolDriver,
  ProtocolTransportFrame,
} from "../implementation/shared/provider-protocol-driver";
import { runProtocolTurn } from "../implementation/shared/protocol-turn-runner";
import type { AiTurnEvent, AiTurnRequest } from "../kernel-bridge";

type PromptEnvelope = AiTurnRequest["prompt"];
type PromptMessage = PromptEnvelope["messages"][number];
type PromptMessageId = PromptMessage["message"]["id"];
type PromptMessagePartId = PromptMessage["parts"][number]["id"];

function createTurnRequest(): AiTurnRequest {
  const sessionId = "session_1" as PromptEnvelope["sessionId"];
  const runId = "run_1" as PromptEnvelope["runId"];
  const turnId = "turn_1" as PromptEnvelope["turnId"];

  return {
    executionProfile: {
      id: "profile-protocol-runner" as AiTurnRequest["executionProfile"]["id"],
      modelId: "fake-stream-model",
    },
    prompt: {
      sessionId,
      runId,
      turnId,
      agentId: "assistant.default",
      systemBlocks: [],
      contextBlocks: [],
      messages: [{
        message: {
          id: "message_user_1" as PromptMessageId,
          sessionId,
          role: "user",
          createdAt: 1,
        },
        parts: [{
          id: "message_user_1_part_1" as PromptMessagePartId,
          type: "text",
          text: "Hello protocol runner",
        }],
      }],
      tools: [],
      outputMode: {
        kind: "text",
      },
    },
    settings: {
      toolChoice: "none",
    },
    trace: {
      sessionId,
      runId,
      turnId,
    },
  };
}

async function collectEvents(stream: AsyncIterable<AiTurnEvent>): Promise<AiTurnEvent[]> {
  const events: AiTurnEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function createFakeDriver(execute: () => AsyncIterable<ProtocolTransportFrame>): DesktopAiProtocolDriver {
  return {
    id: "fake-protocol-driver",
    capabilities: {},
    execute: async function* () {
      yield* execute();
    },
  };
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("runProtocolTurn", () => {
  test("emits telemetry for request_sent, first_byte, first_protocol_frame, and first_ai_event", async () => {
    const telemetry: DesktopAiProviderTelemetryStage[] = [];
    const events = await collectEvents(runProtocolTurn({
      request: createTurnRequest(),
      config: {
        apiKey: "test-key",
      },
      telemetrySink: async (entry) => {
        telemetry.push(entry.stage);
      },
      driver: createFakeDriver(async function* () {
        yield {
          kind: "headers",
          status: 200,
          contentType: "text/event-stream",
        };
        yield {
          kind: "byte",
          chunk: "data: {\"type\":\"text.start\"}\n\n",
        };
        yield {
          kind: "event",
          event: {
            type: "text.start",
          },
        };
        yield {
          kind: "event",
          event: {
            type: "text.delta",
            delta: "hello",
          },
        };
        yield {
          kind: "event",
          event: {
            type: "finish",
            reason: "stop",
          },
        };
      }),
      stageTimeouts: {
        firstByteMs: 50,
        firstEventMs: 50,
        idleMs: 50,
      },
    }));

    expect(telemetry).toEqual([
      "request_built",
      "request_sent",
      "response_headers",
      "first_byte",
      "first_protocol_frame",
      "first_ai_event",
      "stream_finished",
    ]);
    expect(events).toEqual(expect.arrayContaining([{
      type: "text.delta",
      delta: "hello",
    }]));
  });

  test("returns provider_first_event_timeout when bytes arrive but no ai turn event is decoded", async () => {
    const events = await collectEvents(runProtocolTurn({
      request: createTurnRequest(),
      config: {
        apiKey: "test-key",
      },
      driver: createFakeDriver(async function* () {
        yield {
          kind: "headers",
          status: 200,
          contentType: "text/event-stream",
        };
        yield {
          kind: "byte",
          chunk: "event: ping\n\n",
        };
        await sleepMs(15);
      }),
      stageTimeouts: {
        firstByteMs: 50,
        firstEventMs: 5,
        idleMs: 50,
      },
    }));

    expect(events.at(-1)).toEqual({
      type: "error",
      error: expect.objectContaining({
        code: "provider_first_event_timeout",
        retryable: true,
        metadata: expect.objectContaining({
          phase: "first_event",
        }),
      }),
    });
  });
});
