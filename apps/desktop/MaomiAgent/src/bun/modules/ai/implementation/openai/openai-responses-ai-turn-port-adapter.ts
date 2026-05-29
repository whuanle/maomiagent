import type {
  AiTurnEvent,
  AiTurnPort,
  AiTurnRequest,
  PromptCodec,
  RetryBackoffPolicy,
} from "../../kernel-bridge";
import type {
  DesktopAiProviderServiceConfig,
  DesktopAiProviderTelemetrySink,
} from "../../abstraction/models/desktop-ai-runtime.models";
import { runProtocolTurn } from "../shared/protocol-turn-runner";
import {
  createOpenAIResponsesProtocolDriver,
} from "./openai-responses-protocol-driver";
import {
  OpenAIResponsesPromptCodec,
  type OpenAIResponsesPromptPayload,
} from "./openai-responses-prompt-codec";
import {
  normalizeOpenAIThrownError,
} from "./openai-responses-errors";
import type {
  OpenAIResponsesServiceConfig,
  OpenAIResponsesServiceConfigResolver,
} from "./openai-responses-service-config";

type OpenAIResponsesAiTurnPortAdapterOptions = {
  resolveConfig: OpenAIResponsesServiceConfigResolver;
  fetchFn?: typeof fetch;
  codec?: PromptCodec<OpenAIResponsesPromptPayload>;
  retryPolicy?: RetryBackoffPolicy;
  sleepFn?: (ms: number) => Promise<void>;
  telemetrySink?: DesktopAiProviderTelemetrySink;
};

async function sleepMs(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class OpenAIResponsesAiTurnPortAdapter implements AiTurnPort {
  private readonly resolveConfig: OpenAIResponsesServiceConfigResolver;
  private readonly driver: ReturnType<typeof createOpenAIResponsesProtocolDriver>;
  private readonly telemetrySink?: DesktopAiProviderTelemetrySink;

  constructor(options: OpenAIResponsesAiTurnPortAdapterOptions) {
    this.resolveConfig = options.resolveConfig;
    this.driver = createOpenAIResponsesProtocolDriver({
      fetchFn: options.fetchFn ?? fetch,
      codec: options.codec ?? new OpenAIResponsesPromptCodec(),
      ...(options.retryPolicy ? { retryPolicy: options.retryPolicy } : {}),
      ...(options.sleepFn ? { sleepFn: options.sleepFn } : {}),
    });
    this.telemetrySink = options.telemetrySink;
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

    yield* runProtocolTurn({
      request: input,
      config: config satisfies DesktopAiProviderServiceConfig,
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
