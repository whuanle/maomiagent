import type { RunBoundary } from "../run"
import type { KernelEventPayloadMap, KernelEventType } from "../events"
import { asEventId } from "../ids"
import { createKernelFailure } from "../failure"
import { createRejectedInteractionResponse, type InteractionRecord } from "./index"
import type {
  ClockPort,
  EventSinkPort,
  IdGeneratorPort,
  InteractionCoordinatorPort,
  InteractionStorePort,
  RunStorePort,
  SessionStorePort,
  UnitOfWorkPort,
} from "../ports"

type InteractionCoordinatorOptions = {
  interactionStore: InteractionStorePort
  runStore: RunStorePort
  sessionStore: SessionStorePort
  unitOfWork: UnitOfWorkPort
  clock: ClockPort
  idGenerator?: IdGeneratorPort
  eventSink?: EventSinkPort
}

export class InteractionCoordinator implements InteractionCoordinatorPort {
  constructor(private readonly options: InteractionCoordinatorOptions) {}

  private async publishEvent<TType extends KernelEventType>(
    type: TType,
    payload: KernelEventPayloadMap[TType],
  ): Promise<void> {
    if (!this.options.eventSink || !this.options.idGenerator) {
      return
    }

    await this.options.eventSink.publish([{
      id: asEventId(this.options.idGenerator.next("event")),
      type,
      occurredAt: this.options.clock.now(),
      payload,
    }])
  }

  async block(input: {
    interaction: InteractionRecord
    runId: InteractionRecord["runId"]
    sessionId: InteractionRecord["sessionId"]
  }): Promise<RunBoundary> {
    const now = this.options.clock.now()
    const run = await this.options.runStore.get(input.runId)
    const session = await this.options.sessionStore.get(input.sessionId)

    if (run.sessionId !== session.id) {
      throw createKernelFailure({
        code: "interaction_run_session_mismatch",
        message: `Kernel run ${run.id} does not belong to session ${session.id}`,
        retryable: false,
        phase: "interaction_block_validation",
        failureKind: "protocol",
        metadata: {
          interactionId: input.interaction.id,
          runId: run.id,
          runSessionId: run.sessionId,
          sessionId: session.id,
          interactionSessionId: input.interaction.sessionId,
        },
      })
    }

    const interaction: InteractionRecord = {
      ...input.interaction,
      status: "pending",
      updatedAt: now,
    }

    await this.options.unitOfWork.transaction(async () => {
      await this.options.interactionStore.save(interaction)
      await this.options.runStore.save({
        ...run,
        status: "blocked",
        updatedAt: now,
      })
      await this.options.sessionStore.save({
        ...session,
        status: "active",
        updatedAt: now,
      })
    })
    await this.publishEvent("interaction.updated", {
      interaction,
    })
    await this.publishEvent("run.blocked", {
      run: {
        ...run,
        status: "blocked",
        updatedAt: now,
      },
      boundary: {
        kind: "blocked",
        interactionId: interaction.id,
      },
    })

    return {
      kind: "blocked",
      interactionId: interaction.id,
    }
  }

  async resume(input: {
    interactionId: InteractionRecord["id"]
    response: unknown
  }): Promise<void> {
    const interaction = await this.options.interactionStore.get(input.interactionId)
    const now = this.options.clock.now()

    await this.options.interactionStore.save({
      ...interaction,
      status: "answered",
      response: input.response,
      updatedAt: now,
    })
    await this.publishEvent("interaction.updated", {
      interaction: {
        ...interaction,
        status: "answered",
        response: input.response,
        updatedAt: now,
      },
    })
  }

  async reject(input: {
    interactionId: InteractionRecord["id"]
    reason?: string
  }): Promise<void> {
    const interaction = await this.options.interactionStore.get(input.interactionId)
    const now = this.options.clock.now()

    await this.options.interactionStore.save({
      ...interaction,
      status: "rejected",
      response: createRejectedInteractionResponse(input.reason),
      updatedAt: now,
    })
    await this.publishEvent("interaction.updated", {
      interaction: {
        ...interaction,
        status: "rejected",
        response: createRejectedInteractionResponse(input.reason),
        updatedAt: now,
      },
    })
  }
}
