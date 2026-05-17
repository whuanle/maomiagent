import { describe, expect, test } from "bun:test";

import {
  readAnthropicMessageJsonEvents,
  streamAnthropicMessageEvents,
} from "../implementation/anthropic";
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

describe("Anthropic message event parser", () => {
  test("normalizes JSON response payload into kernel turn events", () => {
    const events = readAnthropicMessageJsonEvents({
      id: "msg_json_1",
      content: [{
        type: "thinking",
        thinking: "Need to inspect git first.",
      }, {
        type: "text",
        text: "Checking repository status.",
      }, {
        type: "tool_use",
        id: "call_1",
        name: "git.status",
        input: {
          path: ".",
        },
      }],
      stop_reason: "tool_use",
      usage: {
        input_tokens: 11,
        output_tokens: 7,
        cache_read_input_tokens: 3,
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
      type: "text.start",
    }, {
      type: "text.delta",
      delta: "Checking repository status.",
    }, {
      type: "text.end",
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
      },
    }, {
      type: "finish",
      reason: "tool_calls",
      metadata: {
        providerResponseId: "msg_json_1",
        providerReason: "tool_use",
      },
    }]);
  });

  test("accumulates streamed tool input fragments until the terminal event", async () => {
    const response = new Response([
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_stream_1","usage":{"input_tokens":11,"output_tokens":0}}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call_stream_1","name":"git.status","input":{}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":\\""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":".\\"}"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":3}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].join(""), {
      headers: {
        "content-type": "text/event-stream",
      },
    });

    const events = await collectEvents(streamAnthropicMessageEvents(response));

    expect(events).toEqual([{
      type: "tool.call",
      toolCallId: asToolCallId("call_stream_1"),
      toolName: "git.status",
      input: {
        path: ".",
      },
    }, {
      type: "usage",
      usage: {
        inputTokens: 11,
        outputTokens: 3,
      },
    }, {
      type: "finish",
      reason: "tool_calls",
      metadata: {
        providerResponseId: "msg_stream_1",
        providerReason: "tool_use",
      },
    }]);
  });
});