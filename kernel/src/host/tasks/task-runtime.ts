import type { InteractionId, KernelError, RunId, SessionId } from "../../core"
import type {
  ChildSessionOutcome,
  ChildSessionResolutionMetadata,
  ChildSessionRunnerPort,
} from "./child-session"

export const TASK_RUNTIME_KIND_VALUES = [
  "task",
  "todo",
  "checkpoint",
] as const

export type TaskRuntimeKind = (typeof TASK_RUNTIME_KIND_VALUES)[number]

export type TaskExecutionStatus = ChildSessionOutcome["kind"]

export type TaskExecutionRecord = {
  taskId: string
  taskKind: TaskRuntimeKind
  title: string
  prompt: string
  parentSessionId: SessionId
  childSessionId: SessionId
  childRunId?: RunId
  status: TaskExecutionStatus
  outputText?: string
  interactionId?: InteractionId
  error?: KernelError
  timeoutMs?: number
  resolutionMetadata?: ChildSessionResolutionMetadata
  metadata?: Readonly<Record<string, unknown>>
}

export type RunTaskInput = {
  parentSessionId: SessionId
  taskId: string
  title: string
  prompt: string
  taskKind?: TaskRuntimeKind
  metadata?: Readonly<Record<string, unknown>>
  timeoutMs?: number
  signal?: AbortSignal
}

type TaskRuntimeOptions = {
  childSessionRunner: ChildSessionRunnerPort
}

function mapChildOutcome(record: TaskExecutionRecord, outcome: ChildSessionOutcome): TaskExecutionRecord {
  switch (outcome.kind) {
    case "completed":
      return {
        ...record,
        resolutionMetadata: outcome.metadata,
      }
    case "blocked":
      return {
        ...record,
        interactionId: outcome.interactionId,
        resolutionMetadata: outcome.metadata,
      }
    case "failed":
      return {
        ...record,
        error: outcome.error,
        resolutionMetadata: outcome.metadata,
      }
    case "timed_out":
      return {
        ...record,
        timeoutMs: outcome.timeoutMs,
        resolutionMetadata: outcome.metadata,
      }
    case "cancelled":
      return {
        ...record,
        resolutionMetadata: outcome.metadata,
      }
    default:
      return record
  }
}

export class TaskRuntime {
  constructor(private readonly options: TaskRuntimeOptions) {}

  async runTask(input: RunTaskInput): Promise<TaskExecutionRecord> {
    const taskKind = input.taskKind ?? "task"
    const childSession = await this.options.childSessionRunner.run({
      parentSessionId: input.parentSessionId,
      title: input.title,
      sessionMetadata: {
        taskId: input.taskId,
        taskKind,
        ...(input.metadata ? { ...input.metadata } : {}),
      },
      runMetadata: {
        taskId: input.taskId,
        taskKind,
      },
      timeoutMs: input.timeoutMs,
      signal: input.signal,
      initialMessages: [
        {
          role: "user",
          parts: [
            {
              type: "text",
              text: input.prompt,
            },
          ],
          metadata: {
            taskId: input.taskId,
            taskKind,
          },
        },
      ],
    })

    return mapChildOutcome({
      taskId: input.taskId,
      taskKind,
      title: input.title,
      prompt: input.prompt,
      parentSessionId: input.parentSessionId,
      childSessionId: childSession.session.id,
      childRunId: childSession.run?.id,
      status: childSession.outcome.kind,
      outputText: childSession.lastAssistantText,
      metadata: input.metadata ? { ...input.metadata } : undefined,
    }, childSession.outcome)
  }
}
