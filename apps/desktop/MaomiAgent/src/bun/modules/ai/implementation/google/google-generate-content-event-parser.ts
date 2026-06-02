import type {
  LanguageModelResponseMetadata,
  LanguageModelUsage,
  TextStreamPart,
  ToolSet,
} from "ai";

import {
  asToolCallId,
  type AiTurnFinishMetadata,
  type AiTurnEvent,
  type FinishReason,
  type TokenUsage,
} from "../../kernel-bridge";

type GoogleGenerateContentEventParser = {
  read(part: TextStreamPart<ToolSet>): readonly AiTurnEvent[];
};

type ParserState = {
  finishMetadata?: AiTurnFinishMetadata;
  emittedUsage: boolean;
};

function normalizeGoogleStreamError(error: unknown) {
  return {
    code: "provider_error",
    message: error instanceof Error ? error.message : "Google Generative AI stream failed",
    retryable: false,
  };
}

function readUsage(usage: LanguageModelUsage | undefined): TokenUsage | undefined {
  if (!usage) {
    return undefined;
  }

  const inputTokens = usage.inputTokens;
  const outputTokens = usage.outputTokens;

  if (
    typeof inputTokens !== "number"
    || !Number.isFinite(inputTokens)
    || typeof outputTokens !== "number"
    || !Number.isFinite(outputTokens)
  ) {
    return undefined;
  }

  const reasoningTokens = usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens;
  const cachedInputTokens = usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens;

  return {
    inputTokens,
    outputTokens,
    ...(typeof reasoningTokens === "number" && Number.isFinite(reasoningTokens)
      ? { reasoningTokens }
      : {}),
    ...(typeof cachedInputTokens === "number" && Number.isFinite(cachedInputTokens)
      ? { cachedInputTokens }
      : {}),
  };
}

function mapFinishReason(reason: string | undefined): FinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "tool-calls":
      return "tool_calls";
    case "length":
      return "max_tokens";
    case "content-filter":
    case "error":
      return "error";
    case "other":
    default:
      return "unknown";
  }
}

function buildFinishMetadata(input: {
  response?: LanguageModelResponseMetadata;
  rawFinishReason?: string;
}): AiTurnFinishMetadata | undefined {
  const providerResponseId = input.response?.id;
  const providerReason = input.rawFinishReason;

  if (!providerResponseId && !providerReason) {
    return undefined;
  }

  return {
    ...(providerResponseId ? { providerResponseId } : {}),
    ...(providerReason ? { providerReason } : {}),
  };
}

function normalizeToolCallInput(input: unknown): unknown {
  if (typeof input !== "string") {
    return input ?? {};
  }

  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

export function createGoogleGenerateContentEventParser(): GoogleGenerateContentEventParser {
  const state: ParserState = {
    emittedUsage: false,
  };

  return {
    read(part) {
      switch (part.type) {
        case "text-start":
          return [{ type: "text.start" }];
        case "text-delta":
          return [{
            type: "text.delta",
            delta: part.text,
          }];
        case "text-end":
          return [{ type: "text.end" }];
        case "reasoning-start":
          return [{ type: "reasoning.start" }];
        case "reasoning-delta":
          return [{
            type: "reasoning.delta",
            delta: part.text,
          }];
        case "reasoning-end":
          return [{ type: "reasoning.end" }];
        case "tool-call":
          return [{
            type: "tool.call",
            toolCallId: asToolCallId(part.toolCallId),
            toolName: part.toolName,
            input: normalizeToolCallInput(part.input),
          }];
        case "error":
          return [{
            type: "error",
            error: normalizeGoogleStreamError(part.error),
          }];
        case "finish-step": {
          const events: AiTurnEvent[] = [];
          const usage = readUsage(part.usage);
          if (usage) {
            state.emittedUsage = true;
            events.push({
              type: "usage",
              usage,
            });
          }

          state.finishMetadata = buildFinishMetadata({
            response: part.response,
            rawFinishReason: part.rawFinishReason,
          });
          return events;
        }
        case "finish": {
          const events: AiTurnEvent[] = [];
          if (!state.emittedUsage) {
            const usage = readUsage(part.totalUsage);
            if (usage) {
              events.push({
                type: "usage",
                usage,
              });
            }
          }

          const metadata = state.finishMetadata ?? buildFinishMetadata({
            rawFinishReason: part.rawFinishReason,
          });
          events.push({
            type: "finish",
            reason: mapFinishReason(part.finishReason),
            ...(metadata ? { metadata } : {}),
          });
          return events;
        }
        default:
          return [];
      }
    },
  };
}

export function readGoogleGenerateContentStreamEvents(
  parts: Iterable<TextStreamPart<ToolSet>>,
): readonly AiTurnEvent[] {
  const parser = createGoogleGenerateContentEventParser();
  const events: AiTurnEvent[] = [];

  for (const part of parts) {
    events.push(...parser.read(part));
  }

  return events;
}
