import type {
  KernelError,
  ToolCallRecord,
  ToolDescriptor,
  ToolExecutionContext,
  ToolExecutionOutcome,
  ToolExecutorPort,
} from "../../core"
import { ToolCancelledError, ToolTimeoutError, runToolWithTimeout } from "./tool-timeout-guard"
import { normalizeToolOutput } from "./tool-output-normalizer"
import { normalizeToolInputForSchema, validateToolInputSchema } from "./tool-schema-validator"

export type ToolHandlerContext = ToolExecutionContext & {
  descriptor: ToolDescriptor
  signal: AbortSignal
}

export type ToolHandlerResult = unknown | ToolExecutionOutcome

export type RegisteredToolHandler = {
  descriptor: ToolDescriptor
  timeoutMs?: number
  execute(input: {
    call: ToolCallRecord
    context: ToolHandlerContext
  }): Promise<ToolHandlerResult>
}

type LocalToolExecutorOptions = {
  handlers: readonly RegisteredToolHandler[]
  defaultTimeoutMs?: number
}

function isToolExecutionOutcome(value: unknown): value is ToolExecutionOutcome {
  return !!value
    && typeof value === "object"
    && !Array.isArray(value)
    && typeof (value as Record<string, unknown>).kind === "string"
    && (
      (value as Record<string, unknown>).kind === "completed"
      || (value as Record<string, unknown>).kind === "blocked"
      || (value as Record<string, unknown>).kind === "failed"
    )
}

function buildFailedOutcome(error: KernelError): ToolExecutionOutcome {
  return {
    kind: "failed",
    error,
  }
}

function normalizeThrownToolError(toolName: string, error: unknown): KernelError {
  const errorStack = error instanceof Error
    ? error.stack
    : error && typeof error === "object" && typeof (error as Record<string, unknown>).stack === "string"
      ? (error as Record<string, unknown>).stack as string
      : undefined

  if (error instanceof ToolTimeoutError) {
    return {
      code: "tool_timeout",
      message: error.message,
      retryable: false,
      metadata: {
        toolName,
        timeoutMs: error.timeoutMs,
        ...(errorStack ? { stack: errorStack } : {}),
      },
    }
  }

  if (error instanceof ToolCancelledError) {
    return {
      code: "tool_cancelled",
      message: error.message,
      retryable: true,
      metadata: {
        toolName,
      },
    }
  }

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
      metadata: {
        ...((error as Record<string, unknown>).metadata
          && typeof (error as Record<string, unknown>).metadata === "object"
          && !Array.isArray((error as Record<string, unknown>).metadata)
            ? (error as Record<string, unknown>).metadata as Record<string, unknown>
            : {}),
        ...(errorStack ? { stack: errorStack } : {}),
      },
    }
  }

  return {
    code: "tool_execution_failed",
    message: error instanceof Error ? error.message : `Tool ${toolName} failed`,
    retryable: false,
    metadata: {
      toolName,
      ...(errorStack ? { stack: errorStack } : {}),
    },
  }
}

export class LocalToolExecutor implements ToolExecutorPort {
  private readonly handlers: Map<string, RegisteredToolHandler>
  private readonly defaultTimeoutMs?: number

  constructor(options: LocalToolExecutorOptions) {
    this.handlers = new Map(options.handlers.map((handler) => [handler.descriptor.name, handler]))
    this.defaultTimeoutMs = options.defaultTimeoutMs
  }

  async execute(call: ToolCallRecord, context: ToolExecutionContext): Promise<ToolExecutionOutcome> {
    const handler = this.handlers.get(call.toolName)
    if (!handler) {
      return buildFailedOutcome({
        code: "tool_not_found",
        message: `Tool handler not found: ${call.toolName}`,
        retryable: false,
        metadata: {
          toolName: call.toolName,
        },
      })
    }

    const normalizedInput = normalizeToolInputForSchema({
      schema: handler.descriptor.inputSchema,
      value: call.input,
    })
    const validation = validateToolInputSchema({
      toolName: call.toolName,
      schema: handler.descriptor.inputSchema,
      value: normalizedInput,
    })
    if (!validation.ok) {
      return buildFailedOutcome(validation.error)
    }

    const normalizedCall: ToolCallRecord = {
      ...call,
      input: normalizedInput,
    }

    try {
      const rawResult = await runToolWithTimeout({
        timeoutMs: handler.timeoutMs ?? this.defaultTimeoutMs,
        work: async (signal) => handler.execute({
          call: normalizedCall,
          context: {
            ...context,
            descriptor: handler.descriptor,
            signal,
          },
        }),
      })

      if (isToolExecutionOutcome(rawResult)) {
        if (rawResult.kind === "completed") {
          return {
            kind: "completed",
            output: normalizeToolOutput(rawResult.output),
          }
        }

        return rawResult
      }

      return {
        kind: "completed",
        output: normalizeToolOutput(rawResult),
      }
    } catch (error) {
      return buildFailedOutcome(normalizeThrownToolError(call.toolName, error))
    }
  }
}
