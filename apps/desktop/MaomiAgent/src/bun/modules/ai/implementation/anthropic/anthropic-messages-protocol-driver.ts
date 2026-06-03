import type { PromptCodec, RetryBackoffPolicy } from "../../kernel-bridge";
import {
  calculateRetryDelayMs,
  decideRetry,
  parseProviderRetryAfterMs,
} from "../../kernel-bridge";
import type { DesktopAiProtocolDriver } from "../shared/provider-protocol-driver";
import {
  AnthropicMessagesPromptCodec,
  type AnthropicMessagesPromptPayload,
} from "./anthropic-messages-prompt-codec";
import {
  buildAnthropicMessagesEndpoint,
  readAnthropicMessagesModelId,
  type AnthropicMessagesServiceConfig,
} from "./anthropic-messages-service-config";
import {
  readAnthropicMessageJsonEvents,
  streamAnthropicMessageEvents,
} from "./anthropic-messages-event-parser";
import {
  normalizeAnthropicHttpError,
  normalizeAnthropicThrownError,
} from "./anthropic-errors";
import {
  inferHttpResponseMode,
  looksLikeJsonPayloadPrefix,
} from "../shared/http-response-mode";

const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_INTERLEAVED_THINKING_BETA = "interleaved-thinking-2025-05-14";
const DEFAULT_FINE_GRAINED_TOOL_STREAMING_BETA = "fine-grained-tool-streaming-2025-05-14";
const DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS = 8192;
const DEFAULT_STREAM_ACCEPT_HEADER = "text/event-stream";

export type AnthropicMessagesRequestBody = {
  model: string;
  messages: AnthropicMessagesPromptPayload["messages"];
  max_tokens: number;
  stream: boolean;
  system?: string;
  tools?: AnthropicMessagesPromptPayload["tools"];
  tool_choice?: AnthropicMessagesPromptPayload["toolChoice"];
  thinking?: AnthropicMessagesPromptPayload["thinking"];
  temperature?: number;
};

type CreateAnthropicMessagesProtocolDriverOptions = {
  fetchFn: typeof fetch;
  codec?: PromptCodec<AnthropicMessagesPromptPayload>;
  retryPolicy?: RetryBackoffPolicy;
  sleepFn?: (ms: number) => Promise<void>;
};

function normalizeAssistantReasoningContent(
  messages: AnthropicMessagesPromptPayload["messages"],
): AnthropicMessagesPromptPayload["messages"] {
  return messages.map((message) => {
    if (
      message.role !== "assistant"
      || !message.content.some((block) => block.type === "tool_use")
      || Object.prototype.hasOwnProperty.call(message, "reasoning_content")
    ) {
      return message;
    }

    return {
      ...message,
      reasoning_content: "",
    };
  });
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function startRequestTimeout(timeoutMs: number | undefined): {
  signal?: AbortSignal;
  didTimeout: () => boolean;
  cancel: () => void;
  normalizeError: (error: unknown) => unknown;
} {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return {
      didTimeout: () => false,
      cancel: () => {},
      normalizeError: (error) => error,
    };
  }

  const controller = new AbortController();
  let didTimeout = false;
  const handle = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => didTimeout,
    cancel: () => {
      clearTimeout(handle);
    },
    normalizeError: (error) => {
      if (!didTimeout) {
        return error;
      }

      return new Error(`Anthropic request timed out after ${timeoutMs}ms`);
    },
  };
}

function composeAbortSignals(...signals: Array<AbortSignal | undefined>): {
  signal?: AbortSignal;
  dispose: () => void;
} {
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (activeSignals.length === 0) {
    return {
      dispose: () => {},
    };
  }

  const controller = new AbortController();
  const cleanups: Array<() => void> = [];
  const abort = () => controller.abort();

  for (const signal of activeSignals) {
    if (signal.aborted) {
      abort();
      break;
    }

    const listener = () => abort();
    signal.addEventListener("abort", listener, { once: true });
    cleanups.push(() => signal.removeEventListener("abort", listener));
  }

  return {
    signal: controller.signal,
    dispose: () => {
      for (const cleanup of cleanups) {
        cleanup();
      }
    },
  };
}

function buildAbortedTurnError() {
  return {
    code: "conversation_turn_aborted",
    message: "Desktop conversation reply was stopped.",
    retryable: false,
  };
}

