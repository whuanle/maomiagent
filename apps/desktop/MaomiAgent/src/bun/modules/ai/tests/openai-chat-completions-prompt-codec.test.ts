import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import {
  OpenAIChatCompletionsPromptCodec,
} from "../implementation/openai";
import {
  asToolCallId,
  type AiTurnRequest,
} from "../kernel-bridge";

type PromptEnvelope = AiTurnRequest["prompt"];
type PromptMessage = PromptEnvelope["messages"][number];
type PromptMessageId = PromptMessage["message"]["id"];
type PromptMessagePartId = PromptMessage["parts"][number]["id"];
const TEST_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3X8AAAAASUVORK5CYII=";

function createBaseTurnRequest(): AiTurnRequest {
  const sessionId = "session_1" as PromptEnvelope["sessionId"];
  const runId = "run_1" as PromptEnvelope["runId"];
  const turnId = "turn_1" as PromptEnvelope["turnId"];

  return {
    executionProfile: {
      id: "profile_openai_main" as AiTurnRequest["executionProfile"]["id"],
      modelId: "gpt-5-mini",
    },
    prompt: {
      sessionId,
      runId,
      turnId,
      agentId: "assistant.default",
      systemBlocks: [],
      contextBlocks: [],
      messages: [],
      tools: [],
      outputMode: {
        kind: "text",
      },
    },
    settings: {
      toolChoice: "auto",
    },
  };
}

function createTextMessage(input: {
  messageId: string;
  role: "system" | "user" | "assistant" | "tool";
  text: string;
}): PromptMessage {
  return {
    message: {
      id: input.messageId as PromptMessageId,
      sessionId: "session_1" as PromptEnvelope["sessionId"],
      role: input.role,
      createdAt: 1,
    },
    parts: [{
      id: `${input.messageId}_part_1` as PromptMessagePartId,
      type: "text",
      text: input.text,
    }],
  };
}

function createTempImageFile(fileName: string) {
  const directory = path.join(tmpdir(), "maomiagent-ai-tests");
  mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, fileName);
  writeFileSync(filePath, Buffer.from(TEST_IMAGE_BASE64, "base64"));
  return filePath;
}

