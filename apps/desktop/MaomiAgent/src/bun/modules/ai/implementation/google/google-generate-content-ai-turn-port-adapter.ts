import type {
  AiTurnEvent,
  AiTurnPort,
  AiTurnRequest,
  PromptCodec,
  RetryBackoffPolicy,
} from "../../kernel-bridge";
import type { DesktopAiProviderTelemetrySink } from "../../abstraction/models/desktop-ai-runtime.models";
import { runProtocolTurn } from "../shared/protocol-turn-runner";
import { createGoogleGenerateContentProtocolDriver } from "./google-generate-content-protocol-driver";
import {
  GoogleGenerateContentPromptCodec,
  type GoogleGenerateContentPromptPayload,
} from "./google-generate-content-prompt-codec";
import type {
  GoogleGenerateContentServiceConfig,
  GoogleGenerateContentServiceConfigResolver,
} from "./google-generate-content-service-config";

type GoogleGenerateContentAiTurnPortAdapterOptions = {
  resolveConfig: GoogleGenerateContentServiceConfigResolver;
  fetchFn?: typeof fetch;
  codec?: PromptCodec<GoogleGenerateContentPromptPayload>;
  retryPolicy?: RetryBackoffPolicy;
  sleepFn?: (ms: number) => Promise<void>;
  telemetrySink?: DesktopAiProviderTelemetrySink;
};

function normalizeGoogleThrownError(error: unknown) {
  return {
    code: "provider_error",
    message: error instanceof Error ? error.message : "Gemini request failed",
    retryable: false,
  };
}

export class GoogleGenerateContentAiTurnPortAdapter implements AiTurnPort {
  private readonly resolveConfig: GoogleGenerateContentServiceConfigResolver;
  private readonly driver: ReturnType<typeof createGoogleGenerateContentProtocolDriver>;
  private readonly telemetrySink?: DesktopAiProviderTelemetrySink;

  constructor(options: GoogleGenerateContentAiTurnPortAdapterOptions) {
    this.resolveConfig = options.resolveConfig;
    this.driver = createGoogleGenerateContentProtocolDriver({
      fetchFn: options.fetchFn ?? fetch,
      codec: options.codec ?? new GoogleGenerateContentPromptCodec(),
      ...(options.retryPolicy ? { retryPolicy: options.retryPolicy } : {}),
      ...(options.sleepFn ? { sleepFn: options.sleepFn } : {}),
    });
    this.telemetrySink = options.telemetrySink;
  }

  async *stream(input: AiTurnRequest): AsyncIterable<AiTurnEvent> {
    let config: GoogleGenerateContentServiceConfig;
    try {
      config = await this.resolveConfig(input.executionProfile);
    } catch (error) {
      yield {
        type: "error",
        error: normalizeGoogleThrownError(error),
      };
      return;
    }

    yield* runProtocolTurn({
      request: input,
      config: {
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
        ...(config.headers ? { headers: config.headers } : {}),
        ...(config.project ? { project: config.project } : {}),
      },
      driver: this.driver,
      telemetrySink: this.telemetrySink,
      stageTimeouts: {
        firstByteMs: config.timeoutMs,
        firstEventMs: config.timeoutMs,
        idleMs: config.timeoutMs,
      },
    });
  }
}
