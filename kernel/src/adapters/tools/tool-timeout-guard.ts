type ToolTimeoutGuardInput<T> = {
  timeoutMs?: number
  signal?: AbortSignal
  work: (signal: AbortSignal) => Promise<T>
}

export class ToolTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Tool execution timed out after ${timeoutMs}ms`)
    this.name = "ToolTimeoutError"
  }
}

export class ToolCancelledError extends Error {
  constructor(message = "Tool execution was cancelled") {
    super(message)
    this.name = "ToolCancelledError"
  }
}

export async function runToolWithTimeout<T>(input: ToolTimeoutGuardInput<T>): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const onAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(input.signal?.reason ?? "tool_execution_cancelled")
    }
  }

  if (input.signal) {
    if (input.signal.aborted) {
      onAbort()
    } else {
      input.signal.addEventListener("abort", onAbort, { once: true })
    }
  }

  const normalizedTimeoutMs =
    typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs)
      ? Math.max(0, Math.trunc(input.timeoutMs))
      : 0

  if (normalizedTimeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true
      if (!controller.signal.aborted) {
        controller.abort("tool_execution_timeout")
      }
    }, normalizedTimeoutMs)
  }

  try {
    const workPromise = input.work(controller.signal)
    const abortPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => {
        if (timedOut) {
          reject(new ToolTimeoutError(normalizedTimeoutMs))
          return
        }
        reject(new ToolCancelledError())
      }, { once: true })
    })

    return await Promise.race([workPromise, abortPromise])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    input.signal?.removeEventListener("abort", onAbort)
  }
}
