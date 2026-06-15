import type { KernelEventPayloadMap, KernelEventType } from "../events"
import type { AiTurnPort, AiTurnRequest } from "../../../ai/contracts"
import type { KernelError } from "../common"
import { asEventId, asMessageId, asMessagePartId } from "../ids"
import type { MessageRecord, MessageRecordWithParts } from "../message"
import type { RunBoundary, RunRecord } from "../run"
import type { SessionRecord } from "../session"
import type { ToolCallRecord, ToolExecutionOutcome } from "../tool-call"
import type { TurnPlan, TurnRecord } from "./index"
import type {
  ClockPort,
  ContextCheckpointStorePort,
  IdGeneratorPort,
  InteractionCoordinatorPort,
  KernelRunEnginePort,
  MessageStorePort,
  ProcessorResult,
  RunStorePort,
  SessionStorePort,
  StreamProcessorPort,
  ToolCallStorePort,
  ToolExecutionContext,
  ToolExecutorPort,
  TurnInputAssemblerPort,
  TurnPlannerPort,
  TurnStorePort,
  UnitOfWorkPort,
  EventSinkPort,
} from "../ports"

type KernelRunEngineOptions = {
  sessionStore: SessionStorePort
  runStore: RunStorePort
  turnStore: TurnStorePort
  messageStore: MessageStorePort
  toolCallStore: ToolCallStorePort
  contextCheckpointStore: ContextCheckpointStorePort
  turnInputAssembler: TurnInputAssemblerPort
  turnPlanner: TurnPlannerPort
  turnPort: AiTurnPort
  streamProcessor: StreamProcessorPort
  toolExecutor: ToolExecutorPort
  interactionCoordinator: InteractionCoordinatorPort
  unitOfWork: UnitOfWorkPort
  clock: ClockPort
  idGenerator: IdGeneratorPort
  eventSink?: EventSinkPort
}

type TurnExecutionState = {
  session: SessionRecord
  run: RunRecord
  plan: TurnPlan
  assistantMessage: MessageRecord
  turn: TurnRecord
}

type ToolExecutionState = {
  session: SessionRecord
  run: RunRecord
  turn: TurnRecord
}

type ToolContinuationState =
  | {
      kind: "continue"
      session: SessionRecord
      run: RunRecord
    }
  | {
      kind: "boundary"
      boundary: RunBoundary
    }

const REPEATED_TOOL_BATCH_THRESHOLD = 3

type ExecutionGuardPhase = "tool_batch_validation" | "post_tool_execution"

type ExecutionGuardKind = "turn_budget" | "repeated_tool_batch"

type ExecutionFailurePhase = "model_boundary_validation" | "tool_execution"

type ExecutionFailureKind = "protocol" | "tool_contract" | "tool_runtime" | "tool_cancellation"

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function readInputRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function buildExecutionGuardMetadata(input: {
  turn: TurnRecord
  phase: ExecutionGuardPhase
  guardKind: ExecutionGuardKind
  metadata?: Record<string, unknown>
}): Record<string, unknown> {
  return {
    phase: input.phase,
    guardKind: input.guardKind,
    turnId: input.turn.id,
    turnSequence: input.turn.sequence,
    ...(input.metadata ?? {}),
  }
}

function buildExecutionFailureMetadata(input: {
  turn: TurnRecord
  phase: ExecutionFailurePhase
  failureKind: ExecutionFailureKind
  metadata?: Record<string, unknown>
}): Record<string, unknown> {
  return {
    phase: input.phase,
    failureKind: input.failureKind,
    turnId: input.turn.id,
    turnSequence: input.turn.sequence,
    ...(input.metadata ?? {}),
  }
}

