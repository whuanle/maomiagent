import { describe, expect, test } from "bun:test";

import {
  findDesktopAiProviderRuntimeDescriptor,
  listDesktopAiProviderRuntimeDescriptors,
} from "../index";
import type { DesktopAiProviderTelemetryStage } from "../abstraction/models/desktop-ai-runtime.models";
import {
  AnthropicMessagesAiTurnPortAdapter,
} from "../implementation/anthropic";
import {
  OpenAIChatCompletionsAiTurnPortAdapter,
  OpenAIResponsesAiTurnPortAdapter,
} from "../implementation/openai";

describe("desktop ai provider runtime registry", () => {
  test("lists the implemented runtime descriptors", () => {
    expect(listDesktopAiProviderRuntimeDescriptors().map((item) => ({
      id: item.id,
      protocolFamily: item.protocolFamily,
      apiStyle: item.apiStyle,
      adapterId: item.adapterId,
    }))).toEqual([{
      id: "openai-responses",
      protocolFamily: "openai",
      apiStyle: "responses",
      adapterId: "openai-responses",
    }, {
      id: "openai-chat-completions",
      protocolFamily: "openai",
      apiStyle: "chat-completions",
      adapterId: "openai-chat-completions",
    }, {
      id: "anthropic-messages",
      protocolFamily: "anthropic",
      apiStyle: "messages",
      adapterId: "anthropic-messages",
    }]);
  });

  test("resolves a runtime descriptor and builds an ai turn port through the module registry", () => {
    const descriptor = findDesktopAiProviderRuntimeDescriptor({
      protocolFamily: "openai",
      apiStyle: "responses",
    });

    expect(descriptor).toBeDefined();
    const turnPort = descriptor?.createTurnPort({
      resolveServiceConfig: async () => ({
        apiKey: "sk-test",
      }),
    });

    expect(turnPort).toBeInstanceOf(OpenAIResponsesAiTurnPortAdapter);
  });

  test("resolves the chat completions descriptor and builds the matching ai turn port", () => {
    const descriptor = findDesktopAiProviderRuntimeDescriptor({
      protocolFamily: "openai",
      apiStyle: "chat-completions",
    });

    expect(descriptor).toBeDefined();
    const turnPort = descriptor?.createTurnPort({
      resolveServiceConfig: async () => ({
        apiKey: "sk-test",
      }),
    });

    expect(turnPort).toBeInstanceOf(OpenAIChatCompletionsAiTurnPortAdapter);
  });

  test("resolves the anthropic descriptor and builds the matching ai turn port", () => {
    const descriptor = findDesktopAiProviderRuntimeDescriptor({
      protocolFamily: "anthropic",
      apiStyle: "messages",
    });

    expect(descriptor).toBeDefined();
    const turnPort = descriptor?.createTurnPort({
      resolveServiceConfig: async () => ({
        apiKey: "sk-test",
      }),
    });

    expect(turnPort).toBeInstanceOf(AnthropicMessagesAiTurnPortAdapter);
  });

  test("passes the telemetry sink through the registry into the resolved adapter", async () => {
    const descriptor = findDesktopAiProviderRuntimeDescriptor({
      protocolFamily: "anthropic",
      apiStyle: "messages",
    });
    const telemetry: DesktopAiProviderTelemetryStage[] = [];
    const turnPort = descriptor?.createTurnPort({
      resolveServiceConfig: async () => ({
        apiKey: "kimi-test-key",
        baseUrl: "https://api.kimi.com/coding/v1",
      }),
      fetchFn: (async () => new Response([
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_registry_1","usage":{"input_tokens":4,"output_tokens":0}}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":"registry"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" telemetry"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ].join(""), {
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
      })) as typeof fetch,
      telemetrySink: async (event) => {
        telemetry.push(event.stage);
      },
    });

    expect(turnPort).toBeInstanceOf(AnthropicMessagesAiTurnPortAdapter);

    const events: Array<{ type: string; delta?: string }> = [];
    for await (const event of turnPort!.stream({
      executionProfile: {
        id: "profile-registry-telemetry" as never,
        modelId: "kimi-k2.5",
      },
      prompt: {
        sessionId: "session-registry-telemetry" as never,
        runId: "run-registry-telemetry" as never,
        turnId: "turn-registry-telemetry" as never,
        agentId: "assistant.default",
        systemBlocks: [],
        contextBlocks: [],
        messages: [{
          message: {
            id: "message-user-registry-telemetry" as never,
            sessionId: "session-registry-telemetry" as never,
            role: "user",
            createdAt: 1,
          },
          parts: [{
            id: "part-user-registry-telemetry" as never,
            type: "text",
            text: "Probe telemetry",
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
    })) {
      events.push(event);
    }

    expect(events).toEqual(expect.arrayContaining([{
      type: "text.delta",
      delta: " telemetry",
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
});
