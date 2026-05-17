import type { KernelError, OutputMode, TokenUsage } from "../common"
import type { AiExecutionProfileRef, AiTurnEvent } from "../../../ai/contracts"
import type { ContextBlock, ContextCheckpointRecord, ContextView, PromptEnvelope } from "../context"
import type { InteractionId, RunId, SessionId, TurnId } from "../ids"
import type { KernelEvent } from "../events"
import type { InteractionRecord } from "../interaction"
import type { MessagePart, MessageRecord, MessageRecordWithParts } from "../message"
import type { RunBoundary, RunRecord } from "../run"
import type { SessionRecord } from "../session"
import type { ToolCallRecord, ToolDescriptor, ToolExecutionOutcome } from "../tool-call"
import type { TurnPlan, TurnRecord } from "../turn"

export type AgentDescriptor = {
  id: string
  description?: string
  defaultExecutionProfile?: AiExecutionProfileRef
  maxSteps?: number
  metadata?: Readonly<Record<string, unknown>>
}

export type TurnInputContext = {
  availableAgents: readonly AgentDescriptor[]
  preferredAgentId?: string
  candidateExecutionProfiles: readonly AiExecutionProfileRef[]
  availableTools: readonly ToolDescriptor[]
  systemBlocks: readonly ContextBlock[]
  contextBlocks: readonly ContextBlock[]
  outputMode: OutputMode
  policies: {
    maxTurnsPerRun?: number
    allowCompaction: boolean
    retryOnModelError: boolean
  }
}

export type TurnPlanningInput = {
  session: SessionRecord
  run: RunRecord
  nextSequence: number
  visibleMessages: readonly MessageRecordWithParts[]
  checkpoints: readonly ContextCheckpointRecord[]
  turnInput: TurnInputContext
}

export interface TurnInputAssemblerPort {
  load(input: {
    session: SessionRecord
    run: RunRecord
    visibleMessages: readonly MessageRecordWithParts[]
  }): Promise<TurnInputContext>
}

export interface TurnPlannerPort {
  plan(input: TurnPlanningInput): Promise<TurnPlan>
}

export interface ContextViewBuilderPort {
  build(input: {
    session: SessionRecord
    run: RunRecord
    messages: readonly MessageRecordWithParts[]
    checkpoints: readonly ContextCheckpointRecord[]
    turnInput: TurnInputContext
  }): Promise<ContextView>
}


export type ProcessorStartInput = {
  session: SessionRecord
  run: RunRecord
  turn: TurnRecord
  assistantMessage: MessageRecord
}

export type ProcessorResult = {
  finishReason?: import("../common").FinishReason
  usage?: TokenUsage
  toolCalls: readonly ToolCallRecord[]
  boundary:
    | {
      kind: "continue"
    }
    | {
      kind: "completed"
    }
    | {
      kind: "awaiting_compaction"
      reason: "context_overflow" | "budget_exceeded"
    }
    | {
      kind: "failed"
      error: KernelError
    }
}

export interface ProcessorHandle {
  accept(event: AiTurnEvent): Promise<void>
  complete(): Promise<ProcessorResult>
  fail(error: unknown): Promise<ProcessorResult>
}

export interface StreamProcessorPort {
  start(input: ProcessorStartInput): Promise<ProcessorHandle>
}

export type ToolExecutionContext = {
  session: SessionRecord
  run: RunRecord
  turn: TurnRecord
  recentMessages: readonly MessageRecordWithParts[]
}

export interface ToolExecutorPort {
  execute(call: ToolCallRecord, context: ToolExecutionContext): Promise<ToolExecutionOutcome>
}

export interface InteractionCoordinatorPort {
  block(input: {
    interaction: InteractionRecord
    runId: RunId
    sessionId: SessionId
  }): Promise<RunBoundary>

  resume(input: {
    interactionId: InteractionId
    response: unknown
  }): Promise<void>

  reject(input: {
    interactionId: InteractionId
    reason?: string
  }): Promise<void>
}

export interface KernelRunEnginePort {
  executeUntilBoundary(input: {
    sessionId: SessionId
    runId: RunId
    signal?: AbortSignal
  }): Promise<RunBoundary>
}

export interface ClockPort {
  now(): number
}

export interface IdGeneratorPort {
  next(prefix: string): string
}

export interface UnitOfWorkPort {
  transaction<T>(work: () => Promise<T>): Promise<T>
}

export interface SessionStorePort {
  get(id: SessionId): Promise<SessionRecord>
  save(session: SessionRecord): Promise<void>
}

export interface RunStorePort {
  get(id: RunId): Promise<RunRecord>
  save(run: RunRecord): Promise<void>
  listBySession(sessionId: SessionId): Promise<readonly RunRecord[]>
}

export interface TurnStorePort {
  save(turn: TurnRecord): Promise<void>
  listByRun(runId: RunId): Promise<readonly TurnRecord[]>
  getLastByRun(runId: RunId): Promise<TurnRecord | undefined>
}

export interface MessageStorePort {
  append(message: MessageRecord, parts: readonly MessagePart[]): Promise<void>
  appendParts(messageId: import("../ids").MessageId, parts: readonly MessagePart[]): Promise<void>
  listBySession(sessionId: SessionId): Promise<readonly MessageRecordWithParts[]>
}

export interface ToolCallStorePort {
  save(call: ToolCallRecord): Promise<void>
  patch(call: ToolCallRecord): Promise<void>
  listByRun(runId: RunId): Promise<readonly ToolCallRecord[]>
  listByTurn(turnId: TurnId): Promise<readonly ToolCallRecord[]>
}

export interface InteractionStorePort {
  save(interaction: InteractionRecord): Promise<void>
  get(id: InteractionId): Promise<InteractionRecord>
  listByRun(runId: RunId): Promise<readonly InteractionRecord[]>
  listPendingBySession(sessionId: SessionId): Promise<readonly InteractionRecord[]>
  listPendingByRun(runId: RunId): Promise<readonly InteractionRecord[]>
}

export interface ContextCheckpointStorePort {
  save(checkpoint: ContextCheckpointRecord): Promise<void>
  listBySession(sessionId: SessionId): Promise<readonly ContextCheckpointRecord[]>
}

export interface EventSinkPort {
  publish(events: readonly KernelEvent[]): Promise<void>
}
