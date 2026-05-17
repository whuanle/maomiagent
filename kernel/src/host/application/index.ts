import type {
  ContextCheckpointRecord,
  ContextCheckpointStorePort,
  InteractionRecord,
  InteractionStorePort,
  MessageRecordWithParts,
  MessageStorePort,
  RunBoundary,
  RunRecord,
  RunStorePort,
  RunTrigger,
  SessionRecord,
  SessionStorePort,
  ToolCallRecord,
  ToolCallStorePort,
  TurnStorePort,
} from "../../core"
import {
  buildConversationRunSnapshot,
  type ConversationRunSnapshot,
} from "./conversation-message-protocol"
import type {
  ConversationRuntimeWarmupInput,
  ConversationWarmupCoordinatorPort,
} from "./application-hooks"
import type { AiRoutePurpose, AiRouteResolver, ChannelSelection } from "../../../ai/channels"
import type { PendingInteractionHostPort } from "../interactions"
import type { RunLifecycleService, RunLifecycleResult } from "../sessions/run-lifecycle-service"
import type { RunResumeDescriptor, RunResumeResult, RunResumeService } from "../sessions/run-resume-service"
import type { SessionHostExecutionDisposition } from "../sessions/session-host"

export type ConversationTurnOutput = {
  session: SessionRecord
  run: RunRecord
  boundary: RunBoundary
  messages: readonly MessageRecordWithParts[]
  toolCalls: readonly ToolCallRecord[]
  interactions: readonly InteractionRecord[]
  checkpoints?: readonly ContextCheckpointRecord[]
}

export interface ConversationProjectionPort {
  apply(output: ConversationTurnOutput): Promise<void>
}

export interface ConversationDeliveryPort {
  publish(output: ConversationTurnOutput): Promise<void>
}

export interface ConversationSnapshotProjectionPort {
  apply(snapshot: ConversationRunSnapshot): Promise<void>
}

export interface ConversationSnapshotDeliveryPort {
  publish(snapshot: ConversationRunSnapshot): Promise<void>
}

type ConversationTurnOutputLoaderOptions = {
  sessionStore: SessionStorePort
  runStore: RunStorePort
  turnStore: TurnStorePort
  messageStore: MessageStorePort
  toolCallStore: ToolCallStorePort
  interactionStore: InteractionStorePort
  contextCheckpointStore?: ContextCheckpointStorePort
}

function readWorkspaceId(metadata?: SessionRecord["metadata"]): string | undefined {
  if (typeof metadata?.workspaceId === "string") {
    return metadata.workspaceId
  }

  const workspace = metadata?.workspace
  if (
    workspace
    && typeof workspace === "object"
    && typeof (workspace as Record<string, unknown>).workspaceId === "string"
  ) {
    return (workspace as Record<string, unknown>).workspaceId as string
  }

  return undefined
}

function cloneSelection(selection: ChannelSelection): ChannelSelection {
  return {
    channelId: selection.channelId,
    modelId: selection.modelId,
    metadata: selection.metadata ? { ...selection.metadata } : undefined,
  }
}

function filterMessagesByRun(
  messages: readonly MessageRecordWithParts[],
  runId: RunRecord["id"],
): readonly MessageRecordWithParts[] {
  return messages.filter((entry) => entry.message.runId === runId)
}

export class ConversationTurnOutputLoader {
  constructor(private readonly options: ConversationTurnOutputLoaderOptions) {}

  async load(input: {
    sessionId: SessionRecord["id"]
    runId: RunRecord["id"]
    boundary: RunBoundary
  }): Promise<ConversationTurnOutput> {
    const [session, run, messages, toolCalls, interactions, checkpoints] = await Promise.all([
      this.options.sessionStore.get(input.sessionId),
      this.options.runStore.get(input.runId),
      this.options.messageStore.listBySession(input.sessionId),
      this.options.toolCallStore.listByRun(input.runId),
      this.options.interactionStore.listByRun(input.runId),
      this.options.contextCheckpointStore?.listBySession(input.sessionId),
    ])

    return {
      session,
      run,
      boundary: input.boundary,
      messages: filterMessagesByRun(messages, run.id),
      toolCalls,
      interactions,
      checkpoints,
    }
  }
}

type ConversationRuntimeServiceOptions = {
  sessionStore: SessionStorePort
  aiRouteResolver: AiRouteResolver
  runLifecycleService: Pick<RunLifecycleService, "start">
  runResumeService: Pick<RunResumeService, "resume">
  outputLoader: ConversationTurnOutputLoader
  projection?: ConversationProjectionPort
  delivery?: ConversationDeliveryPort
  snapshotProjection?: ConversationSnapshotProjectionPort
  snapshotDelivery?: ConversationSnapshotDeliveryPort
  pendingInteractionHost?: Pick<PendingInteractionHostPort, "syncRun">
  warmup?: ConversationWarmupCoordinatorPort
}

export type StartConversationTurnInput = {
  sessionId: SessionRecord["id"]
  trigger: RunTrigger
  selection: ChannelSelection
  purpose?: AiRoutePurpose
  workspaceId?: string
  metadata?: RunRecord["metadata"]
  disposition?: SessionHostExecutionDisposition
}

export class ConversationRuntimeService {
  constructor(private readonly options: ConversationRuntimeServiceOptions) {}

  async warm(input: ConversationRuntimeWarmupInput): Promise<void> {
    await this.options.warmup?.warm(input)
  }

  async start(input: StartConversationTurnInput): Promise<ConversationTurnOutput> {
    const session = await this.options.sessionStore.get(input.sessionId)
    const executionProfile = await this.options.aiRouteResolver.resolve({
      sessionId: session.id,
      workspaceId: input.workspaceId ?? readWorkspaceId(session.metadata),
      selection: input.selection,
      purpose: input.purpose ?? "primary",
      metadata: input.metadata,
    })
    const result = await this.options.runLifecycleService.start({
      sessionId: input.sessionId,
      trigger: input.trigger,
      disposition: input.disposition,
      metadata: {
        ...(input.metadata ? { ...input.metadata } : {}),
        preferredExecutionProfile: executionProfile,
        channelSelection: cloneSelection(input.selection),
      },
    })

    return this.publishOutput({
      sessionId: input.sessionId,
      runId: result.run.id,
      boundary: result.boundary,
    })
  }

  async resume(input: RunResumeDescriptor): Promise<ConversationTurnOutput> {
    const result = await this.options.runResumeService.resume(input)

    return this.publishOutput({
      sessionId: input.sessionId,
      runId: result.run.id,
      boundary: result.boundary,
    })
  }

  private async publishOutput(input: {
    sessionId: SessionRecord["id"]
    runId: RunRecord["id"]
    boundary: RunBoundary
  }): Promise<ConversationTurnOutput> {
    const output = await this.options.outputLoader.load(input)
    this.options.pendingInteractionHost?.syncRun({
      session: output.session,
      run: output.run,
      interactions: output.interactions,
    })
    const snapshot = this.options.snapshotProjection || this.options.snapshotDelivery
      ? buildConversationRunSnapshot(output)
      : undefined

    if (this.options.projection) {
      await this.options.projection.apply(output)
    }

    if (this.options.delivery) {
      await this.options.delivery.publish(output)
    }

    if (snapshot && this.options.snapshotProjection) {
      await this.options.snapshotProjection.apply(snapshot)
    }

    if (snapshot && this.options.snapshotDelivery) {
      await this.options.snapshotDelivery.publish(snapshot)
    }

    return output
  }
}

export * from "./application-hooks"
export * from "./conversation-message-protocol"
export * from "./conversation-runtime-event-projector"