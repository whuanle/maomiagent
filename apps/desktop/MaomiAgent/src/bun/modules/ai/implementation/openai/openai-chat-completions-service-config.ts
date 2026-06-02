import {
  readAiExecutionProfileModelId,
  type AiExecutionProfileRef,
} from "../../kernel-bridge";

export type OpenAIChatCompletionsServiceConfig = {
  apiKey: string;
  baseUrl?: string;
  headers?: Readonly<Record<string, string>>;
  organization?: string;
  project?: string;
  timeoutMs?: number;
  store?: boolean;
  parallelToolCalls?: boolean;
  reasoning?: {
    effort?: string;
  };
};

export type OpenAIChatCompletionsServiceConfigResolver = (
  executionProfile: AiExecutionProfileRef,
) => OpenAIChatCompletionsServiceConfig | Promise<OpenAIChatCompletionsServiceConfig>;

function normalizeProviderBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed).toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function ensureAzureOpenAIBaseUrl(baseUrl: string): string {
  const normalized = normalizeProviderBaseUrl(baseUrl);
  if (!normalized) {
    return "";
  }

  try {
    const url = new URL(normalized);
    const normalizedPath = url.pathname.replace(/\/$/, "");
    if (/\/chat\/completions$/i.test(normalizedPath) || /\/responses$/i.test(normalizedPath)) {
      return url.toString().replace(/\/$/, "");
    }
    if (/\/openai\/v1$/i.test(normalizedPath)) {
      return url.toString().replace(/\/$/, "");
    }
    if (/\/openai$/i.test(normalizedPath)) {
      url.pathname = `${normalizedPath}/v1`;
      return url.toString().replace(/\/$/, "");
    }
    url.pathname = `${normalizedPath || ""}/openai/v1`;
    return url.toString().replace(/\/$/, "");
  } catch {
    return normalized;
  }
}

export function readOpenAIChatCompletionsModelId(executionProfile: AiExecutionProfileRef): string {
  return readAiExecutionProfileModelId(executionProfile);
}

export function isAzureOpenAIBaseUrl(baseUrl?: string): boolean {
  const normalized = normalizeProviderBaseUrl(baseUrl ?? "");
  if (!normalized) {
    return false;
  }

  try {
    return /(?:^|\.)openai\.azure\.com$/i.test(new URL(normalized).hostname);
  } catch {
    return false;
  }
}

export function buildOpenAIChatCompletionsEndpoint(baseUrl = "https://api.openai.com/v1"): string {
  const normalized = isAzureOpenAIBaseUrl(baseUrl)
    ? ensureAzureOpenAIBaseUrl(baseUrl)
    : normalizeProviderBaseUrl(baseUrl);
  if (!normalized) {
    return "https://api.openai.com/v1/chat/completions";
  }

  const url = new URL(normalized);
  const normalizedPath = url.pathname.replace(/\/$/, "");

  if (normalizedPath.endsWith("/chat/completions")) {
    return url.toString();
  }

  if (normalizedPath.endsWith("/responses")) {
    url.pathname = normalizedPath.replace(/\/responses$/i, "/chat/completions");
    return url.toString();
  }

  if (isAzureOpenAIBaseUrl(normalized)) {
    if (/\/openai\/v1$/i.test(normalizedPath)) {
      url.pathname = `${normalizedPath}/chat/completions`;
      return url.toString();
    }
    if (/\/openai$/i.test(normalizedPath)) {
      url.pathname = `${normalizedPath}/v1/chat/completions`;
      return url.toString();
    }
    url.pathname = `${normalizedPath || ""}/openai/v1/chat/completions`;
    return url.toString();
  }

  if (/\/v1$/i.test(normalizedPath)) {
    url.pathname = `${normalizedPath}/chat/completions`;
    return url.toString();
  }

  url.pathname = `${normalizedPath || "/v1"}/chat/completions`;
  return url.toString();
}
