import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DesktopConfigurationPort } from "../../../configuration";
import type { RuntimeLogExtra, RuntimeLogLevel, RuntimeLogRecord, RuntimeLogger } from "../../../logs";
import type { DesktopModelsQueryPort } from "../../../models";
import type {
  DesktopConversationApplyWorkspaceSettingsInput,
  DesktopConversationApplyWorkspaceSettingsResponse,
  DesktopConversationAnswerInteractionInput,
  DesktopConversationCommandPort,
  DesktopConversationCreateSessionInput,
  DesktopConversationCreateSessionResponse,
  DesktopConversationHideSessionResponse,
  DesktopConversationInteractionReplyResponse,
  DesktopConversationRejectInteractionInput,
  DesktopConversationSendMessageInput,
  DesktopConversationSendMessageResponse,
  DesktopConversationSessionDetail,
  DesktopConversationStopMessageInput,
  DesktopConversationStopMessageResponse,
} from "../../../conversation";
import type { DesktopWorkspaceItem, DesktopWorkspaceQueryPort } from "../../../workspace";
import { FULLY_MANAGED_AGENT_ID } from "../../../../../shared/conversation/managed-execution";
import { DesktopWechatService } from "./desktop-wechat-service";

function createMockModelsQuery(
  snapshotOverrides: Partial<Awaited<ReturnType<DesktopModelsQueryPort["getRuntimeSelectionSnapshot"]>>> = {},
): Pick<DesktopModelsQueryPort, "getRuntimeSelectionSnapshot"> {
  return {
    getRuntimeSelectionSnapshot: async () => ({
      scope: "global",
      generatedAt: "2026-05-08T00:00:00.000Z",
      etag: "test-selection",
      channels: [{
        value: "channel-alpha",
        label: "Channel Alpha",
        providerType: "openai",
        enabled: true,
      }],
      models: [{
        value: "model-alpha",
        label: "Model Alpha",
        providerType: "openai",
        channelId: "channel-alpha",
        effectiveEnabled: true,
      }],
      defaultSelection: {
        channelId: "channel-alpha",
        modelId: "model-alpha",
      },
      requestedSelection: {},
      resolvedSelection: {
        resolution: "none",
      },
      ...snapshotOverrides,
    }),
  };
}

function createMockLogger(): RuntimeLogger {
  const write = async (level: RuntimeLogLevel, message: string): Promise<RuntimeLogRecord> => ({
    id: "log-test",
    at: new Date().toISOString(),
    level,
    source: "test",
    module: "wechat",
    message,
  });

  return {
    write: (level: RuntimeLogLevel, message: string, _extra?: RuntimeLogExtra) => write(level, message),
    debug: (message: string, _extra?: RuntimeLogExtra) => write("debug", message),
    info: (message: string, _extra?: RuntimeLogExtra) => write("info", message),
    warn: (message: string, _extra?: RuntimeLogExtra) => write("warn", message),
    error: (message: string, _extra?: RuntimeLogExtra) => write("error", message),
  };
}

function createMockConfiguration(storagePath: string): DesktopConfigurationPort {
  return {
    get: () => undefined,
    getString: (key: string, fallback?: string) => {
      if (key === "wechat.state.path") {
        return storagePath;
      }
      return fallback;
    },
    getBoolean: (_key: string, fallback?: boolean) => fallback,
    getNumber: (_key: string, fallback?: number) => fallback,
    getRecord: () => undefined,
    requireString: (key: string) => {
      throw new Error(`Missing configuration: ${key}`);
    },
    snapshot: () => ({
      values: {},
      sources: [],
    }),
  };
}

