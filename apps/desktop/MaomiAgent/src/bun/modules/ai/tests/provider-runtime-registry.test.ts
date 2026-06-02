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
  GoogleGenerateContentAiTurnPortAdapter,
} from "../implementation/google";
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
    }, {
      id: "google-generate-content",
      protocolFamily: "google",
      apiStyle: "generate-content",
      adapterId: "google-generate-content",
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

  test("resolves the google descriptor and builds the matching ai turn port", () => {
    const descriptor = findDesktopAiProviderRuntimeDescriptor({
      protocolFamily: "google",
      apiStyle: "generate-content",
    });

    expect(descriptor).toBeDefined();
    const turnPort = descriptor?.createTurnPort({
      resolveServiceConfig: async () => ({
        apiKey: "google-test-key",
      }),
    });

    expect(turnPort).toBeInstanceOf(GoogleGenerateContentAiTurnPortAdapter);
  });

  test("streams google turns through the AI SDK provider runtime with custom base url and headers", async () => {
    const descriptor = findDesktopAiProviderRuntimeDescriptor({
      protocolFamily: "google",
      apiStyle: "generate-content",
    });
    const requests: Array<{
      url: string;
      headers: Record<string, string>;
      body: string;
    }> = [];

    const turnPort = descriptor?.createTurnPort({
      resolveServiceConfig: async () => ({
        apiKey: "google-test-key",
        baseUrl: "https://google.example.test/v1beta",
        headers: {
          "x-test-header": "runtime-registry",
        },
        project: "maomi-google-project",
      }),
      fetchFn: (async (
        requestInfo: Parameters<typeof fetch>[0],
        requestInit?: Parameters<typeof fetch>[1],
      ) => {
        requests.push({
          url: String(requestInfo),
          headers: Object.fromEntries(new Headers(requestInit?.headers).entries()),
          body: String(requestInit?.body ?? ""),
        });
        return new Response([
          'data: {"candidates":[{"content":{"parts":[{"text":"Hello from Google"}]}}]}\n\n',
          'data: {"candidates":[{"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":2}}\n\n',
        ].join(""), {
          headers: {
            "content-type": "text/event-stream",
          },
        });
      }) as unknown as typeof fetch,
    });

    expect(turnPort).toBeInstanceOf(GoogleGenerateContentAiTurnPortAdapter);

    const events: Array<{
      type: string;
      delta?: string;
      reason?: string;
      metadata?: Record<string, unknown>;
    }> = [];
    for await (const event of turnPort!.stream({
      executionProfile: {
        id: "profile-registry-google" as never,
        modelId: "gemini-2.5-flash",
      },
      prompt: {
        sessionId: "session-registry-google" as never,
        runId: "run-registry-google" as never,
        turnId: "turn-registry-google" as never,
        agentId: "assistant.default",
        systemBlocks: [],
        contextBlocks: [],
        messages: [{
          message: {
            id: "message-user-registry-google" as never,
            sessionId: "session-registry-google" as never,
            role: "user",
            createdAt: 1,
          },
          parts: [{
            id: "part-user-registry-google" as never,
            type: "text",
            text: "Probe google runtime",
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

    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      url: "https://google.example.test/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
      headers: expect.objectContaining({
        "content-type": "application/json",
        "x-goog-api-key": "google-test-key",
        "x-goog-user-project": "maomi-google-project",
        "x-test-header": "runtime-registry",
      }),
      body: JSON.stringify({
        generationConfig: {},
        contents: [{
          role: "user",
          parts: [{
            text: "Probe google runtime",
          }],
        }],
      }),
    });
    expect(events).toContainEqual({
      type: "text.delta",
      delta: "Hello from Google",
    });
    expect(events).toContainEqual({
      type: "finish",
      reason: "stop",
      metadata: expect.objectContaining({
        providerReason: "STOP",
      }),
    });
  });

  test("prefers explicit google auth headers when the channel omits apiKey", async () => {
    const descriptor = findDesktopAiProviderRuntimeDescriptor({
      protocolFamily: "google",
      apiStyle: "generate-content",
    });
    const requests: Array<{
      url: string;
      headers: Record<string, string>;
    }> = [];

    const turnPort = descriptor?.createTurnPort({
      resolveServiceConfig: async () => ({
        apiKey: "",
        baseUrl: "https://google.example.test/v1beta",
        headers: {
          "x-goog-api-key": "header-google-key",
          "x-test-header": "header-only-auth",
        },
      }),
      fetchFn: (async (
        requestInfo: Parameters<typeof fetch>[0],
        requestInit?: Parameters<typeof fetch>[1],
      ) => {
        requests.push({
          url: String(requestInfo),
          headers: Object.fromEntries(new Headers(requestInit?.headers).entries()),
        });
        return new Response([
          'data: {"candidates":[{"content":{"parts":[{"text":"Header auth works"}]}}]}\n\n',
          'data: {"candidates":[{"finishReason":"STOP"}]}\n\n',
        ].join(""), {
          headers: {
            "content-type": "text/event-stream",
          },
        });
      }) as unknown as typeof fetch,
    });

    const events: Array<{ type: string; delta?: string }> = [];
    for await (const event of turnPort!.stream({
      executionProfile: {
        id: "profile-registry-google-header-only" as never,
        modelId: "gemini-2.5-flash",
      },
      prompt: {
        sessionId: "session-registry-google-header-only" as never,
        runId: "run-registry-google-header-only" as never,
        turnId: "turn-registry-google-header-only" as never,
        agentId: "assistant.default",
        systemBlocks: [],
        contextBlocks: [],
        messages: [{
          message: {
            id: "message-user-registry-google-header-only" as never,
            sessionId: "session-registry-google-header-only" as never,
            role: "user",
            createdAt: 1,
          },
          parts: [{
            id: "part-user-registry-google-header-only" as never,
            type: "text",
            text: "Use header auth",
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

    expect(requests).toHaveLength(1);
    expect(requests[0]).toEqual({
      url: "https://google.example.test/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
      headers: expect.objectContaining({
        "content-type": "application/json",
        "x-goog-api-key": "header-google-key",
        "x-test-header": "header-only-auth",
      }),
    });
    expect(events).toContainEqual({
      type: "text.delta",
      delta: "Header auth works",
    });
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
      })) as unknown as typeof fetch,
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
