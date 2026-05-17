function normalizeErrorOutput(error: Error): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  }
}

export function normalizeToolOutput(value: unknown): unknown {
  if (value === undefined) {
    return undefined
  }

  const candidate = value instanceof Error
    ? normalizeErrorOutput(value)
    : value

  const serialized = JSON.stringify(candidate)
  if (serialized === undefined) {
    throw new Error("Tool output is not JSON-serializable")
  }

  return JSON.parse(serialized) as unknown
}