function createMockConversationCommand(calls: DesktopConversationCreateSessionInput[]): DesktopConversationCommandPort {
  const now = new Date().toISOString();
  const detail: DesktopConversationSessionDetail = {
    sessionId: "session-test",
    workspaceId: "workspace-test",
    title: "test",
    status: "idle",
    createdAt: now,
    updatedAt: now,
    runs: [],
    messages: [],
    toolCalls: [],
    interactions: [],
    pendingInteractions: [],
    checkpoints: [],
    timeline: [],
  };

  return {
    createSession: async (
      input: DesktopConversationCreateSessionInput,
    ): Promise<DesktopConversationCreateSessionResponse> => {
      calls.push(input);
      return {
        created: true,
        item: {
          sessionId: detail.sessionId,
          workspaceId: input.workspaceId,
          title: detail.title,
          status: detail.status,
          createdAt: detail.createdAt,
          updatedAt: detail.updatedAt,
        },
      };
    },
    hideSession: async (_sessionId: string): Promise<DesktopConversationHideSessionResponse> => ({
      sessionId: detail.sessionId,
      hidden: true,
    }),
    applyWorkspaceSettings: async (
      _input: DesktopConversationApplyWorkspaceSettingsInput,
    ): Promise<DesktopConversationApplyWorkspaceSettingsResponse> => ({
      items: [],
      updatedCount: 0,
      totalCount: 0,
    }),
    sendMessage: async (
      _input: DesktopConversationSendMessageInput,
    ): Promise<DesktopConversationSendMessageResponse> => ({
      detail,
    }),
    stopMessage: async (
      _input: DesktopConversationStopMessageInput,
    ): Promise<DesktopConversationStopMessageResponse> => ({
      detail,
      stopped: true,
    }),
    answerInteraction: async (
      _input: DesktopConversationAnswerInteractionInput,
    ): Promise<DesktopConversationInteractionReplyResponse> => ({
      detail,
    }),
    rejectInteraction: async (
      _input: DesktopConversationRejectInteractionInput,
    ): Promise<DesktopConversationInteractionReplyResponse> => ({
      detail,
    }),
  };
}

function createTrackingConversationCommand(input: {
  createSessionCalls?: DesktopConversationCreateSessionInput[];
  sendMessageCalls?: DesktopConversationSendMessageInput[];
}): DesktopConversationCommandPort {
  const now = new Date().toISOString();
  const detail: DesktopConversationSessionDetail = {
    sessionId: "session-test",
    workspaceId: "workspace-test",
    title: "test",
    status: "idle",
    createdAt: now,
    updatedAt: now,
    runs: [],
    messages: [],
    toolCalls: [],
    interactions: [],
    pendingInteractions: [],
    checkpoints: [],
    timeline: [],
  };

  return {
    createSession: async (
      createInput: DesktopConversationCreateSessionInput,
    ): Promise<DesktopConversationCreateSessionResponse> => {
      input.createSessionCalls?.push(createInput);
      return {
        created: true,
        item: {
          sessionId: detail.sessionId,
          workspaceId: createInput.workspaceId,
          title: detail.title,
          status: detail.status,
          createdAt: detail.createdAt,
          updatedAt: detail.updatedAt,
        },
      };
    },
    hideSession: async (_sessionId: string): Promise<DesktopConversationHideSessionResponse> => ({
      sessionId: detail.sessionId,
      hidden: true,
    }),
    applyWorkspaceSettings: async (
      _input: DesktopConversationApplyWorkspaceSettingsInput,
    ): Promise<DesktopConversationApplyWorkspaceSettingsResponse> => ({
      items: [],
      updatedCount: 0,
      totalCount: 0,
    }),
    sendMessage: async (
      sendInput: DesktopConversationSendMessageInput,
    ): Promise<DesktopConversationSendMessageResponse> => {
      input.sendMessageCalls?.push(sendInput);
      return {
        detail,
      };
    },
    stopMessage: async (
      _input: DesktopConversationStopMessageInput,
    ): Promise<DesktopConversationStopMessageResponse> => ({
      detail,
      stopped: true,
    }),
    answerInteraction: async (
      _input: DesktopConversationAnswerInteractionInput,
    ): Promise<DesktopConversationInteractionReplyResponse> => ({
      detail,
    }),
    rejectInteraction: async (
      _input: DesktopConversationRejectInteractionInput,
    ): Promise<DesktopConversationInteractionReplyResponse> => ({
      detail,
    }),
  };
}

