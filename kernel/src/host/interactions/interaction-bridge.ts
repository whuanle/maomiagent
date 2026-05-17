import type { InteractionRecord, InteractionStorePort } from "../../core"
import type { PendingInteractionHostPort } from "./pending-interaction-host"
import { type InteractionReplyResult, InteractionReplyService } from "./interaction-reply-service"
import {
  toRuntimeInteractionView,
  type RuntimeInteractionView,
  type RuntimePendingInteractionView,
} from "./runtime-interaction-view"

type InteractionBridgeOptions = {
  interactionStore: InteractionStorePort
  replyService: InteractionReplyService
  pendingInteractionHost?: PendingInteractionHostPort
}

export class InteractionBridge {
  constructor(private readonly options: InteractionBridgeOptions) {}

  async listPendingByRun(runId: InteractionRecord["runId"]): Promise<readonly RuntimeInteractionView[]> {
    if (this.options.pendingInteractionHost) {
      return this.options.pendingInteractionHost.listPendingByRun(runId)
    }

    const interactions = await this.options.interactionStore.listPendingByRun(runId)
    return interactions.map(toRuntimeInteractionView)
  }

  listPendingBySession(
    sessionId: InteractionRecord["sessionId"],
  ): readonly RuntimePendingInteractionView[] {
    return this.options.pendingInteractionHost?.listPendingBySession(sessionId) ?? []
  }

  listPendingByWorkspace(workspaceId: string): readonly RuntimePendingInteractionView[] {
    return this.options.pendingInteractionHost?.listPendingByWorkspace(workspaceId) ?? []
  }

  async answer(input: {
    interactionId: InteractionRecord["id"]
    response: unknown
  }): Promise<InteractionReplyResult> {
    return this.options.replyService.answer(input)
  }

  async reject(input: {
    interactionId: InteractionRecord["id"]
    reason?: string
  }): Promise<InteractionReplyResult> {
    return this.options.replyService.reject(input)
  }
}
