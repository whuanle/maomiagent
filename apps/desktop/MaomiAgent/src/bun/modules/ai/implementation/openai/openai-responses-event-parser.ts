import {
  asToolCallId,
  type AiTurnFinishMetadata,
  type AiTurnEvent,
  type FinishReason,
  type TokenUsage,
} from "../../kernel-bridge";
import { normalizeOpenAIStreamError } from "./openai-responses-errors";

type ParserState = {
  textOpen: boolean;
  reasoningOpen: number;
  hasToolCall: boolean;
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

function mapFinishReason(reason: string | undefined, hasToolCall: boolean): FinishReason {
  if (!reason) {
    return hasToolCall ? "tool_calls" : "stop";
  }

  switch (reason) {
    case "max_output_tokens":
      return "max_tokens";
    case "cancelled":
      return "cancelled";
    case "error":
      return "error";
    default:
      return hasToolCall ? "tool_calls" : "unknown";
  }
}

function readUsage(value: unknown): TokenUsage | undefined {
  const usage = readRecord(value);
  const inputTokens = readNumber(usage?.input_tokens);
  const outputTokens = readNumber(usage?.output_tokens);

  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }

  const inputDetails = readRecord(usage?.input_tokens_details);
  const outputDetails = readRecord(usage?.output_tokens_details);

  return {
    inputTokens,
    outputTokens,
    cachedInputTokens: readNumber(inputDetails?.cached_tokens),
    reasoningTokens: readNumber(outputDetails?.reasoning_tokens),
  };
}

function buildFinishMetadata(input: {
  response?: Record<string, unknown>;
  status?: string;
  reason?: string;
}): AiTurnFinishMetadata | undefined {
  const providerResponseId = readText(input.response?.id);
  const providerStatus = input.status ?? readText(input.response?.status);
  const providerReason = input.reason;

  if (!providerResponseId && !providerStatus && !providerReason) {
    return undefined;
  }

  return {
    ...(providerResponseId ? { providerResponseId } : {}),
    ...(providerStatus ? { providerStatus } : {}),
    ...(providerReason ? { providerReason } : {}),
  };
}

function* emitOpenTextEnd(state: ParserState): Iterable<AiTurnEvent> {
  if (state.textOpen) {
    state.textOpen = false;
    yield {
      type: "text.end",
    };
  }
}

function* emitOpenReasoningEnd(state: ParserState): Iterable<AiTurnEvent> {
  while (state.reasoningOpen > 0) {
    state.reasoningOpen -= 1;
    yield {
      type: "reasoning.end",
    };
  }
}

