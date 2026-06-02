import {
  Output,
  jsonSchema,
  tool,
  type ModelMessage,
  type ToolChoice,
  type ToolSet,
} from "ai";

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
import { normalizeOpenAIStrictJsonSchema } from "../openai/openai-strict-json-schema";

export type GoogleGenerateContentPromptPayload = {
  system?: string;
  messages: ModelMessage[];
  tools?: ToolSet;
  toolChoice?: ToolChoice<ToolSet>;
  output: ReturnType<typeof Output.text> | ReturnType<typeof Output.object>;
  temperature?: number;
  maxOutputTokens?: number;
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

  return normalized.length > 0 ? normalized.join("\n\n") : undefined;
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

function buildSystemInstruction(input: AiTurnRequest): string | undefined {
  const sections = [
    renderBlockGroup("system", input.prompt.systemBlocks),
    renderBlockGroup("context", input.prompt.contextBlocks),
    ...input.prompt.messages
      .filter((message) => message.message.role === "system")
      .map((message) => collectTextParts(message.parts))
      .filter(Boolean),
  ].filter((section): section is string => Boolean(section));

  return sections.length > 0 ? sections.join("\n\n") : undefined;
}

function buildUserMessageContent(
  parts: readonly MessagePart[],
): Extract<ModelMessage, { role: "user" }>["content"] | undefined {
  const content: Array<
    | {
        type: "text";
        text: string;
      }
    | {
        type: "image";
        image: string;
        mediaType: string;
      }
  > = [];

  const text = collectTextParts(parts);
  if (text) {
    content.push({
      type: "text",
      text,
    });
  }

  for (const attachment of collectAttachmentParts(parts)) {
    const imageAttachment = readPromptImageAttachment(attachment);
    if (imageAttachment) {
      content.push({
        type: "image",
        image: imageAttachment.dataBase64,
        mediaType: imageAttachment.mimeType,
      });
      continue;
    }

    content.push({
      type: "text",
      text: buildAttachmentPromptText(attachment),
    });
  }

  if (content.length === 0) {
    return undefined;
  }

  return content.length === 1 && content[0]?.type === "text"
    ? content[0].text
    : content;
}

function buildAssistantMessageContent(
  message: MessageRecordWithParts,
): Extract<ModelMessage, { role: "assistant" }>["content"] | undefined {
  const content: Array<
    | {
        type: "reasoning";
        text: string;
      }
    | {
        type: "text";
        text: string;
      }
    | {
        type: "tool-call";
        toolCallId: string;
        toolName: string;
        input: unknown;
      }
  > = [];

  const reasoning = collectReasoningParts(message.parts);
  if (reasoning) {
    content.push({
      type: "reasoning",
      text: reasoning,
    });
  }

  const text = collectTextParts(message.parts);
  if (text) {
    content.push({
      type: "text",
      text,
    });
  }

  for (const toolCall of collectToolCallRefs(message.parts)) {
    content.push({
      type: "tool-call",
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      input: toolCall.input ?? {},
    });
  }

  if (content.length === 0) {
    return undefined;
  }

  return content.length === 1 && content[0]?.type === "text"
    ? content[0].text
    : content;
}

function buildToolMessageContent(
  message: MessageRecordWithParts,
): Extract<ModelMessage, { role: "tool" }>["content"] {
  const text = collectTextParts(message.parts);
  return collectToolResultRefs(message.parts).map((toolResult) => ({
    type: "tool-result" as const,
    toolCallId: toolResult.toolCallId,
    toolName: toolResult.toolName,
    output: {
      type: "text" as const,
      value: text,
    },
  }));
}

function buildMessageInputItem(message: MessageRecordWithParts): ModelMessage[] {
  if (message.message.role === "system") {
    return [];
  }

  if (message.message.role === "user") {
    const content = buildUserMessageContent(message.parts);
    return content
      ? [{
          role: "user",
          content,
        }]
      : [];
  }

  if (message.message.role === "assistant") {
    const content = buildAssistantMessageContent(message);
    return content
      ? [{
          role: "assistant",
          content,
        }]
      : [];
  }

  const content = buildToolMessageContent(message);
  return content.length > 0
    ? [{
        role: "tool",
        content,
      }]
    : [];
}

function buildToolDefinition(toolDescriptor: ToolDescriptor) {
  return tool({
    description: toolDescriptor.description,
    inputSchema: jsonSchema(normalizeOpenAIStrictJsonSchema(toolDescriptor.inputSchema)),
  });
}

function buildOutput(
  input: AiTurnRequest,
): ReturnType<typeof Output.text> | ReturnType<typeof Output.object> {
  if (input.prompt.outputMode.kind === "text") {
    return Output.text();
  }

  return Output.object({
    schema: jsonSchema(normalizeOpenAIStrictJsonSchema(input.prompt.outputMode.schema)),
  });
}

export class GoogleGenerateContentPromptCodec
implements PromptCodec<GoogleGenerateContentPromptPayload> {
  encode(input: AiTurnRequest): GoogleGenerateContentPromptPayload {
    const system = buildSystemInstruction(input);
    const messages = input.prompt.messages.flatMap((message) => buildMessageInputItem(message));
    const tools = Object.fromEntries(
      input.prompt.tools.map((toolDescriptor) => [
        toolDescriptor.name,
        buildToolDefinition(toolDescriptor),
      ] as const),
    );

    return {
      ...(system ? { system } : {}),
      messages,
      ...(Object.keys(tools).length > 0 ? { tools } : {}),
      toolChoice: Object.keys(tools).length > 0
        ? (input.settings.toolChoice ?? "auto") as ToolChoice<ToolSet>
        : "none",
      output: buildOutput(input),
      ...(typeof input.settings.temperature === "number"
        ? { temperature: input.settings.temperature }
        : {}),
      ...(typeof input.settings.maxOutputTokens === "number"
        ? { maxOutputTokens: Math.max(1, Math.trunc(input.settings.maxOutputTokens)) }
        : {}),
    };
  }
}
