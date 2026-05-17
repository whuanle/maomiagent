import type { KernelError } from "../.."
import type { RetryBackoffPolicy } from "./retry-backoff-helper"

export type RetryDecisionInput = RetryBackoffPolicy & {
  attempt: number
  error: KernelError
}

export type RetryDecision =
  | {
      shouldRetry: true
      reason: "retryable_error"
    }
  | {
      shouldRetry: false
      reason: "not_retryable" | "max_attempts_exhausted"
    }

export function decideRetry(input: RetryDecisionInput): RetryDecision {
  if (!input.error.retryable) {
    return {
      shouldRetry: false,
      reason: "not_retryable",
    }
  }

  if (!Number.isFinite(input.maxAttempts) || input.maxAttempts <= 1 || input.attempt >= input.maxAttempts) {
    return {
      shouldRetry: false,
      reason: "max_attempts_exhausted",
    }
  }

  return {
    shouldRetry: true,
    reason: "retryable_error",
  }
}
