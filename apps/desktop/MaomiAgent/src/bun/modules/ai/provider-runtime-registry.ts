import type { AiTurnPort } from "./kernel-bridge";
import {
  AnthropicMessagesAiTurnPortAdapter,
} from "./implementation/anthropic";
import {
  OpenAIChatCompletionsAiTurnPortAdapter,
  OpenAIResponsesAiTurnPortAdapter,
} from "./implementation/openai";
import type {
  DesktopAiProviderRuntimeBinding,
  DesktopAiProviderRuntimeCreateTurnPortInput,
  DesktopAiProviderRuntimeLookupInput,
} from "./abstraction/models/desktop-ai-runtime.models";
import {
  DESKTOP_AI_PROVIDER_RUNTIME_BINDINGS,
} from "./provider-runtime-support";

export type {
  DesktopAiProviderRuntimeBinding,
  DesktopAiProviderRuntimeCreateTurnPortInput,
  DesktopAiProviderRuntimeLookupInput,
  DesktopAiProviderServiceConfig,
  DesktopAiProviderServiceConfigResolver,
} from "./abstraction/models/desktop-ai-runtime.models";

export type DesktopAiProviderRuntimeDescriptor = DesktopAiProviderRuntimeBinding & {
  createTurnPort(input: DesktopAiProviderRuntimeCreateTurnPortInput): AiTurnPort;
};

function createRuntimeDescriptor(
  binding: DesktopAiProviderRuntimeBinding,
): DesktopAiProviderRuntimeDescriptor {
  switch (binding.id) {
    case "anthropic-messages":
      return {
        ...binding,
        createTurnPort(input) {
          return new AnthropicMessagesAiTurnPortAdapter({
            resolveConfig: input.resolveServiceConfig,
            ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
            ...(input.retryPolicy ? { retryPolicy: input.retryPolicy } : {}),
            ...(input.sleepFn ? { sleepFn: input.sleepFn } : {}),
            ...(input.telemetrySink ? { telemetrySink: input.telemetrySink } : {}),
          });
        },
      };
    case "openai-responses":
      return {
        ...binding,
        createTurnPort(input) {
          return new OpenAIResponsesAiTurnPortAdapter({
            resolveConfig: input.resolveServiceConfig,
            ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
            ...(input.retryPolicy ? { retryPolicy: input.retryPolicy } : {}),
            ...(input.sleepFn ? { sleepFn: input.sleepFn } : {}),
            ...(input.telemetrySink ? { telemetrySink: input.telemetrySink } : {}),
          });
        },
      };
    case "openai-chat-completions":
      return {
        ...binding,
        createTurnPort(input) {
          return new OpenAIChatCompletionsAiTurnPortAdapter({
            resolveConfig: input.resolveServiceConfig,
            ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
            ...(input.retryPolicy ? { retryPolicy: input.retryPolicy } : {}),
            ...(input.sleepFn ? { sleepFn: input.sleepFn } : {}),
            ...(input.telemetrySink ? { telemetrySink: input.telemetrySink } : {}),
          });
        },
      };
    default:
      throw new Error(`Unsupported desktop ai runtime binding: ${binding.id}`);
  }
}

const DESKTOP_AI_PROVIDER_RUNTIME_DESCRIPTOR_MAP = new Map(
  DESKTOP_AI_PROVIDER_RUNTIME_BINDINGS.map((binding) => [
    binding.id,
    createRuntimeDescriptor(binding),
  ] as const),
);

export function listDesktopAiProviderRuntimeDescriptors(): readonly DesktopAiProviderRuntimeDescriptor[] {
  return [...DESKTOP_AI_PROVIDER_RUNTIME_DESCRIPTOR_MAP.values()];
}

export function findDesktopAiProviderRuntimeDescriptor(input: {
  bindingId?: string;
  protocolFamily?: DesktopAiProviderRuntimeLookupInput["protocolFamily"];
  apiStyle?: DesktopAiProviderRuntimeLookupInput["apiStyle"];
}): DesktopAiProviderRuntimeDescriptor | undefined {
  if (input.bindingId) {
    return DESKTOP_AI_PROVIDER_RUNTIME_DESCRIPTOR_MAP.get(input.bindingId);
  }

  return listDesktopAiProviderRuntimeDescriptors().find((descriptor) =>
    descriptor.protocolFamily === input.protocolFamily
    && descriptor.apiStyle === input.apiStyle,
  );
}
