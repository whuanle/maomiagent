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

const DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS = 8192;
const ANTHROPIC_IMAGE_MIME_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type AnthropicMessageContentBlock =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: "image/gif" | "image/jpeg" | "image/png" | "image/webp";
        data: string;
      };
    }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: unknown;
    }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string;
    };

export type AnthropicMessage = {
  role: "user" | "assistant";
  content: readonly AnthropicMessageContentBlock[];
};

export type AnthropicToolDefinition = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

export type AnthropicToolChoice = {
  type: "auto" | "any";
};

export type AnthropicThinkingConfig = {
  type: "enabled";
  budget_tokens: number;
};

export type AnthropicMessagesPromptPayload = {
  system?: string;
  messages: readonly AnthropicMessage[];
  tools?: readonly AnthropicToolDefinition[];
  toolChoice?: AnthropicToolChoice;
  thinking?: AnthropicThinkingConfig;
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

function buildSystemSections(input: AiTurnRequest): string[] {
  const sections = [
    renderBlockGroup("system", input.prompt.systemBlocks),
    renderBlockGroup("context", input.prompt.contextBlocks),
  ].filter((item): item is string => Boolean(item));

  for (const message of input.prompt.messages) {
    if (message.message.role !== "system") {
      continue;
    }

    const text = collectTextParts(message.parts);
    if (text) {
      sections.push(text);
    }
  }

  if (input.prompt.outputMode.kind !== "text") {
    sections.push([
      "[output:json_schema:response]",
      JSON.stringify(input.prompt.outputMode.schema),
    ].join("\n"));
  }

  return sections;
}

function buildUserMessageContent(text: string): AnthropicMessageContentBlock[] {
  return text
    ? [{
        type: "text",
        text,
      }]
    : [];
}

function buildAnthropicUserMessageContent(parts: readonly MessagePart[]): AnthropicMessageContentBlock[] {
  const content = buildUserMessageContent(collectTextParts(parts));

  for (const attachment of collectAttachmentParts(parts)) {
    const imageAttachment = readPromptImageAttachment(attachment, {
      allowedMimeTypes: ANTHROPIC_IMAGE_MIME_TYPES,
    });
    if (imageAttachment) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: imageAttachment.mimeType as "image/gif" | "image/jpeg" | "image/png" | "image/webp",
          data: imageAttachment.dataBase64,
        },
      });
      continue;
    }

    content.push({
      type: "text",
      text: buildAttachmentPromptText(attachment),
    });
  }

  return content;
}

function buildAssistantMessageContent(message: MessageRecordWithParts): AnthropicMessageContentBlock[] {
  const content: AnthropicMessageContentBlock[] = [];
  const text = collectTextParts(message.parts);
  if (text) {
    content.push({
      type: "text",
      text,
    });
  }

  for (const toolCall of collectToolCallRefs(message.parts)) {
    content.push({
      type: "tool_use",
      id: toolCall.toolCallId,
      name: toolCall.toolName,
      input: toolCall.input ?? {},
    });
  }

  return content;
}

function buildMessageInputItem(message: MessageRecordWithParts): AnthropicMessage[] {
  if (message.message.role === "system") {
    return [];
  }

  if (message.message.role === "user") {
    const content = buildAnthropicUserMessageContent(message.parts);
    return content.length > 0
      ? [{
          role: "user",
          content,
        }]
      : [];
  }

  if (message.message.role === "assistant") {
    const content = buildAssistantMessageContent(message);
    return content.length > 0
      ? [{
          role: "assistant",
          content,
        }]
      : [];
  }

  const text = collectTextParts(message.parts);
  return collectToolResultRefs(message.parts).map((toolResult) => ({
    role: "user" as const,
    content: [{
      type: "tool_result" as const,
      tool_use_id: toolResult.toolCallId,
      content: text,
    }],
  }));
}

function buildMessageInputItems(messages: readonly MessageRecordWithParts[]): AnthropicMessage[] {
  return messages.flatMap((message) => buildMessageInputItem(message));
}

function buildToolDefinition(tool: ToolDescriptor): AnthropicToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  };
}

function buildToolChoice(input: AiTurnRequest): AnthropicToolChoice | undefined {
  if (input.prompt.tools.length === 0 || input.settings.toolChoice === "none") {
    return undefined;
  }

  return {
    type: input.settings.toolChoice === "required" ? "any" : "auto",
  };
}

function resolveRequestedMaxTokens(input: AiTurnRequest): number {
  const requested = input.settings.maxOutputTokens;
  if (typeof requested === "number" && Number.isFinite(requested) && requested > 0) {
    return Math.max(1, Math.trunc(requested));
  }

  return DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS;
}

function buildThinkingConfig(input: AiTurnRequest): AnthropicThinkingConfig | undefined {
  const modelId = input.executionProfile.modelId?.toLowerCase() ?? "";
  if (
    !modelId.includes("k2p5")
    && !modelId.includes("kimi-k2.5")
    && !modelId.includes("kimi-k2p5")
  ) {
    return undefined;
  }

  const maxTokens = resolveRequestedMaxTokens(input);
  if (maxTokens <= 1) {
    return undefined;
  }

  return {
    type: "enabled",
    budget_tokens: Math.min(16_000, Math.max(1, Math.floor(maxTokens / 2))),
  };
}

export class AnthropicMessagesPromptCodec
implements PromptCodec<AnthropicMessagesPromptPayload> {
  encode(input: AiTurnRequest): AnthropicMessagesPromptPayload {
    const systemSections = buildSystemSections(input);
    const messages = buildMessageInputItems(input.prompt.messages);
    const tools = input.prompt.tools.map(buildToolDefinition);
    const toolChoice = buildToolChoice(input);
    const thinking = buildThinkingConfig(input);

    return {
      ...(systemSections.length > 0 ? { system: systemSections.join("\n\n") } : {}),
      messages,
      ...(tools.length > 0 && toolChoice
        ? {
            tools,
            toolChoice,
          }
        : {}),
      ...(thinking ? { thinking } : {}),
    };
  }
}
