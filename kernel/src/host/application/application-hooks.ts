import { createServiceNamespace, type DependencyResolver } from "../../../ioc"
import type { KernelMetadata, SessionRecord } from "../../core"
import type { ChannelSelection } from "../../../ai/channels"
import type {
  ConversationRunSnapshot,
  ConversationRuntimeEvent,
} from "./conversation-message-protocol"
import type {
  ConversationRuntimeEventDeliveryPort,
  ConversationRuntimeEventProjectionPort,
} from "./conversation-runtime-event-projector"
import type {
  ConversationDeliveryPort,
  ConversationProjectionPort,
  ConversationSnapshotDeliveryPort,
  ConversationSnapshotProjectionPort,
} from "./index"

const applicationHooks = createServiceNamespace("runtime.application.hooks")

export const CONVERSATION_OUTPUT_PROJECTION_HOOK =
  applicationHooks.token<ConversationProjectionPort>("conversation.output.projection")

export const CONVERSATION_OUTPUT_DELIVERY_HOOK =
  applicationHooks.token<ConversationDeliveryPort>("conversation.output.delivery")

export const CONVERSATION_SNAPSHOT_PROJECTION_HOOK =
  applicationHooks.token<ConversationSnapshotProjectionPort>("conversation.snapshot.projection")

export const CONVERSATION_SNAPSHOT_DELIVERY_HOOK =
  applicationHooks.token<ConversationSnapshotDeliveryPort>("conversation.snapshot.delivery")

export const CONVERSATION_RUNTIME_EVENT_PROJECTION_HOOK =
  applicationHooks.token<ConversationRuntimeEventProjectionPort>("conversation.runtime-event.projection")

export const CONVERSATION_RUNTIME_EVENT_DELIVERY_HOOK =
  applicationHooks.token<ConversationRuntimeEventDeliveryPort>("conversation.runtime-event.delivery")

export const CONVERSATION_WARMUP_HOOK =
  applicationHooks.token<ConversationWarmupHook>("conversation.warmup")

export const CONVERSATION_RUNTIME_WARMUP_REASON_VALUES = [
  "startup",
  "restore-state",
  "workspace-activation",
  "session-activation",
  "preload",
] as const

export type ConversationRuntimeWarmupReason =
  (typeof CONVERSATION_RUNTIME_WARMUP_REASON_VALUES)[number]

export type ConversationRuntimeWarmupInput = {
  reason: ConversationRuntimeWarmupReason
  workspaceId?: string
  sessionId?: SessionRecord["id"]
  selection?: ChannelSelection
  metadata?: KernelMetadata
}

export interface ConversationWarmupHook {
  warm(input: ConversationRuntimeWarmupInput): Promise<void>
}

export interface ConversationWarmupCoordinatorPort {
  warm(input: ConversationRuntimeWarmupInput): Promise<void>
}

export type ConversationApplicationHookSet = {
  outputProjectionHooks: readonly ConversationProjectionPort[]
  outputDeliveryHooks: readonly ConversationDeliveryPort[]
  snapshotProjectionHooks: readonly ConversationSnapshotProjectionPort[]
  snapshotDeliveryHooks: readonly ConversationSnapshotDeliveryPort[]
  runtimeEventProjectionHooks: readonly ConversationRuntimeEventProjectionPort[]
  runtimeEventDeliveryHooks: readonly ConversationRuntimeEventDeliveryPort[]
  warmupHooks: readonly ConversationWarmupHook[]
}

export type ConversationApplicationPorts = {
  projection?: ConversationProjectionPort
  delivery?: ConversationDeliveryPort
  snapshotProjection?: ConversationSnapshotProjectionPort
  snapshotDelivery?: ConversationSnapshotDeliveryPort
  runtimeEventProjection?: ConversationRuntimeEventProjectionPort
  runtimeEventDelivery?: ConversationRuntimeEventDeliveryPort
  warmup?: ConversationWarmupCoordinatorPort
}

async function applyHooks<T>(
  hooks: readonly T[],
  invoke: (hook: T) => Promise<void>,
): Promise<void> {
  for (const hook of hooks) {
    await invoke(hook)
  }
}

export class FanoutConversationProjectionPort implements ConversationProjectionPort {
  constructor(private readonly hooks: readonly ConversationProjectionPort[] = []) {}

  async apply(output: Parameters<ConversationProjectionPort["apply"]>[0]): Promise<void> {
    await applyHooks(this.hooks, async (hook) => {
      await hook.apply(output)
    })
  }
}

export class FanoutConversationDeliveryPort implements ConversationDeliveryPort {
  constructor(private readonly hooks: readonly ConversationDeliveryPort[] = []) {}

  async publish(output: Parameters<ConversationDeliveryPort["publish"]>[0]): Promise<void> {
    await applyHooks(this.hooks, async (hook) => {
      await hook.publish(output)
    })
  }
}

