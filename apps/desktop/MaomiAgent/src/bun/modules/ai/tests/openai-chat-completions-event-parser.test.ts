import { describe, expect, test } from "bun:test";

import {
  readOpenAIChatCompletionJsonEvents,
  streamOpenAIChatCompletionEvents,
} from "../implementation/openai";
import {
  asToolCallId,
  type AiTurnEvent,
} from "../kernel-bridge";

async function collectEvents(stream: AsyncIterable<AiTurnEvent>): Promise<AiTurnEvent[]> {
  const events: AiTurnEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe("OpenAI chat completions event parser", () => {
  test("normalizes JSON response payload into kernel turn events", () => {
    const events = readOpenAIChatCompletionJsonEvents({
      id: "chatcmpl_json_1",
      choices: [{
        index: 0,
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          reasoning_content: "Need to inspect git first.",
          content: null,
          tool_calls: [{
            id: "call_1",
            type: "function",
            function: {
              name: "git.status",
              arguments: '{"path":"."}',
            },
          }],
        },
      }],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 7,
        prompt_tokens_details: {
          cached_tokens: 3,
        },
        completion_tokens_details: {
          reasoning_tokens: 2,
        },
      },
    });

    expect(events).toEqual([{
      type: "reasoning.start",
    }, {
      type: "reasoning.delta",
      delta: "Need to inspect git first.",
    }, {
      type: "reasoning.end",
    }, {
      type: "tool.call",
      toolCallId: asToolCallId("call_1"),
      toolName: "git.status",
      input: {
        path: ".",
      },
    }, {
      type: "usage",
      usage: {
        inputTokens: 11,
        outputTokens: 7,
        cachedInputTokens: 3,
        reasoningTokens: 2,
      },
    }, {
      type: "finish",
      reason: "tool_calls",
      metadata: {
        providerResponseId: "chatcmpl_json_1",
        providerReason: "tool_calls",
      },
    }]);
  });

  test("accumulates streamed tool call argument fragments until the terminal chunk", async () => {
    const response = new Response([
      'data: {"id":"chatcmpl_stream_1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_stream_1","function":{"name":"git.status","arguments":"{\\"path\\":\\""}}]},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl_stream_1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":".\\"}"}}]},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl_stream_1","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      'data: [DONE]\n\n',
    ].join(""), {
      headers: {
        "content-type": "text/event-stream",
      },
    });

    const events = await collectEvents(streamOpenAIChatCompletionEvents(response));

    expect(events).toEqual([{
      type: "tool.call",
      toolCallId: asToolCallId("call_stream_1"),
      toolName: "git.status",
      input: {
        path: ".",
      },
    }, {
      type: "finish",
      reason: "tool_calls",
      metadata: {
        providerResponseId: "chatcmpl_stream_1",
        providerReason: "tool_calls",
      },
    }]);
  });

  test("emits streamed reasoning_content deltas before text deltas", async () => {
    const response = new Response([
      'data: {"id":"chatcmpl_stream_reasoning_1","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl_stream_reasoning_1","choices":[{"index":0,"delta":{"reasoning_content":"Need"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl_stream_reasoning_1","choices":[{"index":0,"delta":{"reasoning_content":" to inspect"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl_stream_reasoning_1","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl_stream_reasoning_1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":11,"completion_tokens":5,"completion_tokens_details":{"reasoning_tokens":3}}}\n\n',
      'data: [DONE]\n\n',
    ].join(""), {
      headers: {
        "content-type": "text/event-stream",
      },
    });

    const events = await collectEvents(streamOpenAIChatCompletionEvents(response));

    expect(events).toEqual([{
      type: "reasoning.start",
    }, {
      type: "reasoning.delta",
      delta: "Need",
    }, {
      type: "reasoning.delta",
      delta: " to inspect",
    }, {
      type: "text.start",
    }, {
      type: "text.delta",
      delta: "ok",
    }, {
      type: "reasoning.end",
    }, {
      type: "text.end",
    }, {
      type: "usage",
      usage: {
        inputTokens: 11,
        outputTokens: 5,
        reasoningTokens: 3,
      },
    }, {
      type: "finish",
      reason: "stop",
      metadata: {
        providerResponseId: "chatcmpl_stream_reasoning_1",
        providerReason: "stop",
      },
    }]);
  });

  test("emits a retryable provider error when the SSE stream ends without a terminal event", async () => {
    const response = new Response([
      'data: {"id":"chatcmpl_stream_2","choices":[{"index":0,"delta":{"content":"partial"},"finish_reason":null}]}\n\n',
    ].join(""), {
      headers: {
        "content-type": "text/event-stream",
      },
    });

    const events = await collectEvents(streamOpenAIChatCompletionEvents(response));

    expect(events).toEqual([{
      type: "text.start",
    }, {
      type: "text.delta",
      delta: "partial",
    }, {
      type: "text.end",
    }, {
      type: "error",
      error: {
        code: "provider_error",
        message: "OpenAI stream ended before a terminal event was received",
        retryable: true,
      },
    }]);
  });
});