function withExecutionFailureMetadata(input: {
  turn: TurnRecord
  error: KernelError
  phase: ExecutionFailurePhase
  failureKind: ExecutionFailureKind
  metadata?: Record<string, unknown>
}): KernelError {
  const existingMetadata = isRecord(input.error.metadata)
    ? input.error.metadata
    : undefined

  return {
    ...input.error,
    metadata: buildExecutionFailureMetadata({
      turn: input.turn,
      phase: input.phase,
      failureKind: input.failureKind,
      metadata: {
        ...(existingMetadata ?? {}),
        ...(input.metadata ?? {}),
      },
    }),
  }
}

function classifyToolFailureKind(error: KernelError): ExecutionFailureKind {
  const existingFailureKind = isRecord(error.metadata) && typeof error.metadata.failureKind === "string"
    ? error.metadata.failureKind
    : undefined

  if (
    existingFailureKind === "protocol"
    || existingFailureKind === "tool_contract"
    || existingFailureKind === "tool_runtime"
    || existingFailureKind === "tool_cancellation"
  ) {
    return existingFailureKind
  }

  if (error.code === "tool_not_found" || error.code === "tool_input_invalid") {
    return "tool_contract"
  }

  if (error.code === "tool_cancelled") {
    return "tool_cancellation"
  }

  return "tool_runtime"
}

function shouldContinueAfterToolFailure(input: {
  call: ToolCallRecord
  error: KernelError
}): boolean {
  const callMetadata = readInputRecord(input.call.metadata)
  if (callMetadata?.continueAfterFailure === false) {
    return false
  }

  if (callMetadata?.continueAfterFailure === true) {
    return true
  }

  const errorMetadata = isRecord(input.error.metadata)
    ? input.error.metadata
    : undefined
  const failureKind = readString(errorMetadata?.failureKind)

  if (failureKind === "protocol" || failureKind === "tool_cancellation") {
    return false
  }

  if (input.error.code === "tool_execution_rejected") {
    return false
  }

  if (errorMetadata?.terminateRun === true || errorMetadata?.continueAfterFailure === false) {
    return false
  }

  return true
}

function buildFailedToolOutput(error: KernelError): Record<string, unknown> {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(typeof error.retryable === "boolean" ? { retryable: error.retryable } : {}),
      ...(cloneKernelErrorMetadata(error.metadata) ? { metadata: cloneKernelErrorMetadata(error.metadata) } : {}),
    },
  }
}

function cloneKernelErrorMetadata(metadata: KernelError["metadata"]): Record<string, unknown> | undefined {
  return isRecord(metadata) ? { ...metadata } : undefined
}

function cloneFailedBoundary(input: Extract<RunBoundary, { kind: "failed" }>): Record<string, unknown> {
  return {
    kind: "failed",
    error: {
      code: input.error.code,
      message: input.error.message,
      ...(typeof input.error.retryable === "boolean" ? { retryable: input.error.retryable } : {}),
      ...(cloneKernelErrorMetadata(input.error.metadata)
        ? { metadata: cloneKernelErrorMetadata(input.error.metadata) }
        : {}),
    },
  }
}

