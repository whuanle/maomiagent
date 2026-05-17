import {
  asToolCallId,
  type AiTurnEvent,
  type FinishReason,
  type KernelError,
  type TokenUsage,
} from "../../kernel-bridge";
import { normalizeOpenAIStreamError } from "./openai-responses-errors";

type ToolCallState = {
  id?: string;
  name?: string;
  argumentsText: string;
};

type ParserState = {
  responseId?: string;
  textOpen: boolean;
  reasoningOpen: boolean;
  toolCalls: Map<number, ToolCallState>;
  sawTerminal: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function readText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? value
    : undefined;
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

function appendTextFragments(bucket: string[], value: unknown): void {
  if (typeof value === "string") {
    bucket.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendTextFragments(bucket, item);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const text = readText(value.text) ?? readText(value.value);
  if (text) {
    bucket.push(text);
    return;
  }

  if (value.content !== undefined) {
    appendTextFragments(bucket, value.content);
  }
}

function readContentText(value: unknown): string {
  const bucket: string[] = [];
  appendTextFragments(bucket, value);
  return bucket.join("");
}

function readReasoningText(value: Record<string, unknown>): string {
  const bucket: string[] = [];
  appendTextFragments(bucket, value.reasoning_content);
  appendTextFragments(bucket, value.reasoning);
  appendTextFragments(bucket, value.reasoning_details);
  return bucket.join("");
}

function readUsage(value: unknown): TokenUsage | undefined {
  const usage = readRecord(value);
  const inputTokens = readNumber(usage?.prompt_tokens) ?? readNumber(usage?.input_tokens);
  const outputTokens = readNumber(usage?.completion_tokens) ?? readNumber(usage?.output_tokens);

  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }

  const promptDetails = readRecord(usage?.prompt_tokens_details) ?? readRecord(usage?.input_tokens_details);
  const completionDetails = readRecord(usage?.completion_tokens_details) ?? readRecord(usage?.output_tokens_details);

  return {
    inputTokens,
    outputTokens,
    cachedInputTokens: readNumber(promptDetails?.cached_tokens),
    reasoningTokens: readNumber(completionDetails?.reasoning_tokens),
  };
}

function mapFinishReason(reason: string | undefined, hasToolCalls: boolean): FinishReason {
  if (!reason) {
    return hasToolCalls ? "tool_calls" : "unknown";
  }

  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "max_tokens";
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    case "cancelled":
      return "cancelled";
    case "error":
      return "error";
    default:
      return hasToolCalls ? "tool_calls" : "unknown";
  }
}

function buildFinishMetadata(input: {
  responseId?: string;
  reason?: string;
}) {
  if (!input.responseId && !input.reason) {
    return undefined;
  }

  return {
    ...(input.responseId ? { providerResponseId: input.responseId } : {}),
    ...(input.reason ? { providerReason: input.reason } : {}),
  };
}

function* emitOpenTextEnd(state: ParserState): Iterable<AiTurnEvent> {
  if (!state.textOpen) {
    return;
  }

  state.textOpen = false;
  yield {
    type: "text.end",
  };
}

function* emitOpenReasoningEnd(state: ParserState): Iterable<AiTurnEvent> {
  if (!state.reasoningOpen) {
    return;
  }

  state.reasoningOpen = false;
  yield {
    type: "reasoning.end",
  };
}

function mergeToolCallState(
  state: ParserState,
  index: number,
  toolCall: Record<string, unknown>,
): void {
  const current = state.toolCalls.get(index) ?? { argumentsText: "" };
  const functionRecord = readRecord(toolCall.function) ?? toolCall;
  const id = readText(toolCall.id);
  const name = readText(functionRecord.name);
  const argumentsFragment = readText(functionRecord.arguments);

  state.toolCalls.set(index, {
    id: id ?? current.id,
    name: name ?? current.name,
    argumentsText: `${current.argumentsText}${argumentsFragment ?? ""}`,
  });
}

function* emitPendingToolCalls(state: ParserState): Iterable<AiTurnEvent> {
  const entries = [...state.toolCalls.entries()].sort((left, right) => left[0] - right[0]);
  state.toolCalls.clear();

  for (const [index, toolCall] of entries) {
    if (!toolCall.name) {
      continue;
    }

    const toolCallId = toolCall.id ?? `${state.responseId ?? "tool_call"}_${index}`;
    yield {
      type: "tool.call",
      toolCallId: asToolCallId(toolCallId),
      toolName: toolCall.name,
      input: parseJsonMaybe(toolCall.argumentsText || "{}"),
    };
  }
}

function readPrimaryChoice(value: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const records = value
    .map((item) => readRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));

  return records.find((item) => readNumber(item.index) === 0) ?? records[0];
}

function buildStreamError(): KernelError {
  return {
    code: "provider_error",
    message: "OpenAI stream ended before a terminal event was received",
    retryable: true,
  };
}

