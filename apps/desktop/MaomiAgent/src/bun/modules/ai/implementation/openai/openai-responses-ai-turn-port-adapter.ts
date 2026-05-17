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
  OpenAIResponsesPromptCodec,
  type OpenAIResponsesPromptPayload,
} from "./openai-responses-prompt-codec";
import {
  normalizeOpenAIHttpError,
  normalizeOpenAIThrownError,
} from "./openai-responses-errors";
import {
  buildOpenAIResponsesEndpoint,
  readOpenAIResponsesModelId,
  type OpenAIResponsesServiceConfig,
  type OpenAIResponsesServiceConfigResolver,
} from "./openai-responses-service-config";
import {
  readOpenAIResponseJsonEvents,
  streamOpenAIResponseEvents,
} from "./openai-responses-event-parser";

export type OpenAIResponsesRequestBody = {
  model: string;
  input: OpenAIResponsesPromptPayload["input"];
  stream: boolean;
  metadata?: Readonly<Record<string, string>>;
  tools?: OpenAIResponsesPromptPayload["tools"];
  tool_choice?: OpenAIResponsesPromptPayload["toolChoice"];
  text?: OpenAIResponsesPromptPayload["text"];
  temperature?: number;
  max_output_tokens?: number;
  store?: boolean;
  parallel_tool_calls?: boolean;
  reasoning?: {
    effort?: string;
    summary?: string;
  };
};

type OpenAIResponsesAiTurnPortAdapterOptions = {
  resolveConfig: OpenAIResponsesServiceConfigResolver;
  fetchFn?: typeof fetch;
  codec?: PromptCodec<OpenAIResponsesPromptPayload>;
  retryPolicy?: RetryBackoffPolicy;
  sleepFn?: (ms: number) => Promise<void>;
};

async function sleepMs(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildTraceMetadata(input: AiTurnRequest): Readonly<Record<string, string>> | undefined {
  const metadata: Record<string, string> = {};

  const sessionId = input.trace?.sessionId ?? input.prompt.sessionId;
  const runId = input.trace?.runId ?? input.prompt.runId;
  const turnId = input.trace?.turnId ?? input.prompt.turnId;

  if (sessionId) {
    metadata.maomi_session_id = sessionId;
  }

  if (runId) {
    metadata.maomi_run_id = runId;
  }

  if (turnId) {
    metadata.maomi_turn_id = turnId;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
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

      return new Error(`OpenAI request timed out after ${timeoutMs}ms`);
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

function buildRequestBody(
  input: AiTurnRequest,
  payload: OpenAIResponsesPromptPayload,
  config: OpenAIResponsesServiceConfig,
): OpenAIResponsesRequestBody {
  const traceMetadata = buildTraceMetadata(input);

  return {
    model: readOpenAIResponsesModelId(input.executionProfile),
    input: payload.input,
    stream: true,
    ...(traceMetadata ? { metadata: traceMetadata } : {}),
    ...(payload.tools && payload.tools.length > 0 ? { tools: payload.tools } : {}),
    ...(payload.toolChoice ? { tool_choice: payload.toolChoice } : {}),
    ...(payload.text ? { text: payload.text } : {}),
    ...(typeof input.settings.temperature === "number"
      ? { temperature: input.settings.temperature }
      : {}),
    ...(typeof input.settings.maxOutputTokens === "number"
      ? { max_output_tokens: input.settings.maxOutputTokens }
      : {}),
    ...(typeof config.store === "boolean" ? { store: config.store } : {}),
    ...(typeof config.parallelToolCalls === "boolean"
      ? { parallel_tool_calls: config.parallelToolCalls }
      : {}),
    ...(config.reasoning ? { reasoning: config.reasoning } : {}),
  };
}

function buildHeaders(config: OpenAIResponsesServiceConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
    ...(config.organization ? { "OpenAI-Organization": config.organization } : {}),
    ...(config.project ? { "OpenAI-Project": config.project } : {}),
    ...(config.headers ? { ...config.headers } : {}),
  };
}

async function readResponseBodyText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export class OpenAIResponsesAiTurnPortAdapter implements AiTurnPort {
  private readonly resolveConfig: OpenAIResponsesServiceConfigResolver;
  private readonly fetchFn: typeof fetch;
  private readonly codec: PromptCodec<OpenAIResponsesPromptPayload>;
  private readonly retryPolicy?: RetryBackoffPolicy;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(options: OpenAIResponsesAiTurnPortAdapterOptions) {
    this.resolveConfig = options.resolveConfig;
    this.fetchFn = options.fetchFn ?? fetch;
    this.codec = options.codec ?? new OpenAIResponsesPromptCodec();
    this.retryPolicy = options.retryPolicy;
    this.sleepFn = options.sleepFn ?? sleepMs;
  }

  async *stream(input: AiTurnRequest): AsyncIterable<AiTurnEvent> {
    let config: OpenAIResponsesServiceConfig;
    try {
      config = await this.resolveConfig(input.executionProfile);
    } catch (error) {
      yield {
        type: "error",
        error: normalizeOpenAIThrownError(error),
      };
      return;
    }

    const requestBody = buildRequestBody(input, this.codec.encode(input), config);
    const endpoint = buildOpenAIResponsesEndpoint(config.baseUrl);
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
        const kernelError = normalizeOpenAIThrownError(requestTimeout.normalizeError(error));
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
        const kernelError = normalizeOpenAIHttpError({
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
          yield* streamOpenAIResponseEvents(response);
          return;
        }

        const payload = await response.json();
        yield* readOpenAIResponseJsonEvents(payload);
      } catch (error) {
        yield {
          type: "error",
          error: normalizeOpenAIThrownError(requestTimeout.normalizeError(error)),
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
    error: ReturnType<typeof normalizeOpenAIThrownError>;
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