export class FanoutConversationSnapshotProjectionPort
implements ConversationSnapshotProjectionPort {
  constructor(private readonly hooks: readonly ConversationSnapshotProjectionPort[] = []) {}

  async apply(snapshot: ConversationRunSnapshot): Promise<void> {
    await applyHooks(this.hooks, async (hook) => {
      await hook.apply(snapshot)
    })
  }
}

export class FanoutConversationSnapshotDeliveryPort
implements ConversationSnapshotDeliveryPort {
  constructor(private readonly hooks: readonly ConversationSnapshotDeliveryPort[] = []) {}

  async publish(snapshot: ConversationRunSnapshot): Promise<void> {
    await applyHooks(this.hooks, async (hook) => {
      await hook.publish(snapshot)
    })
  }
}

export class FanoutConversationRuntimeEventProjectionPort
implements ConversationRuntimeEventProjectionPort {
  constructor(private readonly hooks: readonly ConversationRuntimeEventProjectionPort[] = []) {}

  async apply(events: readonly ConversationRuntimeEvent[]): Promise<void> {
    await applyHooks(this.hooks, async (hook) => {
      await hook.apply(events)
    })
  }
}

export class FanoutConversationRuntimeEventDeliveryPort
implements ConversationRuntimeEventDeliveryPort {
  constructor(private readonly hooks: readonly ConversationRuntimeEventDeliveryPort[] = []) {}

  async publish(events: readonly ConversationRuntimeEvent[]): Promise<void> {
    await applyHooks(this.hooks, async (hook) => {
      await hook.publish(events)
    })
  }
}

export class ConversationWarmupCoordinator implements ConversationWarmupCoordinatorPort {
  constructor(private readonly hooks: readonly ConversationWarmupHook[] = []) {}

  async warm(input: ConversationRuntimeWarmupInput): Promise<void> {
    await applyHooks(this.hooks, async (hook) => {
      await hook.warm(input)
    })
  }
}

export function resolveConversationApplicationHookSet(
  resolver: Pick<DependencyResolver, "resolveAll">,
): ConversationApplicationHookSet {
  return {
    outputProjectionHooks: resolver.resolveAll(CONVERSATION_OUTPUT_PROJECTION_HOOK),
    outputDeliveryHooks: resolver.resolveAll(CONVERSATION_OUTPUT_DELIVERY_HOOK),
    snapshotProjectionHooks: resolver.resolveAll(CONVERSATION_SNAPSHOT_PROJECTION_HOOK),
    snapshotDeliveryHooks: resolver.resolveAll(CONVERSATION_SNAPSHOT_DELIVERY_HOOK),
    runtimeEventProjectionHooks: resolver.resolveAll(CONVERSATION_RUNTIME_EVENT_PROJECTION_HOOK),
    runtimeEventDeliveryHooks: resolver.resolveAll(CONVERSATION_RUNTIME_EVENT_DELIVERY_HOOK),
    warmupHooks: resolver.resolveAll(CONVERSATION_WARMUP_HOOK),
  }
}

export function composeConversationApplicationPorts(
  hooks: ConversationApplicationHookSet,
): ConversationApplicationPorts {
  return {
    projection: hooks.outputProjectionHooks.length > 0
      ? new FanoutConversationProjectionPort(hooks.outputProjectionHooks)
      : undefined,
    delivery: hooks.outputDeliveryHooks.length > 0
      ? new FanoutConversationDeliveryPort(hooks.outputDeliveryHooks)
      : undefined,
    snapshotProjection: hooks.snapshotProjectionHooks.length > 0
      ? new FanoutConversationSnapshotProjectionPort(hooks.snapshotProjectionHooks)
      : undefined,
    snapshotDelivery: hooks.snapshotDeliveryHooks.length > 0
      ? new FanoutConversationSnapshotDeliveryPort(hooks.snapshotDeliveryHooks)
      : undefined,
    runtimeEventProjection: hooks.runtimeEventProjectionHooks.length > 0
      ? new FanoutConversationRuntimeEventProjectionPort(hooks.runtimeEventProjectionHooks)
      : undefined,
    runtimeEventDelivery: hooks.runtimeEventDeliveryHooks.length > 0
      ? new FanoutConversationRuntimeEventDeliveryPort(hooks.runtimeEventDeliveryHooks)
      : undefined,
    warmup: hooks.warmupHooks.length > 0
      ? new ConversationWarmupCoordinator(hooks.warmupHooks)
      : undefined,
  }
}

export function buildConversationApplicationPorts(
  resolver: Pick<DependencyResolver, "resolveAll">,
): ConversationApplicationPorts {
  return composeConversationApplicationPorts(
    resolveConversationApplicationHookSet(resolver),
  )
}