import type { PromptCodec, RetryBackoffPolicy } from "../../kernel-bridge";
import {
  calculateRetryDelayMs,
  decideRetry,
  parseProviderRetryAfterMs,
} from "../../kernel-bridge";
import type { DesktopAiProtocolDriver } from "../shared/provider-protocol-driver";
import { inferHttpResponseMode } from "../shared/http-response-mode";
import {
  OpenAIChatCompletionsPromptCodec,
  type OpenAIChatCompletionsPromptPayload,
} from "./openai-chat-completions-prompt-codec";
import {
  buildOpenAIChatCompletionsEndpoint,
  isAzureOpenAIBaseUrl,
  readOpenAIChatCompletionsModelId,
  type OpenAIChatCompletionsServiceConfig,
} from "./openai-chat-completions-service-config";
import {
  readOpenAIChatCompletionJsonEvents,
  streamOpenAIChatCompletionEvents,
} from "./openai-chat-completions-event-parser";
import {
  normalizeOpenAIHttpError,
  normalizeOpenAIThrownError,
} from "./openai-responses-errors";

export type OpenAIChatCompletionsRequestBody = {
  model: string;
  messages: OpenAIChatCompletionsPromptPayload["messages"];
  stream: boolean;
  metadata?: Readonly<Record<string, string>>;
  tools?: OpenAIChatCompletionsPromptPayload["tools"];
  tool_choice?: OpenAIChatCompletionsPromptPayload["toolChoice"];
  response_format?: OpenAIChatCompletionsPromptPayload["responseFormat"];
  temperature?: number;
  max_tokens?: number;
  store?: boolean;
  parallel_tool_calls?: boolean;
  reasoning_effort?: string;
};

function normalizeAssistantReasoningContent(
  messages: OpenAIChatCompletionsPromptPayload["messages"],
): OpenAIChatCompletionsPromptPayload["messages"] {
  return messages.map((message) => {
    if (message.role !== "assistant" || !Array.isArray(message.tool_calls) || message.tool_calls.length === 0) {
      return message;
    }

    return Object.prototype.hasOwnProperty.call(message, "reasoning_content")
      ? message
      : {
          ...message,
          reasoning_content: "",
        };
  });
}

function isOpenAICompatibleToolName(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(value);
}

function toOpenAICompatibleToolName(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9_-]/g, "_");
  return /^[A-Za-z]/.test(normalized) ? normalized : `tool_${normalized}`;
}

function buildOpenAIToolNameMaps(payload: OpenAIChatCompletionsPromptPayload): {
  originalToEncoded: ReadonlyMap<string, string>;
  encodedToOriginal: ReadonlyMap<string, string>;
} {
  const originalToEncoded = new Map<string, string>();
  const encodedToOriginal = new Map<string, string>();
  const used = new Set<string>();

  const reserve = (originalName: string): void => {
    if (originalToEncoded.has(originalName)) {
      return;
    }

    const baseName = toOpenAICompatibleToolName(originalName);
    let encodedName = baseName;
    let suffix = 2;
    while (used.has(encodedName)) {
      encodedName = `${baseName}_${suffix}`;
      suffix += 1;
    }

    used.add(encodedName);
    originalToEncoded.set(originalName, encodedName);
    if (encodedName !== originalName) {
      encodedToOriginal.set(encodedName, originalName);
    }
  };

  for (const tool of payload.tools ?? []) {
    reserve(tool.function.name);
  }

  for (const message of payload.messages) {
    if (message.role !== "assistant" || !Array.isArray(message.tool_calls)) {
      continue;
    }
    for (const toolCall of message.tool_calls) {
      reserve(toolCall.function.name);
    }
  }

  return { originalToEncoded, encodedToOriginal };
}

function encodeToolName(input: {
  name: string;
  originalToEncoded: ReadonlyMap<string, string>;
}): string {
  return input.originalToEncoded.get(input.name)
    ?? (isOpenAICompatibleToolName(input.name) ? input.name : toOpenAICompatibleToolName(input.name));
}

