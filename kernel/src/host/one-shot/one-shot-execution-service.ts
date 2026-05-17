import type {
  AiExecutionProfileRef,
  AiTurnEvent,
  AiTurnFinishMetadata,
  AiTurnPort,
  AiTurnRequest,
} from "../../../ai/contracts"
import { createServiceNamespace } from "../../../ioc"
import {
  asMessageId,
  asMessagePartId,
  asRunId,
  asSessionId,
  asTurnId,
  buildPromptEnvelope,
  type ClockPort,
  type ContextBlock,
  type FinishReason,
  type IdGeneratorPort,
  type KernelError,
  type KernelMetadata,
  type MessageRecordWithParts,
  type MessageRole,
  type OutputMode,
  type RunId,
  type SessionId,
  type TokenUsage,
  type TurnId,
} from "../../core"

const oneShotHost = createServiceNamespace("runtime.one-shot")

export type OneShotMessageInput = {
  role: MessageRole
  content: string
  metadata?: KernelMetadata
}

export type OneShotExecutionInput = {
  executionProfile: AiExecutionProfileRef
  messages: readonly OneShotMessageInput[]
  systemBlocks?: readonly ContextBlock[]
  contextBlocks?: readonly ContextBlock[]
  agentId?: string
  outputMode?: OutputMode
  settings?: AiTurnRequest["settings"]
  sessionId?: SessionId
  runId?: RunId
  turnId?: TurnId
  onEvent?: (event: AiTurnEvent) => Promise<void> | void
}

export type OneShotExecutionResult = {
  sessionId: SessionId
  runId: RunId
  turnId: TurnId
  finishReason?: FinishReason
  usage?: TokenUsage
  content: string
  reasoning: readonly string[]
  error?: KernelError
  terminalMetadata?: AiTurnFinishMetadata
}

export interface OneShotExecutionPort {
  execute(input: OneShotExecutionInput): Promise<OneShotExecutionResult>
}

export const ONE_SHOT_EXECUTION_PORT =
  oneShotHost.token<OneShotExecutionPort>("execution")

type OneShotExecutionServiceOptions = {
  turnPort: AiTurnPort
  clock: Pick<ClockPort, "now">
  idGenerator: Pick<IdGeneratorPort, "next">
}

function cloneBlocks(blocks: readonly ContextBlock[] | undefined): readonly ContextBlock[] {
  return blocks?.map((block) => ({
    ...block,
    metadata: block.metadata ? { ...block.metadata } : undefined,
  })) ?? []
}

function normalizeError(error: unknown): KernelError {
  if (
    error
    && typeof error === "object"
    && typeof (error as Record<string, unknown>).code === "string"
    && typeof (error as Record<string, unknown>).message === "string"
  ) {
    return {
      code: (error as Record<string, unknown>).code as string,
      message: (error as Record<string, unknown>).message as string,
      retryable:
        typeof (error as Record<string, unknown>).retryable === "boolean"
          ? (error as Record<string, unknown>).retryable as boolean
          : undefined,
      metadata:
        (error as Record<string, unknown>).metadata
        && typeof (error as Record<string, unknown>).metadata === "object"
        && !Array.isArray((error as Record<string, unknown>).metadata)
          ? (error as Record<string, unknown>).metadata as Record<string, unknown>
          : undefined,
    }
  }

  if (error instanceof Error) {
    return {
      code: "one_shot_execution_failed",
      message: error.message,
    }
  }

  return {
    code: "one_shot_execution_failed",
    message: "Unknown one-shot execution failure",
  }
}

function buildUnsupportedToolCallError(event: Extract<AiTurnEvent, { type: "tool.call" }>): KernelError {
  return {
    code: "one_shot_tool_call_unsupported",
    message: "One-shot execution does not support tool calls",
    metadata: {
      toolCallId: event.toolCallId,
      toolName: event.toolName,
    },
  }
}

