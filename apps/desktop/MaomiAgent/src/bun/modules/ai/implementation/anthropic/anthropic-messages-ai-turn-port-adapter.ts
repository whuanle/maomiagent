import type {
  AiTurnEvent,
  AiTurnPort,
  AiTurnRequest,
  PromptCodec,
  RetryBackoffPolicy,
} from "../../kernel-bridge";
import {
  calculateRetryDelayMs,
  decideRetry,
  parseProviderRetryAfterMs,
} from "../../kernel-bridge";
import {
  AnthropicMessagesPromptCodec,
  type AnthropicMessagesPromptPayload,
} from "./anthropic-messages-prompt-codec";
import {
  buildAnthropicMessagesEndpoint,
  readAnthropicMessagesModelId,
  type AnthropicMessagesServiceConfig,
  type AnthropicMessagesServiceConfigResolver,
} from "./anthropic-messages-service-config";
import {
  readAnthropicMessageJsonEvents,
  streamAnthropicMessageEvents,
} from "./anthropic-messages-event-parser";
import {
  normalizeAnthropicHttpError,
  normalizeAnthropicThrownError,
} from "./anthropic-errors";

const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_ANTHROPIC_BETA = "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14";
const DEFAULT_ANTHROPIC_MAX_OUTPUT_TOKENS = 8192;

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

type AnthropicMessagesAiTurnPortAdapterOptions = {
  resolveConfig: AnthropicMessagesServiceConfigResolver;
  fetchFn?: typeof fetch;
  codec?: PromptCodec<AnthropicMessagesPromptPayload>;
  retryPolicy?: RetryBackoffPolicy;
  sleepFn?: (ms: number) => Promise<void>;
};

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

function resolveMaxTokens(input: AiTurnRequest): number {
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
  input: AiTurnRequest,
  payload: AnthropicMessagesPromptPayload,
): AnthropicMessagesRequestBody {
  return {
    model: readAnthropicMessagesModelId(input.executionProfile),
    messages: payload.messages,
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

function mergeAnthropicBetaHeader(configuredValue: string | undefined): string {
  const values = [
    ...(configuredValue
      ? configuredValue.split(",").map((item) => item.trim()).filter(Boolean)
      : []),
    ...DEFAULT_ANTHROPIC_BETA.split(",").map((item) => item.trim()).filter(Boolean),
  ];

  return [...new Set(values)].join(",");
}

function buildHeaders(config: AnthropicMessagesServiceConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": config.apiKey,
    "anthropic-version": DEFAULT_ANTHROPIC_VERSION,
    "anthropic-beta": mergeAnthropicBetaHeader(config.headers?.["anthropic-beta"]),
    ...(config.headers ? { ...config.headers } : {}),
  };

  headers["anthropic-version"] = config.headers?.["anthropic-version"] ?? DEFAULT_ANTHROPIC_VERSION;
  headers["anthropic-beta"] = mergeAnthropicBetaHeader(config.headers?.["anthropic-beta"]);
  return headers;
}

async function readResponseBodyText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export class AnthropicMessagesAiTurnPortAdapter implements AiTurnPort {
  private readonly resolveConfig: AnthropicMessagesServiceConfigResolver;
  private readonly fetchFn: typeof fetch;
  private readonly codec: PromptCodec<AnthropicMessagesPromptPayload>;
  private readonly retryPolicy?: RetryBackoffPolicy;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(options: AnthropicMessagesAiTurnPortAdapterOptions) {
    this.resolveConfig = options.resolveConfig;
    this.fetchFn = options.fetchFn ?? fetch;
    this.codec = options.codec ?? new AnthropicMessagesPromptCodec();
    this.retryPolicy = options.retryPolicy;
    this.sleepFn = options.sleepFn ?? sleepMs;
  }

  async *stream(input: AiTurnRequest): AsyncIterable<AiTurnEvent> {
    let config: AnthropicMessagesServiceConfig;
    try {
      config = await this.resolveConfig(input.executionProfile);
    } catch (error) {
      yield {
        type: "error",
        error: normalizeAnthropicThrownError(error),
      };
      return;
    }

    const requestBody = buildRequestBody(input, this.codec.encode(input));
    const endpoint = buildAnthropicMessagesEndpoint(config.baseUrl);
    let attempt = 1;

    while (true) {
      const requestTimeout = startRequestTimeout(config.timeoutMs);
      const requestSignal = composeAbortSignals(requestTimeout.signal, input.signal);
      let response: Response;
      try {
        response = await this.fetchFn(endpoint, {
          method: "POST",
          headers: buildHeaders(config),
          body: JSON.stringify(requestBody),
          ...(requestSignal.signal ? { signal: requestSignal.signal } : {}),
        });
      } catch (error) {
        requestSignal.dispose();
        requestTimeout.cancel();
        if (input.signal?.aborted && !requestTimeout.didTimeout()) {
          yield {
            type: "error",
            error: buildAbortedTurnError(),
          };
          return;
        }
        const kernelError = normalizeAnthropicThrownError(requestTimeout.normalizeError(error));
        const retried = await this.retryIfNeeded({
          attempt,
          error: kernelError,
        });
        if (retried) {
          attempt += 1;
          continue;
        }

        yield {
          type: "error",
          error: kernelError,
        };
        return;
      }

      if (!response.ok) {
        requestSignal.dispose();
        requestTimeout.cancel();
        const kernelError = normalizeAnthropicHttpError({
          status: response.status,
          statusText: response.statusText,
          bodyText: await readResponseBodyText(response),
        });
        const retried = await this.retryIfNeeded({
          attempt,
          error: kernelError,
          headers: response.headers,
        });
        if (retried) {
          attempt += 1;
          continue;
        }

        yield {
          type: "error",
          error: kernelError,
        };
        return;
      }

      try {
        const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
        if (contentType.includes("text/event-stream")) {
          yield* streamAnthropicMessageEvents(response);
          return;
        }

        const payload = await response.json() as Record<string, unknown>;
        yield* readAnthropicMessageJsonEvents(payload);
      } catch (error) {
        yield {
          type: "error",
          error: normalizeAnthropicThrownError(requestTimeout.normalizeError(error)),
        };
      } finally {
        requestSignal.dispose();
        requestTimeout.cancel();
      }
      return;
    }
  }

  private async retryIfNeeded(input: {
    attempt: number;
    error: ReturnType<typeof normalizeAnthropicThrownError>;
    headers?: Headers;
  }): Promise<boolean> {
    if (!this.retryPolicy) {
      return false;
    }

    const decision = decideRetry({
      ...this.retryPolicy,
      attempt: input.attempt,
      error: input.error,
    });
    if (!decision.shouldRetry) {
      return false;
    }

    const delayMs = calculateRetryDelayMs({
      ...this.retryPolicy,
      attempt: input.attempt,
      retryAfterMs: input.headers
        ? parseProviderRetryAfterMs({
            headers: input.headers,
          })
        : undefined,
    });

    await this.sleepFn(delayMs);
    return true;
  }
}