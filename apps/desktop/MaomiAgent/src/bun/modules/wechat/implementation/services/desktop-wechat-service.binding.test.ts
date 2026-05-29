import { expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { DesktopConfigurationPort } from "../../../configuration";
import type { RuntimeLogExtra, RuntimeLogLevel, RuntimeLogRecord, RuntimeLogger } from "../../../logs";
import type { DesktopModelsQueryPort } from "../../../models";
import type {
  DesktopConversationAnswerInteractionInput,
  DesktopConversationCommandPort,
  DesktopConversationCreateSessionInput,
  DesktopConversationCreateSessionResponse,
  DesktopConversationHideSessionResponse,
  DesktopConversationInteractionReplyResponse,
  DesktopConversationRejectInteractionInput,
  DesktopConversationSaveWorkspaceSettingsInput,
  DesktopConversationSaveWorkspaceSettingsResponse,
  DesktopConversationSendMessageInput,
  DesktopConversationSendMessageResponse,
  DesktopConversationSessionDetail,
  DesktopConversationStopMessageInput,
  DesktopConversationStopMessageResponse,
} from "../../../conversation";
import type { DesktopWorkspaceItem, DesktopWorkspaceQueryPort } from "../../../workspace";
import { WECHAT_AGENT_ID } from "../../../../../shared/conversation/managed-execution";
import { createDefaultDesktopConversationWorkspaceSettings } from "../../../../../shared/desktop-conversation";
import { DesktopWechatService } from "./desktop-wechat-service";
import type { WechatInboundMessage } from "./wechat-api-client";

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
  const detail = createConversationDetail();

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
    saveWorkspaceSettings: async (
      input: DesktopConversationSaveWorkspaceSettingsInput,
    ): Promise<DesktopConversationSaveWorkspaceSettingsResponse> => ({
      workspaceId: input.workspaceId,
      version: 1,
      path: "",
      updatedAt: new Date(0).toISOString(),
      settings: createDefaultDesktopConversationWorkspaceSettings(),
      warnings: [],
      syncedSessionCount: 0,
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
  sendMessageDetail?: DesktopConversationSessionDetail;
  sendMessageHandler?: (
    sendInput: DesktopConversationSendMessageInput,
  ) => Promise<DesktopConversationSendMessageResponse>;
}): DesktopConversationCommandPort {
  const detail = input.sendMessageDetail ?? createConversationDetail();

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
    saveWorkspaceSettings: async (
      input: DesktopConversationSaveWorkspaceSettingsInput,
    ): Promise<DesktopConversationSaveWorkspaceSettingsResponse> => ({
      workspaceId: input.workspaceId,
      version: 1,
      path: "",
      updatedAt: new Date(0).toISOString(),
      settings: createDefaultDesktopConversationWorkspaceSettings(),
      warnings: [],
      syncedSessionCount: 0,
    }),
    sendMessage: async (
      sendInput: DesktopConversationSendMessageInput,
    ): Promise<DesktopConversationSendMessageResponse> => {
      input.sendMessageCalls?.push(sendInput);
      if (input.sendMessageHandler) {
        return input.sendMessageHandler(sendInput);
      }
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

function createConversationDetail(
  overrides: Partial<DesktopConversationSessionDetail> = {},
): DesktopConversationSessionDetail {
  const now = new Date().toISOString();
  return {
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
    ...overrides,
  };
}

function createInboundTextMessage(input: {
  messageId: number;
  peerId?: string;
  text: string;
  createdAtMs: number;
  contextToken?: string;
}): WechatInboundMessage {
  return {
    message_id: input.messageId,
    from_user_id: input.peerId ?? "peer-1",
    create_time_ms: input.createdAtMs,
    message_type: 1,
    item_list: [{
      type: 1,
      text_item: {
        text: input.text,
      },
    }],
    context_token: input.contextToken,
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
  expect(createSessionCalls[0]?.selectedAgentId).toBe(WECHAT_AGENT_ID);
  expect(createSessionCalls[0]?.metadata).toEqual({
    source: "wechat",
    accountId: "wechat-account",
    peerId: "peer-1",
    conversationSettings: {
      capabilityPreferences: {
        "mcp.runtime": false,
        "skills.runtime": false,
        "wechat.runtime": true,
      },
    },
  });
  expect(binding.runtimeSessionVersion).toBe("wechat-capabilities-v2");

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
  expect(binding.runtimeSessionVersion).toBe("wechat-capabilities-v2");
  expect(binding.lastMessageId).toBe("message-2");
});

test("desktop wechat captures the desktop and sends the image through the bound conversation", async () => {
  const storagePath = join(
    tmpdir(),
    `maomi-desktop-wechat-binding-capture-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const service = new DesktopWechatService(
    createMockConfiguration(storagePath),
    createMockLogger(),
    createTrackingConversationCommand({}),
    createMockWorkspaceQuery("workspace-fallback"),
    createMockModelsQuery(),
    async ({ outputDir }) => {
      const filePath = join(outputDir, "capture.png");
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, "fake-image");
      return {
        filePath,
        fileName: "capture.png",
      };
    },
  );

  await service.getState();
  (service as any).storage.accounts.push({
    accountId: "wechat-account",
    token: "wechat-token",
    enabled: true,
    updatedAt: "2026-05-21T00:00:00.000Z",
  });
  (service as any).storage.bindings.push({
    key: "wechat-account:peer-1",
    accountId: "wechat-account",
    peerId: "peer-1",
    homeWorkspaceId: "workspace-fallback",
    workspaceId: "workspace-fallback",
    sessionId: "existing-session",
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z",
    runtimeSessionVersion: "wechat-capabilities-v2",
  });

  const originalSendConversationMedia = service.sendConversationMedia.bind(service);
  const mediaCalls: Array<{ sessionId: string; filePath: string; contextToken?: string }> = [];
  (service as any).sendConversationMedia = async (
    input: { sessionId: string; filePath: string; contextToken?: string },
  ) => {
    mediaCalls.push(input);
    return {
      clientId: "media-client-1",
      kind: "image",
      fileName: "capture.png",
      mimeType: "image/png",
      contextToken: input.contextToken,
    };
  };

  try {
    const result = await service.captureConversationDesktopAndSend({
      sessionId: "existing-session",
    });

    expect(mediaCalls).toHaveLength(1);
    expect(mediaCalls[0]).toMatchObject({
      sessionId: "existing-session",
      contextToken: undefined,
    });
    expect(mediaCalls[0]?.filePath).toContain("capture.png");
    expect(result).toMatchObject({
      clientId: "media-client-1",
      kind: "image",
      fileName: "capture.png",
    });
    expect(result.filePath).toContain("capture.png");
  } finally {
    (service as any).sendConversationMedia = originalSendConversationMedia;
  }
});

test("desktop wechat routes inbound messages through the dedicated wechat agent for existing bindings", async () => {
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
    runtimeSessionVersion: "wechat-capabilities-v2",
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
    messageIds: ["message-3"],
    text: "请用 easytouch 截图",
    createdAt: "2026-05-07T00:00:00.000Z",
  });

  expect(sendMessageCalls).toHaveLength(1);
  expect(sendMessageCalls[0]).toMatchObject({
    sessionId: "existing-session",
    workspaceId: "workspace-fallback",
    selectedAgentId: WECHAT_AGENT_ID,
  });
});

test("desktop wechat ignores recovered stale messages while keeping them in runtime context", async () => {
  const storagePath = join(
    tmpdir(),
    `maomi-desktop-wechat-binding-stale-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const sendMessageCalls: DesktopConversationSendMessageInput[] = [];
  const outboundReplies: string[] = [];
  const service = new DesktopWechatService(
    createMockConfiguration(storagePath),
    createMockLogger(),
    createTrackingConversationCommand({ sendMessageCalls }),
    createMockWorkspaceQuery("workspace-fallback"),
    createMockModelsQuery(),
  );
  const nowMs = Date.now();

  await service.getState();
  (service as any).serviceStartedAtMs = nowMs;
  (service as any).sendTextChunks = async (input: { text: string }) => {
    outboundReplies.push(input.text);
    return undefined;
  };
  (service as any).storage.accounts.push({
    accountId: "wechat-account",
    token: "wechat-token",
    enabled: true,
    updatedAt: "2026-05-19T08:30:00.000Z",
  });

  const changed = await (service as any).consumeInboundMessages("wechat-account", [createInboundTextMessage({
    messageId: 101,
    text: "这是一条恢复的旧消息",
    createdAtMs: nowMs - (2 * 60 * 1000),
  })]);

  expect(changed).toBe(true);
  expect(sendMessageCalls).toHaveLength(0);
  expect(outboundReplies).toHaveLength(0);

  const processedMessage = (service as any).storage.processedMessages.find((item: { messageId: string }) => item.messageId === "101");
  expect(processedMessage).toMatchObject({
    status: "ignored",
    responsePreview: "已记录旧消息，不自动回复",
  });

  (service as any).storage.bindings.push({
    key: "wechat-account:peer-1",
    accountId: "wechat-account",
    peerId: "peer-1",
    homeWorkspaceId: "workspace-fallback",
    workspaceId: "workspace-fallback",
    sessionId: "existing-session",
    createdAt: "2026-05-19T08:30:00.000Z",
    updatedAt: "2026-05-19T08:30:00.000Z",
    runtimeSessionVersion: "wechat-capabilities-v1",
  });

  const runtimeContext = await service.getConversationRuntimeContext("existing-session");
  expect(runtimeContext?.recentMessages[0]).toMatchObject({
    messageId: "101",
    status: "ignored",
    queryPreview: "这是一条恢复的旧消息",
  });
});

test("desktop wechat merges burst messages into one conversation turn and one reply", async () => {
  const storagePath = join(
    tmpdir(),
    `maomi-desktop-wechat-binding-merged-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const sendMessageCalls: DesktopConversationSendMessageInput[] = [];
  const outboundReplies: string[] = [];
  const service = new DesktopWechatService(
    createMockConfiguration(storagePath),
    createMockLogger(),
    createTrackingConversationCommand({
      sendMessageCalls,
      sendMessageDetail: createConversationDetail({
        sessionId: "existing-session",
        workspaceId: "workspace-fallback",
        messages: [{
          messageId: "assistant-merged",
          role: "assistant",
          createdAt: Date.parse("2026-05-19T08:30:05.000Z"),
          parts: [{
            type: "text",
            partId: "text-merged",
            text: "收到，已合并处理。",
          }],
        } as any],
      }),
    }),
    createMockWorkspaceQuery("workspace-fallback"),
    createMockModelsQuery(),
  );
  const nowMs = Date.now();

  await service.getState();
  (service as any).serviceStartedAtMs = nowMs - 10_000;
  (service as any).sendTextChunks = async (input: { text: string }) => {
    outboundReplies.push(input.text);
    return undefined;
  };
  (service as any).storage.accounts.push({
    accountId: "wechat-account",
    token: "wechat-token",
    enabled: true,
    updatedAt: "2026-05-19T08:30:00.000Z",
  });
  (service as any).storage.bindings.push({
    key: "wechat-account:peer-1",
    accountId: "wechat-account",
    peerId: "peer-1",
    homeWorkspaceId: "workspace-fallback",
    workspaceId: "workspace-fallback",
    sessionId: "existing-session",
    createdAt: "2026-05-19T08:30:00.000Z",
    updatedAt: "2026-05-19T08:30:00.000Z",
    runtimeSessionVersion: "wechat-capabilities-v1",
  });

  await (service as any).consumeInboundMessages("wechat-account", [
    createInboundTextMessage({
      messageId: 201,
      text: "第一条消息",
      createdAtMs: nowMs - 4_000,
    }),
    createInboundTextMessage({
      messageId: 202,
      text: "第二条消息",
      createdAtMs: nowMs - 2_000,
      contextToken: "ctx-202",
    }),
  ]);

  expect(sendMessageCalls).toHaveLength(0);
  expect((service as any).conversationPendingCounts.get("wechat-account:peer-1")).toBe(2);

  (service as any).flushBufferedConversation("wechat-account:peer-1");
  await ((service as any).conversationQueues.get("wechat-account:peer-1") ?? Promise.resolve());

  expect(sendMessageCalls).toHaveLength(1);
  expect(sendMessageCalls[0]).toMatchObject({
    sessionId: "existing-session",
    workspaceId: "workspace-fallback",
    text: "第一条消息\n\n第二条消息",
    selectedAgentId: WECHAT_AGENT_ID,
  });
  expect(outboundReplies).toEqual(["收到，已合并处理。"]);
  expect((service as any).conversationPendingCounts.has("wechat-account:peer-1")).toBe(false);

  const processedMessages = (service as any).storage.processedMessages
    .filter((item: { conversationKey: string }) => item.conversationKey === "wechat-account:peer-1");
  expect(processedMessages).toHaveLength(2);
  expect(processedMessages.every((item: { status: string }) => item.status === "completed")).toBe(true);
});

test("desktop wechat drops stale replies when a newer message arrives before the old turn returns", async () => {
  const storagePath = join(
    tmpdir(),
    `maomi-desktop-wechat-binding-superseded-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const sendMessageCalls: DesktopConversationSendMessageInput[] = [];
  const outboundReplies: string[] = [];
  let service!: DesktopWechatService;
  const conversationDetail = createConversationDetail({
    sessionId: "existing-session",
    workspaceId: "workspace-fallback",
    messages: [{
      messageId: "assistant-stale",
      role: "assistant",
      createdAt: Date.now(),
      parts: [{
        type: "text",
        partId: "text-stale",
        text: "截图已成功发送到你的微信了！",
      }],
    } as any],
  });

  const conversationCommand = createTrackingConversationCommand({
    sendMessageCalls,
    sendMessageDetail: conversationDetail,
    sendMessageHandler: async (_sendInput) => {
      (service as any).storage.processedMessages.unshift({
        accountId: "wechat-account",
        peerId: "peer-1",
        messageId: "message-newer",
        conversationKey: "wechat-account:peer-1",
        status: "pending",
        queryPreview: "1+1=",
        responsePreview: "处理中",
        createdAt: new Date(Date.now() + 1_000).toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return {
        detail: conversationDetail,
      };
    },
  });

  service = new DesktopWechatService(
    createMockConfiguration(storagePath),
    createMockLogger(),
    conversationCommand,
    createMockWorkspaceQuery("workspace-fallback"),
    createMockModelsQuery(),
  );

  await service.getState();
  (service as any).sendTextChunks = async (input: { text: string }) => {
    outboundReplies.push(input.text);
    return undefined;
  };
  (service as any).storage.accounts.push({
    accountId: "wechat-account",
    token: "wechat-token",
    enabled: true,
    updatedAt: "2026-05-19T09:00:00.000Z",
  });
  (service as any).storage.bindings.push({
    key: "wechat-account:peer-1",
    accountId: "wechat-account",
    peerId: "peer-1",
    homeWorkspaceId: "workspace-fallback",
    workspaceId: "workspace-fallback",
    sessionId: "existing-session",
    createdAt: "2026-05-19T09:00:00.000Z",
    updatedAt: "2026-05-19T09:00:00.000Z",
    runtimeSessionVersion: "wechat-capabilities-v1",
  });
  (service as any).storage.processedMessages.push({
    accountId: "wechat-account",
    peerId: "peer-1",
    messageId: "message-old",
    conversationKey: "wechat-account:peer-1",
    status: "pending",
    queryPreview: "使用 easytouch 技能截图发我",
    responsePreview: "处理中",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await (service as any).processQueuedMessage({
    accountId: "wechat-account",
    peerId: "peer-1",
    conversationKey: "wechat-account:peer-1",
    messageIds: ["message-old"],
    text: "使用 easytouch 技能截图发我",
    createdAt: new Date().toISOString(),
    latestCreatedAt: new Date().toISOString(),
  });

  expect(sendMessageCalls).toHaveLength(1);
  expect(outboundReplies).toHaveLength(0);

  const oldProcessedMessage = (service as any).storage.processedMessages.find((item: { messageId: string }) => item.messageId === "message-old");
  expect(oldProcessedMessage).toMatchObject({
    status: "ignored",
    responsePreview: "已跳到较新的消息",
  });
});

test("desktop wechat does not reuse the previous assistant reply when the current turn has no fresh assistant message", async () => {
  const storagePath = join(
    tmpdir(),
    `maomi-desktop-wechat-binding-no-fresh-reply-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const outboundReplies: string[] = [];
  const service = new DesktopWechatService(
    createMockConfiguration(storagePath),
    createMockLogger(),
    createTrackingConversationCommand({
      sendMessageDetail: createConversationDetail({
        sessionId: "existing-session",
        workspaceId: "workspace-fallback",
        runs: [{
          id: "run-old",
          sessionId: "existing-session",
          status: "completed",
          startedAt: Date.parse("2026-05-19T09:00:00.000Z"),
          updatedAt: Date.parse("2026-05-19T09:00:10.000Z"),
          completedAt: Date.parse("2026-05-19T09:00:10.000Z"),
          trigger: {
            kind: "user_message",
            refId: "user-old",
          },
        } as any, {
          id: "run-new",
          sessionId: "existing-session",
          status: "completed",
          startedAt: Date.parse("2026-05-19T09:01:00.000Z"),
          updatedAt: Date.parse("2026-05-19T09:01:10.000Z"),
          completedAt: Date.parse("2026-05-19T09:01:10.000Z"),
          trigger: {
            kind: "user_message",
            refId: "user-new",
          },
        } as any],
        messages: [
          {
            messageId: "assistant-old",
            role: "assistant",
            runId: "run-old",
            createdAt: Date.parse("2026-05-19T09:00:00.000Z"),
            parts: [{
              type: "text",
              partId: "text-old",
              text: "截图已成功发送到你的微信了！",
            }],
          } as any,
          {
            messageId: "user-new",
            role: "user",
            createdAt: Date.parse("2026-05-19T09:01:00.000Z"),
            parts: [{
              type: "text",
              partId: "text-user",
              text: "2+2=",
            }],
          } as any,
        ],
      }),
    }),
    createMockWorkspaceQuery("workspace-fallback"),
    createMockModelsQuery(),
  );

  await service.getState();
  (service as any).sendTextChunks = async (input: { text: string }) => {
    outboundReplies.push(input.text);
    return undefined;
  };
  (service as any).storage.accounts.push({
    accountId: "wechat-account",
    token: "wechat-token",
    enabled: true,
    updatedAt: "2026-05-19T09:00:00.000Z",
  });
  (service as any).storage.bindings.push({
    key: "wechat-account:peer-1",
    accountId: "wechat-account",
    peerId: "peer-1",
    homeWorkspaceId: "workspace-fallback",
    workspaceId: "workspace-fallback",
    sessionId: "existing-session",
    createdAt: "2026-05-19T09:00:00.000Z",
    updatedAt: "2026-05-19T09:00:00.000Z",
    runtimeSessionVersion: "wechat-capabilities-v1",
  });
  (service as any).storage.processedMessages.push({
    accountId: "wechat-account",
    peerId: "peer-1",
    messageId: "message-no-fresh",
    conversationKey: "wechat-account:peer-1",
    status: "pending",
    queryPreview: "2+2=",
    responsePreview: "处理中",
    createdAt: "2026-05-19T09:01:00.000Z",
    updatedAt: "2026-05-19T09:01:00.000Z",
  });

  await (service as any).processQueuedMessage({
    accountId: "wechat-account",
    peerId: "peer-1",
    conversationKey: "wechat-account:peer-1",
    messageIds: ["message-no-fresh"],
    text: "2+2=",
    createdAt: "2026-05-19T09:01:00.000Z",
    latestCreatedAt: "2026-05-19T09:01:00.000Z",
  });

  expect(outboundReplies).toHaveLength(0);

  const processedMessage = (service as any).storage.processedMessages.find((item: { messageId: string }) => item.messageId === "message-no-fresh");
  expect(processedMessage).toMatchObject({
    status: "ignored",
    responsePreview: "未生成新的文本回复",
  });
});

test("desktop wechat surfaces latest run assistant errors instead of sending a fake success fallback", async () => {
  const storagePath = join(
    tmpdir(),
    `maomi-desktop-wechat-binding-run-error-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const outboundReplies: string[] = [];
  const service = new DesktopWechatService(
    createMockConfiguration(storagePath),
    createMockLogger(),
    createTrackingConversationCommand({
      sendMessageDetail: createConversationDetail({
        sessionId: "existing-session",
        workspaceId: "workspace-fallback",
        runs: [{
          id: "run-failed",
          sessionId: "existing-session",
          status: "failed",
          startedAt: Date.parse("2026-05-19T11:16:00.000Z"),
          updatedAt: Date.parse("2026-05-19T11:16:01.000Z"),
          completedAt: Date.parse("2026-05-19T11:16:01.000Z"),
          trigger: {
            kind: "user_message",
            refId: "user-new",
          },
        } as any],
        messages: [
          {
            messageId: "assistant-error",
            role: "assistant",
            runId: "run-failed",
            createdAt: Date.parse("2026-05-19T11:16:00.500Z"),
            parts: [{
              type: "error",
              partId: "part-error",
              error: {
                code: "400",
                message: "Param Incorrect",
                retryable: false,
              },
            }],
          } as any,
          {
            messageId: "user-new",
            role: "user",
            createdAt: Date.parse("2026-05-19T11:16:00.000Z"),
            parts: [{
              type: "text",
              partId: "text-user-new",
              text: "猫跟狗的区别",
            }],
          } as any,
        ],
      }),
    }),
    createMockWorkspaceQuery("workspace-fallback"),
    createMockModelsQuery(),
  );

  await service.getState();
  (service as any).sendTextChunks = async (input: { text: string }) => {
    outboundReplies.push(input.text);
    return undefined;
  };
  (service as any).storage.accounts.push({
    accountId: "wechat-account",
    token: "wechat-token",
    enabled: true,
    updatedAt: "2026-05-19T11:16:00.000Z",
  });
  (service as any).storage.bindings.push({
    key: "wechat-account:peer-1",
    accountId: "wechat-account",
    peerId: "peer-1",
    homeWorkspaceId: "workspace-fallback",
    workspaceId: "workspace-fallback",
    sessionId: "existing-session",
    createdAt: "2026-05-19T09:00:00.000Z",
    updatedAt: "2026-05-19T09:00:00.000Z",
    runtimeSessionVersion: "wechat-capabilities-v1",
  });
  (service as any).storage.processedMessages.push({
    accountId: "wechat-account",
    peerId: "peer-1",
    messageId: "message-run-error",
    conversationKey: "wechat-account:peer-1",
    status: "pending",
    queryPreview: "猫跟狗的区别",
    responsePreview: "处理中",
    createdAt: "2026-05-19T11:16:00.000Z",
    updatedAt: "2026-05-19T11:16:00.000Z",
  });

  await (service as any).processQueuedMessage({
    accountId: "wechat-account",
    peerId: "peer-1",
    conversationKey: "wechat-account:peer-1",
    messageIds: ["message-run-error"],
    text: "猫跟狗的区别",
    createdAt: "2026-05-19T11:16:00.000Z",
    latestCreatedAt: "2026-05-19T11:16:00.000Z",
  });

  expect(outboundReplies).toEqual([
    "处理失败：当前模型调用失败：Param Incorrect",
  ]);

  const processedMessage = (service as any).storage.processedMessages.find((item: { messageId: string }) => item.messageId === "message-run-error");
  expect(processedMessage).toMatchObject({
    status: "failed",
    responsePreview: "当前模型调用失败：Param Incorrect",
  });
});

test("desktop wechat extracts the latest run assistant reply even when raw message order places assistant before the newest user", async () => {
  const storagePath = join(
    tmpdir(),
    `maomi-desktop-wechat-binding-run-aware-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const outboundReplies: string[] = [];
  const service = new DesktopWechatService(
    createMockConfiguration(storagePath),
    createMockLogger(),
    createTrackingConversationCommand({
      sendMessageDetail: createConversationDetail({
        sessionId: "existing-session",
        workspaceId: "workspace-fallback",
        runs: [{
          id: "run-old",
          sessionId: "existing-session",
          status: "completed",
          startedAt: Date.parse("2026-05-19T09:00:00.000Z"),
          updatedAt: Date.parse("2026-05-19T09:00:10.000Z"),
          completedAt: Date.parse("2026-05-19T09:00:10.000Z"),
          trigger: {
            kind: "user_message",
            refId: "user-old",
          },
        } as any, {
          id: "run-new",
          sessionId: "existing-session",
          status: "completed",
          startedAt: Date.parse("2026-05-19T09:01:00.000Z"),
          updatedAt: Date.parse("2026-05-19T09:01:10.000Z"),
          completedAt: Date.parse("2026-05-19T09:01:10.000Z"),
          trigger: {
            kind: "user_message",
            refId: "user-new",
          },
        } as any],
        messages: [
          {
            messageId: "assistant-new",
            role: "assistant",
            runId: "run-new",
            createdAt: Date.parse("2026-05-19T09:01:00.000Z"),
            parts: [{
              type: "text",
              partId: "text-new",
              text: "4",
            }],
          } as any,
          {
            messageId: "user-new",
            role: "user",
            createdAt: Date.parse("2026-05-19T09:01:00.000Z"),
            parts: [{
              type: "text",
              partId: "text-user-new",
              text: "2+2=",
            }],
          } as any,
          {
            messageId: "assistant-old",
            role: "assistant",
            runId: "run-old",
            createdAt: Date.parse("2026-05-19T09:00:00.000Z"),
            parts: [{
              type: "text",
              partId: "text-old",
              text: "旧答案",
            }],
          } as any,
        ],
      }),
    }),
    createMockWorkspaceQuery("workspace-fallback"),
    createMockModelsQuery(),
  );

  await service.getState();
  (service as any).sendTextChunks = async (input: { text: string }) => {
    outboundReplies.push(input.text);
    return undefined;
  };
  (service as any).storage.accounts.push({
    accountId: "wechat-account",
    token: "wechat-token",
    enabled: true,
    updatedAt: "2026-05-19T09:01:00.000Z",
  });
  (service as any).storage.bindings.push({
    key: "wechat-account:peer-1",
    accountId: "wechat-account",
    peerId: "peer-1",
    homeWorkspaceId: "workspace-fallback",
    workspaceId: "workspace-fallback",
    sessionId: "existing-session",
    createdAt: "2026-05-19T09:00:00.000Z",
    updatedAt: "2026-05-19T09:00:00.000Z",
    runtimeSessionVersion: "wechat-capabilities-v1",
  });
  (service as any).storage.processedMessages.push({
    accountId: "wechat-account",
    peerId: "peer-1",
    messageId: "message-run-aware",
    conversationKey: "wechat-account:peer-1",
    status: "pending",
    queryPreview: "2+2=",
    responsePreview: "处理中",
    createdAt: "2026-05-19T09:01:00.000Z",
    updatedAt: "2026-05-19T09:01:00.000Z",
  });

  await (service as any).processQueuedMessage({
    accountId: "wechat-account",
    peerId: "peer-1",
    conversationKey: "wechat-account:peer-1",
    messageIds: ["message-run-aware"],
    text: "2+2=",
    createdAt: "2026-05-19T09:01:00.000Z",
    latestCreatedAt: "2026-05-19T09:01:00.000Z",
  });

  expect(outboundReplies).toEqual(["4"]);
});

test("desktop wechat strips reasoning and internal execution traces from outbound replies", async () => {
  const storagePath = join(
    tmpdir(),
    `maomi-desktop-wechat-binding-sanitized-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const outboundReplies: string[] = [];
  const service = new DesktopWechatService(
    createMockConfiguration(storagePath),
    createMockLogger(),
    createTrackingConversationCommand({
      sendMessageDetail: createConversationDetail({
        sessionId: "existing-session",
        workspaceId: "workspace-fallback",
        messages: [{
          messageId: "assistant-1",
          role: "assistant",
          createdAt: Date.parse("2026-05-07T00:00:01.000Z"),
          parts: [
            {
              type: "reasoning",
              partId: "reasoning-1",
              text: "执行摘要：使用 PowerShell CopyFromScreen",
            },
            {
              type: "text",
              partId: "text-1",
              text: [
                "图片已经发给你了",
                "执行摘要：使用 PowerShell CopyFromScreen",
                "C:\\Users\\ASUS\\Desktop\\screenshot.png",
                "The file timestamp shows it was just taken",
              ].join("\n"),
            },
          ],
        } as any],
      }),
    }),
    createMockWorkspaceQuery("workspace-fallback"),
    createMockModelsQuery(),
  );

  await service.getState();
  (service as any).sendTextChunks = async (input: { text: string }) => {
    outboundReplies.push(input.text);
    return undefined;
  };
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
    runtimeSessionVersion: "wechat-capabilities-v2",
  });
  (service as any).storage.processedMessages.push({
    accountId: "wechat-account",
    peerId: "peer-1",
    messageId: "message-sanitized",
    conversationKey: "wechat-account:peer-1",
    status: "pending",
    queryPreview: "请把截图发给我",
    responsePreview: "处理中",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
  });

  await (service as any).processQueuedMessage({
    accountId: "wechat-account",
    peerId: "peer-1",
    conversationKey: "wechat-account:peer-1",
    messageIds: ["message-sanitized"],
    text: "请把截图发给我",
    createdAt: "2026-05-07T00:00:00.000Z",
  });

  expect(outboundReplies).toEqual(["图片已经发给你了"]);
});

test("desktop wechat trims inline screenshot metadata from a single visible reply line", async () => {
  const storagePath = join(
    tmpdir(),
    `maomi-desktop-wechat-binding-inline-cutoff-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const outboundReplies: string[] = [];
  const service = new DesktopWechatService(
    createMockConfiguration(storagePath),
    createMockLogger(),
    createTrackingConversationCommand({
      sendMessageDetail: createConversationDetail({
        sessionId: "existing-session",
        workspaceId: "workspace-fallback",
        messages: [{
          messageId: "assistant-inline",
          role: "assistant",
          createdAt: Date.parse("2026-05-19T09:01:01.000Z"),
          parts: [{
            type: "text",
            partId: "text-inline",
            text: "截图已成功发送到你的微信了！🎉 - ⏰ 截图时间：2026-05-11 18:41:23 - 💾 文件保存：C:\\Users\\ASUS\\Desktop\\screenshot.png - ✅ 已通过微信发送给你",
          }],
        } as any, {
          messageId: "user-inline",
          role: "user",
          createdAt: Date.parse("2026-05-19T09:01:00.000Z"),
          parts: [{
            type: "text",
            partId: "text-user-inline",
            text: "把截图发给我",
          }],
        } as any].sort((left, right) => left.createdAt - right.createdAt),
      }),
    }),
    createMockWorkspaceQuery("workspace-fallback"),
    createMockModelsQuery(),
  );

  await service.getState();
  (service as any).sendTextChunks = async (input: { text: string }) => {
    outboundReplies.push(input.text);
    return undefined;
  };
  (service as any).storage.accounts.push({
    accountId: "wechat-account",
    token: "wechat-token",
    enabled: true,
    updatedAt: "2026-05-19T09:01:00.000Z",
  });
  (service as any).storage.bindings.push({
    key: "wechat-account:peer-1",
    accountId: "wechat-account",
    peerId: "peer-1",
    homeWorkspaceId: "workspace-fallback",
    workspaceId: "workspace-fallback",
    sessionId: "existing-session",
    createdAt: "2026-05-19T09:00:00.000Z",
    updatedAt: "2026-05-19T09:00:00.000Z",
    runtimeSessionVersion: "wechat-capabilities-v1",
  });
  (service as any).storage.processedMessages.push({
    accountId: "wechat-account",
    peerId: "peer-1",
    messageId: "message-inline",
    conversationKey: "wechat-account:peer-1",
    status: "pending",
    queryPreview: "把截图发给我",
    responsePreview: "处理中",
    createdAt: "2026-05-19T09:01:00.000Z",
    updatedAt: "2026-05-19T09:01:00.000Z",
  });

  await (service as any).processQueuedMessage({
    accountId: "wechat-account",
    peerId: "peer-1",
    conversationKey: "wechat-account:peer-1",
    messageIds: ["message-inline"],
    text: "把截图发给我",
    createdAt: "2026-05-19T09:01:00.000Z",
    latestCreatedAt: "2026-05-19T09:01:00.000Z",
  });

  expect(outboundReplies).toEqual(["截图已成功发送到你的微信了！🎉"]);
});

test("desktop wechat converts pseudo tool markup without real tool calls into a stable failure notice", async () => {
  const storagePath = join(
    tmpdir(),
    `maomi-desktop-wechat-binding-pseudo-tool-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const outboundReplies: string[] = [];
  const service = new DesktopWechatService(
    createMockConfiguration(storagePath),
    createMockLogger(),
    createTrackingConversationCommand({
      sendMessageDetail: createConversationDetail({
        sessionId: "existing-session",
        workspaceId: "workspace-fallback",
        runs: [{
          id: "run-pseudo-tool",
          sessionId: "existing-session",
          status: "completed",
          startedAt: Date.parse("2026-05-20T09:30:00.000Z"),
          updatedAt: Date.parse("2026-05-20T09:30:01.000Z"),
          completedAt: Date.parse("2026-05-20T09:30:01.000Z"),
          trigger: {
            kind: "user_message",
            refId: "user-pseudo-tool",
          },
        } as any],
        messages: [
          {
            messageId: "assistant-pseudo-tool",
            role: "assistant",
            runId: "run-pseudo-tool",
            createdAt: Date.parse("2026-05-20T09:30:00.500Z"),
            parts: [{
              type: "text",
              partId: "text-pseudo-tool",
              text: [
                "<tool_call>",
                "<function=skill__easytouch>",
                "</function>",
                "</tool_call>",
              ].join("\n"),
            }],
          } as any,
          {
            messageId: "user-pseudo-tool",
            role: "user",
            createdAt: Date.parse("2026-05-20T09:30:00.000Z"),
            parts: [{
              type: "text",
              partId: "text-user-pseudo-tool",
              text: "使用 easytouch 把桌面截图发我",
            }],
          } as any,
        ],
        toolCalls: [],
      }),
    }),
    createMockWorkspaceQuery("workspace-fallback"),
    createMockModelsQuery(),
  );

  await service.getState();
  (service as any).sendTextChunks = async (input: { text: string }) => {
    outboundReplies.push(input.text);
    return undefined;
  };
  (service as any).storage.accounts.push({
    accountId: "wechat-account",
    token: "wechat-token",
    enabled: true,
    updatedAt: "2026-05-20T09:30:00.000Z",
  });
  (service as any).storage.bindings.push({
    key: "wechat-account:peer-1",
    accountId: "wechat-account",
    peerId: "peer-1",
    homeWorkspaceId: "workspace-fallback",
    workspaceId: "workspace-fallback",
    sessionId: "existing-session",
    createdAt: "2026-05-20T09:30:00.000Z",
    updatedAt: "2026-05-20T09:30:00.000Z",
    runtimeSessionVersion: "wechat-capabilities-v1",
  });
  (service as any).storage.processedMessages.push({
    accountId: "wechat-account",
    peerId: "peer-1",
    messageId: "message-pseudo-tool",
    conversationKey: "wechat-account:peer-1",
    status: "pending",
    queryPreview: "使用 easytouch 把桌面截图发我",
    responsePreview: "处理中",
    createdAt: "2026-05-20T09:30:00.000Z",
    updatedAt: "2026-05-20T09:30:00.000Z",
  });

  await (service as any).processQueuedMessage({
    accountId: "wechat-account",
    peerId: "peer-1",
    conversationKey: "wechat-account:peer-1",
    messageIds: ["message-pseudo-tool"],
    text: "使用 easytouch 把桌面截图发我",
    createdAt: "2026-05-20T09:30:00.000Z",
    latestCreatedAt: "2026-05-20T09:30:00.000Z",
  });

  expect(outboundReplies).toEqual([
    "处理失败：当前模型未完成该操作，请切换到支持工具调用的模型后重试。",
  ]);

  const processedMessage = (service as any).storage.processedMessages.find((item: { messageId: string }) => item.messageId === "message-pseudo-tool");
  expect(processedMessage).toMatchObject({
    status: "failed",
    responsePreview: "当前模型未完成该操作，请切换到支持工具调用的模型后重试。",
  });
});

test("desktop wechat keeps the natural-language result when the latest run has real tool calls", async () => {
  const storagePath = join(
    tmpdir(),
    `maomi-desktop-wechat-binding-pseudo-tool-success-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const outboundReplies: string[] = [];
  const service = new DesktopWechatService(
    createMockConfiguration(storagePath),
    createMockLogger(),
    createTrackingConversationCommand({
      sendMessageDetail: createConversationDetail({
        sessionId: "existing-session",
        workspaceId: "workspace-fallback",
        runs: [{
          id: "run-real-tool",
          sessionId: "existing-session",
          status: "completed",
          startedAt: Date.parse("2026-05-20T09:45:00.000Z"),
          updatedAt: Date.parse("2026-05-20T09:45:02.000Z"),
          completedAt: Date.parse("2026-05-20T09:45:02.000Z"),
          trigger: {
            kind: "user_message",
            refId: "user-real-tool",
          },
        } as any],
        messages: [
          {
            messageId: "assistant-real-tool",
            role: "assistant",
            runId: "run-real-tool",
            createdAt: Date.parse("2026-05-20T09:45:01.000Z"),
            parts: [{
              type: "text",
              partId: "text-real-tool",
              text: [
                "桌面截图已经发给你了。",
                "<tool_call>",
                "<function=wechat_send_media_file>",
                "</function>",
                "</tool_call>",
              ].join("\n"),
            }],
          } as any,
          {
            messageId: "user-real-tool",
            role: "user",
            createdAt: Date.parse("2026-05-20T09:45:00.000Z"),
            parts: [{
              type: "text",
              partId: "text-user-real-tool",
              text: "使用 easytouch 把桌面截图发我",
            }],
          } as any,
        ],
        toolCalls: [{
          callId: "tool-call-real-tool",
          sessionId: "existing-session",
          runId: "run-real-tool",
          turnId: "turn-real-tool",
          messageId: "assistant-real-tool",
          toolName: "wechat_send_media_file",
          status: "completed",
          input: { filePath: "C:/Users/ASUS/Desktop/screenshot.png" },
          output: { ok: true },
          startedAt: Date.parse("2026-05-20T09:45:00.200Z"),
          updatedAt: Date.parse("2026-05-20T09:45:00.500Z"),
          completedAt: Date.parse("2026-05-20T09:45:00.500Z"),
          operation: {
            kind: "tool_execution",
            label: "send wechat media",
          },
        } as any],
      }),
    }),
    createMockWorkspaceQuery("workspace-fallback"),
    createMockModelsQuery(),
  );

  await service.getState();
  (service as any).sendTextChunks = async (input: { text: string }) => {
    outboundReplies.push(input.text);
    return undefined;
  };
  (service as any).storage.accounts.push({
    accountId: "wechat-account",
    token: "wechat-token",
    enabled: true,
    updatedAt: "2026-05-20T09:45:00.000Z",
  });
  (service as any).storage.bindings.push({
    key: "wechat-account:peer-1",
    accountId: "wechat-account",
    peerId: "peer-1",
    homeWorkspaceId: "workspace-fallback",
    workspaceId: "workspace-fallback",
    sessionId: "existing-session",
    createdAt: "2026-05-20T09:45:00.000Z",
    updatedAt: "2026-05-20T09:45:00.000Z",
    runtimeSessionVersion: "wechat-capabilities-v1",
  });
  (service as any).storage.processedMessages.push({
    accountId: "wechat-account",
    peerId: "peer-1",
    messageId: "message-real-tool",
    conversationKey: "wechat-account:peer-1",
    status: "pending",
    queryPreview: "使用 easytouch 把桌面截图发我",
    responsePreview: "处理中",
    createdAt: "2026-05-20T09:45:00.000Z",
    updatedAt: "2026-05-20T09:45:00.000Z",
  });

  await (service as any).processQueuedMessage({
    accountId: "wechat-account",
    peerId: "peer-1",
    conversationKey: "wechat-account:peer-1",
    messageIds: ["message-real-tool"],
    text: "使用 easytouch 把桌面截图发我",
    createdAt: "2026-05-20T09:45:00.000Z",
    latestCreatedAt: "2026-05-20T09:45:00.000Z",
  });

  expect(outboundReplies).toEqual(["桌面截图已经发给你了。"]);
});

test("desktop wechat falls back to a stable reply when sanitization removes all content", async () => {
  const storagePath = join(
    tmpdir(),
    `maomi-desktop-wechat-binding-fallback-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );
  const outboundReplies: string[] = [];
  const service = new DesktopWechatService(
    createMockConfiguration(storagePath),
    createMockLogger(),
    createTrackingConversationCommand({
      sendMessageDetail: createConversationDetail({
        sessionId: "existing-session",
        workspaceId: "workspace-fallback",
        messages: [{
          messageId: "assistant-2",
          role: "assistant",
          createdAt: Date.parse("2026-05-07T00:00:01.000Z"),
          parts: [{
            type: "text",
            partId: "text-2",
            text: [
              "执行摘要：使用 PowerShell CopyFromScreen",
              "C:\\Users\\ASUS\\Desktop\\screenshot.png",
              "The file timestamp shows it was just taken",
            ].join("\n"),
          }],
        } as any],
      }),
    }),
    createMockWorkspaceQuery("workspace-fallback"),
    createMockModelsQuery(),
  );

  await service.getState();
  (service as any).sendTextChunks = async (input: { text: string }) => {
    outboundReplies.push(input.text);
    return undefined;
  };
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
    runtimeSessionVersion: "wechat-capabilities-v2",
  });
  (service as any).storage.processedMessages.push({
    accountId: "wechat-account",
    peerId: "peer-1",
    messageId: "message-fallback",
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
    messageIds: ["message-fallback"],
    text: "继续处理",
    createdAt: "2026-05-07T00:00:00.000Z",
  });

  expect(outboundReplies).toEqual(["已处理完成"]);
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
    messageIds: ["message-4"],
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
    messageIds: ["message-5"],
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
