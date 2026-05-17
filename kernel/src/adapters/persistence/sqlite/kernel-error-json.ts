import type { KernelError, KernelMetadata } from "../../../core"

export function parseKernelErrorValue(value: unknown, recordLabel: string): KernelError {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`Kernel error must be a JSON object: ${recordLabel}`)
  }

  const payload = value as Record<string, unknown>
  const code = payload.code
  const message = payload.message
  const retryable = payload.retryable
  const metadata = payload.metadata

  if (typeof code !== "string" || typeof message !== "string") {
    throw new Error(`Kernel error payload is invalid: ${recordLabel}`)
  }

  if (retryable !== undefined && typeof retryable !== "boolean") {
    throw new Error(`Kernel error retryable flag is invalid: ${recordLabel}`)
  }

  if (metadata !== undefined && (metadata === null || Array.isArray(metadata) || typeof metadata !== "object")) {
    throw new Error(`Kernel error metadata is invalid: ${recordLabel}`)
  }

  return {
    code,
    message,
    retryable,
    metadata: metadata as KernelMetadata | undefined,
  }
}

export function serializeKernelErrorValue(error: KernelError, recordLabel: string): string {
  const serialized = JSON.stringify(error)
  if (serialized === undefined) {
    throw new Error(`Kernel error is not serializable: ${recordLabel}`)
  }

  return serialized
}
