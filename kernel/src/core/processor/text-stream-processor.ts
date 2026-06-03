import type { KernelError } from "../common"
import type { KernelEventPayloadMap, KernelEventType } from "../events"
import { asEventId, asMessagePartId, asToolCallId } from "../ids"
import type { MessagePart } from "../message"
import type { AiTurnEvent } from "../../../ai/contracts"
import {
  type ProcessorHandle,
  type ProcessorResult,
  type ProcessorStartInput,
  type StreamProcessorPort,
  type ToolCallStorePort,
  type MessageStorePort,
  type ClockPort,
  type EventSinkPort,
  type IdGeneratorPort,
} from "../ports"
import type { ToolCallRecord } from "../tool-call"

type TextStreamProcessorOptions = {
  messageStore: MessageStorePort
  toolCallStore: ToolCallStorePort
  clock: ClockPort
  idGenerator: IdGeneratorPort
  eventSink?: EventSinkPort
}

type ProcessorFailurePhase = "model_completion" | "model_stream" | "stream_processing"

type ProcessorFailureKind = "model" | "processor"

const SUPPRESSED_TERMINAL_ERROR_CODES = new Set(["conversation_turn_aborted"])
const PSEUDO_TOOL_CALL_OPEN_TAG = "<tool_call>"
const PSEUDO_TOOL_CALL_CLOSE_TAG = "</tool_call>"
const PSEUDO_TOOL_CALL_OPEN_TAG_LOWER = PSEUDO_TOOL_CALL_OPEN_TAG.toLowerCase()
const PSEUDO_TOOL_CALL_CLOSE_TAG_LOWER = PSEUDO_TOOL_CALL_CLOSE_TAG.toLowerCase()

type ParsedPseudoToolCall = {
  toolName: string
  input: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function buildProcessorFailureMetadata(input: {
  turn: ProcessorStartInput["turn"]
  phase: ProcessorFailurePhase
  failureKind: ProcessorFailureKind
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

function withProcessorFailureMetadata(input: {
  error: KernelError
  turn: ProcessorStartInput["turn"]
  phase: ProcessorFailurePhase
  failureKind: ProcessorFailureKind
}): KernelError {
  const existingMetadata = isRecord(input.error.metadata)
    ? input.error.metadata
    : undefined

  return {
    ...input.error,
    metadata: buildProcessorFailureMetadata({
      turn: input.turn,
      phase: input.phase,
      failureKind: input.failureKind,
      metadata: existingMetadata,
    }),
  }
}

function normalizeKernelError(error: unknown): KernelError {
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
      code: "stream_processing_error",
      message: error.message,
    }
  }

  return {
    code: "stream_processing_error",
    message: "Unknown stream processing failure",
  }
}

function shouldRecoverPseudoToolCalls(start: ProcessorStartInput): boolean {
  const sessionMetadata = isRecord(start.session.metadata)
    ? start.session.metadata
    : undefined
  const runMetadata = isRecord(start.run.metadata)
    ? start.run.metadata
    : undefined
  return runMetadata?.pseudoToolCallRecovery !== false
    && sessionMetadata?.pseudoToolCallRecovery !== false
}

function normalizePseudoToolName(input: string): string {
  const normalized = input.trim()
  if (!normalized) {
    return ""
  }

  const canonical = normalized.replace(/[.\-]/g, "_")
  const aliases: Record<string, string> = {
    git_status: "git_list_changes",
    workspace_read: "workspace_read_file",
    workspace_readfile: "workspace_read_file",
    workspace_write: "workspace_write_file",
    workspace_writefile: "workspace_write_file",
    terminal_run: "terminal_execute",
  }

  return aliases[canonical] ?? canonical
}

function findPseudoToolMarkupTailStart(input: string): number {
  const lower = input.toLowerCase()
  const lastTagStart = lower.lastIndexOf("<")
  if (lastTagStart < 0) {
    return input.length
  }

  const tail = lower.slice(lastTagStart)
  return PSEUDO_TOOL_CALL_OPEN_TAG_LOWER.startsWith(tail)
    ? lastTagStart
    : input.length
}

function normalizePseudoToolParameterName(input: string): string {
  const normalized = input.trim()
  if (!normalized) {
    return ""
  }

  const aliases: Record<string, string> = {
    session_id: "sessionId",
    workspace_id: "workspaceId",
    shell_kind: "shellKind",
  }

  const lowered = normalized.toLowerCase()
  if (aliases[lowered]) {
    return aliases[lowered]
  }

  return normalized.replace(/[_-]([a-z])/gi, (_match, letter: string) => letter.toUpperCase())
}

function readPseudoTerminalCommandInput(input: Record<string, unknown>): string | undefined {
  const commandLikeValue = [
    input.command,
    input.text,
    input.commandPreview,
    input.commandChars,
    input.commandLines,
    input.script,
    input.cmd,
  ].find((value) => typeof value === "string" && value.trim())

  return typeof commandLikeValue === "string"
    ? commandLikeValue.trim()
    : undefined
}

function normalizePseudoToolParameterValue(input: string): unknown {
  const value = input.replace(/\r\n/g, "\n").trim()
  if (!value) {
    return ""
  }

  if (/^(true|false)$/i.test(value)) {
    return value.toLowerCase() === "true"
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value)
  }

  return value
}

