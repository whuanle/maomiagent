import {
  readAiExecutionProfileModelId,
  type AiExecutionProfileRef,
} from "../../kernel-bridge";

export type GoogleGenerateContentServiceConfig = {
  apiKey: string;
  baseUrl?: string;
  headers?: Readonly<Record<string, string>>;
  project?: string;
  timeoutMs?: number;
};

export type GoogleGenerateContentServiceConfigResolver = (
  executionProfile: AiExecutionProfileRef,
) => GoogleGenerateContentServiceConfig | Promise<GoogleGenerateContentServiceConfig>;

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

export function readGoogleGenerateContentModelId(executionProfile: AiExecutionProfileRef): string {
  return readAiExecutionProfileModelId(executionProfile);
}

export function resolveGoogleGenerateContentBaseUrl(baseUrl?: string): string | undefined {
  const normalized = normalizeProviderBaseUrl(
    baseUrl ?? "https://generativelanguage.googleapis.com/v1beta",
  );
  return normalized || undefined;
}

export function resolveGoogleGenerateContentHeaders(
  config: Pick<GoogleGenerateContentServiceConfig, "headers" | "project">,
): Readonly<Record<string, string>> | undefined {
  const headers = {
    ...(config.project ? { "x-goog-user-project": config.project } : {}),
    ...(config.headers ? { ...config.headers } : {}),
  };

  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function resolveGoogleGenerateContentApiKey(
  config: Pick<GoogleGenerateContentServiceConfig, "apiKey" | "headers">,
): string | undefined {
  const headerApiKey = Object.entries(config.headers ?? {})
    .find(([key, value]) => key.toLowerCase() === "x-goog-api-key" && value.trim().length > 0)?.[1]
    ?.trim();
  if (headerApiKey) {
    return headerApiKey;
  }

  const apiKey = config.apiKey.trim();
  return apiKey || undefined;
}
