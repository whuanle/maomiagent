import { afterEach, describe, expect, test } from "bun:test";

import {
  OpenAIChatCompletionsAiTurnPortAdapter,
} from "../implementation/openai";
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
      id: "profile-openai-main" as AiTurnRequest["executionProfile"]["id"],
      modelId: "gpt-5.1",
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

describe("OpenAIChatCompletionsAiTurnPortAdapter", () => {
  test("uses Azure-compatible endpoint and api-key header for chat completions", async () => {
    let capturedUrl = "";
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody = "";

    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = init?.headers;
      capturedBody = String(init?.body ?? "");

      return new Response(JSON.stringify({
        id: "chatcmpl_azure_1",
        choices: [{
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "ok",
          },
        }],
      }), {
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch;

    const adapter = new OpenAIChatCompletionsAiTurnPortAdapter({
      resolveConfig: () => ({
        apiKey: "azure-test-key",
        baseUrl: "https://maomi-test.openai.azure.com/openai",
      }),
    });

    const events = await collectEvents(adapter.stream(createTurnRequest()));

    expect(capturedUrl).toBe("https://maomi-test.openai.azure.com/openai/v1/chat/completions");
    expect(capturedHeaders).toEqual(expect.objectContaining({
      "Content-Type": "application/json",
      "api-key": "azure-test-key",
    }));
    expect(JSON.parse(capturedBody)).toMatchObject({
      model: "gpt-5.1",
    });
    expect(JSON.parse(capturedBody)).not.toHaveProperty("metadata");
    expect(JSON.parse(capturedBody)).not.toHaveProperty("tool_choice");
    expect(events.at(-1)).toEqual({
      type: "finish",
      reason: "stop",
      metadata: {
        providerResponseId: "chatcmpl_azure_1",
        providerReason: "stop",
      },
    });
  });
});