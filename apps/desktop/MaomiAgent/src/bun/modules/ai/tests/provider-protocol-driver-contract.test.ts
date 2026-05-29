import { describe, expect, test } from "bun:test";

import { runProtocolTurn } from "../implementation/shared/protocol-turn-runner";
import type { DesktopAiProtocolDriver } from "../implementation/shared/provider-protocol-driver";
import type { AiTurnEvent, AiTurnRequest } from "../kernel-bridge";

type PromptEnvelope = AiTurnRequest["prompt"];
type PromptMessage = PromptEnvelope["messages"][number];
type PromptMessageId = PromptMessage["message"]["id"];
type PromptMessagePartId = PromptMessage["parts"][number]["id"];

function createTurnRequest(): AiTurnRequest {
  const sessionId = "session_google_contract" as PromptEnvelope["sessionId"];
  const runId = "run_google_contract" as PromptEnvelope["runId"];
  const turnId = "turn_google_contract" as PromptEnvelope["turnId"];

  return {
    executionProfile: {
      id: "profile-google-contract" as AiTurnRequest["executionProfile"]["id"],
      modelId: "gemini-2.5-pro",
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
          id: "message_user_google_contract" as PromptMessageId,
          sessionId,
          role: "user",
          createdAt: 1,
        },
        parts: [{
          id: "message_user_google_contract_part_1" as PromptMessagePartId,
          type: "text",
          text: "Can the generic protocol driver contract accept a Google-style driver?",
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
  };
}

async function collectEvents(stream: AsyncIterable<AiTurnEvent>): Promise<AiTurnEvent[]> {
  const events: AiTurnEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function createStubGoogleDriver(): DesktopAiProtocolDriver {
  return {
    id: "google-generate-content-stub",
    capabilities: {
      supportsFunctionCall: true,
      supportsStructuredOutput: true,
    },
    async *execute() {
      yield {
        kind: "headers",
        status: 200,
        contentType: "application/json",
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
          delta: "gemini-ready",
        },
      };
      yield {
        kind: "event",
        event: {
          type: "finish",
          reason: "stop",
        },
      };
    },
  };
}

describe("provider protocol driver contract", () => {
  test("accepts a stub google generate-content driver without changing upper-layer contracts", async () => {
    const events = await collectEvents(runProtocolTurn({
      request: createTurnRequest(),
      config: {
        apiKey: "google-test-key",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      },
      driver: createStubGoogleDriver(),
      stageTimeouts: {
        firstByteMs: 50,
        firstEventMs: 50,
        idleMs: 50,
      },
    }));

    expect(events).toEqual(expect.arrayContaining([{
      type: "text.delta",
      delta: "gemini-ready",
    }]));
  });
});
