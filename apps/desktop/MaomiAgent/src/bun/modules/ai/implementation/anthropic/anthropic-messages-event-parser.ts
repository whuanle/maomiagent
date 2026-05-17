import {
  asToolCallId,
  type AiTurnEvent,
  type FinishReason,
  type TokenUsage,
} from "../../kernel-bridge";
import { normalizeAnthropicStreamError } from "./anthropic-errors";

type ToolUseState = {
  kind: "tool_use";
  id?: string;
  name?: string;
  inputText: string;
  hasInputDelta: boolean;
};

type ContentBlockState =
  | {
      kind: "text";
    }
  | {
      kind: "reasoning";
    }
  | ToolUseState;

type ParserState = {
  messageId?: string;
  finishReason?: string;
  usage?: TokenUsage;
  contentBlocks: Map<number, ContentBlockState>;
  hasToolCall: boolean;
  sawTerminal: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readTrimmedText(value: unknown): string | undefined {
  const text = readString(value)?.trim();
  return text ? text : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function parseJsonMaybe(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function mapFinishReason(reason: string | undefined, hasToolCall: boolean): FinishReason {
  if (!reason) {
    return hasToolCall ? "tool_calls" : "stop";
  }

  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "max_tokens";
    case "tool_use":
      return "tool_calls";
    case "pause_turn":
      return hasToolCall ? "tool_calls" : "unknown";
    default:
      return hasToolCall ? "tool_calls" : "unknown";
  }
}

function mergeUsage(current: TokenUsage | undefined, value: unknown): TokenUsage | undefined {
  const usage = readRecord(value);
  if (!usage) {
    return current;
  }

  const inputTokens = readNumber(usage.input_tokens) ?? current?.inputTokens;
  const outputTokens = readNumber(usage.output_tokens) ?? current?.outputTokens;
  const cachedInputTokens = readNumber(usage.cache_read_input_tokens) ?? current?.cachedInputTokens;
  const reasoningTokens = readNumber(usage.reasoning_tokens) ?? current?.reasoningTokens;

  if (inputTokens === undefined || outputTokens === undefined) {
    return current;
  }

  return {
    inputTokens,
    outputTokens,
    ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
  };
}

function buildFinishMetadata(input: {
  messageId?: string;
  reason?: string;
}) {
  if (!input.messageId && !input.reason) {
    return undefined;
  }

  return {
    ...(input.messageId ? { providerResponseId: input.messageId } : {}),
    ...(input.reason ? { providerReason: input.reason } : {}),
  };
}

function* emitTextEvents(text: string): Iterable<AiTurnEvent> {
  if (!text) {
    return;
  }

  yield {
    type: "text.start",
  };
  yield {
    type: "text.delta",
    delta: text,
  };
  yield {
    type: "text.end",
  };
}

function* emitReasoningEvents(text: string): Iterable<AiTurnEvent> {
  if (!text) {
    return;
  }

  yield {
    type: "reasoning.start",
  };
  yield {
    type: "reasoning.delta",
    delta: text,
  };
  yield {
    type: "reasoning.end",
  };
}

function* emitToolUseEvent(block: ToolUseState, state: ParserState): Iterable<AiTurnEvent> {
  if (!block.name) {
    return;
  }

  state.hasToolCall = true;
  yield {
    type: "tool.call",
    toolCallId: asToolCallId(block.id ?? `${state.messageId ?? "tool_call"}_${block.name}`),
    toolName: block.name,
    input: parseJsonMaybe(block.inputText || "{}"),
  };
}

function* emitContentBlockStop(
  block: ContentBlockState | undefined,
  state: ParserState,
): Iterable<AiTurnEvent> {
  if (!block) {
    return;
  }

  if (block.kind === "text") {
    yield {
      type: "text.end",
    };
    return;
  }

  if (block.kind === "reasoning") {
    yield {
      type: "reasoning.end",
    };
    return;
  }

  yield* emitToolUseEvent(block, state);
}

function* emitPendingBlockClosures(state: ParserState): Iterable<AiTurnEvent> {
  const entries = [...state.contentBlocks.entries()].sort((left, right) => left[0] - right[0]);
  state.contentBlocks.clear();

  for (const [, block] of entries) {
    yield* emitContentBlockStop(block, state);
  }
}

function readToolUseInput(block: Record<string, unknown>): string {
  if (!("input" in block)) {
    return "";
  }

  if (typeof block.input === "string") {
    return block.input;
  }

  if (isRecord(block.input) && Object.keys(block.input).length === 0) {
    return "";
  }

  return JSON.stringify(block.input ?? {});
}

function* emitJsonContentBlockEvents(
  block: Record<string, unknown>,
  state: ParserState,
): Iterable<AiTurnEvent> {
  const type = readTrimmedText(block.type);
  if (!type) {
    return;
  }

  if (type === "text") {
    yield* emitTextEvents(readString(block.text) ?? "");
    return;
  }

  if (type === "thinking") {
    yield* emitReasoningEvents(readString(block.thinking) ?? "");
    return;
  }

  if (type === "tool_use") {
    yield* emitToolUseEvent({
      kind: "tool_use",
      id: readTrimmedText(block.id),
      name: readTrimmedText(block.name),
      inputText: readToolUseInput(block) || "{}",
      hasInputDelta: false,
    }, state);
  }
}

function* normalizeJsonPayload(payload: Record<string, unknown>): Iterable<AiTurnEvent> {
  const state: ParserState = {
    messageId: readTrimmedText(payload.id),
    finishReason: readTrimmedText(payload.stop_reason),
    usage: mergeUsage(undefined, payload.usage),
    contentBlocks: new Map(),
    hasToolCall: false,
    sawTerminal: true,
  };

  for (const item of Array.isArray(payload.content) ? payload.content : []) {
    const block = readRecord(item);
    if (!block) {
      continue;
    }
    yield* emitJsonContentBlockEvents(block, state);
  }

  if (state.usage) {
    yield {
      type: "usage",
      usage: state.usage,
    };
  }

  const metadata = buildFinishMetadata({
    messageId: state.messageId,
    reason: state.finishReason,
  });
  yield {
    type: "finish",
    reason: mapFinishReason(state.finishReason, state.hasToolCall),
    ...(metadata ? { metadata } : {}),
  };
}

function* normalizeStreamingPayload(
  payload: Record<string, unknown>,
  state: ParserState,
): Iterable<AiTurnEvent> {
  const type = readTrimmedText(payload.type);
  if (!type) {
    return;
  }

  if (type === "error") {
    state.sawTerminal = true;
    yield {
      type: "error",
      error: normalizeAnthropicStreamError(payload),
    };
    return;
  }

  if (type === "message_start") {
    const message = readRecord(payload.message);
    state.messageId = readTrimmedText(message?.id) ?? state.messageId;
    state.usage = mergeUsage(state.usage, message?.usage);
    return;
  }

  if (type === "content_block_start") {
    const index = readNumber(payload.index) ?? 0;
    const block = readRecord(payload.content_block);
    const blockType = readTrimmedText(block?.type);
    if (!blockType) {
      return;
    }

    if (blockType === "text") {
      state.contentBlocks.set(index, { kind: "text" });
      yield {
        type: "text.start",
      };
      const text = readString(block?.text) ?? "";
      if (text) {
        yield {
          type: "text.delta",
          delta: text,
        };
      }
      return;
    }

    if (blockType === "thinking") {
      state.contentBlocks.set(index, { kind: "reasoning" });
      yield {
        type: "reasoning.start",
      };
      const thinking = readString(block?.thinking) ?? "";
      if (thinking) {
        yield {
          type: "reasoning.delta",
          delta: thinking,
        };
      }
      return;
    }

    if (blockType === "tool_use") {
      state.contentBlocks.set(index, {
        kind: "tool_use",
        id: readTrimmedText(block?.id),
        name: readTrimmedText(block?.name),
        inputText: readToolUseInput(block ?? {}),
        hasInputDelta: false,
      });
    }
    return;
  }

  if (type === "content_block_delta") {
    const index = readNumber(payload.index) ?? 0;
    const delta = readRecord(payload.delta);
    const deltaType = readTrimmedText(delta?.type);
    const currentBlock = state.contentBlocks.get(index);
    if (!deltaType || !currentBlock) {
      return;
    }

    if (currentBlock.kind === "text" && deltaType === "text_delta") {
      const text = readString(delta?.text) ?? "";
      if (text) {
        yield {
          type: "text.delta",
          delta: text,
        };
      }
      return;
    }

    if (currentBlock.kind === "reasoning" && deltaType === "thinking_delta") {
      const thinking = readString(delta?.thinking) ?? "";
      if (thinking) {
        yield {
          type: "reasoning.delta",
          delta: thinking,
        };
      }
      return;
    }

    if (currentBlock.kind === "tool_use" && deltaType === "input_json_delta") {
      const fragment = readString(delta?.partial_json) ?? "";
      if (!fragment) {
        return;
      }

      currentBlock.inputText = !currentBlock.hasInputDelta && !currentBlock.inputText
        ? fragment
        : `${currentBlock.inputText}${fragment}`;
      currentBlock.hasInputDelta = true;
    }
    return;
  }

  if (type === "content_block_stop") {
    const index = readNumber(payload.index) ?? 0;
    const currentBlock = state.contentBlocks.get(index);
    state.contentBlocks.delete(index);
    yield* emitContentBlockStop(currentBlock, state);
    return;
  }

  if (type === "message_delta") {
    const delta = readRecord(payload.delta);
    state.finishReason = readTrimmedText(delta?.stop_reason) ?? state.finishReason;
    state.usage = mergeUsage(state.usage, payload.usage);
    return;
  }

  if (type === "message_stop") {
    yield* emitPendingBlockClosures(state);
    if (state.usage) {
      yield {
        type: "usage",
        usage: state.usage,
      };
    }

    state.sawTerminal = true;
    const metadata = buildFinishMetadata({
      messageId: state.messageId,
      reason: state.finishReason,
    });
    yield {
      type: "finish",
      reason: mapFinishReason(state.finishReason, state.hasToolCall),
      ...(metadata ? { metadata } : {}),
    };
  }
}

async function* readSsePayloads(response: Response): AsyncIterable<Record<string, unknown>> {
  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consumeBlock = (block: string): Array<Record<string, unknown>> => {
    const dataText = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");

    if (!dataText || dataText === "[DONE]") {
      return [];
    }

    try {
      const parsed = JSON.parse(dataText) as unknown;
      return isRecord(parsed) ? [parsed] : [];
    } catch {
      return [];
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.search(/\r?\n\r?\n/);
    while (boundary >= 0) {
      const match = /\r?\n\r?\n/.exec(buffer.slice(boundary));
      const separatorLength = match?.[0].length ?? 2;
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + separatorLength);

      for (const payload of consumeBlock(block)) {
        yield payload;
      }

      boundary = buffer.search(/\r?\n\r?\n/);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    for (const payload of consumeBlock(buffer)) {
      yield payload;
    }
  }
}

export function readAnthropicMessageJsonEvents(
  payload: Record<string, unknown>,
): AiTurnEvent[] {
  return [...normalizeJsonPayload(payload)];
}

export async function* streamAnthropicMessageEvents(
  response: Response,
): AsyncIterable<AiTurnEvent> {
  const state: ParserState = {
    contentBlocks: new Map(),
    hasToolCall: false,
    sawTerminal: false,
  };

  for await (const payload of readSsePayloads(response)) {
    yield* normalizeStreamingPayload(payload, state);
  }

  if (!state.sawTerminal) {
    yield* emitPendingBlockClosures(state);
    yield {
      type: "error",
      error: {
        code: "provider_error",
        message: "Anthropic stream ended before a terminal event was received",
        retryable: true,
      },
    };
  }
}