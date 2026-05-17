import { afterEach, describe, expect, test } from "bun:test";

import {
  OpenAIResponsesAiTurnPortAdapter,
} from "../implementation/openai";
import type {
  AiTurnEvent,
  AiTurnRequest,
} from "../kernel-bridge";

const originalFetch = globalThis.fetch;

type PromptEnvelope = AiTurnRequest["prompt"];
type PromptMessage = AiTurnRequest["prompt"]["messages"][number];
type PromptMessageId = PromptMessage["message"]["id"];
type PromptMessagePartId = PromptMessage["parts"][number]["id"];

function createTurnRequest(): AiTurnRequest {
  const sessionId = "session_1" as PromptEnvelope["sessionId"];
  const runId = "run_1" as PromptEnvelope["runId"];
  const turnId = "turn_1" as PromptEnvelope["turnId"];

  return {
    executionProfile: {
      id: "gpt-5-mini" as AiTurnRequest["executionProfile"]["id"],
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

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("OpenAIResponsesAiTurnPortAdapter", () => {
  test("writes kernel trace context into OpenAI request metadata", async () => {
    const request = createTurnRequest();
    let capturedBody = "";

    globalThis.fetch = (async (_input, init) => {
      capturedBody = String(init?.body ?? "");

      return new Response(JSON.stringify({
        response: {
          id: "resp_1",
          status: "completed",
          output_text: "ok",
          usage: {
            input_tokens: 1,
            output_tokens: 1,
          },
        },
      }), {
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch;

    const adapter = new OpenAIResponsesAiTurnPortAdapter({
      resolveConfig: () => ({
        apiKey: "sk-test",
      }),
    });

    await collectEvents(adapter.stream(request));

    expect(JSON.parse(capturedBody)).toMatchObject({
      metadata: {
        maomi_session_id: "session_1",
        maomi_run_id: "run_1",
        maomi_turn_id: "turn_1",
      },
    });
  });

  test("uses typed execution profile model id before metadata or profile id", async () => {
    const request = {
      ...createTurnRequest(),
      executionProfile: {
        id: "profile-openai-main" as AiTurnRequest["executionProfile"]["id"],
        modelId: "gpt-5.1",
        metadata: {
          modelId: "metadata-model-should-not-win",
        },
      },
    } satisfies AiTurnRequest;
    let capturedBody = "";

    globalThis.fetch = (async (_input, init) => {
      capturedBody = String(init?.body ?? "");

      return new Response(JSON.stringify({
        response: {
          id: "resp_model_id_1",
          status: "completed",
          output_text: "ok",
        },
      }), {
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch;

    const adapter = new OpenAIResponsesAiTurnPortAdapter({
      resolveConfig: () => ({
        apiKey: "sk-test",
      }),
    });

    await collectEvents(adapter.stream(request));

    expect(JSON.parse(capturedBody)).toMatchObject({
      model: "gpt-5.1",
    });
  });

  test("emits provider terminal metadata from OpenAI JSON responses", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      response: {
        id: "resp_json_1",
        status: "incomplete",
        incomplete_details: {
          reason: "max_output_tokens",
        },
        output_text: "partial",
      },
    }), {
      headers: {
        "content-type": "application/json",
      },
    })) as unknown as typeof fetch;

    const adapter = new OpenAIResponsesAiTurnPortAdapter({
      resolveConfig: () => ({
        apiKey: "sk-test",
      }),
    });

    const events = await collectEvents(adapter.stream(createTurnRequest()));

    expect(events.at(-1)).toEqual({
      type: "finish",
      reason: "max_tokens",
      metadata: {
        providerResponseId: "resp_json_1",
        providerStatus: "incomplete",
        providerReason: "max_output_tokens",
      },
    });
  });
});