function* normalizeStreamPayload(
  payload: Record<string, unknown>,
  state: ParserState,
): Iterable<AiTurnEvent> {
  const type = readText(payload.type);
  if (!type) {
    return;
  }

  if (type === "response.output_item.added") {
    const item = readRecord(payload.item);
    const itemType = readText(item?.type);
    if (itemType === "message" && !state.textOpen) {
      state.textOpen = true;
      yield {
        type: "text.start",
      };
    }
    if (itemType === "reasoning") {
      state.reasoningOpen += 1;
      yield {
        type: "reasoning.start",
      };
    }
    return;
  }

  if (type === "response.output_text.delta") {
    const delta = readText(payload.delta) ?? "";
    if (!state.textOpen) {
      state.textOpen = true;
      yield {
        type: "text.start",
      };
    }
    if (delta) {
      yield {
        type: "text.delta",
        delta,
      };
    }
    return;
  }

  if (type === "response.reasoning_summary_text.delta") {
    const delta = readText(payload.delta) ?? "";
    if (state.reasoningOpen === 0) {
      state.reasoningOpen = 1;
      yield {
        type: "reasoning.start",
      };
    }
    if (delta) {
      yield {
        type: "reasoning.delta",
        delta,
      };
    }
    return;
  }

  if (type === "response.output_item.done") {
    const item = readRecord(payload.item);
    const itemType = readText(item?.type);

    if (itemType === "message") {
      yield* emitOpenTextEnd(state);
      return;
    }

    if (itemType === "reasoning") {
      if (state.reasoningOpen > 0) {
        state.reasoningOpen -= 1;
      }
      yield {
        type: "reasoning.end",
      };
      return;
    }

    if (itemType === "function_call") {
      const toolName = readText(item?.name);
      const callId = readText(item?.call_id) ?? readText(item?.id);
      const argumentsText = readText(item?.arguments) ?? "{}";

      if (!toolName || !callId) {
        return;
      }

      state.hasToolCall = true;
      yield {
        type: "tool.call",
        toolCallId: asToolCallId(callId),
        toolName,
        input: parseJsonMaybe(argumentsText),
      };
      return;
    }

    return;
  }

  if (type === "response.completed" || type === "response.incomplete") {
    const response = readRecord(payload.response);
    const incompleteDetails = readRecord(response?.incomplete_details);
    const reason = readText(incompleteDetails?.reason);
    const metadata = buildFinishMetadata({
      response,
      status: type === "response.completed" ? "completed" : "incomplete",
      reason,
    });

    yield* emitOpenReasoningEnd(state);
    yield* emitOpenTextEnd(state);

    const usage = readUsage(response?.usage);
    if (usage) {
      yield {
        type: "usage",
        usage,
      };
    }

    state.sawTerminal = true;
    yield {
      type: "finish",
      reason: mapFinishReason(reason, state.hasToolCall),
      ...(metadata ? { metadata } : {}),
    };
    return;
  }

  if (type === "error") {
    state.sawTerminal = true;
    yield {
      type: "error",
      error: normalizeOpenAIStreamError(payload),
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

export async function* streamOpenAIResponseEvents(
  response: Response,
): AsyncIterable<AiTurnEvent> {
  const state: ParserState = {
    textOpen: false,
    reasoningOpen: 0,
    hasToolCall: false,
    sawTerminal: false,
  };

  for await (const payload of readSsePayloads(response)) {
    yield* normalizeStreamPayload(payload, state);
  }

  if (!state.sawTerminal) {
    yield* emitOpenReasoningEnd(state);
    yield* emitOpenTextEnd(state);
    yield {
      type: "error",
      error: {
        code: "provider_error",
        message: "OpenAI stream ended before a terminal event was received",
        retryable: true,
      },
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

function* emitReasoningEvents(summary: readonly unknown[]): Iterable<AiTurnEvent> {
  const text = summary
    .map((item) => {
      const record = readRecord(item);
      return readText(record?.text) ?? "";
    })
    .join("")
    .trim();

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

function* emitOutputItemEvents(
  item: Record<string, unknown>,
  state: { hasToolCall: boolean },
): Iterable<AiTurnEvent> {
  const type = readText(item.type);
  if (!type) {
    return;
  }

  if (type === "message") {
    const content = Array.isArray(item.content) ? item.content : [];
    const text = content
      .map((part) => {
        const record = readRecord(part);
        return readText(record?.text) ?? "";
      })
      .join("")
      .trim();

    yield* emitTextEvents(text);
    return;
  }

  if (type === "reasoning") {
    const summary = Array.isArray(item.summary) ? item.summary : [];
    yield* emitReasoningEvents(summary);
    return;
  }

  if (type === "function_call") {
    const toolName = readText(item.name);
    const callId = readText(item.call_id) ?? readText(item.id);
    const argumentsText = readText(item.arguments) ?? "{}";

    if (!toolName || !callId) {
      return;
    }

    state.hasToolCall = true;
    yield {
      type: "tool.call",
      toolCallId: asToolCallId(callId),
      toolName,
      input: parseJsonMaybe(argumentsText),
    };
  }
}

export function readOpenAIResponseJsonEvents(payload: unknown): readonly AiTurnEvent[] {
  const root = readRecord(payload);
  const response = readRecord(root?.response);
  const source = response ?? root;

  if (!source) {
    return [{
      type: "error",
      error: {
        code: "provider_error",
        message: "OpenAI JSON response payload is invalid",
      },
    }];
  }

  const events: AiTurnEvent[] = [];
  const state = {
    hasToolCall: false,
  };

  const output = Array.isArray(source.output) ? source.output : [];
  for (const item of output) {
    const record = readRecord(item);
    if (!record) {
      continue;
    }
    for (const event of emitOutputItemEvents(record, state)) {
      events.push(event);
    }
  }

  if (output.length === 0) {
    const outputText = readText(source.output_text);
    if (outputText) {
      for (const event of emitTextEvents(outputText)) {
        events.push(event);
      }
    }
  }

  const usage = readUsage(source.usage);
  if (usage) {
    events.push({
      type: "usage",
      usage,
    });
  }

  const incompleteDetails = readRecord(source.incomplete_details);
  const reason = readText(incompleteDetails?.reason);
  const metadata = buildFinishMetadata({
    response: source,
    status: readText(source.status),
    reason,
  });
  events.push({
    type: "finish",
    reason: mapFinishReason(reason, state.hasToolCall),
    ...(metadata ? { metadata } : {}),
  });

  return events;
}