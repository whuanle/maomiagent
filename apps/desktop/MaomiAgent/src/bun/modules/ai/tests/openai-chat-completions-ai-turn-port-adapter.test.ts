import { afterEach, describe, expect, test } from "bun:test";

import {
  OpenAIChatCompletionsAiTurnPortAdapter,
} from "../implementation/openai";
import type {
  AiTurnEvent,
  AiTurnRequest,
  PromptCodec,
} from "../kernel-bridge";
import type { OpenAIChatCompletionsPromptPayload } from "../implementation/openai";

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

  test("uses the selected execution profile model id for openai-compatible channels", async () => {
    let capturedBody = "";

    globalThis.fetch = (async (_input, init) => {
      capturedBody = String(init?.body ?? "");

      return new Response(JSON.stringify({
        id: "chatcmpl_kimi_1",
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
        apiKey: "kimi-test-key",
        baseUrl: "https://api.kimi.com/coding/v1",
      }),
    });

    await collectEvents(adapter.stream({
      ...createTurnRequest(),
      executionProfile: {
        id: "profile-kimi-coding" as AiTurnRequest["executionProfile"]["id"],
        modelId: "kimi-k2.5",
      },
    }));

    expect(JSON.parse(capturedBody)).toMatchObject({
      model: "kimi-k2.5",
    });
  });

  test("forwards configured headers for Kimi Coding chat completions", async () => {
    let capturedHeaders: HeadersInit | undefined;

    globalThis.fetch = (async (_input, init) => {
      capturedHeaders = init?.headers;

      return new Response(JSON.stringify({
        id: "chatcmpl_kimi_headers_1",
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
        apiKey: "kimi-test-key",
        baseUrl: "https://api.kimi.com/coding/v1",
        headers: {
          "User-Agent": "KimiCLI/1.3",
        },
      }),
    });

    await collectEvents(adapter.stream({
      ...createTurnRequest(),
      executionProfile: {
        id: "profile-kimi-coding-headers" as AiTurnRequest["executionProfile"]["id"],
        modelId: "kimi-k2.6",
      },
    }));

    expect(capturedHeaders).toEqual(expect.objectContaining({
      Authorization: "Bearer kimi-test-key",
      "Content-Type": "application/json",
      "User-Agent": "KimiCLI/1.3",
    }));
  });

  test("uses compatible system and tool names for openai-compatible chat providers", async () => {
    let capturedBody = "";

    globalThis.fetch = (async (_input, init) => {
      capturedBody = String(init?.body ?? "");

      return new Response(JSON.stringify({
        id: "chatcmpl_kimi_tool_1",
        choices: [{
          index: 0,
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "tool_call_1",
              type: "function",
              function: {
                name: "workspace_read_status",
                arguments: "{\"path\":\".\"}",
              },
            }],
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
        apiKey: "kimi-test-key",
        baseUrl: "https://api.kimi.com/coding/v1",
      }),
    });

    const request = createTurnRequest();
    request.prompt.systemBlocks = [{
      id: "system_1",
      kind: "instruction",
      content: "Be concise.",
    } as PromptEnvelope["systemBlocks"][number]];
    request.prompt.tools = [{
      name: "workspace.read_status",
      description: "Read workspace status",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
          },
        },
        required: ["path"],
      },
    } as PromptEnvelope["tools"][number]];
    request.settings.toolChoice = "auto";

    const events = await collectEvents(adapter.stream(request));
    const body = JSON.parse(capturedBody);

    expect(body.messages[0]).toMatchObject({
      role: "system",
      content: "[system:instruction:system_1]\nBe concise.",
    });
    expect(body.tools[0].function.name).toBe("workspace_read_status");
    expect(events).toContainEqual({
      type: "tool.call",
      toolCallId: "tool_call_1",
      toolName: "workspace.read_status",
      input: {
        path: ".",
      },
    });
  });

  test("adds empty reasoning content to assistant tool call history when thinking is enabled", async () => {
    let capturedBody = "";

    const codec: PromptCodec<OpenAIChatCompletionsPromptPayload> = {
      encode() {
        return {
          messages: [{
            role: "user",
            content: "Inspect workspace",
          }, {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "tool_call_1",
              type: "function",
              function: {
                name: "git.status",
                arguments: "{\"path\":\".\"}",
              },
            }],
          }],
          tools: [{
            type: "function",
            function: {
              name: "git.status",
              parameters: {
                type: "object",
                properties: {
                  path: {
                    type: "string",
                  },
                },
                required: ["path"],
              },
              strict: true,
            },
          }],
          toolChoice: "auto",
        };
      },
    };

    globalThis.fetch = (async (_input, init) => {
      capturedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({
        id: "chatcmpl_reasoning_fix_1",
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
      codec,
      resolveConfig: () => ({
        apiKey: "test-key",
        baseUrl: "https://api.openai.com/v1",
        reasoning: {
          effort: "medium",
        },
      }),
    });

    await collectEvents(adapter.stream(createTurnRequest()));

    expect(JSON.parse(capturedBody)).toMatchObject({
      reasoning_effort: "medium",
      messages: [{
        role: "user",
        content: "Inspect workspace",
      }, {
        role: "assistant",
        content: null,
        reasoning_content: "",
        tool_calls: [{
          id: "tool_call_1",
          type: "function",
          function: {
            name: "git_status",
            arguments: "{\"path\":\".\"}",
          },
        }],
      }],
    });
  });
});
