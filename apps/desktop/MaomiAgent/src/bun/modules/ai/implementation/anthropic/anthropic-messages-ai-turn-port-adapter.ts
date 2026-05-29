import type {
  AiTurnEvent,
  AiTurnPort,
  AiTurnRequest,
  PromptCodec,
  RetryBackoffPolicy,
} from "../../kernel-bridge";
import type { DesktopAiProviderTelemetrySink } from "../../abstraction/models/desktop-ai-runtime.models";
import { runProtocolTurn } from "../shared/protocol-turn-runner";
import {
  createAnthropicMessagesProtocolDriver,
} from "./anthropic-messages-protocol-driver";
import {
  AnthropicMessagesPromptCodec,
  type AnthropicMessagesPromptPayload,
} from "./anthropic-messages-prompt-codec";
import {
  normalizeAnthropicThrownError,
} from "./anthropic-errors";
import type {
  AnthropicMessagesServiceConfig,
  AnthropicMessagesServiceConfigResolver,
} from "./anthropic-messages-service-config";

type AnthropicMessagesAiTurnPortAdapterOptions = {
  resolveConfig: AnthropicMessagesServiceConfigResolver;
  fetchFn?: typeof fetch;
  codec?: PromptCodec<AnthropicMessagesPromptPayload>;
  retryPolicy?: RetryBackoffPolicy;
  sleepFn?: (ms: number) => Promise<void>;
  telemetrySink?: DesktopAiProviderTelemetrySink;
};

async function sleepMs(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class AnthropicMessagesAiTurnPortAdapter implements AiTurnPort {
  private readonly resolveConfig: AnthropicMessagesServiceConfigResolver;
  private readonly driver: ReturnType<typeof createAnthropicMessagesProtocolDriver>;
  private readonly telemetrySink?: DesktopAiProviderTelemetrySink;
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
    this.driver = createAnthropicMessagesProtocolDriver({
      fetchFn: this.fetchFn,
      codec: this.codec,
      retryPolicy: this.retryPolicy,
      sleepFn: this.sleepFn,
    });
    this.telemetrySink = options.telemetrySink;
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

    yield* runProtocolTurn({
      request: input,
      config,
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
