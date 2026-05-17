export function serializeRequiredJsonValue(value: unknown, recordLabel: string): string {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) {
    throw new Error(`Kernel JSON value is not serializable: ${recordLabel}`)
  }

  return serialized
}

export function serializeOptionalJsonValue(value: unknown, recordLabel: string): string | null {
  if (value === undefined) {
    return null
  }

  return serializeRequiredJsonValue(value, recordLabel)
}

export function parseRequiredJsonValue(value: string, recordLabel: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch (error) {
    throw new Error(`Kernel JSON value is invalid: ${recordLabel}`, {
      cause: error,
    })
  }
}

export function parseOptionalJsonValue(value: string | null, recordLabel: string): unknown {
  if (value === null) {
    return undefined
  }

  return parseRequiredJsonValue(value, recordLabel)
}
