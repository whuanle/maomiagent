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
  createOpenAIChatCompletionsProtocolDriver,
} from "./openai-chat-completions-protocol-driver";
import {
  OpenAIChatCompletionsPromptCodec,
  type OpenAIChatCompletionsPromptPayload,
} from "./openai-chat-completions-prompt-codec";
import {
  normalizeOpenAIThrownError,
} from "./openai-responses-errors";
import type {
  OpenAIChatCompletionsServiceConfig,
  OpenAIChatCompletionsServiceConfigResolver,
} from "./openai-chat-completions-service-config";

type OpenAIChatCompletionsAiTurnPortAdapterOptions = {
  resolveConfig: OpenAIChatCompletionsServiceConfigResolver;
  fetchFn?: typeof fetch;
  codec?: PromptCodec<OpenAIChatCompletionsPromptPayload>;
  retryPolicy?: RetryBackoffPolicy;
  sleepFn?: (ms: number) => Promise<void>;
  telemetrySink?: DesktopAiProviderTelemetrySink;
};

export class OpenAIChatCompletionsAiTurnPortAdapter implements AiTurnPort {
  private readonly resolveConfig: OpenAIChatCompletionsServiceConfigResolver;
  private readonly driver: ReturnType<typeof createOpenAIChatCompletionsProtocolDriver>;
  private readonly telemetrySink?: DesktopAiProviderTelemetrySink;

  constructor(options: OpenAIChatCompletionsAiTurnPortAdapterOptions) {
    this.resolveConfig = options.resolveConfig;
    this.driver = createOpenAIChatCompletionsProtocolDriver({
      fetchFn: options.fetchFn ?? fetch,
      codec: options.codec ?? new OpenAIChatCompletionsPromptCodec(),
      ...(options.retryPolicy ? { retryPolicy: options.retryPolicy } : {}),
      ...(options.sleepFn ? { sleepFn: options.sleepFn } : {}),
    });
    this.telemetrySink = options.telemetrySink;
  }

  async *stream(input: AiTurnRequest): AsyncIterable<AiTurnEvent> {
    let config: OpenAIChatCompletionsServiceConfig;
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
