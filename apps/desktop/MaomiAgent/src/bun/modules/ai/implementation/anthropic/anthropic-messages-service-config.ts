import {
  readAiExecutionProfileModelId,
  type AiExecutionProfileRef,
} from "../../kernel-bridge";

export type AnthropicMessagesServiceConfig = {
  apiKey: string;
  baseUrl?: string;
  headers?: Readonly<Record<string, string>>;
  timeoutMs?: number;
};

export type AnthropicMessagesServiceConfigResolver = (
  executionProfile: AiExecutionProfileRef,
) => AnthropicMessagesServiceConfig | Promise<AnthropicMessagesServiceConfig>;

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

export function readAnthropicMessagesModelId(executionProfile: AiExecutionProfileRef): string {
  return readAiExecutionProfileModelId(executionProfile);
}

export function buildAnthropicMessagesEndpoint(baseUrl = "https://api.anthropic.com/v1"): string {
  const normalized = normalizeProviderBaseUrl(baseUrl);
  if (!normalized) {
    return "https://api.anthropic.com/v1/messages";
  }

  const url = new URL(normalized);
  const normalizedPath = url.pathname.replace(/\/$/, "");

  if (normalizedPath.endsWith("/messages")) {
    return url.toString();
  }

  if (/\/v\d+$/i.test(normalizedPath)) {
    url.pathname = `${normalizedPath}/messages`;
    return url.toString();
  }

  // BigModel's Claude-compatible base URL is documented as `/api/anthropic`,
  // while the actual messages endpoint lives under `/api/anthropic/v1/messages`.
  if (/\/api\/anthropic$/i.test(normalizedPath)) {
    url.pathname = `${normalizedPath}/v1/messages`;
    return url.toString();
  }

  if (!normalizedPath) {
    url.pathname = "/v1/messages";
    return url.toString();
  }

  url.pathname = `${normalizedPath}/messages`;
  return url.toString();
}
