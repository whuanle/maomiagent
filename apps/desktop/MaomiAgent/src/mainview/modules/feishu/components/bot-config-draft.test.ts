import { describe, expect, test } from "bun:test"

import type { FeishuBotStateView } from "../../../../shared/desktop-feishu"
import {
  buildFeishuBotConfigInput,
  createFeishuBotDraft,
  resolveFeishuBotDraftAfterStateRefresh,
} from "./bot-config-draft"

function createBotState(partial: Partial<FeishuBotStateView> = {}): FeishuBotStateView {
  return {
    enabled: false,
    appId: "",
    hasAppSecret: false,
    hasVerificationToken: false,
    hasEncryptKey: false,
    transportMode: "websocket",
    catalog: {
      transportMode: "websocket",
      descriptors: [],
    },
    connectionStatus: "disconnected",
    sessionMappingCount: 0,
    processedMessageCount: 0,
    queuedConversationCount: 0,
    recentProcessedMessages: [],
    updatedAt: "2026-05-25T00:00:00.000Z",
    ...partial,
  }
}

describe("feishu bot draft helpers", () => {
  test("creates a clean draft from saved bot state", () => {
    const draft = createFeishuBotDraft(createBotState({
      appId: "cli_test_bot",
      appSecret: "secret-1",
      verificationToken: "verify-1",
      encryptKey: "encrypt-1",
      allowWorkspaceSwitch: true,
      workspaceSwitchScope: "restricted",
      allowedExecutionWorkspaceIds: ["workspace-a", "workspace-b"],
      selectedChannelId: "channel-alpha",
      selectedModelId: "model-alpha",
    }))

    expect(draft).toEqual({
      appId: "cli_test_bot",
      appSecret: "secret-1",
      verificationToken: "verify-1",
      encryptKey: "encrypt-1",
      allowWorkspaceSwitch: true,
      allowedExecutionWorkspaceIds: ["workspace-a", "workspace-b"],
      selectedChannelId: "channel-alpha",
      selectedModelId: "model-alpha",
    })
  })

  test("keeps the current draft when background refresh arrives during editing", () => {
    const currentDraft = {
      appId: "draft-bot",
      appSecret: "draft-secret",
      verificationToken: "",
      encryptKey: "",
      allowWorkspaceSwitch: false,
      allowedExecutionWorkspaceIds: [],
      selectedChannelId: undefined,
      selectedModelId: undefined,
    }

    const result = resolveFeishuBotDraftAfterStateRefresh({
      currentDraft,
      botState: createBotState({
        updatedAt: "2026-05-25T00:00:05.000Z",
      }),
      draftDirty: true,
    })

    expect(result).toEqual({
      draft: currentDraft,
      draftDirty: true,
      shouldApply: false,
    })
  })

  test("builds save payload with restricted scope only when workspace switch is enabled and scoped", () => {
    const restricted = buildFeishuBotConfigInput({
      appId: "cli_test_bot",
      appSecret: "secret-1",
      verificationToken: "verify-1",
      encryptKey: "encrypt-1",
      allowWorkspaceSwitch: true,
      allowedExecutionWorkspaceIds: ["workspace-a"],
      selectedChannelId: "channel-alpha",
      selectedModelId: "model-alpha",
    })

    expect(restricted).toEqual({
      appId: "cli_test_bot",
      appSecret: "secret-1",
      verificationToken: "verify-1",
      encryptKey: "encrypt-1",
      allowWorkspaceSwitch: true,
      workspaceSwitchScope: "restricted",
      allowedExecutionWorkspaceIds: ["workspace-a"],
      selectedChannelId: "channel-alpha",
      selectedModelId: "model-alpha",
    })

    const disabled = buildFeishuBotConfigInput({
      appId: "cli_test_bot",
      appSecret: "",
      verificationToken: "",
      encryptKey: "",
      allowWorkspaceSwitch: false,
      allowedExecutionWorkspaceIds: ["workspace-a"],
      selectedChannelId: undefined,
      selectedModelId: undefined,
    })

    expect(disabled).toEqual({
      appId: "cli_test_bot",
      appSecret: undefined,
      verificationToken: undefined,
      encryptKey: undefined,
      allowWorkspaceSwitch: false,
      workspaceSwitchScope: "all",
      allowedExecutionWorkspaceIds: [],
      selectedChannelId: undefined,
      selectedModelId: undefined,
    })
  })
})
