import type { SessionId } from "../../core"
import type { TaskExecutionRecord } from "./task-runtime"
import { TaskRuntime } from "./task-runtime"

export type RunCheckpointInput = {
  parentSessionId: SessionId
  checkpointId: string
  title: string
  prompt: string
  metadata?: Readonly<Record<string, unknown>>
  timeoutMs?: number
  signal?: AbortSignal
}

type CheckpointRuntimeOptions = {
  taskRuntime: TaskRuntime
}

export class CheckpointRuntime {
  constructor(private readonly options: CheckpointRuntimeOptions) {}

  async runCheckpoint(input: RunCheckpointInput): Promise<TaskExecutionRecord> {
    return this.options.taskRuntime.runTask({
      parentSessionId: input.parentSessionId,
      taskId: input.checkpointId,
      title: input.title,
      prompt: input.prompt,
      taskKind: "checkpoint",
      timeoutMs: input.timeoutMs,
      signal: input.signal,
      metadata: {
        checkpointId: input.checkpointId,
        ...(input.metadata ? { ...input.metadata } : {}),
      },
    })
  }
}
