import { afterEach, describe, expect, test } from "bun:test";

import {
  AnthropicMessagesAiTurnPortAdapter,
} from "../implementation/anthropic";
import type {
  AiTurnEvent,
  AiTurnRequest,
} from "../kernel-bridge";

const originalFetch = globalThis.fetch;

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
      id: "profile-kimi-main" as AiTurnRequest["executionProfile"]["id"],
      modelId: "kimi-k2.5",
    },
    prompt: {
      sessionId,
      runId,
      turnId,
      agentId: "assistant.default",
      systemBlocks: [],
      contextBlocks: [],
      messages: [
        {
          message: {
            id: "message_user_1" as PromptMessageId,
            sessionId,
            role: "user",
            createdAt: 1,
          },
          parts: [
            {
              id: "message_user_1_part_1" as PromptMessagePartId,
              type: "text",
              text: "Hello trace",
            },
          ],
        },
      ],
      tools: [],
      outputMode: {
        kind: "text",
      },
    },
    settings: {
      toolChoice: "none",
      maxOutputTokens: 4000,
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

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("AnthropicMessagesAiTurnPortAdapter", () => {
  test("uses anthropic-compatible endpoint, headers, and Kimi thinking config", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = init?.headers;
      capturedBody = String(init?.body ?? "");

      return new Response(JSON.stringify({
        id: "msg_1",
        content: [{
          type: "text",
          text: "ok",
        }],
        stop_reason: "end_turn",
        usage: {
          input_tokens: 10,
          output_tokens: 2,
        },
      }), {
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch;

    const adapter = new AnthropicMessagesAiTurnPortAdapter({
      resolveConfig: () => ({
        apiKey: "kimi-test-key",
        baseUrl: "https://api.kimi.com/coding/v1",
      }),
    });

    const events = await collectEvents(adapter.stream(createTurnRequest()));

    expect(capturedUrl).toBe("https://api.kimi.com/coding/v1/messages");
    expect(capturedHeaders).toEqual(expect.objectContaining({
      "Content-Type": "application/json",
      "x-api-key": "kimi-test-key",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
    }));
    expect(JSON.parse(capturedBody)).toMatchObject({
      model: "kimi-k2.5",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: [{
          type: "text",
          text: "Hello trace",
        }],
      }],
      thinking: {
        type: "enabled",
        budget_tokens: 2000,
      },
    });
    expect(events.at(-1)).toEqual({
      type: "finish",
      reason: "stop",
      metadata: {
        providerResponseId: "msg_1",
        providerReason: "end_turn",
      },
    });
  });
});