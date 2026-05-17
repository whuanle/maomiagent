import {
  createKernelFailure,
  type ClockPort,
  type RunBoundary,
  type RunRecord,
  type RunStorePort,
  type RunTrigger,
  type SessionRecord,
  type SessionStorePort,
  type UnitOfWorkPort,
} from "../../core"
import type { WorkspaceBindingResolver } from "../workspace"
import type { SessionHostExecutionDisposition, SessionHostPort } from "./session-host"
import type { WorkspaceRuntimeHostPort } from "./workspace-runtime-host"
import {
  SessionExecutionCoordinator,
  type SessionExecutionCoordinatorPort,
} from "./session-execution-coordinator"
import type { WorkspaceRuntimeHealthPolicy } from "./workspace-runtime-health-policy"

type RunResumeServiceOptions = {
  sessionStore: SessionStorePort
  runStore: RunStorePort
  sessionHost: SessionHostPort
  unitOfWork: UnitOfWorkPort
  clock: ClockPort
  sessionExecutionCoordinator?: SessionExecutionCoordinatorPort
  workspaceBindingResolver?: WorkspaceBindingResolver
  workspaceRuntimeHost?: WorkspaceRuntimeHostPort<unknown>
  workspaceRuntimeHealthPolicy?: WorkspaceRuntimeHealthPolicy
  defaultExecutionDisposition?: SessionHostExecutionDisposition
}

export type RunResumeDescriptor = {
  sessionId: SessionRecord["id"]
  runId: RunRecord["id"]
  trigger: RunTrigger
  disposition?: SessionHostExecutionDisposition
}

export type RunResumeResult = {
  run: RunRecord
  boundary: RunBoundary
  execution: Awaited<ReturnType<SessionExecutionCoordinatorPort["resume"]>>["execution"]
}

function assertResumableRun(run: RunRecord): void {
  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
    throw createKernelFailure({
      code: "run_not_resumable",
      message: `Kernel run is not resumable: ${run.id}`,
      retryable: false,
      phase: "run_resume_validation",
      failureKind: "protocol",
      metadata: {
        runId: run.id,
        sessionId: run.sessionId,
        runStatus: run.status,
      },
    })
  }
}

export class RunResumeService {
  private readonly sessionExecutionCoordinator: SessionExecutionCoordinatorPort

  constructor(private readonly options: RunResumeServiceOptions) {
    this.sessionExecutionCoordinator = options.sessionExecutionCoordinator
      ?? new SessionExecutionCoordinator({
        sessionStore: options.sessionStore,
        runStore: options.runStore,
        sessionHost: options.sessionHost,
        workspaceBindingResolver: options.workspaceBindingResolver,
        workspaceRuntimeHost: options.workspaceRuntimeHost,
        workspaceRuntimeHealthPolicy: options.workspaceRuntimeHealthPolicy,
        defaultDisposition: options.defaultExecutionDisposition,
      })
  }

  async resume(input: RunResumeDescriptor): Promise<RunResumeResult> {
    const session = await this.options.sessionStore.get(input.sessionId)
    const run = await this.options.runStore.get(input.runId)

    if (run.sessionId !== session.id) {
      throw createKernelFailure({
        code: "run_resume_session_mismatch",
        message: `Kernel run ${run.id} does not belong to session ${session.id}`,
        retryable: false,
        phase: "run_resume_validation",
        failureKind: "protocol",
        metadata: {
          runId: run.id,
          runSessionId: run.sessionId,
          sessionId: session.id,
          triggerKind: input.trigger.kind,
        },
      })
    }

    assertResumableRun(run)

    const now = this.options.clock.now()
    const nextRun: RunRecord = {
      ...run,
      status: "planning",
      updatedAt: now,
      trigger: {
        ...input.trigger,
      },
    }
    const nextSession: SessionRecord = {
      ...session,
      status: "active",
      updatedAt: now,
    }

    await this.options.unitOfWork.transaction(async () => {
      await this.options.sessionStore.save(nextSession)
      await this.options.runStore.save(nextRun)
    })

    const execution = await this.sessionExecutionCoordinator.resume({
      sessionId: nextSession.id,
      runId: nextRun.id,
      disposition: input.disposition,
    })

    return {
      run: execution.run,
      boundary: execution.boundary,
      execution: execution.execution,
    }
  }
}
