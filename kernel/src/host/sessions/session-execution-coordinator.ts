import type { RunBoundary, RunRecord, RunStorePort, SessionRecord, SessionStorePort } from "../../core"
import { DefaultWorkspaceBindingResolver, type WorkspaceBinding, type WorkspaceBindingResolver } from "../workspace"
import type { SessionHostExecutionContext, SessionHostExecutionDisposition, SessionHostPort } from "./session-host"
import type { WorkspaceRuntimeHostPort } from "./workspace-runtime-host"
import {
  DefaultWorkspaceRuntimeHealthPolicy,
  type WorkspaceRuntimeHealthPolicy,
} from "./workspace-runtime-health-policy"

export type SessionExecutionResult = {
  run: RunRecord
  boundary: RunBoundary
  execution: SessionHostExecutionContext
}

export interface SessionExecutionCoordinatorPort {
  start(input: {
    sessionId: SessionRecord["id"]
    runId: RunRecord["id"]
    disposition?: SessionHostExecutionDisposition
    signal?: AbortSignal
  }): Promise<SessionExecutionResult>

  resume(input: {
    sessionId: SessionRecord["id"]
    runId: RunRecord["id"]
    disposition?: SessionHostExecutionDisposition
    signal?: AbortSignal
  }): Promise<SessionExecutionResult>
}

type SessionExecutionCoordinatorOptions = {
  sessionStore: SessionStorePort
  runStore: RunStorePort
  sessionHost: SessionHostPort
  workspaceBindingResolver?: WorkspaceBindingResolver
  workspaceRuntimeHost?: WorkspaceRuntimeHostPort<unknown>
  workspaceRuntimeHealthPolicy?: WorkspaceRuntimeHealthPolicy
  defaultDisposition?: SessionHostExecutionDisposition
}

function cloneBinding(binding: WorkspaceBinding | undefined): WorkspaceBinding | undefined {
  if (!binding) {
    return undefined
  }

  return {
    ...binding,
    ...(binding.metadata ? { metadata: { ...binding.metadata } } : {}),
  }
}

function buildExecutionContext(input: {
  mode: SessionHostExecutionContext["mode"]
  disposition: SessionHostExecutionDisposition
  binding?: WorkspaceBinding
  lease?: Awaited<ReturnType<WorkspaceRuntimeHostPort<unknown>["acquire"]>>
}): SessionHostExecutionContext {
  const binding = cloneBinding(input.binding)
  const identity = input.lease?.identity

  return {
    mode: input.mode,
    disposition: input.disposition,
    ...(binding ? { binding } : {}),
    ...((binding || input.lease)
      ? {
          workspaceRuntime: {
            ...(binding?.workspaceId || identity?.workspaceId
              ? { workspaceId: binding?.workspaceId ?? identity?.workspaceId }
              : {}),
            ...(binding?.executionWorkspaceId || identity?.executionWorkspaceId
              ? {
                  executionWorkspaceId:
                    binding?.executionWorkspaceId ?? identity?.executionWorkspaceId,
                }
              : {}),
            ...(binding?.workspaceRoot || identity?.workspaceRoot
              ? { workspaceRoot: binding?.workspaceRoot ?? identity?.workspaceRoot }
              : {}),
            ...(binding?.executionWorkspaceRoot || identity?.executionWorkspaceRoot
              ? {
                  executionWorkspaceRoot:
                    binding?.executionWorkspaceRoot ?? identity?.executionWorkspaceRoot,
                }
              : {}),
            ...(binding?.worktreeId || identity?.worktreeId
              ? { worktreeId: binding?.worktreeId ?? identity?.worktreeId }
              : {}),
            ...(binding?.worktreeRoot || identity?.worktreeRoot
              ? { worktreeRoot: binding?.worktreeRoot ?? identity?.worktreeRoot }
              : {}),
            ...(binding?.sandboxMode || identity?.sandboxMode
              ? { sandboxMode: binding?.sandboxMode ?? identity?.sandboxMode }
              : {}),
            ...(binding?.runtimeProfileSignature || identity?.runtimeProfileSignature
              ? {
                  runtimeProfileSignature:
                    binding?.runtimeProfileSignature ?? identity?.runtimeProfileSignature,
                }
              : {}),
            ...(binding?.source ? { bindingSource: binding.source } : {}),
            ...(input.lease?.hostId ? { hostId: input.lease.hostId } : {}),
            ...(input.lease?.leaseId ? { leaseId: input.lease.leaseId } : {}),
            ...(input.lease?.state ? { state: input.lease.state } : {}),
            ...(input.lease?.reason ? { reason: input.lease.reason } : {}),
            ...(typeof input.lease?.activeLeaseCount === "number"
              ? { activeLeaseCount: input.lease.activeLeaseCount }
              : {}),
          },
        }
      : {}),
  }
}

function mergeRunMetadata(input: {
  run: RunRecord
  execution: SessionHostExecutionContext
}): RunRecord {
  const workspaceRuntime = input.execution.workspaceRuntime
  if (!workspaceRuntime) {
    return input.run
  }

  return {
    ...input.run,
    metadata: {
      ...(input.run.metadata ? { ...input.run.metadata } : {}),
      workspaceRuntime: {
        ...workspaceRuntime,
        executionMode: input.execution.disposition,
      },
    },
  }
}