describe("OpenAIChatCompletionsPromptCodec", () => {
  test("encodes system/context blocks and tool history into chat completions payload", () => {
    const codec = new OpenAIChatCompletionsPromptCodec();
    const request = createBaseTurnRequest();

    request.prompt.systemBlocks = [{
      id: "system_1",
      kind: "instruction",
      content: "Follow repository guardrails.",
    } as PromptEnvelope["systemBlocks"][number]];
    request.prompt.contextBlocks = [{
      id: "context_1",
      kind: "workspace",
      content: "Workspace: MaomiAgent",
    } as PromptEnvelope["contextBlocks"][number]];
    request.prompt.messages = [
      createTextMessage({
        messageId: "message_user_1",
        role: "user",
        text: "Inspect the repository status",
      }),
      {
        message: {
          id: "message_assistant_1" as PromptMessageId,
          sessionId: "session_1" as PromptEnvelope["sessionId"],
          role: "assistant",
          createdAt: 2,
        },
        parts: [{
          id: "message_assistant_1_part_1" as PromptMessagePartId,
          type: "text",
          text: "I will inspect git status.",
        }, {
          id: "message_assistant_1_part_2" as PromptMessagePartId,
          type: "tool_call_ref",
          toolCallId: asToolCallId("tool_call_1"),
          toolName: "git.status",
          input: {
            path: ".",
          },
        }],
      },
      {
        message: {
          id: "message_tool_1" as PromptMessageId,
          sessionId: "session_1" as PromptEnvelope["sessionId"],
          role: "tool",
          createdAt: 3,
        },
        parts: [{
          id: "message_tool_1_part_1" as PromptMessagePartId,
          type: "tool_result_ref",
          toolCallId: asToolCallId("tool_call_1"),
          toolName: "git.status",
        }, {
          id: "message_tool_1_part_2" as PromptMessagePartId,
          type: "text",
          text: "working tree clean",
        }],
      },
    ];
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
    } as PromptEnvelope["tools"][number]];
    request.settings.toolChoice = "required";

    const payload = codec.encode(request);

    expect(payload).toEqual({
      messages: [{
        role: "system",
        content: "[system:instruction:system_1]\nFollow repository guardrails.",
      }, {
        role: "system",
        content: "[context:workspace:context_1]\nWorkspace: MaomiAgent",
      }, {
        role: "user",
        content: "Inspect the repository status",
      }, {
        role: "assistant",
        content: "I will inspect git status.",
        reasoning_content: "",
        tool_calls: [{
          id: "tool_call_1",
          type: "function",
          function: {
            name: "git.status",
            arguments: '{"path":"."}',
          },
        }],
      }, {
        role: "tool",
        tool_call_id: "tool_call_1",
        content: "working tree clean",
      }],
      tools: [{
        type: "function",
        function: {
          name: "git.status",
          description: "Read git status",
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
      toolChoice: "required",
    });
  });

  test("adds empty reasoning content for assistant tool calls when no reasoning text exists", () => {
    const codec = new OpenAIChatCompletionsPromptCodec();
    const request = createBaseTurnRequest();

    request.prompt.messages = [{
      message: {
        id: "message_assistant_toolcall_without_reasoning" as PromptMessageId,
        sessionId: "session_1" as PromptEnvelope["sessionId"],
        role: "assistant",
        createdAt: 2,
      },
      parts: [{
        id: "message_assistant_toolcall_without_reasoning_part_1" as PromptMessagePartId,
        type: "tool_call_ref",
        toolCallId: asToolCallId("tool_call_without_reasoning"),
        toolName: "workspace-check",
        input: {
          path: ".",
        },
      }],
    }];

    const payload = codec.encode(request);

    expect(payload.messages).toEqual([{
      role: "assistant",
      content: null,
      reasoning_content: "",
      tool_calls: [{
        id: "tool_call_without_reasoning",
        type: "function",
        function: {
          name: "workspace-check",
          arguments: '{"path":"."}',
        },
      }],
    }]);
  });

  test("preserves assistant reasoning content alongside tool call history", () => {
    const codec = new OpenAIChatCompletionsPromptCodec();
    const request = createBaseTurnRequest();

    request.prompt.messages = [{
      message: {
        id: "message_assistant_reasoning_1" as PromptMessageId,
        sessionId: "session_1" as PromptEnvelope["sessionId"],
        role: "assistant",
        createdAt: 2,
      },
      parts: [{
        id: "message_assistant_reasoning_1_part_1" as PromptMessagePartId,
        type: "reasoning",
        text: "Need to inspect the workspace before editing.",
      }, {
        id: "message_assistant_reasoning_1_part_2" as PromptMessagePartId,
        type: "tool_call_ref",
        toolCallId: asToolCallId("tool_call_workspace_check"),
        toolName: "workspace-check",
        input: {
          path: ".",
        },
      }],
    }];

    const payload = codec.encode(request);

    expect(payload.messages).toEqual([{
      role: "assistant",
      content: null,
      reasoning_content: "Need to inspect the workspace before editing.",
      tool_calls: [{
        id: "tool_call_workspace_check",
        type: "function",
        function: {
          name: "workspace-check",
          arguments: '{"path":"."}',
        },
      }],
    }]);
  });

  test("summarizes heavy tool call arguments for chat completions", () => {
    const codec = new OpenAIChatCompletionsPromptCodec();
    const request = createBaseTurnRequest();

    request.prompt.messages = [{
      message: {
        id: "message_assistant_large_tool_call" as PromptMessageId,
        sessionId: "session_1" as PromptEnvelope["sessionId"],
        role: "assistant",
        createdAt: 2,
      },
      parts: [{
        id: "message_assistant_large_tool_call_part_1" as PromptMessagePartId,
        type: "tool_call_ref",
        toolCallId: asToolCallId("tool_call_large_write"),
        toolName: "workspace_write_file",
        input: {
          path: "docs/demo.md",
          content: "# Title\n" + "A".repeat(6000),
        },
      }],
    }];

    const payload = codec.encode(request);
    const toolCall = payload.messages.find((message) =>
      message.role === "assistant"
      && Array.isArray(message.tool_calls)
      && message.tool_calls.length > 0)?.tool_calls?.[0];

    expect(toolCall?.function.arguments).toContain("\"content\"");
    expect(toolCall?.function.arguments).toContain("Historical file body omitted");
    expect(toolCall?.function.arguments).not.toContain("A".repeat(300));
  });

  test("summarizes heavy tool results for chat completions", () => {
    const codec = new OpenAIChatCompletionsPromptCodec();
    const request = createBaseTurnRequest();

    request.prompt.messages = [{
      message: {
        id: "message_tool_large_terminal_output" as PromptMessageId,
        sessionId: "session_1" as PromptEnvelope["sessionId"],
        role: "tool",
        createdAt: 3,
      },
      parts: [{
        id: "message_tool_large_terminal_output_part_1" as PromptMessagePartId,
        type: "tool_result_ref",
        toolCallId: asToolCallId("tool_call_terminal_output"),
        toolName: "terminal_read_output",
      }, {
        id: "message_tool_large_terminal_output_part_2" as PromptMessagePartId,
        type: "text",
        text: JSON.stringify({
          exitCode: 1,
          stdout: "",
          stderr: "IndentationError\n" + "x".repeat(6000),
        }),
      }],
    }];

    const payload = codec.encode(request);
    const toolMessage = payload.messages.find((message) => message.role === "tool");
    expect(String(toolMessage?.content)).toContain("IndentationError");
    expect(String(toolMessage?.content)).not.toContain("x".repeat(300));
  });

  test("uses explicit system role and structured output config when schema output is requested", () => {
    const codec = new OpenAIChatCompletionsPromptCodec({
      systemMessageRole: "system",
    });
    const request = createBaseTurnRequest();

    request.prompt.systemBlocks = [{
      id: "system_2",
      kind: "instruction",
      content: "Return JSON only.",
    } as PromptEnvelope["systemBlocks"][number]];
    request.prompt.messages = [createTextMessage({
      messageId: "message_user_2",
      role: "user",
      text: "Summarize the module boundary",
    })];
    request.prompt.outputMode = {
      kind: "json_schema",
      schema: {
        type: "object",
        properties: {
          summary: {
            type: "string",
          },
        },
        required: ["summary"],
      },
    } as PromptEnvelope["outputMode"];

    const payload = codec.encode(request);

    expect(payload.messages[0]).toEqual({
      role: "system",
      content: "[system:instruction:system_2]\nReturn JSON only.",
    });
    expect(payload.toolChoice).toBe("none");
    expect(payload.responseFormat).toEqual({
      type: "json_schema",
      json_schema: {
        name: "response",
        schema: {
          type: "object",
          properties: {
            summary: {
              type: "string",
            },
          },
          required: ["summary"],
        },
        strict: true,
      },
    });
  });

  test("normalizes optional tool properties for strict OpenAI function schemas", () => {
    const codec = new OpenAIChatCompletionsPromptCodec();
    const request = createBaseTurnRequest();

    request.prompt.tools = [{
      name: "workspace_read_file",
      description: "Read a text file from the current workspace.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceId: {
            type: "string",
          },
          path: {
            type: "string",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
    } as PromptEnvelope["tools"][number]];

    const payload = codec.encode(request);

    expect(payload.tools).toEqual([{
      type: "function",
      function: {
        name: "workspace_read_file",
        description: "Read a text file from the current workspace.",
        parameters: {
          type: "object",
          properties: {
            workspaceId: {
              anyOf: [{
                type: "string",
              }, {
                type: "null",
              }],
            },
            path: {
              type: "string",
            },
          },
          required: ["workspaceId", "path"],
          additionalProperties: false,
        },
        strict: true,
      },
    }]);
  });

  test("encodes image attachments as multimodal chat content parts", () => {
    const codec = new OpenAIChatCompletionsPromptCodec();
    const request = createBaseTurnRequest();
    const imagePath = createTempImageFile("openai-chat-image.png");

    try {
      request.prompt.messages = [{
        message: {
          id: "message_user_image_1" as PromptMessageId,
          sessionId: "session_1" as PromptEnvelope["sessionId"],
          role: "user",
          createdAt: 1,
        },
        parts: [{
          id: "message_user_image_1_part_1" as PromptMessagePartId,
          type: "text",
          text: "识别图中文字",
        }, {
          id: "message_user_image_1_part_2" as PromptMessagePartId,
          type: "attachment",
          attachmentId: "attachment_1",
          mimeType: "image/png",
          kind: "image",
          fileName: "image.png",
          name: "image.png",
          path: imagePath,
        }],
      }];

      const payload = codec.encode(request);
      expect(payload.messages).toEqual([{
        role: "user",
        content: [{
          type: "text",
          text: "识别图中文字",
        }, {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${TEST_IMAGE_BASE64}`,
          },
        }],
      }]);
    } finally {
      rmSync(imagePath, { force: true });
    }
  });
});
