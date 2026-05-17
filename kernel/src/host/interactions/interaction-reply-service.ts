import type {
  KernelError,
  InteractionCoordinatorPort,
  InteractionRecord,
  InteractionStorePort,
  RunTrigger,
  SessionStorePort,
} from "../../core"
import { createKernelFailure } from "../../core"
import type { PendingInteractionHostPort } from "./pending-interaction-host"
import {
  buildPermissionRuleScope,
  clearSessionPermissionRule,
  parsePermissionDecisionResponse,
  parsePermissionInteractionRequest,
  upsertSessionPermissionOnceGrant,
  upsertSessionPermissionRule,
} from "./permission-governance"

export type InteractionResumeDescriptor = {
  interactionId: InteractionRecord["id"]
  sessionId: InteractionRecord["sessionId"]
  runId: InteractionRecord["runId"]
  trigger: RunTrigger
}

export type InteractionReplyResult = {
  interaction: InteractionRecord
  resume: InteractionResumeDescriptor
  linkedInteractions?: readonly InteractionRecord[]
  linkedResumes?: readonly InteractionResumeDescriptor[]
}

type InteractionReplyServiceOptions = {
  interactionStore: InteractionStorePort
  sessionStore: SessionStorePort
  interactionCoordinator: InteractionCoordinatorPort
  pendingInteractionHost?: Pick<PendingInteractionHostPort, "settle">
}

function buildResumeDescriptor(interaction: InteractionRecord): InteractionResumeDescriptor {
  return {
    interactionId: interaction.id,
    sessionId: interaction.sessionId,
    runId: interaction.runId,
    trigger: {
      kind: "resume_interaction",
      refId: interaction.id,
    },
  }
}

function buildInteractionReplyFailure(input: {
  code: string
  message: string
  interaction: InteractionRecord
  metadata?: Record<string, unknown>
}): KernelError {
  return createKernelFailure({
    code: input.code,
    message: input.message,
    retryable: false,
    phase: "interaction_reply_validation",
    failureKind: "protocol",
    metadata: {
      interactionId: input.interaction.id,
      interactionKind: input.interaction.kind,
      interactionStatus: input.interaction.status,
      runId: input.interaction.runId,
      sessionId: input.interaction.sessionId,
      ...(input.metadata ?? {}),
    },
  })
}

function assertPendingInteraction(interaction: InteractionRecord): void {
  if (interaction.status !== "pending") {
    throw buildInteractionReplyFailure({
      code: "interaction_not_pending",
      message: `Kernel interaction is not pending: ${interaction.id}`,
      interaction,
    })
  }
}

export class InteractionReplyService {
  constructor(private readonly options: InteractionReplyServiceOptions) {}

  private async listLinkedPendingPermissions(input: {
    interaction: InteractionRecord
  }): Promise<readonly InteractionRecord[]> {
    const request = parsePermissionInteractionRequest(input.interaction)
    if (!request) {
      return []
    }

    const scope = buildPermissionRuleScope(request)
    const pending = await this.options.interactionStore.listPendingBySession(input.interaction.sessionId)

    return pending.filter((candidate) => {
      if (candidate.id === input.interaction.id || candidate.kind !== "permission") {
        return false
      }

      const candidateRequest = parsePermissionInteractionRequest(candidate)
      if (!candidateRequest) {
        return false
      }

      return buildPermissionRuleScope(candidateRequest) === scope
    })
  }

  private async settleAnswer(
    interaction: InteractionRecord,
    response: unknown,
  ): Promise<InteractionRecord> {
    await this.options.interactionCoordinator.resume({
      interactionId: interaction.id,
      response,
    })

    const updated = await this.options.interactionStore.get(interaction.id)
    this.options.pendingInteractionHost?.settle({
      interaction: updated,
    })

    return updated
  }

  private async settleReject(
    interaction: InteractionRecord,
    reason?: string,
  ): Promise<InteractionRecord> {
    await this.options.interactionCoordinator.reject({
      interactionId: interaction.id,
      reason,
    })

    const updated = await this.options.interactionStore.get(interaction.id)
    this.options.pendingInteractionHost?.settle({
      interaction: updated,
    })

    return updated
  }

  private async settleLinkedAnswers(
    interactions: readonly InteractionRecord[],
    response: unknown,
  ): Promise<InteractionRecord[]> {
    const updated: InteractionRecord[] = []

    for (const interaction of interactions) {
      updated.push(await this.settleAnswer(interaction, response))
    }

    return updated
  }

  private async settleLinkedRejects(
    interactions: readonly InteractionRecord[],
    reason?: string,
  ): Promise<InteractionRecord[]> {
    const updated: InteractionRecord[] = []

    for (const interaction of interactions) {
      updated.push(await this.settleReject(interaction, reason))
    }

    return updated
  }