function parsePseudoToolCallBlock(input: string): ParsedPseudoToolCall | undefined {
  const normalized = input.replace(/\r\n/g, "\n")
  const functionMatch = normalized.match(/<function=([^>\n]+)>/i)
  if (!functionMatch) {
    return undefined
  }

  const toolName = normalizePseudoToolName(functionMatch[1] ?? "")
  if (!toolName) {
    return undefined
  }

  const parameterPattern = /<parameter=([^>\n]+)>([\s\S]*?)<\/parameter>/gi
  const parsedInput: Record<string, unknown> = {}

  for (const match of normalized.matchAll(parameterPattern)) {
    const rawName = match[1]?.trim() ?? ""
    const name = normalizePseudoToolParameterName(rawName)
    if (!name) {
      continue
    }

    parsedInput[name] = normalizePseudoToolParameterValue(match[2] ?? "")
  }

  if (toolName === "terminal_create_session") {
    const label = typeof parsedInput.label === "string" ? parsedInput.label : undefined
    if (label && typeof parsedInput.title !== "string") {
      parsedInput.title = label
    }
    delete parsedInput.label
    return {
      toolName,
      input: sanitizePseudoToolInput(toolName, parsedInput),
    }
  }

  if (toolName === "terminal_execute" && typeof parsedInput.command !== "string") {
    const command = readPseudoTerminalCommandInput(parsedInput)
    if (command) {
      parsedInput.command = command
    }
  }

  return {
    toolName,
    input: sanitizePseudoToolInput(toolName, parsedInput),
  }
}

function sanitizePseudoToolInput(
  toolName: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const allowedKeys = toolName === "terminal_create_session"
    ? new Set(["workspaceId", "cwd", "title", "shellKind"])
    : toolName === "terminal_execute"
      ? new Set(["sessionId", "command"])
      : toolName === "terminal_read_output"
        ? new Set(["sessionId", "limit"])
        : toolName === "terminal_close_session"
          ? new Set(["sessionId"])
          : undefined

  if (!allowedKeys) {
    return input
  }

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!allowedKeys.has(key)) {
      continue
    }

    sanitized[key] = value
  }

  return sanitized
}

class TextProcessorHandle implements ProcessorHandle {
  private textBuffer = ""
  private reasoningBuffer = ""
  private usage?: ProcessorResult["usage"]
  private finishReason?: ProcessorResult["finishReason"]
  private terminalError?: KernelError
  private readonly toolCalls: ToolCallRecord[] = []
  private terminalErrorPersisted = false
  private assistantMessagePersisted = false
  private readonly pseudoToolCallRecoveryEnabled: boolean

  constructor(
    private readonly options: TextStreamProcessorOptions,
    private readonly start: ProcessorStartInput,
  ) {
    this.pseudoToolCallRecoveryEnabled = shouldRecoverPseudoToolCalls(start)
  }