function resolveMaxTokens(input: Parameters<DesktopAiProtocolDriver["execute"]>[0]["request"]): number {
  if (
    typeof input.settings.maxOutputTokens === "number"
    && Number.isFinite(input.settings.maxOutputTokens)
    && input.settings.maxOutputTokens > 0
  ) {
    return Math.max(1, Math.trunc(input.settings.maxOutputTokens));
  }

  return DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS;
}

function buildRequestBody(
  input: Parameters<DesktopAiProtocolDriver["execute"]>[0]["request"],
  payload: AnthropicMessagesPromptPayload,
): AnthropicMessagesRequestBody {
  return {
    model: readAnthropicMessagesModelId(input.executionProfile),
    messages: normalizeAssistantReasoningContent(payload.messages),
    max_tokens: resolveMaxTokens(input),
    stream: true,
    ...(payload.system ? { system: payload.system } : {}),
    ...(payload.tools && payload.tools.length > 0 ? { tools: payload.tools } : {}),
    ...(payload.toolChoice ? { tool_choice: payload.toolChoice } : {}),
    ...(payload.thinking ? { thinking: payload.thinking } : {}),
    ...(typeof input.settings.temperature === "number"
      ? { temperature: input.settings.temperature }
      : {}),
  };
}

function mergeAnthropicBetaHeader(input: {
  configuredValue: string | undefined;
  enableInterleavedThinking: boolean;
}): string | undefined {
  const configuredValues = input.configuredValue
    ? input.configuredValue.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
  const filteredConfiguredValues = input.enableInterleavedThinking
    ? configuredValues
    : configuredValues.filter((item) => item !== DEFAULT_INTERLEAVED_THINKING_BETA);
  const values = [
    ...filteredConfiguredValues,
    ...(input.enableInterleavedThinking ? [DEFAULT_INTERLEAVED_THINKING_BETA] : []),
    DEFAULT_FINE_GRAINED_TOOL_STREAMING_BETA,
  ];
  const deduped = [...new Set(values)];

  return deduped.length > 0 ? deduped.join(",") : undefined;
}

function buildHeaders(input: {
  config: AnthropicMessagesServiceConfig;
  payload: AnthropicMessagesPromptPayload;
}): Record<string, string> {
  const configuredHeaders = input.config.headers;
  const anthropicBeta = mergeAnthropicBetaHeader({
    configuredValue: configuredHeaders?.["anthropic-beta"],
    enableInterleavedThinking: Boolean(input.payload.thinking),
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": input.config.apiKey,
    "anthropic-version": DEFAULT_ANTHROPIC_VERSION,
    ...(anthropicBeta ? { "anthropic-beta": anthropicBeta } : {}),
    ...(configuredHeaders ? { ...configuredHeaders } : {}),
  };

  headers["anthropic-version"] = configuredHeaders?.["anthropic-version"] ?? DEFAULT_ANTHROPIC_VERSION;
  if (anthropicBeta) {
    headers["anthropic-beta"] = anthropicBeta;
  } else {
    delete headers["anthropic-beta"];
  }
  delete headers.accept;
  headers.Accept = configuredHeaders?.Accept
    ?? configuredHeaders?.accept
    ?? DEFAULT_STREAM_ACCEPT_HEADER;
  return headers;
}

async function readResponseBodyText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function rebuildReadableStream(
  firstChunk: Uint8Array,
  reader: ReadableStreamDefaultReader<Uint8Array>,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(firstChunk);

      void (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              break;
            }

            if (value) {
              controller.enqueue(value);
            }
          }
        } catch (error) {
          controller.error(error);
        }
      })();
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });
}

async function resolveResponseMode(input: {
  response: Response;
}): Promise<{
  mode: "stream" | "json";
  response: Response;
}> {
  const mode = inferHttpResponseMode(input.response.headers.get("content-type"));
  if (mode === "stream") {
    return {
      mode,
      response: input.response,
    };
  }

  if (!input.response.body) {
    return {
      mode: "json",
      response: input.response,
    };
  }

  const reader = input.response.body.getReader();
  const firstChunk = await reader.read();
  if (firstChunk.done || !firstChunk.value || firstChunk.value.length === 0) {
    return {
      mode: "json",
      response: new Response("", {
        status: input.response.status,
        statusText: input.response.statusText,
        headers: input.response.headers,
      }),
    };
  }

  const prefixText = new TextDecoder().decode(firstChunk.value);
  return {
    mode: looksLikeJsonPayloadPrefix(prefixText) ? "json" : "stream",
    response: new Response(rebuildReadableStream(firstChunk.value, reader), {
      status: input.response.status,
      statusText: input.response.statusText,
      headers: input.response.headers,
    }),
  };
}

