import type {
  DesktopModelProviderApiStyle,
  DesktopModelProviderProtocolFamily,
  DesktopModelProviderRuntimeSupport,
} from "../../../shared/desktop-models";
import type {
  DesktopAiProviderRuntimeBinding,
  DesktopAiProviderRuntimeLookupInput,
  DesktopAiProviderRuntimeSupportInput,
} from "./abstraction/models/desktop-ai-runtime.models";

export type {
  DesktopAiProviderRuntimeBinding,
  DesktopAiProviderRuntimeSupportInput,
} from "./abstraction/models/desktop-ai-runtime.models";

export const DESKTOP_AI_PROVIDER_RUNTIME_BINDINGS: readonly DesktopAiProviderRuntimeBinding[] = [{
  id: "openai-responses",
  protocolFamily: "openai",
  apiStyle: "responses",
  adapterId: "openai-responses",
}, {
  id: "openai-chat-completions",
  protocolFamily: "openai",
  apiStyle: "chat-completions",
  adapterId: "openai-chat-completions",
}, {
  id: "anthropic-messages",
  protocolFamily: "anthropic",
  apiStyle: "messages",
  adapterId: "anthropic-messages",
}];

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function findDesktopAiProviderRuntimeBinding(
  input: DesktopAiProviderRuntimeLookupInput,
): DesktopAiProviderRuntimeBinding | undefined {
  if (input.bindingId) {
    return DESKTOP_AI_PROVIDER_RUNTIME_BINDINGS.find((binding) => binding.id === input.bindingId);
  }

  return DESKTOP_AI_PROVIDER_RUNTIME_BINDINGS.find((binding) =>
    binding.protocolFamily === input.protocolFamily
    && binding.apiStyle === input.apiStyle,
  );
}

export function resolveDesktopAiProviderRuntimeSupport(
  input: DesktopAiProviderRuntimeSupportInput,
): DesktopModelProviderRuntimeSupport {
  const providerType = normalizeOptionalText(input.providerType) ?? "unknown";

  const binding = findDesktopAiProviderRuntimeBinding(input);
  if (binding) {
    return {
      status: "implemented",
      adapterId: binding.adapterId,
    };
  }

  if (!input.protocolFamily) {
    return {
      status: "catalog-only",
      reason: `${providerType} has no normalized protocol family`,
    };
  }

  if (!input.apiStyle) {
    return {
      status: "catalog-only",
      reason: `${providerType} has no normalized api style for protocol family ${input.protocolFamily}`,
    };
  }

  return {
    status: "catalog-only",
    reason: `${providerType} is cataloged as ${input.protocolFamily}/${input.apiStyle}, but desktop ai has no matching runtime adapter yet`,
  };
}