  async accept(event: AiTurnEvent): Promise<void> {
    switch (event.type) {
      case "text.start":
        return
      case "text.delta":
        this.textBuffer += event.delta
        await this.flushTextBuffer()
        return
      case "text.end":
        await this.flushTextBuffer()
        return
      case "reasoning.start":
        return
      case "reasoning.delta":
        this.reasoningBuffer += event.delta
        await this.flushReasoningBuffer()
        return
      case "reasoning.end":
        await this.flushReasoningBuffer()
        return
      case "tool.call":
        await this.flushTextBuffer()
        await this.flushReasoningBuffer()
        await this.recordToolCall(event)
        return
      case "usage":
        this.usage = event.usage
        return
      case "finish":
        this.finishReason = event.reason
        return
      case "error":
        this.terminalError = withProcessorFailureMetadata({
          error: event.error,
          turn: this.start.turn,
          phase: "model_stream",
          failureKind: "model",
        })
        return
    }
  }

  async complete(): Promise<ProcessorResult> {
    await this.flushTextBuffer()
    await this.flushReasoningBuffer()

    if (this.terminalError) {
      if (!SUPPRESSED_TERMINAL_ERROR_CODES.has(this.terminalError.code)) {
        await this.persistTerminalError()
      }
      if (this.terminalError.code === "context_overflow") {
        return {
          finishReason: this.finishReason ?? "error",
          usage: this.usage,
          toolCalls: this.toolCalls,
          boundary: {
            kind: "awaiting_compaction",
            reason: "context_overflow",
          },
        }
      }

      if (this.terminalError.code === "budget_exceeded") {
        return {
          finishReason: this.finishReason ?? "error",
          usage: this.usage,
          toolCalls: this.toolCalls,
          boundary: {
            kind: "awaiting_compaction",
            reason: "budget_exceeded",
          },
        }
      }

      return {
        finishReason: this.finishReason ?? "error",
        usage: this.usage,
        toolCalls: this.toolCalls,
        boundary: {
          kind: "failed",
          error: this.terminalError,
        },
      }
    }

    if (this.finishReason === "error") {
      return {
        finishReason: this.finishReason,
        usage: this.usage,
        toolCalls: this.toolCalls,
        boundary: {
          kind: "failed",
          error: withProcessorFailureMetadata({
            error: {
              code: "model_error",
              message: "Model finished with an error finish reason",
            },
            turn: this.start.turn,
            phase: "model_completion",
            failureKind: "model",
          }),
        },
      }
    }

    if (this.finishReason === "tool_calls" || this.toolCalls.length > 0) {
      return {
        finishReason: this.finishReason,
        usage: this.usage,
        toolCalls: this.toolCalls,
        boundary: {
          kind: "continue",
        },
      }
    }

    return {
      finishReason: this.finishReason,
      usage: this.usage,
      toolCalls: this.toolCalls,
      boundary: {
        kind: "completed",
      },
    }
  }

  async fail(error: unknown): Promise<ProcessorResult> {
    const normalized = normalizeKernelError(error)
    this.terminalError = withProcessorFailureMetadata({
      error: normalized,
      turn: this.start.turn,
      phase: "stream_processing",
      failureKind: normalized.code === "stream_processing_error" ? "processor" : "model",
    })
    return this.complete()
  }

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

  private async flushTextBuffer(): Promise<void> {
    if (this.textBuffer.length === 0) {
      return
    }

    if (!this.pseudoToolCallRecoveryEnabled) {
      await this.persistTextPart(this.textBuffer)
      this.textBuffer = ""
      return
    }

    while (this.textBuffer.length > 0) {
      const lower = this.textBuffer.toLowerCase()
      const blockStart = lower.indexOf(PSEUDO_TOOL_CALL_OPEN_TAG_LOWER)
      if (blockStart < 0) {
        const safePlainTextEnd = findPseudoToolMarkupTailStart(this.textBuffer)
        if (safePlainTextEnd > 0) {
          const plainText = this.textBuffer.slice(0, safePlainTextEnd)
          this.textBuffer = this.textBuffer.slice(safePlainTextEnd)
          await this.persistTextPart(plainText)
        }
        return
      }

      if (blockStart > 0) {
        const plainText = this.textBuffer.slice(0, blockStart)
        this.textBuffer = this.textBuffer.slice(blockStart)
        await this.persistTextPart(plainText)
        continue
      }

      const blockEnd = lower.indexOf(PSEUDO_TOOL_CALL_CLOSE_TAG_LOWER)
      if (blockEnd < 0) {
        return
      }

      const completeBlockEnd = blockEnd + PSEUDO_TOOL_CALL_CLOSE_TAG.length
      const block = this.textBuffer.slice(0, completeBlockEnd)
      this.textBuffer = this.textBuffer.slice(completeBlockEnd)
      const parsed = parsePseudoToolCallBlock(block)

      if (!parsed) {
        await this.persistTextPart(block)
        continue
      }

      await this.recordToolCall({
        type: "tool.call",
        toolCallId: asToolCallId(this.options.idGenerator.next("tool_call")),
        toolName: parsed.toolName,
        input: parsed.input,
      })
    }
  }