function mergeRunMetadataForBoundary(input: {
  run: RunRecord
  boundary: RunBoundary
}): RunRecord["metadata"] {
  const metadata = isRecord(input.run.metadata)
    ? { ...input.run.metadata }
    : {}

  if (input.boundary.kind === "failed") {
    metadata.terminalBoundary = cloneFailedBoundary(input.boundary)
  } else {
    delete metadata.terminalBoundary
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined
}

function buildAssistantMessage(input: {
  session: SessionRecord
  run: RunRecord
  turn: TurnRecord
  idGenerator: IdGeneratorPort
  clock: ClockPort
}): MessageRecord {
  return {
    id: asMessageId(input.idGenerator.next("message")),
    sessionId: input.session.id,
    runId: input.run.id,
    turnId: input.turn.id,
    role: "assistant",
    createdAt: input.clock.now(),
  }
}

function buildToolResultMessage(input: {
  session: SessionRecord
  run: RunRecord
  turn: TurnRecord
  call: ToolCallRecord
  output: unknown
  clock: ClockPort
  idGenerator: IdGeneratorPort
}): MessageRecordWithParts {
  return {
    message: {
      id: asMessageId(input.idGenerator.next("message")),
      sessionId: input.session.id,
      runId: input.run.id,
      turnId: input.turn.id,
      role: "tool",
      createdAt: input.clock.now(),
    },
    parts: [
      {
        id: asMessagePartId(input.idGenerator.next("part")),
        type: "tool_result_ref",
        toolCallId: input.call.id,
        toolName: input.call.toolName,
      },
      {
        id: asMessagePartId(input.idGenerator.next("part")),
        type: "text",
        text: stringifyToolOutput(input.output),
      },
    ],
  }
}

function buildUnexpectedContinueBoundary(input: {
  turn: TurnRecord
}): RunBoundary {
  return {
    kind: "failed",
    error: {
      code: "invalid_continue_boundary",
      message: "Model requested another turn without tool calls",
      metadata: buildExecutionFailureMetadata({
        turn: input.turn,
        phase: "model_boundary_validation",
        failureKind: "protocol",
      }),
    },
  }
}

function buildMaxTurnsExceededBoundary(input: {
  turn: TurnRecord
  plan: TurnPlan
}): RunBoundary {
  const maxTurnsPerRun = readNumber(input.plan.metadata?.maxTurnsPerRun)

  return {
    kind: "failed",
    error: {
      code: "max_turns_exceeded",
      message: "Kernel run reached maxTurnsPerRun before continuing after tool execution",
      retryable: false,
      metadata: buildExecutionGuardMetadata({
        turn: input.turn,
        phase: "post_tool_execution",
        guardKind: "turn_budget",
        metadata: maxTurnsPerRun === undefined
          ? undefined
          : {
              maxTurnsPerRun,
            },
      }),
    },
  }
}

type ToolCallBatch = {
  turnId: TurnRecord["id"]
  calls: readonly ToolCallRecord[]
  signature: string
  allCompleted: boolean
}

function normalizeToolCallInput(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeToolCallInput)
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, candidate]) => candidate !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, candidate]) => [key, normalizeToolCallInput(candidate)]),
    )
  }

  return value
}

function buildToolCallSignature(call: Pick<ToolCallRecord, "toolName" | "input">): string {
  const serialized = JSON.stringify(normalizeToolCallInput(call.input))
  return `${call.toolName}:${serialized ?? "null"}`
}

function buildToolCallBatchSignature(calls: readonly ToolCallRecord[]): string {
  return calls.map(buildToolCallSignature).join("\u0001")
}

function groupToolCallBatches(calls: readonly ToolCallRecord[]): readonly ToolCallBatch[] {
  const batches: Array<{
    turnId: TurnRecord["id"]
    calls: ToolCallRecord[]
  }> = []

  for (const call of calls) {
    const lastBatch = batches.at(-1)
    if (!lastBatch || lastBatch.turnId !== call.turnId) {
      batches.push({
        turnId: call.turnId,
        calls: [call],
      })
      continue
    }

    lastBatch.calls.push(call)
  }

  return batches.map((batch) => ({
    turnId: batch.turnId,
    calls: batch.calls,
    signature: buildToolCallBatchSignature(batch.calls),
    allCompleted: batch.calls.every((call) => call.status === "completed"),
  }))
}