function* normalizeStreamingPayload(
  payload: Record<string, unknown>,
  state: ParserState,
): Iterable<AiTurnEvent> {
  const errorRecord = readRecord(payload.error);
  if (errorRecord) {
    state.sawTerminal = true;
    yield {
      type: "error",
      error: normalizeOpenAIStreamError(errorRecord),
    };
    return;
  }

  state.responseId = readText(payload.id) ?? state.responseId;

  const usage = readUsage(payload.usage);
  const choice = readPrimaryChoice(payload.choices);
  if (!choice) {
    if (usage) {
      yield {
        type: "usage",
        usage,
      };
    }
    return;
  }

  const delta = readRecord(choice.delta);
  if (delta) {
    const reasoningText = readReasoningText(delta);
    if (reasoningText) {
      if (!state.reasoningOpen) {
        state.reasoningOpen = true;
        yield {
          type: "reasoning.start",
        };
      }
      yield {
        type: "reasoning.delta",
        delta: reasoningText,
      };
    }

    const contentText = readContentText(delta.content);
    if (contentText) {
      if (!state.textOpen) {
        state.textOpen = true;
        yield {
          type: "text.start",
        };
      }
      yield {
        type: "text.delta",
        delta: contentText,
      };
    }

    const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
    toolCalls.forEach((item, listIndex) => {
      const record = readRecord(item);
      if (!record) {
        return;
      }
      const index = readNumber(record.index) ?? listIndex;
      mergeToolCallState(state, index, record);
    });

    const legacyFunctionCall = readRecord(delta.function_call);
    if (legacyFunctionCall) {
      mergeToolCallState(state, 0, legacyFunctionCall);
    }
  }

  const finishReason = readText(choice.finish_reason);
  if (!finishReason) {
    if (usage) {
      yield {
        type: "usage",
        usage,
      };
    }
    return;
  }

  yield* emitOpenReasoningEnd(state);
  yield* emitOpenTextEnd(state);
  yield* emitPendingToolCalls(state);

  if (usage) {
    yield {
      type: "usage",
      usage,
    };
  }

  state.sawTerminal = true;
  const metadata = buildFinishMetadata({
    responseId: state.responseId,
    reason: finishReason,
  });
  yield {
    type: "finish",
    reason: mapFinishReason(finishReason, finishReason === "tool_calls" || finishReason === "function_call"),
    ...(metadata ? { metadata } : {}),
  };
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

export async function* streamOpenAIChatCompletionEvents(
  response: Response,
): AsyncIterable<AiTurnEvent> {
  const state: ParserState = {
    textOpen: false,
    reasoningOpen: false,
    toolCalls: new Map(),
    sawTerminal: false,
  };

  for await (const payload of readSsePayloads(response)) {
    yield* normalizeStreamingPayload(payload, state);
  }

  if (!state.sawTerminal) {
    yield* emitOpenReasoningEnd(state);
    yield* emitOpenTextEnd(state);
    yield {
      type: "error",
      error: buildStreamError(),
    };
  }
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

function* emitToolCallEvents(input: {
  message?: Record<string, unknown>;
  responseId?: string;
  onToolCall: () => void;
}): Iterable<AiTurnEvent> {
  const message = input.message;
  if (!message) {
    return;
  }

  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  for (const item of toolCalls) {
    const record = readRecord(item);
    if (!record) {
      continue;
    }

    const functionRecord = readRecord(record.function);
    const toolName = readText(functionRecord?.name);
    const toolCallId = readText(record.id);
    if (!toolName || !toolCallId) {
      continue;
    }

    input.onToolCall();
    yield {
      type: "tool.call",
      toolCallId: asToolCallId(toolCallId),
      toolName,
      input: parseJsonMaybe(readText(functionRecord?.arguments) ?? "{}"),
    };
  }

  const legacyFunctionCall = readRecord(message.function_call);
  if (!legacyFunctionCall) {
    return;
  }

  const legacyName = readText(legacyFunctionCall.name);
  if (!legacyName) {
    return;
  }

  input.onToolCall();
  yield {
    type: "tool.call",
    toolCallId: asToolCallId(`${input.responseId ?? "tool_call"}_0`),
    toolName: legacyName,
    input: parseJsonMaybe(readText(legacyFunctionCall.arguments) ?? "{}"),
  };
}

export function readOpenAIChatCompletionJsonEvents(payload: unknown): readonly AiTurnEvent[] {
  const root = readRecord(payload);
  const source = readRecord(root?.response) ?? root;

  if (!source) {
    return [{
      type: "error",
      error: {
        code: "provider_error",
        message: "OpenAI JSON response payload is invalid",
      },
    }];
  }

  const choice = readPrimaryChoice(source.choices);
  if (!choice) {
    return [{
      type: "error",
      error: {
        code: "provider_error",
        message: "OpenAI JSON response payload is missing choices",
      },
    }];
  }

  const events: AiTurnEvent[] = [];
  const message = readRecord(choice.message);
  const responseId = readText(source.id);
  let hasToolCalls = false;

  const reasoningText = message ? readReasoningText(message) : "";
  for (const event of emitReasoningEvents(reasoningText)) {
    events.push(event);
  }

  const contentText = message ? readContentText(message.content) : "";
  for (const event of emitTextEvents(contentText)) {
    events.push(event);
  }

  for (const event of emitToolCallEvents({
    message,
    responseId,
    onToolCall: () => {
      hasToolCalls = true;
    },
  })) {
    events.push(event);
  }

  const usage = readUsage(source.usage);
  if (usage) {
    events.push({
      type: "usage",
      usage,
    });
  }

  const finishReason = readText(choice.finish_reason);
  const metadata = buildFinishMetadata({
    responseId,
    reason: finishReason,
  });
  events.push({
    type: "finish",
    reason: mapFinishReason(finishReason, hasToolCalls),
    ...(metadata ? { metadata } : {}),
  });

  return events;
}