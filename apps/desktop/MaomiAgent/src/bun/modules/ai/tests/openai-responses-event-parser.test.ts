import { describe, expect, test } from "bun:test";

import {
  readOpenAIResponseJsonEvents,
  streamOpenAIResponseEvents,
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

describe("OpenAI response event parser", () => {
  test("normalizes JSON response payload into kernel turn events", () => {
    const events = readOpenAIResponseJsonEvents({
      response: {
        id: "resp_json_1",
        status: "incomplete",
        incomplete_details: {
          reason: "max_output_tokens",
        },
        output: [{
          type: "reasoning",
          summary: [{
            text: "Need a tool first.",
          }],
        }, {
          type: "function_call",
          id: "call_1",
          name: "git.status",
          arguments: '{"path":"."}',
        }, {
          type: "message",
          content: [{
            text: "Status is clean.",
          }],
        }],
        usage: {
          input_tokens: 5,
          output_tokens: 7,
          input_tokens_details: {
            cached_tokens: 1,
          },
          output_tokens_details: {
            reasoning_tokens: 2,
          },
        },
      },
    });

    expect(events).toEqual([{ 
      type: "reasoning.start",
    }, {
      type: "reasoning.delta",
      delta: "Need a tool first.",
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
      type: "text.start",
    }, {
      type: "text.delta",
      delta: "Status is clean.",
    }, {
      type: "text.end",
    }, {
      type: "usage",
      usage: {
        inputTokens: 5,
        outputTokens: 7,
        cachedInputTokens: 1,
        reasoningTokens: 2,
      },
    }, {
      type: "finish",
      reason: "max_tokens",
      metadata: {
        providerResponseId: "resp_json_1",
        providerStatus: "incomplete",
        providerReason: "max_output_tokens",
      },
    }]);
  });

  test("emits a retryable provider error when the SSE stream ends without a terminal event", async () => {
    const response = new Response([
      'data: {"type":"response.output_item.added","item":{"type":"message"}}\n\n',
      'data: {"type":"response.output_text.delta","delta":"partial answer"}\n\n',
    ].join(""), {
      headers: {
        "content-type": "text/event-stream",
      },
    });

    const events = await collectEvents(streamOpenAIResponseEvents(response));

    expect(events).toEqual([{ 
      type: "text.start",
    }, {
      type: "text.delta",
      delta: "partial answer",
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