  private buildReplyResult(input: {
    interaction: InteractionRecord
    linkedInteractions?: readonly InteractionRecord[]
  }): InteractionReplyResult {
    const linkedInteractions = input.linkedInteractions?.filter(Boolean) ?? []

    return {
      interaction: input.interaction,
      resume: buildResumeDescriptor(input.interaction),
      ...(linkedInteractions.length > 0
        ? {
            linkedInteractions,
            linkedResumes: linkedInteractions.map(buildResumeDescriptor),
          }
        : {}),
    }
  }

  async answer(input: {
    interactionId: InteractionRecord["id"]
    response: unknown
  }): Promise<InteractionReplyResult> {
    const interaction = await this.options.interactionStore.get(input.interactionId)
    assertPendingInteraction(interaction)

    const permissionRequest = parsePermissionInteractionRequest(interaction)
    const permissionResponse = permissionRequest
      ? parsePermissionDecisionResponse(input.response)
      : undefined

    if (permissionRequest && !permissionResponse) {
      throw buildInteractionReplyFailure({
        code: "interaction_response_invalid",
        message: `Permission interaction response is invalid: ${interaction.id}`,
        interaction,
      })
    }

    const session = permissionRequest
      ? await this.options.sessionStore.get(interaction.sessionId)
      : undefined
    let nextSession = session
    let linkedPending: readonly InteractionRecord[] = []

    if (permissionRequest && permissionResponse && session) {
      if (permissionResponse.decision === "approve_always" && permissionRequest.allowAlways !== true) {
        throw buildInteractionReplyFailure({
          code: "interaction_response_not_allowed",
          message: `Permission interaction does not allow approve_always: ${interaction.id}`,
          interaction,
          metadata: {
            decision: permissionResponse.decision,
          },
        })
      }

      if (permissionResponse.decision === "approve_always") {
        nextSession = upsertSessionPermissionRule({
          session,
          request: permissionRequest,
          decision: "approve_always",
          updatedAt: session.updatedAt,
          note: permissionResponse.note,
        })
        linkedPending = await this.listLinkedPendingPermissions({
          interaction,
        })
      } else if (permissionResponse.decision === "reject") {
        nextSession = upsertSessionPermissionRule({
          session,
          request: permissionRequest,
          decision: "reject",
          updatedAt: session.updatedAt,
          note: permissionResponse.note,
        })
        linkedPending = await this.listLinkedPendingPermissions({
          interaction,
        })
      } else {
        nextSession = upsertSessionPermissionOnceGrant({
          session: clearSessionPermissionRule({
            session,
            request: permissionRequest,
            updatedAt: session.updatedAt,
          }),
          request: permissionRequest,
          updatedAt: session.updatedAt,
          note: permissionResponse.note,
        })
      }
    }

    const updated = await this.settleAnswer(interaction, input.response)
    const linkedInteractions = linkedPending.length > 0
      ? await this.settleLinkedAnswers(linkedPending, input.response)
      : []

    if (session && nextSession && nextSession !== session) {
      const latestUpdateAt = linkedInteractions.reduce(
        (current, candidate) => Math.max(current, candidate.updatedAt),
        updated.updatedAt,
      )
      await this.options.sessionStore.save({
        ...nextSession,
        updatedAt: latestUpdateAt,
      })
    }

    return this.buildReplyResult({
      interaction: updated,
      linkedInteractions,
    })
  }

  async reject(input: {
    interactionId: InteractionRecord["id"]
    reason?: string
  }): Promise<InteractionReplyResult> {
    const interaction = await this.options.interactionStore.get(input.interactionId)
    assertPendingInteraction(interaction)

    const permissionRequest = parsePermissionInteractionRequest(interaction)
    const session = permissionRequest
      ? await this.options.sessionStore.get(interaction.sessionId)
      : undefined
    const nextSession = permissionRequest && session
      ? upsertSessionPermissionRule({
          session,
          request: permissionRequest,
          decision: "reject",
          updatedAt: session.updatedAt,
          note: input.reason,
        })
      : session
    const linkedPending = permissionRequest && session
      ? await this.listLinkedPendingPermissions({
          interaction,
        })
      : []

    const updated = await this.settleReject(interaction, input.reason)
    const linkedInteractions = linkedPending.length > 0
      ? await this.settleLinkedRejects(linkedPending, input.reason)
      : []

    if (session && nextSession && nextSession !== session) {
      const latestUpdateAt = linkedInteractions.reduce(
        (current, candidate) => Math.max(current, candidate.updatedAt),
        updated.updatedAt,
      )
      await this.options.sessionStore.save({
        ...nextSession,
        updatedAt: latestUpdateAt,
      })
    }

    return this.buildReplyResult({
      interaction: updated,
      linkedInteractions,
    })
  }
}
