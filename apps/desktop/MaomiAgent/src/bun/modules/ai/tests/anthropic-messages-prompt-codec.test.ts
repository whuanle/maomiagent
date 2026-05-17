import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import {
  AnthropicMessagesPromptCodec,
} from "../implementation/anthropic";
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
      id: "profile_kimi_main" as AiTurnRequest["executionProfile"]["id"],
      modelId: "kimi-k2.5",
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
      maxOutputTokens: 6000,
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

describe("AnthropicMessagesPromptCodec", () => {
  test("encodes system/context blocks and tool history into anthropic messages payload", () => {
    const codec = new AnthropicMessagesPromptCodec();
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
      system: [
        "[system:instruction:system_1]\nFollow repository guardrails.",
        "[context:workspace:context_1]\nWorkspace: MaomiAgent",
      ].join("\n\n"),
      messages: [{
        role: "user",
        content: [{
          type: "text",
          text: "Inspect the repository status",
        }],
      }, {
        role: "assistant",
        content: [{
          type: "text",
          text: "I will inspect git status.",
        }, {
          type: "tool_use",
          id: "tool_call_1",
          name: "git.status",
          input: {
            path: ".",
          },
        }],
      }, {
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: "tool_call_1",
          content: "working tree clean",
        }],
      }],
      tools: [{
        name: "git.status",
        description: "Read git status",
        input_schema: {
          type: "object",
          properties: {
            path: {
              type: "string",
            },
          },
          required: ["path"],
        },
      }],
      toolChoice: {
        type: "any",
      },
      thinking: {
        type: "enabled",
        budget_tokens: 3000,
      },
    });
  });

  test("injects json schema output constraints into the system prompt", () => {
    const codec = new AnthropicMessagesPromptCodec();
    const request = createBaseTurnRequest();

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

    expect(payload.system).toBe([
      "[output:json_schema:response]",
      JSON.stringify({
        type: "object",
        properties: {
          summary: {
            type: "string",
          },
        },
        required: ["summary"],
      }),
    ].join("\n"));
  });

  test("encodes image attachments as anthropic image content blocks", () => {
    const codec = new AnthropicMessagesPromptCodec();
    const request = createBaseTurnRequest();
    const imagePath = createTempImageFile("anthropic-image.png");

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
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: TEST_IMAGE_BASE64,
          },
        }],
      }]);
    } finally {
      rmSync(imagePath, { force: true });
    }
  });
});
