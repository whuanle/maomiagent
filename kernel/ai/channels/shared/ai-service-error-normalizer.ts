import type { KernelError, KernelMetadata } from "../../../src/core"

export type AiServiceErrorNormalizationInput = {
  code?: string
  message: string
  retryable?: boolean
  metadata?: KernelMetadata
}

export function normalizeAiServiceError(
  input: AiServiceErrorNormalizationInput,
): KernelError {
  return {
    code: input.code ?? "provider_error",
    message: input.message,
    retryable: input.retryable,
    metadata: input.metadata,
  }
}