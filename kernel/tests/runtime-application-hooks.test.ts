import { describe, expect, it } from "bun:test"
import { createServiceCollection } from "../ioc"
import {
  asRunId,
  asSessionId,
  type RunRecord,
  type SessionRecord,
} from "../src/core"
import {
  CONVERSATION_OUTPUT_DELIVERY_HOOK,
  CONVERSATION_OUTPUT_PROJECTION_HOOK,
  CONVERSATION_RUNTIME_EVENT_DELIVERY_HOOK,
  CONVERSATION_RUNTIME_EVENT_PROJECTION_HOOK,
  CONVERSATION_SNAPSHOT_DELIVERY_HOOK,
  CONVERSATION_SNAPSHOT_PROJECTION_HOOK,
  CONVERSATION_WARMUP_HOOK,
  ConversationRuntimeService,
  buildConversationApplicationPorts,
  buildConversationRunSnapshot,
  type ConversationRuntimeEvent,
  type ConversationTurnOutput,
} from "../src/host/application"

function buildConversationOutput(): ConversationTurnOutput {
  const session: SessionRecord = {
    id: asSessionId("session_application_hooks"),
    title: "Application Hooks",
    status: "active",
    createdAt: 1,
    updatedAt: 2,
    metadata: {
      workspaceId: "workspace-1",
    },
  }

  const run: RunRecord = {
    id: asRunId("run_application_hooks"),
    sessionId: session.id,
    status: "completed",
    startedAt: 10,
    updatedAt: 20,
    completedAt: 20,
    trigger: {
      kind: "user_message",
    },
    metadata: {
      channelSelection: {
        channelId: "chat",
      },
    },
  }

  return {
    session,
    run,
    boundary: {
      kind: "completed",
    },
    messages: [],
    toolCalls: [],
    interactions: [],
    checkpoints: [],
  }
}

function buildRuntimeEvent(output: ConversationTurnOutput): ConversationRuntimeEvent {
  const snapshot = buildConversationRunSnapshot(output)
  return {
    type: "run.started",
    eventId: "evt-1",
    occurredAt: 10,
    sessionId: snapshot.session.sessionId,
    runId: snapshot.run.runId,
    run: snapshot.run,
  }
}

describe("runtime application hooks", () => {
  it("composes warmup, projection, delivery, snapshot, and runtime event hooks from IOC", async () => {
    const trace: string[] = []
    const services = createServiceCollection()

    services.addSingleton(CONVERSATION_WARMUP_HOOK, {
      useValue: {
        warm: async (input) => {
          trace.push(`warm:${input.reason}:${input.workspaceId}`)
        },
      },
      source: "warmup",
    })
    services.addSingleton(CONVERSATION_OUTPUT_PROJECTION_HOOK, {
      useValue: {
        apply: async (output) => {
          trace.push(`projection:first:${output.run.id}`)
        },
      },
      order: 10,
      source: "projection.first",
    })
    services.addSingleton(CONVERSATION_OUTPUT_PROJECTION_HOOK, {
      useValue: {
        apply: async (output) => {
          trace.push(`projection:second:${output.run.id}`)
        },
      },
      order: 30,
      source: "projection.second",
    })
    services.addSingleton(CONVERSATION_OUTPUT_DELIVERY_HOOK, {
      useValue: {
        publish: async (output) => {
          trace.push(`delivery:${output.run.id}`)
        },
      },
      source: "delivery",
    })
    services.addSingleton(CONVERSATION_SNAPSHOT_PROJECTION_HOOK, {
      useValue: {
        apply: async (snapshot) => {
          trace.push(`snapshot-projection:${snapshot.run.runId}`)
        },
      },
      source: "snapshot.projection",
    })
    services.addSingleton(CONVERSATION_SNAPSHOT_DELIVERY_HOOK, {
      useValue: {
        publish: async (snapshot) => {
          trace.push(`snapshot-delivery:${snapshot.run.runId}`)
        },
      },
      source: "snapshot.delivery",
    })
    services.addSingleton(CONVERSATION_RUNTIME_EVENT_PROJECTION_HOOK, {
      useValue: {
        apply: async (events) => {
          trace.push(`event-projection:${events[0]?.type}`)
        },
      },
      source: "event.projection",
    })
    services.addSingleton(CONVERSATION_RUNTIME_EVENT_DELIVERY_HOOK, {
      useValue: {
        publish: async (events) => {
          trace.push(`event-delivery:${events[0]?.type}`)
        },
      },
      source: "event.delivery",
    })

    const container = services.buildServiceProvider()
    const ports = buildConversationApplicationPorts(container)
    const output = buildConversationOutput()
    const snapshot = buildConversationRunSnapshot(output)
    const event = buildRuntimeEvent(output)

    await ports.warmup?.warm({
      reason: "startup",
      workspaceId: "workspace-1",
    })
    await ports.projection?.apply(output)
    await ports.delivery?.publish(output)
    await ports.snapshotProjection?.apply(snapshot)
    await ports.snapshotDelivery?.publish(snapshot)
    await ports.runtimeEventProjection?.apply([event])
    await ports.runtimeEventDelivery?.publish([event])

    expect(trace).toEqual([
      "warm:startup:workspace-1",
      "projection:first:run_application_hooks",
      "projection:second:run_application_hooks",
      "delivery:run_application_hooks",
      "snapshot-projection:run_application_hooks",
      "snapshot-delivery:run_application_hooks",
      "event-projection:run.started",
      "event-delivery:run.started",
    ])
  })

  it("lets ConversationRuntimeService delegate warmup through application ports", async () => {
    const trace: string[] = []
    const services = createServiceCollection()

    services.addSingleton(CONVERSATION_WARMUP_HOOK, {
      useValue: {
        warm: async (input) => {
          trace.push(`service-warm:${input.reason}:${input.workspaceId}`)
        },
      },
      source: "warmup.service",
    })

    const container = services.buildServiceProvider()
    const ports = buildConversationApplicationPorts(container)
    const service = new ConversationRuntimeService({
      sessionStore: {
        get: async () => {
          throw new Error("not used")
        },
      } as never,
      aiRouteResolver: {
        resolve: async () => {
          throw new Error("not used")
        },
      },
      runLifecycleService: {
        start: async () => {
          throw new Error("not used")
        },
      },
      runResumeService: {
        resume: async () => {
          throw new Error("not used")
        },
      },
      outputLoader: {
        load: async () => {
          throw new Error("not used")
        },
      } as never,
      warmup: ports.warmup,
    })

    await service.warm({
      reason: "restore-state",
      workspaceId: "workspace-2",
    })

    expect(trace).toEqual([
      "service-warm:restore-state:workspace-2",
    ])
  })
})