import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import {
  OpenAIResponsesPromptCodec,
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
    trace: {
      sessionId,
      runId,
      turnId,
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

describe("OpenAIResponsesPromptCodec", () => {
  test("encodes system/context blocks and tool history into OpenAI Responses payload", () => {
    const codec = new OpenAIResponsesPromptCodec();
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
      input: [{
        role: "developer",
        content: "[system:instruction:system_1]\nFollow repository guardrails.",
      }, {
        role: "developer",
        content: "[context:workspace:context_1]\nWorkspace: MaomiAgent",
      }, {
        role: "user",
        content: [{
          type: "input_text",
          text: "Inspect the repository status",
        }],
      }, {
        role: "assistant",
        content: [{
          type: "output_text",
          text: "I will inspect git status.",
        }],
      }, {
        type: "function_call",
        call_id: "tool_call_1",
        name: "git.status",
        arguments: '{"path":"."}',
      }, {
        type: "function_call_output",
        call_id: "tool_call_1",
        output: "working tree clean",
      }],
      tools: [{
        type: "function",
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
      }],
      toolChoice: "required",
    });
  });

  test("uses explicit system role and structured output config when schema output is requested", () => {
    const codec = new OpenAIResponsesPromptCodec({
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

    expect(payload.input[0]).toEqual({
      role: "system",
      content: "[system:instruction:system_2]\nReturn JSON only.",
    });
    expect(payload.toolChoice).toBe("none");
    expect(payload.text).toEqual({
      format: {
        type: "json_schema",
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
    const codec = new OpenAIResponsesPromptCodec();
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
    }]);
  });

  test("encodes image attachments as input_image user content", () => {
    const codec = new OpenAIResponsesPromptCodec();
    const request = createBaseTurnRequest();
    const imagePath = createTempImageFile("openai-responses-image.png");

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
      expect(payload.input).toEqual([{
        role: "user",
        content: [{
          type: "input_text",
          text: "识别图中文字",
        }, {
          type: "input_image",
          image_url: `data:image/png;base64,${TEST_IMAGE_BASE64}`,
        }],
      }]);
    } finally {
      rmSync(imagePath, { force: true });
    }
  });
});
