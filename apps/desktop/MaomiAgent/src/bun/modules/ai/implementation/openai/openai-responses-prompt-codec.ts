import type {
  AiTurnRequest,
  ContextBlock,
  MessagePart,
  MessageRecordWithParts,
  PromptCodec,
  ToolDescriptor,
} from "../../kernel-bridge";

import {
  buildAttachmentPromptText,
  collectAttachmentParts,
  readPromptImageAttachment,
} from "../prompt-attachments";
import { normalizeOpenAIStrictJsonSchema } from "./openai-strict-json-schema";

type OpenAIResponsesUserContentItem =
  | {
      type: "input_text";
      text: string;
    }
  | {
      type: "input_image";
      image_url: string;
    };

export type OpenAIResponsesInputItem =
  | {
      role: "developer" | "system";
      content: string;
    }
  | {
      role: "user";
      content: OpenAIResponsesUserContentItem[];
    }
  | {
      role: "assistant";
      content: Array<{
        type: "output_text";
        text: string;
      }>;
    }
  | {
      type: "function_call";
      call_id: string;
      name: string;
      arguments: string;
    }
  | {
      type: "function_call_output";
      call_id: string;
      output: string;
    };

export type OpenAIResponsesTool = {
  type: "function";
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
};

export type OpenAIResponsesTextConfig = {
  format:
    | {
        type: "json_schema";
        name: string;
        schema: Record<string, unknown>;
        strict: boolean;
      }
    | {
        type: "json_object";
      };
};

export type OpenAIResponsesPromptPayload = {
  input: readonly OpenAIResponsesInputItem[];
  tools?: readonly OpenAIResponsesTool[];
  toolChoice?: "auto" | "required" | "none";
  text?: OpenAIResponsesTextConfig;
};

type OpenAIResponsesPromptCodecOptions = {
  systemMessageRole?: "developer" | "system";
};

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function renderBlockGroup(label: string, blocks: readonly ContextBlock[]): string | undefined {
  const normalized = blocks
    .map((block) => {
      const content = normalizeText(block.content);
      if (!content) {
        return undefined;
      }

      return [
        `[${label}:${block.kind}:${block.id}]`,
        content,
      ].join("\n");
    })
    .filter((item): item is string => Boolean(item));

  if (normalized.length === 0) {
    return undefined;
  }

  return normalized.join("\n\n");
}

function collectTextParts(parts: readonly MessagePart[]): string {
  return parts
    .filter((part): part is Extract<MessagePart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

function collectToolCallRefs(
  parts: readonly MessagePart[],
): Array<Extract<MessagePart, { type: "tool_call_ref" }>> {
  return parts.filter(
    (part): part is Extract<MessagePart, { type: "tool_call_ref" }> => part.type === "tool_call_ref",
  );
}

function collectToolResultRefs(
  parts: readonly MessagePart[],
): Array<Extract<MessagePart, { type: "tool_result_ref" }>> {
  return parts.filter(
    (part): part is Extract<MessagePart, { type: "tool_result_ref" }> => part.type === "tool_result_ref",
  );
}

function serializeToolPayload(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value ?? {});
}

function buildOpenAIUserContent(parts: readonly MessagePart[]): OpenAIResponsesUserContentItem[] {
  const content: OpenAIResponsesUserContentItem[] = [];
  const text = collectTextParts(parts);
  if (text) {
    content.push({
      type: "input_text",
      text,
    });
  }

  for (const attachment of collectAttachmentParts(parts)) {
    const imageAttachment = readPromptImageAttachment(attachment);
    if (imageAttachment) {
      content.push({
        type: "input_image",
        image_url: `data:${imageAttachment.mimeType};base64,${imageAttachment.dataBase64}`,
      });
      continue;
    }

    content.push({
      type: "input_text",
      text: buildAttachmentPromptText(attachment),
    });
  }

  return content;
}

function buildMessageInputItem(
  message: MessageRecordWithParts,
  systemMessageRole: "developer" | "system",
): OpenAIResponsesInputItem[] {
  const text = collectTextParts(message.parts);

  if (message.message.role === "system") {
    return text
      ? [{
          role: systemMessageRole,
          content: text,
        }]
      : [];
  }

  if (message.message.role === "user") {
    const content = buildOpenAIUserContent(message.parts);
    return content.length > 0
      ? [{
          role: "user",
          content,
        }]
      : [];
  }

  if (message.message.role === "assistant") {
    const items: OpenAIResponsesInputItem[] = [];

    if (text) {
      items.push({
        role: "assistant",
        content: [
          {
            type: "output_text",
            text,
          },
        ],
      });
    }

    for (const toolCall of collectToolCallRefs(message.parts)) {
      items.push({
        type: "function_call",
        call_id: toolCall.toolCallId,
        name: toolCall.toolName,
        arguments: serializeToolPayload(toolCall.input),
      });
    }

    return items;
  }

  const toolResults = collectToolResultRefs(message.parts);
  if (toolResults.length === 0) {
    return [];
  }

  return toolResults.map((toolResult) => ({
    type: "function_call_output",
    call_id: toolResult.toolCallId,
    output: text,
  }));
}

function buildMessageInputItems(
  messages: readonly MessageRecordWithParts[],
  systemMessageRole: "developer" | "system",
): OpenAIResponsesInputItem[] {
  return messages.flatMap((message) => buildMessageInputItem(message, systemMessageRole));
}

function buildToolDefinition(tool: ToolDescriptor): OpenAIResponsesTool {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: normalizeOpenAIStrictJsonSchema(tool.inputSchema),
    strict: true,
  };
}

function buildTextConfig(input: AiTurnRequest): OpenAIResponsesTextConfig | undefined {
  if (input.prompt.outputMode.kind === "text") {
    return undefined;
  }

  return {
    format: {
      type: "json_schema",
      name: "response",
      schema: normalizeOpenAIStrictJsonSchema(input.prompt.outputMode.schema),
      strict: true,
    },
  };
}

export class OpenAIResponsesPromptCodec
implements PromptCodec<OpenAIResponsesPromptPayload> {
  private readonly systemMessageRole: "developer" | "system";

  constructor(options: OpenAIResponsesPromptCodecOptions = {}) {
    this.systemMessageRole = options.systemMessageRole ?? "developer";
  }

  encode(input: AiTurnRequest): OpenAIResponsesPromptPayload {
    const payloadInput: OpenAIResponsesInputItem[] = [];
    const systemMessage = renderBlockGroup("system", input.prompt.systemBlocks);
    if (systemMessage) {
      payloadInput.push({
        role: this.systemMessageRole,
        content: systemMessage,
      });
    }

    const contextMessage = renderBlockGroup("context", input.prompt.contextBlocks);
    if (contextMessage) {
      payloadInput.push({
        role: this.systemMessageRole,
        content: contextMessage,
      });
    }

    payloadInput.push(...buildMessageInputItems(input.prompt.messages, this.systemMessageRole));

    const tools = input.prompt.tools.map(buildToolDefinition);
    const text = buildTextConfig(input);

    return {
      input: payloadInput,
      ...(tools.length > 0 ? { tools } : {}),
      ...(tools.length > 0
        ? { toolChoice: input.settings.toolChoice ?? "auto" }
        : { toolChoice: "none" }),
      ...(text ? { text } : {}),
    };
  }
}
