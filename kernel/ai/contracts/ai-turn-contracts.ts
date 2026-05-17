import type { FinishReason, KernelError, KernelMetadata, TokenUsage } from "../../src/core/common"
import type { PromptEnvelope } from "../../src/core/context"
import type {
  RunId,
  SessionId,
  ToolCallId,
  TurnId,
  OpaqueId,
} from "../../src/core/ids"

export type AiExecutionProfileId = OpaqueId<"maomi.kernel.ai.execution-profile.id">

export function asAiExecutionProfileId(value: string): AiExecutionProfileId {
  return value as AiExecutionProfileId
}

export type AiExecutionProfileRef = {
  id: AiExecutionProfileId
  modelId?: string
  metadata?: KernelMetadata
}

export function cloneAiExecutionProfileRef(profile: AiExecutionProfileRef): AiExecutionProfileRef {
  return {
    id: profile.id,
    modelId: profile.modelId,
    metadata: profile.metadata ? { ...profile.metadata } : undefined,
  }
}

export function readAiExecutionProfileModelId(profile: AiExecutionProfileRef): string {
  if (typeof profile.modelId === "string" && profile.modelId.trim().length > 0) {
    return profile.modelId
  }

  const metadataModelId = profile.metadata?.modelId
  if (typeof metadataModelId === "string" && metadataModelId.trim().length > 0) {
    return metadataModelId
  }

  return profile.id
}

export function matchesAiExecutionProfileRef(
  left: AiExecutionProfileRef,
  right: AiExecutionProfileRef,
): boolean {
  return left.id === right.id
}

export type AiTraceContext = {
  sessionId?: SessionId
  runId?: RunId
  turnId?: TurnId
}

export type AiTurnRequest = {
  executionProfile: AiExecutionProfileRef
  prompt: PromptEnvelope
  settings: {
    temperature?: number
    maxOutputTokens?: number
    toolChoice?: "auto" | "required" | "none"
  }
  trace?: AiTraceContext
  signal?: AbortSignal
}

export type AiTurnFinishMetadata = {
  providerResponseId?: string
  providerStatus?: string
  providerReason?: string
}

export type AiTurnEvent =
  | {
    type: "text.start"
  }
  | {
    type: "text.delta"
    delta: string
  }
  | {
    type: "text.end"
  }
  | {
    type: "reasoning.start"
  }
  | {
    type: "reasoning.delta"
    delta: string
  }
  | {
    type: "reasoning.end"
  }
  | {
    type: "tool.call"
    toolCallId: ToolCallId
    toolName: string
    input: unknown
  }
  | {
    type: "usage"
    usage: TokenUsage
  }
  | {
    type: "finish"
    reason: FinishReason
    metadata?: AiTurnFinishMetadata
  }
  | {
    type: "error"
    error: KernelError
  }

export interface AiTurnPort {
  stream(input: AiTurnRequest): AsyncIterable<AiTurnEvent>
}