function materializeMessages(input: {
  messages: readonly OneShotMessageInput[]
  sessionId: SessionId
  runId: RunId
  turnId: TurnId
  createdAt: number
  idGenerator: Pick<IdGeneratorPort, "next">
}): MessageRecordWithParts[] {
  return input.messages.flatMap((item) => {
    if (item.content.length === 0) {
      return []
    }

    return [{
      message: {
        id: asMessageId(input.idGenerator.next("message")),
        sessionId: input.sessionId,
        runId: input.runId,
        turnId: input.turnId,
        role: item.role,
        createdAt: input.createdAt,
        metadata: item.metadata ? { ...item.metadata } : undefined,
      },
      parts: [{
        id: asMessagePartId(input.idGenerator.next("message-part")),
        type: "text",
        text: item.content,
      }],
    } satisfies MessageRecordWithParts]
  })
}

class OneShotAccumulator {
  private text = ""
  private reasoningBuffer = ""
  private readonly reasoningSegments: string[] = []
  private finishReason?: FinishReason
  private usage?: TokenUsage
  private error?: KernelError
  private terminalMetadata?: AiTurnFinishMetadata

  accept(event: AiTurnEvent) {
    switch (event.type) {
      case "text.start":
      case "text.end":
      case "reasoning.start":
        return
      case "text.delta":
        this.text += event.delta
        return
      case "reasoning.delta":
        this.reasoningBuffer += event.delta
        return
      case "reasoning.end":
        this.flushReasoning()
        return
      case "tool.call":
        this.error = this.error ?? buildUnsupportedToolCallError(event)
        return
      case "usage":
        this.usage = event.usage
        return
      case "finish":
        this.finishReason = event.reason
        this.terminalMetadata = event.metadata
        return
      case "error":
        this.error = event.error
        return
    }
  }

  finalize(): Omit<OneShotExecutionResult, "sessionId" | "runId" | "turnId"> {
    this.flushReasoning()

    return {
      finishReason: this.finishReason ?? (this.error ? "error" : undefined),
      usage: this.usage,
      content: this.text,
      reasoning: [...this.reasoningSegments],
      error: this.error,
      terminalMetadata: this.terminalMetadata,
    }
  }

  fail(error: unknown) {
    this.error = normalizeError(error)
  }

  private flushReasoning() {
    if (!this.reasoningBuffer) {
      return
    }

    this.reasoningSegments.push(this.reasoningBuffer)
    this.reasoningBuffer = ""
  }
}

export class OneShotExecutionService implements OneShotExecutionPort {
  constructor(private readonly options: OneShotExecutionServiceOptions) {}

  async execute(input: OneShotExecutionInput): Promise<OneShotExecutionResult> {
    const sessionId = input.sessionId ?? asSessionId(this.options.idGenerator.next("session"))
    const runId = input.runId ?? asRunId(this.options.idGenerator.next("run"))
    const turnId = input.turnId ?? asTurnId(this.options.idGenerator.next("turn"))
    const createdAt = this.options.clock.now()
    const visibleMessages = materializeMessages({
      messages: input.messages,
      sessionId,
      runId,
      turnId,
      createdAt,
      idGenerator: this.options.idGenerator,
    })
    const systemBlocks = cloneBlocks(input.systemBlocks)
    const contextBlocks = cloneBlocks(input.contextBlocks)

    if (systemBlocks.length === 0 && contextBlocks.length === 0 && visibleMessages.length === 0) {
      throw {
        code: "invalid_argument",
        message: "One-shot execution requires at least one system block, context block, or message",
      } satisfies KernelError
    }

    const request: AiTurnRequest = {
      executionProfile: input.executionProfile,
      prompt: buildPromptEnvelope({
        sessionId,
        runId,
        turnId,
        agentId: input.agentId ?? "assistant.default",
        contextView: {
          visibleMessages,
          checkpoints: [],
          systemBlocks,
          contextBlocks,
        },
        tools: [],
        outputMode: input.outputMode ?? { kind: "text" },
      }),
      settings: {
        ...input.settings,
        toolChoice: input.settings?.toolChoice ?? "none",
      },
      trace: {
        sessionId,
        runId,
        turnId,
      },
    }
    const accumulator = new OneShotAccumulator()

    try {
      for await (const event of this.options.turnPort.stream(request)) {
        accumulator.accept(event)
        await input.onEvent?.(event)
      }
    } catch (error) {
      accumulator.fail(error)
    }

    return {
      sessionId,
      runId,
      turnId,
      ...accumulator.finalize(),
    }
  }
}