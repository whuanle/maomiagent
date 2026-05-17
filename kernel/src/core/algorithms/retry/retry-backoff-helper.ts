export type RetryBackoffPolicy = {
  maxAttempts: number
  baseDelayMs?: number
  maxDelayMs?: number
  jitterRatio?: number
}

export type RetryBackoffInput = RetryBackoffPolicy & {
  attempt: number
  retryAfterMs?: number
  random?: () => number
}

const DEFAULT_BASE_DELAY_MS = 500
const DEFAULT_MAX_DELAY_MS = 8_000
const DEFAULT_JITTER_RATIO = 0.2

function clampAttempt(attempt: number): number {
  if (!Number.isFinite(attempt) || attempt < 1) {
    return 1
  }

  return Math.floor(attempt)
}

function clampNonNegative(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return fallback
  }

  return value
}

export function calculateRetryDelayMs(input: RetryBackoffInput): number {
  const attempt = clampAttempt(input.attempt)
  const baseDelayMs = clampNonNegative(input.baseDelayMs ?? DEFAULT_BASE_DELAY_MS, DEFAULT_BASE_DELAY_MS)
  const maxDelayMs = clampNonNegative(input.maxDelayMs ?? DEFAULT_MAX_DELAY_MS, DEFAULT_MAX_DELAY_MS)
  const jitterRatio = clampNonNegative(input.jitterRatio ?? DEFAULT_JITTER_RATIO, DEFAULT_JITTER_RATIO)
  const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)))
  const random = input.random ?? Math.random
  const jitter = exponentialDelay * jitterRatio * Math.max(0, Math.min(1, random()))
  const computedDelay = Math.round(exponentialDelay + jitter)

  if (typeof input.retryAfterMs === "number" && Number.isFinite(input.retryAfterMs) && input.retryAfterMs >= 0) {
    return Math.max(computedDelay, Math.round(input.retryAfterMs))
  }

  return computedDelay
}