function detectRepeatedToolBatchLoop(input: {
  turn: TurnRecord
  callsByRun: readonly ToolCallRecord[]
}): KernelError | undefined {
  const batches = groupToolCallBatches(input.callsByRun)
  if (batches.length < REPEATED_TOOL_BATCH_THRESHOLD) {
    return undefined
  }

  const recentBatches = batches.slice(-REPEATED_TOOL_BATCH_THRESHOLD)
  const currentBatch = recentBatches.at(-1)
  if (!currentBatch || currentBatch.turnId !== input.turn.id) {
    return undefined
  }

  if (recentBatches.some((batch) => batch.signature !== currentBatch.signature)) {
    return undefined
  }

  if (recentBatches.slice(0, -1).some((batch) => !batch.allCompleted)) {
    return undefined
  }

  return {
    code: "tool_loop_detected",
    message: "Kernel run detected a repeated tool-call batch across consecutive turns",
    retryable: false,
    metadata: buildExecutionGuardMetadata({
      turn: input.turn,
      phase: "tool_batch_validation",
      guardKind: "repeated_tool_batch",
      metadata: {
      repetitionCount: REPEATED_TOOL_BATCH_THRESHOLD,
      repeatedTurnIds: recentBatches.map((batch) => batch.turnId),
      currentBatchCallIds: currentBatch.calls.map((call) => call.id),
      toolNames: [...new Set(currentBatch.calls.map((call) => call.toolName))],
      batchSignature: currentBatch.signature,
      },
    }),
  }
}

function stringifyToolOutput(output: unknown): string {
  if (typeof output === "string") {
    return output
  }

  const serialized = JSON.stringify(output)
  return serialized ?? "null"
}

export class KernelRunEngine implements KernelRunEnginePort {
  constructor(private readonly options: KernelRunEngineOptions) {}

  private async publishEvent<TType extends KernelEventType>(
    type: TType,
    payload: KernelEventPayloadMap[TType],
  ): Promise<void> {
    if (!this.options.eventSink) {
      return
    }

    await this.options.eventSink.publish([{
      id: asEventId(this.options.idGenerator.next("event")),
      type,
      occurredAt: this.options.clock.now(),
      payload,
    }])
  }

  async executeUntilBoundary(input: {
    sessionId: SessionRecord["id"]
    runId: RunRecord["id"]
    signal?: AbortSignal
  }): Promise<RunBoundary> {
    let session = await this.options.sessionStore.get(input.sessionId)
    let run = await this.options.runStore.get(input.runId)

    if (run.sessionId !== session.id) {
      throw new Error(`Kernel run ${run.id} does not belong to session ${session.id}`)
    }

    while (true) {
      const startedState = await this.prepareTurnExecution({
        session,
        run,
      })
      const processorResult = await this.executeModelTurn(startedState, input.signal)

      if (processorResult.boundary.kind !== "continue") {
        await this.persistTurnResult({
          session: startedState.session,
          run: startedState.run,
          turn: startedState.turn,
          boundary: processorResult.boundary,
          finishReason: processorResult.finishReason,
          usage: processorResult.usage,
        })

        return processorResult.boundary
      }

      if (processorResult.toolCalls.length === 0) {
        const boundary = buildUnexpectedContinueBoundary({
          turn: startedState.turn,
        })

        await this.persistTurnResult({
          session: startedState.session,
          run: startedState.run,
          turn: startedState.turn,
          boundary,
          finishReason: processorResult.finishReason,
          usage: processorResult.usage,
        })

        return boundary
      }

      const continuation = await this.executeToolCalls({
        state: startedState,
        processorResult,
      })

      if (continuation.kind === "boundary") {
        return continuation.boundary
      }

      session = continuation.session
      run = continuation.run
    }
  }

