import type { SessionId } from "../../core"
import type { TaskExecutionRecord } from "./task-runtime"
import { TaskRuntime } from "./task-runtime"

export type RunTodoInput = {
  parentSessionId: SessionId
  todoId: string
  title: string
  prompt: string
  metadata?: Readonly<Record<string, unknown>>
  timeoutMs?: number
  signal?: AbortSignal
}

type TodoRuntimeOptions = {
  taskRuntime: TaskRuntime
}

export class TodoRuntime {
  constructor(private readonly options: TodoRuntimeOptions) {}

  async runTodo(input: RunTodoInput): Promise<TaskExecutionRecord> {
    return this.options.taskRuntime.runTask({
      parentSessionId: input.parentSessionId,
      taskId: input.todoId,
      title: input.title,
      prompt: input.prompt,
      taskKind: "todo",
      timeoutMs: input.timeoutMs,
      signal: input.signal,
      metadata: {
        todoId: input.todoId,
        ...(input.metadata ? { ...input.metadata } : {}),
      },
    })
  }
}
