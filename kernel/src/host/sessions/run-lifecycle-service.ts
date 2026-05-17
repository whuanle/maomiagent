import { asRunId, type ClockPort, type EventSinkPort, type IdGeneratorPort, type RunBoundary, type RunRecord, type RunStorePort, type RunTrigger, type SessionRecord, type SessionStorePort, type UnitOfWorkPort } from "../../core"
import { publishKernelEvents } from "../../adapters/events"
import type { WorkspaceBindingResolver } from "../workspace"
import type { SessionHostExecutionDisposition, SessionHostPort } from "./session-host"
import type { WorkspaceRuntimeHostPort } from "./workspace-runtime-host"
import {
  SessionExecutionCoordinator,
  type SessionExecutionCoordinatorPort,
} from "./session-execution-coordinator"
import type { WorkspaceRuntimeHealthPolicy } from "./workspace-runtime-health-policy"

type RunLifecycleServiceOptions = {
  sessionStore: SessionStorePort
  runStore: RunStorePort
  sessionHost: SessionHostPort
  unitOfWork: UnitOfWorkPort
  clock: ClockPort
  idGenerator: IdGeneratorPort
  eventSink?: EventSinkPort
  sessionExecutionCoordinator?: SessionExecutionCoordinatorPort
  workspaceBindingResolver?: WorkspaceBindingResolver
  workspaceRuntimeHost?: WorkspaceRuntimeHostPort<unknown>
  workspaceRuntimeHealthPolicy?: WorkspaceRuntimeHealthPolicy
  defaultExecutionDisposition?: SessionHostExecutionDisposition
}

export type StartRunInput = {
  sessionId: SessionRecord["id"]
  trigger: RunTrigger
  metadata?: RunRecord["metadata"]
  disposition?: SessionHostExecutionDisposition
  signal?: AbortSignal
}

export type RunLifecycleResult = {
  run: RunRecord
  boundary: RunBoundary
  execution: Awaited<ReturnType<SessionExecutionCoordinatorPort["start"]>>["execution"]
}

function buildRun(input: {
  sessionId: SessionRecord["id"]
  trigger: RunTrigger
  metadata?: RunRecord["metadata"]
  clock: ClockPort
  idGenerator: IdGeneratorPort
}): RunRecord {
  const now = input.clock.now()

  return {
    id: asRunId(input.idGenerator.next("run")),
    sessionId: input.sessionId,
    status: "created",
    startedAt: now,
    updatedAt: now,
    trigger: {
      ...input.trigger,
    },
    metadata: input.metadata ? { ...input.metadata } : undefined,
  }
}

export class RunLifecycleService {
  private readonly sessionExecutionCoordinator: SessionExecutionCoordinatorPort

  constructor(private readonly options: RunLifecycleServiceOptions) {
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

  async start(input: StartRunInput): Promise<RunLifecycleResult> {
    await this.options.sessionStore.get(input.sessionId)

    const run = buildRun({
      ...input,
      clock: this.options.clock,
      idGenerator: this.options.idGenerator,
    })

    await this.options.unitOfWork.transaction(async () => {
      await this.options.runStore.save(run)
    })
    await publishKernelEvents({
      events: [{
        type: "run.started",
        payload: {
          run,
        },
      }],
      eventSink: this.options.eventSink,
      clock: this.options.clock,
      idGenerator: this.options.idGenerator,
    })

    const execution = await this.sessionExecutionCoordinator.start({
      sessionId: run.sessionId,
      runId: run.id,
      disposition: input.disposition,
      signal: input.signal,
    })

    return {
      run: execution.run,
      boundary: execution.boundary,
      execution: execution.execution,
    }
  }
}