  private async prepareTurnExecution(input: {
    session: SessionRecord
    run: RunRecord
  }): Promise<TurnExecutionState> {
    const messages = await this.options.messageStore.listBySession(input.session.id)
    const checkpoints = await this.options.contextCheckpointStore.listBySession(input.session.id)
    const lastTurn = await this.options.turnStore.getLastByRun(input.run.id)
    const turnInput = await this.options.turnInputAssembler.load({
      session: input.session,
      run: input.run,
      visibleMessages: messages,
    })
    const plan = await this.options.turnPlanner.plan({
      session: input.session,
      run: input.run,
      nextSequence: (lastTurn?.sequence ?? 0) + 1,
      visibleMessages: messages,
      checkpoints,
      turnInput,
    })
    await this.publishEvent("turn.planned", {
      plan,
    })
    const turn: TurnRecord = {
      ...plan.turn,
      status: "streaming",
    }
    const assistantMessage = buildAssistantMessage({
      session: input.session,
      run: input.run,
      turn,
      idGenerator: this.options.idGenerator,
      clock: this.options.clock,
    })

    return this.persistTurnStart({
      session: input.session,
      run: input.run,
      plan,
      turn,
      assistantMessage,
    })
  }

  private async executeModelTurn(
    state: TurnExecutionState,
    signal?: AbortSignal,
  ): Promise<ProcessorResult> {
    const processor = await this.options.streamProcessor.start({
      session: state.session,
      run: state.run,
      turn: state.turn,
      assistantMessage: state.assistantMessage,
    })

    const turnRequest: AiTurnRequest = {
      executionProfile: state.plan.executionProfile,
      prompt: state.plan.envelope,
      settings: {
        toolChoice: state.plan.tools.length > 0 ? "auto" : "none",
      } as const,
      trace: {
        sessionId: state.session.id,
        runId: state.run.id,
        turnId: state.turn.id,
      },
      ...(signal ? { signal } : {}),
    }

    try {
      for await (const event of this.options.turnPort.stream(turnRequest)) {
        await processor.accept(event)
      }

      return await processor.complete()
    } catch (error) {
      return processor.fail(error)
    }
  }

  private async executeToolCalls(input: {
    state: TurnExecutionState
    processorResult: ProcessorResult
  }): Promise<ToolContinuationState> {
    let toolState = await this.persistTurnEnteredToolExecution({
      session: input.state.session,
      run: input.state.run,
      turn: input.state.turn,
      finishReason: input.processorResult.finishReason,
      usage: input.processorResult.usage,
    })
    const recentMessages = [
      ...await this.options.messageStore.listBySession(toolState.session.id),
    ]
    const repeatedToolLoopBoundary = await this.failRepeatedToolLoopIfDetected({
      state: toolState,
      calls: input.processorResult.toolCalls,
      finishReason: input.processorResult.finishReason,
      usage: input.processorResult.usage,
    })

    if (repeatedToolLoopBoundary) {
      return {
        kind: "boundary",
        boundary: repeatedToolLoopBoundary,
      }
    }

    for (const call of input.processorResult.toolCalls) {
      const executionContext: ToolExecutionContext = {
        session: toolState.session,
        run: toolState.run,
        turn: toolState.turn,
        recentMessages,
      }
      const executingCall: ToolCallRecord = {
        ...call,
        status: "executing",
        updatedAt: this.options.clock.now(),
      }

      await this.options.toolCallStore.patch(executingCall)
      await this.publishEvent("tool-call.updated", {
        toolCall: executingCall,
      })

      const outcome = await this.options.toolExecutor.execute(executingCall, executionContext)
      const nextState = await this.handleToolOutcome({
        state: toolState,
        call: executingCall,
        outcome,
        recentMessages,
        finishReason: input.processorResult.finishReason,
        usage: input.processorResult.usage,
      })

      if (nextState.kind === "boundary") {
        return nextState
      }

      toolState = nextState.state
    }

    if (input.state.plan.stopAfterThisTurn) {
      const boundary = buildMaxTurnsExceededBoundary({
        turn: toolState.turn,
        plan: input.state.plan,
      })

      await this.persistTurnResult({
        session: toolState.session,
        run: toolState.run,
        turn: toolState.turn,
        boundary,
        finishReason: input.processorResult.finishReason,
        usage: input.processorResult.usage,
      })

      return {
        kind: "boundary",
        boundary,
      }
    }

    const continuedState = await this.persistTurnToolExecutionCompleted({
      session: toolState.session,
      run: toolState.run,
      turn: toolState.turn,
      finishReason: input.processorResult.finishReason,
      usage: input.processorResult.usage,
    })

    return {
      kind: "continue",
      session: continuedState.session,
      run: continuedState.run,
    }
  }

