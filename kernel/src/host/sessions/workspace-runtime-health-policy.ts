import type { KernelError, KernelMetadata, RunBoundary } from "../../core"

export type WorkspaceRuntimeHealthTransition = {
  nextState: "ready" | "suspect" | "broken"
  reason?: string
}

export interface WorkspaceRuntimeHealthPolicy {
  evaluate(input: {
    boundary?: RunBoundary
    error?: unknown
  }): WorkspaceRuntimeHealthTransition
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function normalizeKernelError(error: unknown): KernelError | undefined {
  if (!error || typeof error !== "object") {
    return undefined
  }

  const code = typeof (error as Record<string, unknown>).code === "string"
    ? (error as Record<string, unknown>).code as string
    : undefined
  const message = typeof (error as Record<string, unknown>).message === "string"
    ? (error as Record<string, unknown>).message as string
    : undefined
  const retryable = typeof (error as Record<string, unknown>).retryable === "boolean"
    ? (error as Record<string, unknown>).retryable as boolean
    : undefined
  const metadata = isRecord((error as Record<string, unknown>).metadata)
    ? (error as Record<string, unknown>).metadata as KernelMetadata
    : undefined

  if (!code || !message) {
    return undefined
  }

  return {
    code,
    message,
    ...(retryable !== undefined ? { retryable } : {}),
    ...(metadata ? { metadata } : {}),
  }
}

function readErrorPhase(error: KernelError | undefined): string | undefined {
  return readString(isRecord(error?.metadata) ? error.metadata.phase : undefined)
}

function readErrorGuardKind(error: KernelError | undefined): string | undefined {
  return readString(isRecord(error?.metadata) ? error.metadata.guardKind : undefined)
}

function readErrorFailureKind(error: KernelError | undefined): string | undefined {
  return readString(isRecord(error?.metadata) ? error.metadata.failureKind : undefined)
}

function isExecutionGuardFailure(error: KernelError): boolean {
  const guardKind = readErrorGuardKind(error)
  if (guardKind && /(turn_budget|repeated_tool_batch)/.test(guardKind)) {
    return true
  }

  return [
    "max_turns_exceeded",
    "tool_loop_detected",
  ].includes(error.code)
}

function isLogicalExecutionFailure(error: KernelError): boolean {
  const failureKind = readErrorFailureKind(error)
  if (failureKind && /(protocol|model|processor|tool_contract|tool_cancellation)/.test(failureKind)) {
    return true
  }

  return [
    "invalid_continue_boundary",
    "model_error",
    "stream_processing_error",
    "tool_not_found",
    "tool_input_invalid",
    "tool_cancelled",
  ].includes(error.code)
}

function isToolRuntimeFailure(error: KernelError): boolean {
  const failureKind = readErrorFailureKind(error)
  if (failureKind === "tool_runtime") {
    return true
  }

  return [
    "tool_timeout",
    "tool_execution_failed",
  ].includes(error.code)
}

function isCompactionPersistenceFailure(error: KernelError): boolean {
  const phase = readErrorPhase(error)
  if (phase && /(persist|checkpoint|artifact|continuation|failure|consistency)/.test(phase)) {
    return true
  }

  return /compaction.*(persist|checkpoint|consistency)/.test(error.code)
}

function classifyKernelError(error: KernelError | undefined): WorkspaceRuntimeHealthTransition {
  if (!error) {
    return {
      nextState: "suspect",
      reason: "workspace runtime execution failed",
    }
  }

  if (isExecutionGuardFailure(error)) {
    return {
      nextState: "ready",
    }
  }

  if (isLogicalExecutionFailure(error)) {
    return {
      nextState: "ready",
    }
  }

  if (isToolRuntimeFailure(error)) {
    return {
      nextState: "suspect",
      reason: `${error.code}: ${error.message}`,
    }
  }

  if (error.code === "compaction_loop_detected") {
    return {
      nextState: "suspect",
      reason: `${error.code}: ${error.message}`,
    }
  }

  if (isCompactionPersistenceFailure(error)) {
    return {
      nextState: "broken",
      reason: `${error.code}: ${error.message}`,
    }
  }

  if (error.code.startsWith("compaction_")) {
    return {
      nextState: error.retryable === false ? "broken" : "suspect",
      reason: `${error.code}: ${error.message}`,
    }
  }

  if (error.retryable === false) {
    return {
      nextState: "broken",
      reason: `${error.code}: ${error.message}`,
    }
  }

  return {
    nextState: "suspect",
    reason: `${error.code}: ${error.message}`,
  }
}

export class DefaultWorkspaceRuntimeHealthPolicy
  implements WorkspaceRuntimeHealthPolicy {
  evaluate(input: {
    boundary?: RunBoundary
    error?: unknown
  }): WorkspaceRuntimeHealthTransition {
    if (input.error !== undefined) {
      if (input.error instanceof Error) {
        return {
          nextState: "suspect",
          reason: input.error.message,
        }
      }

      return classifyKernelError(normalizeKernelError(input.error))
    }

    if (!input.boundary || input.boundary.kind === "completed" || input.boundary.kind === "blocked") {
      return {
        nextState: "ready",
      }
    }

    if (input.boundary.kind === "failed") {
      return classifyKernelError(input.boundary.error)
    }

    return {
      nextState: "ready",
    }
  }
}
