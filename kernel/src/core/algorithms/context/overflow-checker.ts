import type { TokenEstimate } from "./token-estimator"

const DEFAULT_COMPACTION_BUFFER_TOKENS = 20_000
const DEFAULT_MAX_OUTPUT_TOKENS = 4_096

export type OverflowBudget = {
  contextWindowTokens: number
  maxInputTokens?: number
  maxOutputTokens?: number
  reservedTokens?: number
  autoCompaction?: boolean
}

export type OverflowCheckResult = {
  overflow: boolean
  estimatedPromptTokens: number
  usablePromptTokens: number
  reservedTokens: number
  overflowBy: number
}

function resolveReservedTokens(budget: OverflowBudget): number {
  if (typeof budget.reservedTokens === "number") {
    return budget.reservedTokens
  }

  return Math.min(
    DEFAULT_COMPACTION_BUFFER_TOKENS,
    budget.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  )
}

function resolveUsablePromptTokens(budget: OverflowBudget, reservedTokens: number): number {
  if (typeof budget.maxInputTokens === "number" && budget.maxInputTokens > 0) {
    return Math.max(0, budget.maxInputTokens - reservedTokens)
  }

  if (budget.contextWindowTokens <= 0) {
    return 0
  }

  return Math.max(
    0,
    budget.contextWindowTokens - (budget.maxOutputTokens ?? reservedTokens),
  )
}

export function checkPromptOverflow(input: {
  estimate: TokenEstimate
  budget: OverflowBudget
}): OverflowCheckResult {
  const reservedTokens = resolveReservedTokens(input.budget)
  const usablePromptTokens = resolveUsablePromptTokens(input.budget, reservedTokens)
  const overflowBy = Math.max(0, input.estimate.promptTokens - usablePromptTokens)

  if (input.budget.autoCompaction === false) {
    return {
      overflow: false,
      estimatedPromptTokens: input.estimate.promptTokens,
      usablePromptTokens,
      reservedTokens,
      overflowBy,
    }
  }

  return {
    overflow: usablePromptTokens > 0 && input.estimate.promptTokens >= usablePromptTokens,
    estimatedPromptTokens: input.estimate.promptTokens,
    usablePromptTokens,
    reservedTokens,
    overflowBy,
  }
}