  private async flushReasoningBuffer(): Promise<void> {
    if (this.reasoningBuffer.length === 0) {
      return
    }

    const part: MessagePart = {
      id: asMessagePartId(this.options.idGenerator.next("part")),
      type: "reasoning",
      text: this.reasoningBuffer,
    }

    this.reasoningBuffer = ""
    await this.persistAssistantParts([part])
    await this.publishEvent("message.parts.appended", {
      message: this.start.assistantMessage,
      parts: [part],
    })
  }

  private async recordToolCall(event: Extract<AiTurnEvent, { type: "tool.call" }>): Promise<void> {
    const now = this.options.clock.now()
    await this.ensureAssistantMessagePersisted()
    const call: ToolCallRecord = {
      id: asToolCallId(event.toolCallId),
      sessionId: this.start.session.id,
      runId: this.start.run.id,
      turnId: this.start.turn.id,
      messageId: this.start.assistantMessage.id,
      toolName: event.toolName,
      input: event.input,
      status: "pending",
      startedAt: now,
      updatedAt: now,
    }

    await this.options.toolCallStore.save(call)
    this.toolCalls.push(call)
    const part: MessagePart = {
      id: asMessagePartId(this.options.idGenerator.next("part")),
      type: "tool_call_ref",
      toolCallId: call.id,
      toolName: call.toolName,
      input: call.input,
    }
    await this.persistAssistantParts([part])
    await this.publishEvent("message.parts.appended", {
      message: this.start.assistantMessage,
      parts: [part],
    })
    await this.publishEvent("tool-call.updated", {
      toolCall: call,
    })
  }

  private async ensureAssistantMessagePersisted(): Promise<void> {
    if (this.assistantMessagePersisted) {
      return
    }

    await this.options.messageStore.append(this.start.assistantMessage, [])
    this.assistantMessagePersisted = true
  }

  private async persistTerminalError(): Promise<void> {
    if (!this.terminalError || this.terminalErrorPersisted) {
      return
    }

    this.terminalErrorPersisted = true
    const part: MessagePart = {
      id: asMessagePartId(this.options.idGenerator.next("part")),
      type: "error",
      error: this.terminalError,
    }
    await this.persistAssistantParts([part])
    await this.publishEvent("message.parts.appended", {
      message: this.start.assistantMessage,
      parts: [part],
    })
  }

  private async persistAssistantParts(parts: readonly MessagePart[]): Promise<void> {
    if (parts.length === 0) {
      return
    }

    if (!this.assistantMessagePersisted) {
      await this.options.messageStore.append(this.start.assistantMessage, parts)
      this.assistantMessagePersisted = true
      return
    }

    await this.options.messageStore.appendParts(this.start.assistantMessage.id, parts)
  }

  private async persistTextPart(text: string): Promise<void> {
    if (!text) {
      return
    }

    const part: MessagePart = {
      id: asMessagePartId(this.options.idGenerator.next("part")),
      type: "text",
      text,
    }

    await this.persistAssistantParts([part])
    await this.publishEvent("message.parts.appended", {
      message: this.start.assistantMessage,
      parts: [part],
    })
  }
}

export class TextStreamProcessor implements StreamProcessorPort {
  constructor(private readonly options: TextStreamProcessorOptions) {}

  async start(input: ProcessorStartInput): Promise<ProcessorHandle> {
    return new TextProcessorHandle(this.options, input)
  }
}
