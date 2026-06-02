import { afterEach, describe, expect, test } from "bun:test";

import type { DesktopAiProviderTelemetryStage } from "../abstraction/models/desktop-ai-runtime.models";
import {
  AnthropicMessagesAiTurnPortAdapter,
} from "../implementation/anthropic";
import type {
  AiTurnEvent,
  AiTurnRequest,
} from "../kernel-bridge";
import {
  asToolCallId,
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
      Accept: "text/event-stream",
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

  test("treats SSE payloads as streaming even when the provider omits the event-stream content type", async () => {
    globalThis.fetch = (async () => new Response([
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_stream_1","usage":{"input_tokens":12,"output_tokens":0}}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"先看一下问题。"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"先定位流式返回。"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":"已经开始输出"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"，现在继续流式显示。"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":8}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].join(""), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    })) as typeof fetch;

    const adapter = new AnthropicMessagesAiTurnPortAdapter({
      resolveConfig: () => ({
        apiKey: "kimi-test-key",
        baseUrl: "https://api.kimi.com/coding/v1",
      }),
    });

    const events = await collectEvents(adapter.stream(createTurnRequest()));

    expect(events).toEqual([{
      type: "reasoning.start",
    }, {
      type: "reasoning.delta",
      delta: "先看一下问题。",
    }, {
      type: "reasoning.delta",
      delta: "先定位流式返回。",
    }, {
      type: "reasoning.end",
    }, {
      type: "text.start",
    }, {
      type: "text.delta",
      delta: "已经开始输出",
    }, {
      type: "text.delta",
      delta: "，现在继续流式显示。",
    }, {
      type: "text.end",
    }, {
      type: "usage",
      usage: {
        inputTokens: 12,
        outputTokens: 8,
      },
    }, {
      type: "finish",
      reason: "stop",
      metadata: {
        providerResponseId: "msg_stream_1",
        providerReason: "end_turn",
      },
    }]);
  });

  test("publishes shared protocol runner telemetry stages during streaming turns", async () => {
    const telemetry: DesktopAiProviderTelemetryStage[] = [];

    globalThis.fetch = (async () => new Response([
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_stream_telemetry","usage":{"input_tokens":9,"output_tokens":0}}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":"telemetry"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" works"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":4}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].join(""), {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    })) as typeof fetch;

    const adapter = new AnthropicMessagesAiTurnPortAdapter({
      resolveConfig: () => ({
        apiKey: "kimi-test-key",
        baseUrl: "https://api.kimi.com/coding/v1",
      }),
      telemetrySink: async (entry) => {
        telemetry.push(entry.stage);
      },
    });

    const events = await collectEvents(adapter.stream(createTurnRequest()));

    expect(events).toEqual(expect.arrayContaining([{
      type: "text.delta",
      delta: " works",
    }]));
    expect(telemetry).toEqual([
      "request_built",
      "request_sent",
      "response_headers",
      "first_byte",
      "first_protocol_frame",
      "first_ai_event",
      "stream_finished",
    ]);
  });

  test("includes reasoning_content for assistant tool history on Kimi anthropic-compatible turns", async () => {
    let capturedBody = "";
    const request = createTurnRequest();
    request.prompt.messages = [{
      message: {
        id: "message_user_history_1" as PromptMessageId,
        sessionId: request.prompt.sessionId,
        role: "user",
        createdAt: 1,
      },
      parts: [{
        id: "message_user_history_1_part_1" as PromptMessagePartId,
        type: "text",
        text: "Inspect workspace",
      }],
    }, {
      message: {
        id: "message_assistant_history_1" as PromptMessageId,
        sessionId: request.prompt.sessionId,
        role: "assistant",
        createdAt: 2,
      },
      parts: [{
        id: "message_assistant_history_1_part_1" as PromptMessagePartId,
        type: "tool_call_ref",
        toolCallId: asToolCallId("tool_call_1"),
        toolName: "git.status",
        input: {
          path: ".",
        },
      }],
    }];
    request.prompt.tools = [{
      name: "git.status",
      description: "Read git status",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
          },
        },
        required: ["path"],
      },
    }];
    request.settings.toolChoice = "auto";

    globalThis.fetch = (async (_input, init) => {
      capturedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({
        id: "msg_reasoning_fix_1",
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

    await collectEvents(adapter.stream(request));

    expect(JSON.parse(capturedBody)).toMatchObject({
      messages: [{
        role: "user",
        content: [{
          type: "text",
          text: "Inspect workspace",
        }],
      }, {
        role: "assistant",
        reasoning_content: "",
        content: [{
          type: "tool_use",
          id: "tool_call_1",
          name: "git.status",
          input: {
            path: ".",
          },
        }],
      }],
    });
  });
});
