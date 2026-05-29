import type { PromptCodec, RetryBackoffPolicy } from "../../kernel-bridge";
import {
  calculateRetryDelayMs,
  decideRetry,
  parseProviderRetryAfterMs,
} from "../../kernel-bridge";
import type { DesktopAiProtocolDriver } from "../shared/provider-protocol-driver";
import { inferHttpResponseMode } from "../shared/http-response-mode";
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

type CreateOpenAIResponsesProtocolDriverOptions = {
  fetchFn: typeof fetch;
  codec?: PromptCodec<OpenAIResponsesPromptPayload>;
  retryPolicy?: RetryBackoffPolicy;
  sleepFn?: (ms: number) => Promise<void>;
};

async function sleepMs(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildTraceMetadata(input: Parameters<DesktopAiProtocolDriver["execute"]>[0]["request"]): Readonly<Record<string, string>> | undefined {
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
  input: Parameters<DesktopAiProtocolDriver["execute"]>[0]["request"],
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

export function createOpenAIResponsesProtocolDriver(
  options: CreateOpenAIResponsesProtocolDriverOptions,
): DesktopAiProtocolDriver {
  const codec = options.codec ?? new OpenAIResponsesPromptCodec();
  const sleepFn = options.sleepFn ?? sleepMs;

  return {
    id: "openai-responses",
    capabilities: {
      supportsFunctionCall: true,
      supportsStructuredOutput: true,
      supportsParallelToolCalls: true,
      supportsJsonMode: true,
      supportsTemperature: true,
    },
    async *execute(input) {
      const requestBody = buildRequestBody(input.request, codec.encode(input.request), input.config);
      const endpoint = buildOpenAIResponsesEndpoint(input.config.baseUrl);
      let attempt = 1;

      while (true) {
        const requestTimeout = startRequestTimeout(input.config.timeoutMs);
        const requestSignal = composeAbortSignals(requestTimeout.signal, input.signal);
        let response: Response;
        try {
          response = await options.fetchFn(endpoint, {
            method: "POST",
            headers: buildHeaders(input.config),
            body: JSON.stringify(requestBody),
            ...(requestSignal.signal ? { signal: requestSignal.signal } : {}),
          });
        } catch (error) {
          requestSignal.dispose();
          requestTimeout.cancel();
          if (input.signal?.aborted && !requestTimeout.didTimeout()) {
            throw buildAbortedTurnError();
          }
          const kernelError = normalizeOpenAIThrownError(requestTimeout.normalizeError(error));
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
          const kernelError = normalizeOpenAIHttpError({
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

          if (inferHttpResponseMode(response.headers.get("content-type")) === "stream") {
            yield {
              kind: "byte",
              chunk: "",
            };
            for await (const event of streamOpenAIResponseEvents(response)) {
              yield {
                kind: "event",
                event,
              };
            }
            return;
          }

          const payload = await response.json();
          for await (const event of readOpenAIResponseJsonEvents(payload)) {
            yield {
              kind: "event",
              event,
            };
          }
        } catch (error) {
          throw normalizeOpenAIThrownError(requestTimeout.normalizeError(error));
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
  error: ReturnType<typeof normalizeOpenAIThrownError>;
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