function createMockWorkspaceQuery(workspaceId: string): Pick<DesktopWorkspaceQueryPort, "list"> {
  const now = new Date().toISOString();
  const item: DesktopWorkspaceItem = {
    workspaceId,
    name: "Default Workspace",
    directoryPath: "E:/workspace/default",
    isPinned: false,
    tags: [],
    createdAt: now,
    updatedAt: now,
  };

  return {
    list: async () => ({
      items: [item],
      meta: {
        total: 1,
        limit: 1,
        offset: 0,
        hasMore: false,
      },
    }),
  };
}

test("desktop wechat binding falls back to the first workspace when config has none", async () => {
  const storagePath = join(
    tmpdir(),
    `maomi-desktop-wechat-binding-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const createSessionCalls: DesktopConversationCreateSessionInput[] = [];
  const service = new DesktopWechatService(
    createMockConfiguration(storagePath),
    createMockLogger(),
    createMockConversationCommand(createSessionCalls),
    createMockWorkspaceQuery("workspace-fallback"),
    createMockModelsQuery(),
  );

  await service.getState();

  const binding = await (service as any).resolveOrCreateBinding({
    accountId: "wechat-account",
    peerId: "peer-1",
    conversationKey: "wechat-account:peer-1",
    messageId: "message-1",
    inboundText: "hello",
    createdAt: new Date().toISOString(),
  });

  expect(binding.workspaceId).toBe("workspace-fallback");
  expect(binding.homeWorkspaceId).toBe("workspace-fallback");
  expect(createSessionCalls[0]?.workspaceId).toBe("workspace-fallback");
  expect(createSessionCalls[0]?.selectedAgentId).toBe(FULLY_MANAGED_AGENT_ID);
  expect(createSessionCalls[0]?.metadata).toEqual({
    source: "wechat",
    accountId: "wechat-account",
    peerId: "peer-1",
    conversationSettings: {
      capabilityPreferences: {
        "mcp.runtime": true,
        "skills.runtime": true,
        "wechat.runtime": true,
      },
    },
  });
  expect(binding.runtimeSessionVersion).toBe("wechat-capabilities-v1");

  const state = await service.getState();
  expect(state.config.selectedWorkspaceId).toBe("workspace-fallback");
  expect(state.config.defaultExecutionWorkspaceId).toBe("workspace-fallback");
});

test("desktop wechat recreates legacy bindings to bootstrap runtime capabilities", async () => {
  const storagePath = join(
    tmpdir(),
    `maomi-desktop-wechat-binding-legacy-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const createSessionCalls: DesktopConversationCreateSessionInput[] = [];
  const service = new DesktopWechatService(
    createMockConfiguration(storagePath),
    createMockLogger(),
    createMockConversationCommand(createSessionCalls),
    createMockWorkspaceQuery("workspace-fallback"),
    createMockModelsQuery(),
  );

  await service.getState();
  (service as any).storage.bindings.push({
    key: "wechat-account:peer-1",
    accountId: "wechat-account",
    peerId: "peer-1",
    homeWorkspaceId: "workspace-fallback",
    workspaceId: "workspace-fallback",
    sessionId: "legacy-session",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  });

  const binding = await (service as any).resolveOrCreateBinding({
    accountId: "wechat-account",
    peerId: "peer-1",
    conversationKey: "wechat-account:peer-1",
    messageId: "message-2",
    inboundText: "hello again",
    createdAt: "2026-05-06T00:00:00.000Z",
  });

  expect(createSessionCalls).toHaveLength(1);
  expect(binding.sessionId).toBe("session-test");
  expect(binding.createdAt).toBe("2026-05-01T00:00:00.000Z");
  expect(binding.runtimeSessionVersion).toBe("wechat-capabilities-v1");
  expect(binding.lastMessageId).toBe("message-2");
});

test("desktop wechat routes inbound messages through the managed agent for existing bindings", async () => {
  const storagePath = join(
    tmpdir(),
    `maomi-desktop-wechat-binding-managed-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const sendMessageCalls: DesktopConversationSendMessageInput[] = [];
  const service = new DesktopWechatService(
    createMockConfiguration(storagePath),
    createMockLogger(),
    createTrackingConversationCommand({ sendMessageCalls }),
    createMockWorkspaceQuery("workspace-fallback"),
    createMockModelsQuery(),
  );

  await service.getState();
  (service as any).sendTextChunks = async () => undefined;
  (service as any).storage.accounts.push({
    accountId: "wechat-account",
    token: "wechat-token",
    enabled: true,
    updatedAt: "2026-05-07T00:00:00.000Z",
  });
  (service as any).storage.bindings.push({
    key: "wechat-account:peer-1",
    accountId: "wechat-account",
    peerId: "peer-1",
    homeWorkspaceId: "workspace-fallback",
    workspaceId: "workspace-fallback",
    sessionId: "existing-session",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    runtimeSessionVersion: "wechat-capabilities-v1",
  });
  (service as any).storage.processedMessages.push({
    accountId: "wechat-account",
    peerId: "peer-1",
    messageId: "message-3",
    conversationKey: "wechat-account:peer-1",
    status: "pending",
    queryPreview: "请用 easytouch 截图",
    responsePreview: "处理中",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
  });

  await (service as any).processQueuedMessage({
    accountId: "wechat-account",
    peerId: "peer-1",
    conversationKey: "wechat-account:peer-1",
    messageId: "message-3",
    text: "请用 easytouch 截图",
    createdAt: "2026-05-07T00:00:00.000Z",
  });

  expect(sendMessageCalls).toHaveLength(1);
  expect(sendMessageCalls[0]).toMatchObject({
    sessionId: "existing-session",
    workspaceId: "workspace-fallback",
    selectedAgentId: FULLY_MANAGED_AGENT_ID,
  });
});

test("desktop wechat forwards inbound media as conversation attachments", async () => {
  const storagePath = join(
    tmpdir(),
    `maomi-desktop-wechat-binding-attachments-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const sendMessageCalls: DesktopConversationSendMessageInput[] = [];
  const service = new DesktopWechatService(
    createMockConfiguration(storagePath),
    createMockLogger(),
    createTrackingConversationCommand({ sendMessageCalls }),
    createMockWorkspaceQuery("workspace-fallback"),
    createMockModelsQuery(),
  );

  await service.getState();
  (service as any).sendTextChunks = async () => undefined;

  const attachmentBuffer = Buffer.from("fake-wechat-image");
  const attachmentPath = join(
    tmpdir(),
    `maomi-desktop-wechat-attachment-${Date.now()}-${Math.random().toString(16).slice(2)}.png`,
  );
  await writeFile(attachmentPath, attachmentBuffer);

  (service as any).storage.accounts.push({
    accountId: "wechat-account",
    token: "wechat-token",
    enabled: true,
    updatedAt: "2026-05-07T00:00:00.000Z",
  });
  (service as any).storage.bindings.push({
    key: "wechat-account:peer-1",
    accountId: "wechat-account",
    peerId: "peer-1",
    homeWorkspaceId: "workspace-fallback",
    workspaceId: "workspace-fallback",
    sessionId: "existing-session",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    runtimeSessionVersion: "wechat-capabilities-v1",
  });
  (service as any).storage.processedMessages.push({
    accountId: "wechat-account",
    peerId: "peer-1",
    messageId: "message-4",
    conversationKey: "wechat-account:peer-1",
    status: "pending",
    queryPreview: "分析这张图",
    responsePreview: "处理中",
    mediaAssets: [{
      kind: "image",
      path: attachmentPath,
      mimeType: "image/png",
      fileName: "input.png",
      sizeBytes: attachmentBuffer.byteLength,
    }],
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
  });

  await (service as any).processQueuedMessage({
    accountId: "wechat-account",
    peerId: "peer-1",
    conversationKey: "wechat-account:peer-1",
    messageId: "message-4",
    text: "分析这张图",
    createdAt: "2026-05-07T00:00:00.000Z",
  });

  expect(sendMessageCalls).toHaveLength(1);
  expect(sendMessageCalls[0]?.attachments).toHaveLength(1);
  expect(sendMessageCalls[0]?.attachments?.[0]).toMatchObject({
    kind: "image",
    fileName: "input.png",
    mimeType: "image/png",
    sizeBytes: attachmentBuffer.byteLength,
    dataBase64: attachmentBuffer.toString("base64"),
  });
});

test("desktop wechat falls back to the first available runtime model when saved selection is invalid", async () => {
  const storagePath = join(
    tmpdir(),
    `maomi-desktop-wechat-binding-model-fallback-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const sendMessageCalls: DesktopConversationSendMessageInput[] = [];
  const service = new DesktopWechatService(
    createMockConfiguration(storagePath),
    createMockLogger(),
    createTrackingConversationCommand({ sendMessageCalls }),
    createMockWorkspaceQuery("workspace-fallback"),
    createMockModelsQuery({
      channels: [{
        value: "channel-alpha",
        label: "Channel Alpha",
        providerType: "openai",
        enabled: true,
      }, {
        value: "channel-beta",
        label: "Channel Beta",
        providerType: "openai",
        enabled: true,
      }],
      models: [{
        value: "model-alpha",
        label: "Model Alpha",
        providerType: "openai",
        channelId: "channel-alpha",
        effectiveEnabled: true,
      }, {
        value: "model-beta",
        label: "Model Beta",
        providerType: "openai",
        channelId: "channel-beta",
        effectiveEnabled: true,
      }],
      defaultSelection: {
        channelId: "channel-alpha",
        modelId: "model-alpha",
      },
    }),
  );

  await service.getState();
  (service as any).sendTextChunks = async () => undefined;
  (service as any).storage.config.selectedChannelId = "missing-channel";
  (service as any).storage.config.selectedModelId = "missing-model";
  (service as any).storage.accounts.push({
    accountId: "wechat-account",
    token: "wechat-token",
    enabled: true,
    updatedAt: "2026-05-07T00:00:00.000Z",
  });
  (service as any).storage.bindings.push({
    key: "wechat-account:peer-1",
    accountId: "wechat-account",
    peerId: "peer-1",
    homeWorkspaceId: "workspace-fallback",
    workspaceId: "workspace-fallback",
    sessionId: "existing-session",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    runtimeSessionVersion: "wechat-capabilities-v1",
  });
  (service as any).storage.processedMessages.push({
    accountId: "wechat-account",
    peerId: "peer-1",
    messageId: "message-5",
    conversationKey: "wechat-account:peer-1",
    status: "pending",
    queryPreview: "继续处理",
    responsePreview: "处理中",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
  });

  await (service as any).processQueuedMessage({
    accountId: "wechat-account",
    peerId: "peer-1",
    conversationKey: "wechat-account:peer-1",
    messageId: "message-5",
    text: "继续处理",
    createdAt: "2026-05-07T00:00:00.000Z",
  });

  expect(sendMessageCalls).toHaveLength(1);
  expect(sendMessageCalls[0]).toMatchObject({
    selectedChannelId: "channel-alpha",
    selectedModelId: "model-alpha",
  });

  const state = await service.getState();
  expect(state.config.selectedChannelId).toBe("channel-alpha");
  expect(state.config.selectedModelId).toBe("model-alpha");
});