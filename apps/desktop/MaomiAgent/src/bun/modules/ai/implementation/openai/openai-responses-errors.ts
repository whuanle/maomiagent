import {
  normalizeAiServiceError,
  type KernelError,
} from "../../kernel-bridge";

const CONTEXT_OVERFLOW_PATTERNS = [
  /prompt is too long/i,
  /exceeds the context window/i,
  /maximum context length/i,
  /context length/i,
  /context[_ ]length[_ ]exceeded/i,
] as const;

const RETRYABLE_TRANSPORT_PATTERNS = [
  /timed out/i,
  /timeout/i,
  /network/i,
  /fetch failed/i,
  /econnreset/i,
  /econnrefused/i,
  /eai_again/i,
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readJson(text: string): Record<string, unknown> | undefined {
  if (!text.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function extractErrorRecord(
  body: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!body) {
    return undefined;
  }

  if (isRecord(body.error)) {
    return body.error;
  }

  return body;
}

function extractErrorMessage(
  error: Record<string, unknown> | undefined,
  fallback: string,
): string {
  const message = typeof error?.message === "string"
    ? error.message.trim()
    : "";
  return message || fallback;
}

function extractErrorCode(error: Record<string, unknown> | undefined): string | undefined {
  return typeof error?.code === "string" && error.code.trim()
    ? error.code.trim()
    : undefined;
}

function isContextOverflow(input: { message: string; code?: string; status?: number }) {
  return input.status === 413
    || input.code === "context_length_exceeded"
    || CONTEXT_OVERFLOW_PATTERNS.some((pattern) => pattern.test(input.message));
}

export function normalizeOpenAIHttpError(input: {
  status: number;
  statusText: string;
  bodyText: string;
}): KernelError {
  const body = readJson(input.bodyText);
  const error = extractErrorRecord(body);
  const code = extractErrorCode(error);
  const message = extractErrorMessage(
    error,
    input.bodyText.trim() || input.statusText || "OpenAI request failed",
  );

  if (isContextOverflow({ message, code, status: input.status })) {
    return normalizeAiServiceError({
      code: "context_overflow",
      message,
      retryable: false,
      metadata: {
        status: input.status,
        providerCode: code,
      },
    });
  }

  if (input.status === 429) {
    return normalizeAiServiceError({
      code: "rate_limit",
      message,
      retryable: true,
      metadata: {
        status: input.status,
        providerCode: code,
      },
    });
  }

  if (input.status >= 500) {
    return normalizeAiServiceError({
      code: "provider_unavailable",
      message,
      retryable: true,
      metadata: {
        status: input.status,
        providerCode: code,
      },
    });
  }

  return normalizeAiServiceError({
    code: code ?? "provider_error",
    message,
    retryable: false,
    metadata: {
      status: input.status,
      providerCode: code,
    },
  });
}

export function normalizeOpenAIStreamError(payload: Record<string, unknown>): KernelError {
  const code = typeof payload.code === "string" && payload.code.trim()
    ? payload.code.trim()
    : "provider_error";
  const message = typeof payload.message === "string" && payload.message.trim()
    ? payload.message.trim()
    : "OpenAI stream failed";

  return normalizeAiServiceError({
    code: isContextOverflow({ message, code }) ? "context_overflow" : code,
    message,
    retryable: code === "rate_limit_exceeded",
    metadata: {
      providerCode: code,
    },
  });
}

export function normalizeOpenAIThrownError(error: unknown): KernelError {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "OpenAI request failed";
  const retryable = RETRYABLE_TRANSPORT_PATTERNS.some((pattern) => pattern.test(message));

  return normalizeAiServiceError({
    code: /timed out/i.test(message) || /timeout/i.test(message)
      ? "provider_timeout"
      : "provider_error",
    message,
    retryable,
  });
}