export function createAnthropicMessagesProtocolDriver(
  options: CreateAnthropicMessagesProtocolDriverOptions,
): DesktopAiProtocolDriver {
  const codec = options.codec ?? new AnthropicMessagesPromptCodec();
  const sleepFn = options.sleepFn ?? sleepMs;

  return {
    id: "anthropic-messages",
    capabilities: {
      supportsFunctionCall: true,
      supportsReasoning: true,
      supportsInterleavedReasoning: true,
      supportsSystemBlocks: true,
      supportsTemperature: true,
    },
    async *execute(input) {
      const payload = codec.encode(input.request);
      const requestBody = buildRequestBody(input.request, payload);
      const endpoint = buildAnthropicMessagesEndpoint(input.config.baseUrl);
      let attempt = 1;

      while (true) {
        const requestTimeout = startRequestTimeout(input.config.timeoutMs);
        const requestSignal = composeAbortSignals(requestTimeout.signal, input.signal);
        let response: Response;
        try {
          response = await options.fetchFn(endpoint, {
            method: "POST",
            headers: buildHeaders({
              config: input.config,
              payload,
            }),
            body: JSON.stringify(requestBody),
            ...(requestSignal.signal ? { signal: requestSignal.signal } : {}),
          });
        } catch (error) {
          requestSignal.dispose();
          requestTimeout.cancel();
          if (input.signal?.aborted && !requestTimeout.didTimeout()) {
            throw buildAbortedTurnError();
          }
          const kernelError = normalizeAnthropicThrownError(requestTimeout.normalizeError(error));
          const retried = await retryIfNeeded({
            attempt,
            error: kernelError,
            retryPolicy: options.retryPolicy,
            sleepFn,
          });
          if (retried) {
            attempt += 1;
            continue;
          }

          throw kernelError;
        }

        if (!response.ok) {
          requestSignal.dispose();
          requestTimeout.cancel();
          const kernelError = normalizeAnthropicHttpError({
            status: response.status,
            statusText: response.statusText,
            bodyText: await readResponseBodyText(response),
          });
          const retried = await retryIfNeeded({
            attempt,
            error: kernelError,
            headers: response.headers,
            retryPolicy: options.retryPolicy,
            sleepFn,
          });
          if (retried) {
            attempt += 1;
            continue;
          }

          throw kernelError;
        }

        try {
          yield {
            kind: "headers",
            status: response.status,
            contentType: response.headers.get("content-type") ?? undefined,
          };

          const resolvedResponse = await resolveResponseMode({ response });
          if (resolvedResponse.mode === "stream") {
            yield {
              kind: "byte",
              chunk: "",
            };
            for await (const event of streamAnthropicMessageEvents(resolvedResponse.response)) {
              yield {
                kind: "event",
                event,
              };
            }
            return;
          }

          const payload = await resolvedResponse.response.json() as Record<string, unknown>;
          for await (const event of readAnthropicMessageJsonEvents(payload)) {
            yield {
              kind: "event",
              event,
            };
          }
        } catch (error) {
          throw normalizeAnthropicThrownError(requestTimeout.normalizeError(error));
        } finally {
          requestSignal.dispose();
          requestTimeout.cancel();
        }

        return;
      }
    },
  };
}

async function retryIfNeeded(input: {
  attempt: number;
  error: ReturnType<typeof normalizeAnthropicThrownError>;
  headers?: Headers;
  retryPolicy?: RetryBackoffPolicy;
  sleepFn: (ms: number) => Promise<void>;
}): Promise<boolean> {
  if (!input.retryPolicy) {
    return false;
  }

  const decision = decideRetry({
    ...input.retryPolicy,
    attempt: input.attempt,
    error: input.error,
  });
  if (!decision.shouldRetry) {
    return false;
  }

  const delayMs = calculateRetryDelayMs({
    ...input.retryPolicy,
    attempt: input.attempt,
    retryAfterMs: input.headers
      ? parseProviderRetryAfterMs({
          headers: input.headers,
        })
      : undefined,
  });

  await input.sleepFn(delayMs);
  return true;
}