  private async failRepeatedToolLoopIfDetected(input: {
    state: ToolExecutionState
    calls: readonly ToolCallRecord[]
    finishReason?: TurnRecord["finishReason"]
    usage?: TurnRecord["usage"]
  }): Promise<RunBoundary | undefined> {
    const callsByRun = await this.options.toolCallStore.listByRun(input.state.run.id)
    const error = detectRepeatedToolBatchLoop({
      turn: input.state.turn,
      callsByRun,
    })

    if (!error) {
      return undefined
    }

    return this.failCurrentToolBatch({
      state: input.state,
      calls: input.calls,
      error,
      finishReason: input.finishReason,
      usage: input.usage,
    })
  }

  private async failCurrentToolBatch(input: {
    state: ToolExecutionState
    calls: readonly ToolCallRecord[]
    error: KernelError
    finishReason?: TurnRecord["finishReason"]
    usage?: TurnRecord["usage"]
  }): Promise<RunBoundary> {
    const failedAt = this.options.clock.now()
    const failedCalls = input.calls.map((call) => ({
      ...call,
      status: "failed" as const,
      error: input.error,
      updatedAt: failedAt,
      completedAt: failedAt,
    }))
    const boundary: RunBoundary = {
      kind: "failed",
      error: input.error,
    }

    await this.options.unitOfWork.transaction(async () => {
      for (const call of failedCalls) {
        await this.options.toolCallStore.patch(call)
      }

      await this.persistTurnResult({
        session: input.state.session,
        run: input.state.run,
        turn: input.state.turn,
        boundary,
        finishReason: input.finishReason,
        usage: input.usage,
      })
    })

    for (const call of failedCalls) {
      await this.publishEvent("tool-call.updated", {
        toolCall: call,
      })
    }

    return boundary
  }