function normalizeOpenAIToolNames(payload: OpenAIChatCompletionsPromptPayload): {
  payload: OpenAIChatCompletionsPromptPayload;
  toolNameMap: ReadonlyMap<string, string>;
} {
  const maps = buildOpenAIToolNameMaps(payload);
  if (maps.encodedToOriginal.size === 0) {
    return {
      payload,
      toolNameMap: maps.encodedToOriginal,
    };
  }

  return {
    payload: {
      ...payload,
      messages: payload.messages.map((message) => {
        if (message.role !== "assistant" || !Array.isArray(message.tool_calls)) {
          return message;
        }

        return {
          ...message,
          tool_calls: message.tool_calls.map((toolCall) => ({
            ...toolCall,
            function: {
              ...toolCall.function,
              name: encodeToolName({
                name: toolCall.function.name,
                originalToEncoded: maps.originalToEncoded,
              }),
            },
          })),
        };
      }),
      tools: payload.tools?.map((tool) => ({
        ...tool,
        function: {
          ...tool.function,
          name: encodeToolName({
            name: tool.function.name,
            originalToEncoded: maps.originalToEncoded,
          }),
        },
      })),
    },
    toolNameMap: maps.encodedToOriginal,
  };
}

type CreateOpenAIChatCompletionsProtocolDriverOptions = {
  fetchFn: typeof fetch;
  codec?: PromptCodec<OpenAIChatCompletionsPromptPayload>;
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
  payload: OpenAIChatCompletionsPromptPayload,
  config: OpenAIChatCompletionsServiceConfig,
): OpenAIChatCompletionsRequestBody {
  const traceMetadata = buildTraceMetadata(input);
  const hasTools = Boolean(payload.tools && payload.tools.length > 0);
  const includeMetadata = config.store === true;
  const normalizedMessages = normalizeAssistantReasoningContent(payload.messages);

  return {
    model: readOpenAIChatCompletionsModelId(input.executionProfile),
    messages: normalizedMessages,
    stream: true,
    ...(includeMetadata && traceMetadata ? { metadata: traceMetadata } : {}),
    ...(hasTools ? { tools: payload.tools } : {}),
    ...(hasTools && payload.toolChoice ? { tool_choice: payload.toolChoice } : {}),
    ...(payload.responseFormat ? { response_format: payload.responseFormat } : {}),
    ...(typeof input.settings.temperature === "number"
      ? { temperature: input.settings.temperature }
      : {}),
    ...(typeof input.settings.maxOutputTokens === "number"
      ? { max_tokens: input.settings.maxOutputTokens }
      : {}),
    ...(typeof config.store === "boolean" ? { store: config.store } : {}),
    ...(typeof config.parallelToolCalls === "boolean"
      ? { parallel_tool_calls: config.parallelToolCalls }
      : {}),
    ...(config.reasoning?.effort ? { reasoning_effort: config.reasoning.effort } : {}),
  };
}

function buildHeaders(config: OpenAIChatCompletionsServiceConfig): Record<string, string> {
  const configuredHeaders = config.headers;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(isAzureOpenAIBaseUrl(config.baseUrl)
      ? { "api-key": config.apiKey }
      : { Authorization: `Bearer ${config.apiKey}` }),
    ...(config.organization ? { "OpenAI-Organization": config.organization } : {}),
    ...(config.project ? { "OpenAI-Project": config.project } : {}),
  };

  return configuredHeaders
    ? {
        ...headers,
        ...configuredHeaders,
      }
    : headers;
}

async function readResponseBodyText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export function createOpenAIChatCompletionsProtocolDriver(
  options: CreateOpenAIChatCompletionsProtocolDriverOptions,
): DesktopAiProtocolDriver {
  const codec = options.codec ?? new OpenAIChatCompletionsPromptCodec();
  const sleepFn = options.sleepFn ?? sleepMs;

  return {
    id: "openai-chat-completions",
    capabilities: {
      supportsFunctionCall: true,
      supportsStructuredOutput: true,
      supportsParallelToolCalls: true,
      supportsJsonMode: true,
      supportsTemperature: true,
    },
    async *execute(input) {
      const normalized = normalizeOpenAIToolNames(codec.encode(input.request));
      const requestBody = buildRequestBody(input.request, normalized.payload, input.config);
      const endpoint = buildOpenAIChatCompletionsEndpoint(input.config.baseUrl);
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
          const bodyText = await readResponseBodyText(response);
          requestSignal.dispose();
          requestTimeout.cancel();
          const kernelError = normalizeOpenAIHttpError({
            status: response.status,
            statusText: response.statusText,
            bodyText,
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
            for await (const event of streamOpenAIChatCompletionEvents(response, {
              toolNameMap: normalized.toolNameMap,
            })) {
              yield {
                kind: "event",
                event,
              };
            }
            return;
          }

          const payload = await response.json();
          for await (const event of readOpenAIChatCompletionJsonEvents(payload, {
            toolNameMap: normalized.toolNameMap,
          })) {
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
