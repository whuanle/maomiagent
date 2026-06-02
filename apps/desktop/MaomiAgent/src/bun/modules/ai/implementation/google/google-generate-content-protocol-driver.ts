import { APICallError, streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

import type { PromptCodec, RetryBackoffPolicy } from "../../kernel-bridge";
import {
  calculateRetryDelayMs,
  decideRetry,
  parseProviderRetryAfterMs,
} from "../../kernel-bridge";
import type { DesktopAiProtocolDriver } from "../shared/provider-protocol-driver";
import { createGoogleGenerateContentEventParser } from "./google-generate-content-event-parser";
import {
  resolveGoogleGenerateContentApiKey,
  readGoogleGenerateContentModelId,
  resolveGoogleGenerateContentBaseUrl,
  resolveGoogleGenerateContentHeaders,
} from "./google-generate-content-service-config";
import {
  GoogleGenerateContentPromptCodec,
  type GoogleGenerateContentPromptPayload,
} from "./google-generate-content-prompt-codec";

type CreateGoogleGenerateContentProtocolDriverOptions = {
  fetchFn?: typeof fetch;
  codec?: PromptCodec<GoogleGenerateContentPromptPayload>;
  retryPolicy?: RetryBackoffPolicy;
  sleepFn?: (ms: number) => Promise<void>;
};

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Google Generative AI request failed";
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeGoogleError(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
  metadata?: Record<string, unknown>;
} {
  if (error instanceof APICallError) {
    return {
      code: "provider_error",
      message: error.message,
      retryable: error.isRetryable,
      ...(error.statusCode !== undefined ? { metadata: { status: error.statusCode } } : {}),
    };
  }

  return {
    code: "provider_error",
    message: normalizeErrorMessage(error),
    retryable: false,
  };
}

function toHeaders(responseHeaders?: Record<string, string>): Headers | undefined {
  if (!responseHeaders || Object.keys(responseHeaders).length === 0) {
    return undefined;
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(responseHeaders)) {
    headers.set(key, value);
  }
  return headers;
}

export function createGoogleGenerateContentProtocolDriver(
  options: CreateGoogleGenerateContentProtocolDriverOptions,
): DesktopAiProtocolDriver {
  const codec = options.codec ?? new GoogleGenerateContentPromptCodec();
  const sleepFn = options.sleepFn ?? sleepMs;

  return {
    id: "google-generate-content",
    capabilities: {
      supportsAttachments: true,
      supportsFunctionCall: true,
      supportsStructuredOutput: true,
      supportsSystemBlocks: true,
      supportsTemperature: true,
    },
    async *execute(input) {
      const prompt = codec.encode(input.request);
      const baseURL = resolveGoogleGenerateContentBaseUrl(input.config.baseUrl);
      const headers = resolveGoogleGenerateContentHeaders(input.config);
      const apiKey = resolveGoogleGenerateContentApiKey(input.config);
      const modelId = readGoogleGenerateContentModelId(input.request.executionProfile);
      let attempt = 1;

      while (true) {
        let responseStatus: number | undefined;
        let responseHeaders: Record<string, string> | undefined;
        let emittedFrame = false;

        const provider = createGoogleGenerativeAI({
          ...(apiKey ? { apiKey } : {}),
          ...(baseURL ? { baseURL } : {}),
          ...(headers ? { headers } : {}),
          ...(options.fetchFn
            ? {
                fetch: (async (
                  requestInfo: Parameters<typeof fetch>[0],
                  requestInit?: Parameters<typeof fetch>[1],
                ) => {
                  const response = await options.fetchFn!(requestInfo, requestInit);
                  responseStatus = response.status;
                  responseHeaders = Object.fromEntries(response.headers.entries());
                  return response;
                }) as unknown as typeof fetch,
              }
            : {}),
        });

        try {
          const result = streamText({
            model: provider(modelId),
            messages: prompt.messages,
            output: prompt.output,
            toolChoice: prompt.toolChoice,
            ...(prompt.system ? { system: prompt.system } : {}),
            ...(prompt.tools ? { tools: prompt.tools } : {}),
            ...(typeof prompt.temperature === "number"
              ? { temperature: prompt.temperature }
              : {}),
            ...(typeof prompt.maxOutputTokens === "number"
              ? { maxOutputTokens: prompt.maxOutputTokens }
              : {}),
            ...(typeof input.config.timeoutMs === "number"
              ? { timeout: input.config.timeoutMs }
              : {}),
            abortSignal: input.signal,
            maxRetries: 0,
          });

          const parser = createGoogleGenerateContentEventParser();
          let didYieldHeaders = false;

          for await (const part of result.fullStream) {
            if (!didYieldHeaders && responseStatus !== undefined) {
              emittedFrame = true;
              didYieldHeaders = true;
              yield {
                kind: "headers",
                status: responseStatus,
                contentType: responseHeaders?.["content-type"],
              };
            }

            const events = parser.read(part);
            for (const event of events) {
              emittedFrame = true;
              yield {
                kind: "event",
                event,
              };
            }
          }

          if (!didYieldHeaders && responseStatus !== undefined) {
            yield {
              kind: "headers",
              status: responseStatus,
              contentType: responseHeaders?.["content-type"],
            };
          }

          return;
        } catch (error) {
          const kernelError = normalizeGoogleError(error);
          if (emittedFrame) {
            throw kernelError;
          }

          if (await retryIfNeeded({
            attempt,
            error: kernelError,
            headers: toHeaders(responseHeaders),
            retryPolicy: options.retryPolicy,
            sleepFn,
          })) {
            attempt += 1;
            continue;
          }

          throw kernelError;
        }
      }
    },
  };
}

async function retryIfNeeded(input: {
  attempt: number;
  error: ReturnType<typeof normalizeGoogleError>;
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
