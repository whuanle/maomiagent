import type {
  FeishuBotConfigInput,
  FeishuBotStateView,
} from "../../../../shared/desktop-feishu"

export type FeishuBotDraft = {
  appId: string
  appSecret: string
  verificationToken: string
  encryptKey: string
  allowWorkspaceSwitch: boolean
  allowedExecutionWorkspaceIds: string[]
  selectedChannelId: string | undefined
  selectedModelId: string | undefined
}

export function createFeishuBotDraft(botState: FeishuBotStateView | null): FeishuBotDraft {
  return {
    appId: botState?.appId ?? "",
    appSecret: botState?.appSecret ?? "",
    verificationToken: botState?.verificationToken ?? "",
    encryptKey: botState?.encryptKey ?? "",
    allowWorkspaceSwitch: botState?.allowWorkspaceSwitch === true,
    allowedExecutionWorkspaceIds:
      botState?.workspaceSwitchScope === "restricted"
        ? [...(botState.allowedExecutionWorkspaceIds ?? [])]
        : [],
    selectedChannelId: botState?.selectedChannelId,
    selectedModelId: botState?.selectedModelId,
  }
}

export function buildFeishuBotConfigInput(draft: FeishuBotDraft): FeishuBotConfigInput {
  return {
    appId: draft.appId,
    appSecret: draft.appSecret || undefined,
    verificationToken: draft.verificationToken || undefined,
    encryptKey: draft.encryptKey || undefined,
    allowWorkspaceSwitch: draft.allowWorkspaceSwitch,
    workspaceSwitchScope:
      draft.allowWorkspaceSwitch && draft.allowedExecutionWorkspaceIds.length > 0
        ? "restricted"
        : "all",
    allowedExecutionWorkspaceIds: draft.allowWorkspaceSwitch ? draft.allowedExecutionWorkspaceIds : [],
    selectedChannelId: draft.selectedChannelId,
    selectedModelId: draft.selectedModelId,
  }
}

export function areFeishuBotDraftsEqual(left: FeishuBotDraft, right: FeishuBotDraft): boolean {
  return left.appId === right.appId
    && left.appSecret === right.appSecret
    && left.verificationToken === right.verificationToken
    && left.encryptKey === right.encryptKey
    && left.allowWorkspaceSwitch === right.allowWorkspaceSwitch
    && left.selectedChannelId === right.selectedChannelId
    && left.selectedModelId === right.selectedModelId
    && left.allowedExecutionWorkspaceIds.length === right.allowedExecutionWorkspaceIds.length
    && left.allowedExecutionWorkspaceIds.every((value, index) => value === right.allowedExecutionWorkspaceIds[index])
}

export function resolveFeishuBotDraftAfterStateRefresh(input: {
  currentDraft: FeishuBotDraft
  botState: FeishuBotStateView | null
  draftDirty: boolean
}): {
  draft: FeishuBotDraft
  draftDirty: boolean
  shouldApply: boolean
} {
  if (input.draftDirty) {
    return {
      draft: input.currentDraft,
      draftDirty: true,
      shouldApply: false,
    }
  }

  const nextDraft = createFeishuBotDraft(input.botState)
  return {
    draft: nextDraft,
    draftDirty: false,
    shouldApply: !areFeishuBotDraftsEqual(input.currentDraft, nextDraft),
  }
}