function withHostTransition(input: {
  execution: SessionHostExecutionContext
  transition: ReturnType<WorkspaceRuntimeHealthPolicy["evaluate"]>
}): SessionHostExecutionContext {
  if (!input.execution.workspaceRuntime) {
    return input.execution
  }

  return {
    ...input.execution,
    workspaceRuntime: {
      ...input.execution.workspaceRuntime,
      state: input.transition.nextState,
      ...(input.transition.reason ? { reason: input.transition.reason } : {}),
    },
  }
}

export class SessionExecutionCoordinator implements SessionExecutionCoordinatorPort {
  private readonly workspaceBindingResolver?: WorkspaceBindingResolver
  private readonly workspaceRuntimeHealthPolicy: WorkspaceRuntimeHealthPolicy
  private readonly defaultDisposition: SessionHostExecutionDisposition

  constructor(private readonly options: SessionExecutionCoordinatorOptions) {
    this.workspaceBindingResolver = options.workspaceBindingResolver
      ?? (options.workspaceRuntimeHost ? new DefaultWorkspaceBindingResolver() : undefined)
    this.workspaceRuntimeHealthPolicy = options.workspaceRuntimeHealthPolicy
      ?? new DefaultWorkspaceRuntimeHealthPolicy()
    this.defaultDisposition = options.defaultDisposition ?? "foreground"
  }

  async start(input: {
    sessionId: SessionRecord["id"]
    runId: RunRecord["id"]
    disposition?: SessionHostExecutionDisposition
    signal?: AbortSignal
  }): Promise<SessionExecutionResult> {
    return this.execute({
      sessionId: input.sessionId,
      runId: input.runId,
      mode: "start",
      disposition: input.disposition,
      signal: input.signal,
    })
  }

  async resume(input: {
    sessionId: SessionRecord["id"]
    runId: RunRecord["id"]
    disposition?: SessionHostExecutionDisposition
    signal?: AbortSignal
  }): Promise<SessionExecutionResult> {
    return this.execute({
      sessionId: input.sessionId,
      runId: input.runId,
      mode: "resume",
      disposition: input.disposition,
      signal: input.signal,
    })
  }

  private async execute(input: {
    sessionId: SessionRecord["id"]
    runId: RunRecord["id"]
    mode: SessionHostExecutionContext["mode"]
    disposition?: SessionHostExecutionDisposition
    signal?: AbortSignal
  }): Promise<SessionExecutionResult> {
    const session = await this.options.sessionStore.get(input.sessionId)
    const run = await this.options.runStore.get(input.runId)
    const binding = this.workspaceBindingResolver
      ? await this.workspaceBindingResolver.resolve({
          session,
          run,
        })
      : undefined
    const lease = this.options.workspaceRuntimeHost
      ? await this.options.workspaceRuntimeHost.acquire({
          sessionId: session.id,
          binding,
        })
      : undefined

    let execution = buildExecutionContext({
      mode: input.mode,
      disposition: input.disposition ?? this.defaultDisposition,
      binding,
      lease,
    })

    const runWithExecution = mergeRunMetadata({
      run,
      execution,
    })
    if (runWithExecution !== run) {
      await this.options.runStore.save(runWithExecution)
    }

    try {
      const boundary = input.mode === "start"
        ? await this.options.sessionHost.startRun({
            sessionId: session.id,
            runId: run.id,
            execution,
            signal: input.signal,
          })
        : await this.options.sessionHost.resumeRun({
            sessionId: session.id,
            runId: run.id,
            execution,
            signal: input.signal,
          })

      const transition = this.workspaceRuntimeHealthPolicy.evaluate({ boundary })
      execution = await this.applyHostTransition({
        execution,
        transition,
      })

      const persistedRun = mergeRunMetadata({
        run: await this.options.runStore.get(run.id),
        execution,
      })
      await this.options.runStore.save(persistedRun)

      return {
        run: persistedRun,
        boundary,
        execution,
      }
    } catch (error) {
      const transition = this.workspaceRuntimeHealthPolicy.evaluate({ error })
      execution = await this.applyHostTransition({
        execution,
        transition,
      })

      const persistedRun = mergeRunMetadata({
        run: await this.options.runStore.get(run.id),
        execution,
      })
      await this.options.runStore.save(persistedRun)

      throw error
    } finally {
      if (lease?.leaseId && this.options.workspaceRuntimeHost) {
        await this.options.workspaceRuntimeHost.release({
          leaseId: lease.leaseId,
        })
      }
    }
  }

  private async applyHostTransition(input: {
    execution: SessionHostExecutionContext
    transition: ReturnType<WorkspaceRuntimeHealthPolicy["evaluate"]>
  }): Promise<SessionHostExecutionContext> {
    const hostId = input.execution.workspaceRuntime?.hostId
    if (!hostId || !this.options.workspaceRuntimeHost) {
      return withHostTransition(input)
    }

    if (input.transition.nextState === "ready") {
      this.options.workspaceRuntimeHost.markReady({ hostId })
    } else if (input.transition.nextState === "suspect") {
      this.options.workspaceRuntimeHost.markSuspect({
        hostId,
        reason: input.transition.reason,
      })
    } else {
      this.options.workspaceRuntimeHost.markBroken({
        hostId,
        reason: input.transition.reason,
      })
    }

    return withHostTransition(input)
  }
}