  private async handleToolOutcome(input: {
    state: ToolExecutionState
    call: ToolCallRecord
    outcome: ToolExecutionOutcome
    recentMessages: MessageRecordWithParts[]
    finishReason?: TurnRecord["finishReason"]
    usage?: TurnRecord["usage"]
  }): Promise<
    | {
        kind: "continue"
        state: ToolExecutionState
      }
    | {
        kind: "boundary"
        boundary: RunBoundary
      }
  > {
    if (input.outcome.kind === "completed") {
      const now = this.options.clock.now()
      const completedCall: ToolCallRecord = {
        ...input.call,
        status: "completed",
        output: input.outcome.output,
        updatedAt: now,
        completedAt: now,
      }

      await this.options.toolCallStore.patch(completedCall)
      await this.publishEvent("tool-call.updated", {
        toolCall: completedCall,
      })

      const message = buildToolResultMessage({
        session: input.state.session,
        run: input.state.run,
        turn: input.state.turn,
        call: completedCall,
        output: input.outcome.output,
        clock: this.options.clock,
        idGenerator: this.options.idGenerator,
      })

      await this.options.messageStore.append(message.message, message.parts)
      await this.publishEvent("message.appended", {
        message,
      })
      input.recentMessages.push(message)

      return {
        kind: "continue",
        state: input.state,
      }
    }

    if (input.outcome.kind === "blocked") {
      const interaction = input.outcome.interaction
      const blockedCall: ToolCallRecord = {
        ...input.call,
        status: "blocked",
        interactionId: interaction.id,
        updatedAt: this.options.clock.now(),
      }

      let boundary!: RunBoundary
      await this.options.unitOfWork.transaction(async () => {
        await this.options.toolCallStore.patch(blockedCall)
        boundary = await this.options.interactionCoordinator.block({
          interaction,
          runId: input.state.run.id,
          sessionId: input.state.session.id,
        })
      })
      await this.publishEvent("tool-call.updated", {
        toolCall: blockedCall,
      })

      return {
        kind: "boundary",
        boundary,
      }
    }

    const now = this.options.clock.now()
    const failedError = withExecutionFailureMetadata({
      turn: input.state.turn,
      error: input.outcome.error,
      phase: "tool_execution",
      failureKind: classifyToolFailureKind(input.outcome.error),
      metadata: {
        toolCallId: input.call.id,
        toolName: input.call.toolName,
      },
    })
    const failedCall: ToolCallRecord = {
      ...input.call,
      status: "failed",
      output: buildFailedToolOutput(failedError),
      error: failedError,
      updatedAt: now,
      completedAt: now,
    }

    if (shouldContinueAfterToolFailure({
      call: input.call,
      error: failedError,
    })) {
      await this.options.toolCallStore.patch(failedCall)
      await this.publishEvent("tool-call.updated", {
        toolCall: failedCall,
      })

      const message = buildToolResultMessage({
        session: input.state.session,
        run: input.state.run,
        turn: input.state.turn,
        call: failedCall,
        output: failedCall.output,
        clock: this.options.clock,
        idGenerator: this.options.idGenerator,
      })

      await this.options.messageStore.append(message.message, message.parts)
      await this.publishEvent("message.appended", {
        message,
      })
      input.recentMessages.push(message)

      return {
        kind: "continue",
        state: input.state,
      }
    }

    const boundary: RunBoundary = {
      kind: "failed",
      error: failedError,
    }

    await this.options.unitOfWork.transaction(async () => {
      await this.options.toolCallStore.patch(failedCall)
      await this.persistTurnResult({
        session: input.state.session,
        run: input.state.run,
        turn: input.state.turn,
        boundary,
        finishReason: input.finishReason,
        usage: input.usage,
      })
    })
    await this.publishEvent("tool-call.updated", {
      toolCall: failedCall,
    })

    return {
      kind: "boundary",
      boundary,
    }
  }

  private async persistTurnStart(input: {
    session: SessionRecord
    run: RunRecord
    plan: TurnPlan
    turn: TurnRecord
    assistantMessage: MessageRecord
  }): Promise<TurnExecutionState> {
    const now = this.options.clock.now()
    const session: SessionRecord = {
      ...input.session,
      status: "active",
      updatedAt: now,
    }
    const run: RunRecord = {
      ...input.run,
      status: "streaming",
      currentTurnId: input.turn.id,
      updatedAt: now,
    }

    await this.options.unitOfWork.transaction(async () => {
      await this.options.sessionStore.save(session)
      await this.options.runStore.save(run)
      await this.options.turnStore.save(input.turn)
    })
    await this.publishEvent("turn.started", {
      turn: input.turn,
    })
    await this.publishEvent("message.appended", {
      message: {
        message: input.assistantMessage,
        parts: [],
      },
    })

    return {
      session,
      run,
      plan: input.plan,
      assistantMessage: input.assistantMessage,
      turn: input.turn,
    }
  }

  private async persistTurnEnteredToolExecution(input: {
    session: SessionRecord
    run: RunRecord
    turn: TurnRecord
    finishReason?: TurnRecord["finishReason"]
    usage?: TurnRecord["usage"]
  }): Promise<ToolExecutionState> {
    const now = this.options.clock.now()
    const turn: TurnRecord = {
      ...input.turn,
      status: "tool_wait",
      finishedAt: now,
      finishReason: input.finishReason ?? "tool_calls",
      usage: input.usage,
    }
    const run: RunRecord = {
      ...input.run,
      status: "executing_tools",
      updatedAt: now,
      currentTurnId: turn.id,
    }
    const session: SessionRecord = {
      ...input.session,
      status: "active",
      updatedAt: now,
    }

    await this.options.unitOfWork.transaction(async () => {
      await this.options.sessionStore.save(session)
      await this.options.runStore.save(run)
      await this.options.turnStore.save(turn)
    })
    await this.publishEvent("turn.completed", {
      turn,
    })

    return {
      session,
      run,
      turn,
    }
  }

