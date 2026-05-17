import {
  readAiExecutionProfileModelId,
  type AiExecutionProfileRef,
} from "../../kernel-bridge";

export type OpenAIResponsesServiceConfig = {
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
    summary?: string;
  };
};

export type OpenAIResponsesServiceConfigResolver = (
  executionProfile: AiExecutionProfileRef,
) => OpenAIResponsesServiceConfig | Promise<OpenAIResponsesServiceConfig>;

export function readOpenAIResponsesModelId(executionProfile: AiExecutionProfileRef): string {
  return readAiExecutionProfileModelId(executionProfile);
}

export function buildOpenAIResponsesEndpoint(baseUrl = "https://api.openai.com/v1"): string {
  const normalized = baseUrl.trim();
  if (!normalized) {
    return "https://api.openai.com/v1/responses";
  }

  const url = new URL(normalized);
  const pathname = url.pathname.replace(/\/$/, "");

  if (pathname.endsWith("/responses")) {
    return url.toString();
  }

  if (pathname.endsWith("/v1")) {
    url.pathname = `${pathname}/responses`;
    return url.toString();
  }

  url.pathname = `${pathname || "/v1"}/responses`;
  return url.toString();
}