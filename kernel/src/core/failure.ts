import type { KernelError, KernelMetadata } from "./common"

type KernelFailureInput = {
  code: string
  message: string
  retryable?: boolean
  phase: string
  failureKind?: string
  metadata?: Record<string, unknown>
}

function buildKernelFailureMetadata(input: {
  phase: string
  failureKind?: string
  metadata?: Record<string, unknown>
}): KernelMetadata {
  const metadata: Record<string, unknown> = {
    phase: input.phase,
  }

  if (input.failureKind) {
    metadata.failureKind = input.failureKind
  }

  return input.metadata
    ? {
        ...metadata,
        ...input.metadata,
      }
    : metadata
}

export function createKernelFailure(input: KernelFailureInput): KernelError {
  return {
    code: input.code,
    message: input.message,
    ...(input.retryable !== undefined ? { retryable: input.retryable } : {}),
    metadata: buildKernelFailureMetadata({
      phase: input.phase,
      failureKind: input.failureKind,
      metadata: input.metadata,
    }),
  }
}