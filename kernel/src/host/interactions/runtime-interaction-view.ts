import type { InteractionRecord, SessionRecord } from "../../core"

export type RuntimeInteractionView = {
  id: InteractionRecord["id"]
  sessionId: InteractionRecord["sessionId"]
  runId: InteractionRecord["runId"]
  toolCallId?: InteractionRecord["toolCallId"]
  kind: InteractionRecord["kind"]
  status: InteractionRecord["status"]
  request: InteractionRecord["request"]
  response?: InteractionRecord["response"]
  createdAt: InteractionRecord["createdAt"]
  updatedAt: InteractionRecord["updatedAt"]
  metadata?: InteractionRecord["metadata"]
}

export type RuntimePendingInteractionView = RuntimeInteractionView & {
  workspaceId?: string
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

export function toRuntimeInteractionView(
  interaction: InteractionRecord,
): RuntimeInteractionView {
  return {
    id: interaction.id,
    sessionId: interaction.sessionId,
    runId: interaction.runId,
    toolCallId: interaction.toolCallId,
    kind: interaction.kind,
    status: interaction.status,
    request: interaction.request,
    response: interaction.response,
    createdAt: interaction.createdAt,
    updatedAt: interaction.updatedAt,
    metadata: interaction.metadata,
  }
}

export function toRuntimePendingInteractionView(input: {
  interaction: InteractionRecord
  session?: SessionRecord
  workspaceId?: string
}): RuntimePendingInteractionView {
  const workspaceId = input.workspaceId ?? readWorkspaceId(input.session?.metadata)

  return {
    ...toRuntimeInteractionView(input.interaction),
    ...(workspaceId ? { workspaceId } : {}),
  }
}