  private async persistTurnToolExecutionCompleted(input: {
    session: SessionRecord
    run: RunRecord
    turn: TurnRecord
    finishReason?: TurnRecord["finishReason"]
    usage?: TurnRecord["usage"]
  }): Promise<ToolExecutionState> {
    const now = this.options.clock.now()
    const turn: TurnRecord = {
      ...input.turn,
      status: "finished",
      finishedAt: input.turn.finishedAt ?? now,
      finishReason: input.finishReason ?? input.turn.finishReason ?? "tool_calls",
      usage: input.usage ?? input.turn.usage,
    }
    const run: RunRecord = {
      ...input.run,
      status: "planning",
      updatedAt: now,
      currentTurnId: turn.id,
    }
    const session: SessionRecord = {
      ...input.session,
      status: "active",
      updatedAt: now,
    }

    await this.options.unitOfWork.transaction(async () => {
      await this.options.sessionStore.save(session)
      await this.options.runStore.save(run)
      await this.options.turnStore.save(turn)
    })

    return {
      session,
      run,
      turn,
    }
  }

  private async persistTurnResult(input: {
    session: SessionRecord
    run: RunRecord
    turn: TurnRecord
    boundary: RunBoundary
    finishReason?: TurnRecord["finishReason"]
    usage?: TurnRecord["usage"]
  }): Promise<void> {
    const now = this.options.clock.now()
    const turn: TurnRecord = {
      ...input.turn,
      status: input.boundary.kind === "failed" ? "failed" : "finished",
      finishedAt: now,
      finishReason:
        input.boundary.kind === "failed"
          ? input.finishReason ?? "error"
          : input.finishReason,
      usage: input.usage,
    }

    const run: RunRecord =
      input.boundary.kind === "completed"
        ? {
            ...input.run,
            status: "completed",
            updatedAt: now,
            completedAt: now,
            currentTurnId: turn.id,
          }
        : input.boundary.kind === "awaiting_compaction"
          ? {
              ...input.run,
              status: "awaiting_compaction",
              updatedAt: now,
              currentTurnId: turn.id,
            }
          : input.boundary.kind === "blocked"
            ? {
                ...input.run,
                status: "blocked",
                updatedAt: now,
                currentTurnId: turn.id,
              }
            : {
                ...input.run,
                status: "failed",
                updatedAt: now,
                completedAt: now,
                currentTurnId: turn.id,
                metadata: mergeRunMetadataForBoundary({
                  run: input.run,
                  boundary: input.boundary,
                }),
              }

    const session: SessionRecord =
      input.boundary.kind === "completed"
        ? {
            ...input.session,
            status: "idle",
            updatedAt: now,
          }
        : input.boundary.kind === "awaiting_compaction" || input.boundary.kind === "blocked"
          ? {
              ...input.session,
              status: "active",
              updatedAt: now,
            }
          : {
              ...input.session,
              status: "failed",
              updatedAt: now,
            }

    await this.options.unitOfWork.transaction(async () => {
      await this.options.sessionStore.save(session)
      await this.options.runStore.save(run)
      await this.options.turnStore.save(turn)
    })

    if (turn.status === "finished") {
      await this.publishEvent("turn.completed", {
        turn,
      })
    }

    if (input.boundary.kind === "completed") {
      await this.publishEvent("run.completed", {
        run,
        boundary: input.boundary,
      })
      return
    }

    if (input.boundary.kind === "failed") {
      await this.publishEvent("run.failed", {
        run,
        boundary: input.boundary,
      })
    }
  }
}
