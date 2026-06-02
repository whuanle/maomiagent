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

export type OpenAIChatCompletionsUserContentPart =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
      };
    };

export type OpenAIChatCompletionsMessage =
  | {
      role: "developer" | "system";
      content: string;
    }
  | {
      role: "user";
      content: string | OpenAIChatCompletionsUserContentPart[];
    }
  | {
      role: "assistant";
      content: string | null;
      reasoning_content?: string | null;
      tool_calls?: OpenAIChatCompletionsToolCall[];
    }
  | {
      role: "tool";
      content: string;
      tool_call_id: string;
    };

export type OpenAIChatCompletionsToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type OpenAIChatCompletionsTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
  };
};

export type OpenAIChatCompletionsResponseFormat =
  | {
      type: "json_schema";
      json_schema: {
        name: string;
        schema: Record<string, unknown>;
        strict: boolean;
      };
    }
  | {
      type: "json_object";
    };

export type OpenAIChatCompletionsPromptPayload = {
  messages: readonly OpenAIChatCompletionsMessage[];
  tools?: readonly OpenAIChatCompletionsTool[];
  toolChoice?: "auto" | "required" | "none";
  responseFormat?: OpenAIChatCompletionsResponseFormat;
};

type OpenAIChatCompletionsPromptCodecOptions = {
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

function collectReasoningParts(parts: readonly MessagePart[]): string {
  return parts
    .filter((part): part is Extract<MessagePart, { type: "reasoning" }> => part.type === "reasoning")
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

function buildOpenAIUserContent(
  parts: readonly MessagePart[],
): string | OpenAIChatCompletionsUserContentPart[] | undefined {
  const text = collectTextParts(parts);
  const attachments = collectAttachmentParts(parts);
  if (attachments.length === 0) {
    return text || undefined;
  }

  const content: OpenAIChatCompletionsUserContentPart[] = [];
  if (text) {
    content.push({
      type: "text",
      text,
    });
  }

  for (const attachment of attachments) {
    const imageAttachment = readPromptImageAttachment(attachment);
    if (imageAttachment) {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${imageAttachment.mimeType};base64,${imageAttachment.dataBase64}`,
        },
      });
      continue;
    }

    content.push({
      type: "text",
      text: buildAttachmentPromptText(attachment),
    });
  }

  return content.length > 0 ? content : undefined;
}

function buildAssistantMessage(
  message: MessageRecordWithParts,
): OpenAIChatCompletionsMessage | undefined {
  const text = collectTextParts(message.parts);
  const reasoning = collectReasoningParts(message.parts);
  const toolCalls = collectToolCallRefs(message.parts).map((toolCall) => ({
    id: toolCall.toolCallId,
    type: "function" as const,
    function: {
      name: toolCall.toolName,
      arguments: serializeToolPayload(toolCall.input),
    },
  }));

  if (!text && !reasoning && toolCalls.length === 0) {
    return undefined;
  }

  return {
    role: "assistant",
    content: text || null,
    ...((reasoning || toolCalls.length > 0)
      ? { reasoning_content: reasoning || "" }
      : {}),
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };
}

function buildMessageInputItem(
  message: MessageRecordWithParts,
  systemMessageRole: "developer" | "system",
): OpenAIChatCompletionsMessage[] {
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
    return content
      ? [{
          role: "user",
          content,
        }]
      : [];
  }

  if (message.message.role === "assistant") {
    const assistantMessage = buildAssistantMessage(message);
    return assistantMessage ? [assistantMessage] : [];
  }

  return collectToolResultRefs(message.parts).map((toolResult) => ({
    role: "tool" as const,
    tool_call_id: toolResult.toolCallId,
    content: text,
  }));
}

function buildMessageInputItems(
  messages: readonly MessageRecordWithParts[],
  systemMessageRole: "developer" | "system",
): OpenAIChatCompletionsMessage[] {
  return messages.flatMap((message) => buildMessageInputItem(message, systemMessageRole));
}

function buildToolDefinition(tool: ToolDescriptor): OpenAIChatCompletionsTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: normalizeOpenAIStrictJsonSchema(tool.inputSchema),
      strict: true,
    },
  };
}

function buildResponseFormat(input: AiTurnRequest): OpenAIChatCompletionsResponseFormat | undefined {
  if (input.prompt.outputMode.kind === "text") {
    return undefined;
  }

  return {
    type: "json_schema",
    json_schema: {
      name: "response",
      schema: normalizeOpenAIStrictJsonSchema(input.prompt.outputMode.schema),
      strict: true,
    },
  };
}

export class OpenAIChatCompletionsPromptCodec
implements PromptCodec<OpenAIChatCompletionsPromptPayload> {
  private readonly systemMessageRole: "developer" | "system";

  constructor(options: OpenAIChatCompletionsPromptCodecOptions = {}) {
    this.systemMessageRole = options.systemMessageRole ?? "developer";
  }

  encode(input: AiTurnRequest): OpenAIChatCompletionsPromptPayload {
    const messages: OpenAIChatCompletionsMessage[] = [];
    const systemMessage = renderBlockGroup("system", input.prompt.systemBlocks);
    if (systemMessage) {
      messages.push({
        role: this.systemMessageRole,
        content: systemMessage,
      });
    }

    const contextMessage = renderBlockGroup("context", input.prompt.contextBlocks);
    if (contextMessage) {
      messages.push({
        role: this.systemMessageRole,
        content: contextMessage,
      });
    }

    messages.push(...buildMessageInputItems(input.prompt.messages, this.systemMessageRole));

    const tools = input.prompt.tools.map(buildToolDefinition);
    const responseFormat = buildResponseFormat(input);

    return {
      messages,
      ...(tools.length > 0 ? { tools } : {}),
      ...(tools.length > 0
        ? { toolChoice: input.settings.toolChoice ?? "auto" }
        : { toolChoice: "none" }),
      ...(responseFormat ? { responseFormat } : {}),
    };
  }
}
