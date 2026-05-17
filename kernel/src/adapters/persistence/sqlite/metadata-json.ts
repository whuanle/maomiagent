import type { KernelMetadata } from "../../../core"

export function serializeKernelMetadataJson(metadata?: KernelMetadata): string | null {
  if (metadata === undefined) {
    return null
  }

  return JSON.stringify(metadata)
}

export function parseKernelMetadataJson(
  value: string | null,
  recordLabel: string,
): KernelMetadata | undefined {
  if (!value) {
    return undefined
  }

  const parsed = JSON.parse(value) as unknown
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(`Kernel metadata must be a JSON object: ${recordLabel}`)
  }

  return parsed as KernelMetadata
}
