type HeaderLikeValue = string | readonly string[] | undefined

export type ProviderRetryHeaders = Headers | Readonly<Record<string, HeaderLikeValue>>

function isHeaders(value: ProviderRetryHeaders): value is Headers {
  return typeof Headers !== "undefined" && value instanceof Headers
}

function getHeaderValue(headers: ProviderRetryHeaders, name: string): string | undefined {
  if (isHeaders(headers)) {
    const value = headers.get(name)
    return typeof value === "string" && value.trim() ? value.trim() : undefined
  }

  const direct = headers[name]
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim()
  }

  if (Array.isArray(direct)) {
    const first = direct.find((value) => typeof value === "string" && value.trim())
    return typeof first === "string" ? first.trim() : undefined
  }

  const lowerName = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== lowerName) {
      continue
    }

    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }

    if (Array.isArray(value)) {
      const first = value.find((item) => typeof item === "string" && item.trim())
      return typeof first === "string" ? first.trim() : undefined
    }
  }

  return undefined
}

function parseIntegerMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined
  }

  return parsed
}

function parseRetryAfterSeconds(value: string | undefined): number | undefined {
  if (!value) {
    return undefined
  }

  if (/^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed * 1_000
    }
  }

  return undefined
}

function parseRetryAfterDate(value: string | undefined, nowMs: number): number | undefined {
  if (!value) {
    return undefined
  }

  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return undefined
  }

  return Math.max(0, parsed - nowMs)
}

export function parseProviderRetryAfterMs(input: {
  headers: ProviderRetryHeaders
  nowMs?: number
}): number | undefined {
  const nowMs = input.nowMs ?? Date.now()
  const explicitMs = parseIntegerMs(getHeaderValue(input.headers, "retry-after-ms"))
    ?? parseIntegerMs(getHeaderValue(input.headers, "x-ms-retry-after-ms"))

  if (explicitMs !== undefined) {
    return explicitMs
  }

  const retryAfter = getHeaderValue(input.headers, "retry-after")
  return parseRetryAfterSeconds(retryAfter)
    ?? parseRetryAfterDate(retryAfter, nowMs)
}
