import { describe, expect, test } from "bun:test";

import type {
  FeishuBotStateView,
  FeishuDocContentView,
  FeishuStateView,
} from "../../../../../shared/desktop-feishu";
import type {
  DesktopFeishuStoreSnapshot,
} from "../../abstraction/ports/desktop-feishu-store.ports";
import type { DesktopWorkspaceItem, DesktopWorkspacePort } from "../../../workspace";
import {
  DesktopFeishuBotRuntime,
  buildDesktopFeishuBotConversationKey,
  extractDesktopFeishuBotReplyText,
} from "./desktop-feishu-bot-runtime";
import { buildFeishuBotConversationMetadata } from "./desktop-feishu-bot-capability-policy";
import { buildChannelDedicatedWorkspaceDescriptor } from "../../../workspace/implementation/services/desktop-channel-dedicated-workspace";

function createState(): FeishuStateView {
  return {
    personalDocs: {
      enabled: false,
      discoveredTools: [],
      docsMcp: null,
    },
    smartAssistant: {
      enabled: false,
      appId: "",
      hasAppSecret: false,
      redirectUri: "",
      redirectOrigin: "",
      authStatus: "idle",
      authMethod: "oauth",
      hasRefreshToken: false,
      scopes: [],
      allowedTools: [],
      autoRefreshTask: {
        enabled: false,
      },
      docsMcp: null,
      runtimePolicy: {
        controlPlane: "planned",
        domainMounting: "lazy_by_domain",
        actionExecution: "registry_first",
      },
      connectionProfiles: [],
      domainModels: [],
      contextTemplates: [],
      policyItems: [],
      domains: [],
      actions: [],
    },
    mode: "none",
    personal: null,
    developer: null,
    managedMcp: null,
    docs: {
      personal: "https://open.feishu.cn",
      developer: "https://open.feishu.cn",
      authorize: "https://open.feishu.cn",
      token: "https://open.feishu.cn",
      refreshToken: "https://open.feishu.cn",
    },
    catalog: {
      developerScopes: [],
      developerTenantScopes: [],
      developerAllowedTools: [],
      supportedTools: [],
    },
  };
}

function createBotState(partial: Partial<FeishuBotStateView> = {}): FeishuBotStateView {
  return {
    enabled: true,
    appId: "cli_test_bot",
    appSecret: "secret-1",
    hasAppSecret: true,
    verificationToken: "",
    hasVerificationToken: false,
    encryptKey: "",
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
  };
}

function createSnapshot(): DesktopFeishuStoreSnapshot {
  return {
    state: createState(),
    bot: createBotState(),
    botRuntime: {
      version: "1.0",
      bindings: [],
      processedMessages: [],
      pendingActions: [],
    },
    docs: {} as Record<string, FeishuDocContentView>,
    developerCredential: {
      appSecret: "",
    },
    developerToken: {
      accessToken: "",
      refreshToken: "",
      accessTokenExpiresAt: "",
      refreshTokenExpiresAt: "",
    },
    docTreeCache: {
      lastRootToken: "",
      lastRootUpdatedAt: "",
      roots: {},
      branches: {},
      contents: {},
    },
  };
}

function createLogger() {
  return {
    write: async () => ({
      id: "log",
      at: "2026-05-25T00:00:00.000Z",
      level: "info" as const,
      source: "desktop-test",
      module: "desktop.feishu.bot.test",
      message: "log",
    }),
    debug: async () => ({
      id: "debug",
      at: "2026-05-25T00:00:00.000Z",
      level: "debug" as const,
      source: "desktop-test",
      module: "desktop.feishu.bot.test",
      message: "debug",
    }),
    info: async () => ({
      id: "info",
      at: "2026-05-25T00:00:00.000Z",
      level: "info" as const,
      source: "desktop-test",
      module: "desktop.feishu.bot.test",
      message: "info",
    }),
    warn: async () => ({
      id: "warn",
      at: "2026-05-25T00:00:00.000Z",
      level: "warn" as const,
      source: "desktop-test",
      module: "desktop.feishu.bot.test",
      message: "warn",
    }),
    error: async () => ({
      id: "error",
      at: "2026-05-25T00:00:00.000Z",
      level: "error" as const,
      source: "desktop-test",
      module: "desktop.feishu.bot.test",
      message: "error",
    }),
  };
}

function createActionExecutor() {
  return {
    executeSmartAssistantAction: async () => {
      throw new Error("not used in this test");
    },
  };
}

function createSemanticClassifier() {
  return {
    classify: async () => "unclear" as const,
  };
}

function createBinding(partial: Partial<DesktopFeishuStoreSnapshot["botRuntime"]["bindings"][number]> = {}) {
  return {
    key: "tenant-1:oc_1:root",
    tenantKey: "tenant-1",
    chatId: "oc_1",
    workspaceId: "workspace-a",
    sessionId: "session-1",
    createdAt: "2026-05-25T09:00:00.000Z",
    updatedAt: "2026-05-25T09:00:00.000Z",
    lastMessageId: "om_1",
    ...partial,
  };
}

function createWorkspaceItem(workspaceId: string): DesktopWorkspaceItem {
  return {
    workspaceId,
    name: "Workspace A",
    directoryPath: "E:\\workspace\\MaomiAgent",
    isPinned: true,
    tags: [],
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z",
  };
}

function createWorkspacePort(input: {
  existingWorkspaceIds?: string[];
  createdWorkspaceIds?: string[];
} = {}): Pick<DesktopWorkspacePort, "get" | "list" | "create"> {
  const items = (input.existingWorkspaceIds ?? []).map((workspaceId) => createWorkspaceItem(workspaceId));

  return {
    get: async (workspaceId) => items.find((item) => item.workspaceId === workspaceId) ?? null,
    list: async () => ({
      items,
      meta: {
        total: items.length,
        limit: 200,
        offset: 0,
        hasMore: false,
      },
    }),
    create: async (workspaceInput) => {
      if (!workspaceInput.workspaceId) {
        throw new Error("workspaceId is required for test workspace creation");
      }

      const existing = items.find((item) => item.workspaceId === workspaceInput.workspaceId);
      if (existing) {
        return {
          created: false,
          item: existing,
        };
      }

      const item = createWorkspaceItem(workspaceInput.workspaceId);
      item.name = workspaceInput.name ?? item.name;
      item.directoryPath = workspaceInput.directoryPath;
      item.isPinned = workspaceInput.isPinned === true;
      item.tags = workspaceInput.tags ?? [];
      items.push(item);
      input.createdWorkspaceIds?.push(item.workspaceId);
      return {
        created: true,
        item,
      };
    },
  };
}

async function waitFor(condition: () => boolean, timeoutMs = 1_000) {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for bot runtime state.");
    }
    await Bun.sleep(10);
  }
}

type FakeMessageHandler = (message: {
  messageId: string;
  chatId: string;
  chatType: "p2p" | "group";
  senderId: string;
  senderName?: string;
  content: string;
  rawContentType: string;
  resources: [];
  mentions: [];
  mentionAll: boolean;
  mentionedBot: boolean;
  rootId?: string;
  threadId?: string;
  replyToMessageId?: string;
  createTime: number;
  raw?: unknown;
}) => void | Promise<void>;

class FakeChannel {
  botIdentity = {
    openId: "bot_open_id",
  };
  sent: Array<{
    to: string;
    markdown: string;
    replyTo?: string;
    replyInThread?: boolean;
  }> = [];
  private connectionStatus = {
    state: "idle" as const,
    reconnectAttempts: 0,
  };
  private messageHandlers: FakeMessageHandler[] = [];
  private reconnectHandlers: Array<() => void> = [];
  private reconnectedHandlers: Array<() => void> = [];
  private errorHandlers: Array<(error: unknown) => void> = [];
  private rejectHandlers: Array<(event: { messageId: string; chatId: string; senderId: string; reason: string }) => void> = [];

  on(name: string, handler: unknown) {
    if (name === "message") {
      this.messageHandlers.push(handler as FakeMessageHandler);
    } else if (name === "reconnecting") {
      this.reconnectHandlers.push(handler as () => void);
    } else if (name === "reconnected") {
      this.reconnectedHandlers.push(handler as () => void);
    } else if (name === "error") {
      this.errorHandlers.push(handler as (error: unknown) => void);
    } else if (name === "reject") {
      this.rejectHandlers.push(handler as (event: {
        messageId: string;
        chatId: string;
        senderId: string;
        reason: string;
      }) => void);
    }

    return () => undefined;
  }

  async connect() {
    this.connectionStatus = {
      state: "connected",
      reconnectAttempts: 0,
    };
  }

  async disconnect() {
    this.connectionStatus = {
      state: "idle",
      reconnectAttempts: 0,
    };
  }

  getConnectionStatus() {
    return this.connectionStatus;
  }

  async send(
    to: string,
    input: { markdown: string },
    options?: { replyTo?: string; replyInThread?: boolean },
  ) {
    this.sent.push({
      to,
      markdown: input.markdown,
      replyTo: options?.replyTo,
      replyInThread: options?.replyInThread,
    });
    return {
      messageId: `reply-${this.sent.length}`,
    };
  }

  async emitMessage(input: {
    messageId: string;
    chatId: string;
    senderId?: string;
    senderName?: string;
    content: string;
    chatType?: "p2p" | "group";
    threadId?: string;
    rootId?: string;
    raw?: unknown;
  }) {
    const event = {
      messageId: input.messageId,
      chatId: input.chatId,
      chatType: input.chatType ?? "p2p" as const,
      senderId: input.senderId ?? "ou_user_1",
      senderName: input.senderName,
      content: input.content,
      rawContentType: "text",
      resources: [],
      mentions: [],
      mentionAll: false,
      mentionedBot: true,
      threadId: input.threadId,
      rootId: input.rootId,
      createTime: Date.parse("2026-05-25T00:00:00.000Z"),
      raw: input.raw,
    };
    for (const handler of this.messageHandlers) {
      await handler(event);
    }
  }
}

describe("DesktopFeishuBotRuntime", () => {
  test("builds stable conversation keys by tenant, chat, and thread", () => {
    expect(buildDesktopFeishuBotConversationKey({
      tenantKey: "tenant-1",
      chatId: "chat-1",
      threadId: "thread-1",
    })).toBe("tenant-1:chat-1:thread-1");
    expect(buildDesktopFeishuBotConversationKey({
      chatId: "chat-1",
    })).toBe("default:chat-1:root");
  });

  test("extracts the latest assistant text from a conversation detail", () => {
    const reply = extractDesktopFeishuBotReplyText({
      messages: [
        {
          messageId: "user-1",
          sessionId: "session-1",
          role: "user",
          createdAt: 1,
          parts: [{ type: "text", partId: "p1", text: "hello" }],
        },
        {
          messageId: "assistant-1",
          sessionId: "session-1",
          role: "assistant",
          createdAt: 2,
          parts: [{ type: "text", partId: "p2", text: "world" }],
        },
      ],
      pendingInteractions: [],
      runs: [],
    });

    expect(reply).toBe("world");
  });

  test("creates a bound session, sends the conversation reply back to Feishu, and persists processing state", async () => {
    let snapshot = createSnapshot();
    const channel = new FakeChannel();
    const createdSessions: string[] = [];
    const sentMessages: string[] = [];
    const descriptor = buildChannelDedicatedWorkspaceDescriptor({
      channel: "feishu",
      scopeKey: "tenant-1:oc_1",
      label: "tenant-1:oc_1",
    });
    const runtime = new DesktopFeishuBotRuntime(
      {
        read: async () => snapshot,
        write: async (next) => {
          snapshot = next;
        },
        mutate: async (mutator) => {
          const result = await mutator(snapshot);
          return result;
        },
      },
      {
        createSession: async (input) => {
          createdSessions.push(input.workspaceId);
          return {
            created: true,
            item: {
              sessionId: "session-1",
              workspaceId: input.workspaceId,
              title: input.title ?? "New conversation",
              status: "idle",
              createdAt: "2026-05-25T00:00:00.000Z",
              updatedAt: "2026-05-25T00:00:00.000Z",
              metadata: input.metadata,
            },
          };
        },
        sendMessage: async (input) => {
          sentMessages.push(input.text ?? "");
          return {
            detail: {
              sessionId: input.sessionId,
              workspaceId: input.workspaceId ?? "workspace-a",
              title: "Feishu chat",
              status: "idle",
              createdAt: "2026-05-25T00:00:00.000Z",
              updatedAt: "2026-05-25T00:00:01.000Z",
              runs: [],
              toolCalls: [],
              interactions: [],
              pendingInteractions: [],
              checkpoints: [],
              timeline: [],
              messages: [
                {
                  messageId: "assistant-1",
                  sessionId: input.sessionId,
                  role: "assistant",
                  createdAt: 2,
                  parts: [{ type: "text", partId: "p1", text: "你好，我已经收到你的消息。" }],
                },
              ],
            },
          };
        },
      },
      {
        getSession: async () => null,
      },
      createWorkspacePort(),
      createActionExecutor(),
      createSemanticClassifier(),
      createLogger(),
      {
        createChannel: () => channel,
        now: () => new Date("2026-05-25T00:00:00.000Z"),
      },
    );

    await runtime.start();
    await channel.emitMessage({
      messageId: "om_1",
      chatId: "oc_1",
      content: "你好",
      raw: {
        header: {
          event_id: "evt_1",
          tenant_key: "tenant-1",
          event_type: "im.message.receive_v1",
        },
      },
    });
    await waitFor(() => channel.sent.length === 1 && snapshot.botRuntime.processedMessages.length === 1);

    expect(createdSessions).toEqual([descriptor.workspaceId]);
    expect(sentMessages).toEqual([[
      "[飞书消息上下文]",
      "会话类型: 私聊",
      "发送者: ou_user_1",
      "发送者ID: ou_user_1 (open_id)",
      "内容:",
      "你好",
    ].join("\n")]);
    expect(channel.sent).toEqual([
      {
        to: "oc_1",
        markdown: "你好，我已经收到你的消息。",
        replyTo: "om_1",
        replyInThread: false,
      },
    ]);
    expect(snapshot.bot.connectionStatus).toBe("connected");
    expect(snapshot.botRuntime.bindings).toEqual([
      expect.objectContaining({
        key: "tenant-1:oc_1:root",
        chatId: "oc_1",
        workspaceId: descriptor.workspaceId,
        sessionId: "session-1",
      }),
    ]);
    expect(snapshot.botRuntime.processedMessages).toEqual([
      expect.objectContaining({
        messageId: "om_1",
        conversationKey: "tenant-1:oc_1:root",
        status: "completed",
        workspaceId: descriptor.workspaceId,
        sessionId: "session-1",
        responsePreview: "你好，我已经收到你的消息。",
      }),
    ]);
  });

  test("reuses one dedicated workspace for the same Feishu group chat across different senders and threads", async () => {
    let snapshot = createSnapshot();
    const channel = new FakeChannel();
    const createdWorkspaceIds: string[] = [];
    const createdSessions: string[] = [];
    const descriptor = buildChannelDedicatedWorkspaceDescriptor({
      channel: "feishu",
      scopeKey: "tenant-1:oc_group",
      label: "tenant-1:oc_group",
    });
    const runtime = new DesktopFeishuBotRuntime(
      {
        read: async () => snapshot,
        write: async (next) => {
          snapshot = next;
        },
        mutate: async (mutator) => {
          const result = await mutator(snapshot);
          return result;
        },
      },
      {
        createSession: async (input) => {
          createdSessions.push(input.workspaceId);
          return {
            created: true,
            item: {
              sessionId: `session-${createdSessions.length}`,
              workspaceId: input.workspaceId,
              title: input.title ?? "Feishu group",
              status: "idle",
              createdAt: "2026-05-25T00:00:00.000Z",
              updatedAt: "2026-05-25T00:00:00.000Z",
              metadata: input.metadata,
            },
          };
        },
        sendMessage: async (input) => ({
          detail: {
            sessionId: input.sessionId,
            workspaceId: input.workspaceId ?? descriptor.workspaceId,
            title: "Feishu group",
            status: "idle",
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:01.000Z",
            runs: [],
            toolCalls: [],
            interactions: [],
            pendingInteractions: [],
            checkpoints: [],
            timeline: [],
            messages: [{
              messageId: "assistant-1",
              sessionId: input.sessionId,
              role: "assistant",
              createdAt: 2,
              parts: [{ type: "text", partId: "p1", text: "done" }],
            }],
          },
        }),
      },
      {
        getSession: async () => null,
      },
      createWorkspacePort({ createdWorkspaceIds }),
      createActionExecutor(),
      createSemanticClassifier(),
      createLogger(),
      {
        createChannel: () => channel,
        now: () => new Date("2026-05-25T00:00:00.000Z"),
      },
    );

    await runtime.start();
    await channel.emitMessage({
      messageId: "om_group_1",
      chatId: "oc_group",
      chatType: "group",
      senderId: "ou_user_1",
      threadId: "thread-1",
      content: "hello",
      raw: {
        header: {
          tenant_key: "tenant-1",
          event_type: "im.message.receive_v1",
        },
      },
    });
    await channel.emitMessage({
      messageId: "om_group_2",
      chatId: "oc_group",
      chatType: "group",
      senderId: "ou_user_2",
      threadId: "thread-2",
      content: "again",
      raw: {
        header: {
          tenant_key: "tenant-1",
          event_type: "im.message.receive_v1",
        },
      },
    });
    await waitFor(() => snapshot.botRuntime.processedMessages.length === 2);

    expect(createdWorkspaceIds).toEqual([descriptor.workspaceId]);
    expect(createdSessions).toEqual([descriptor.workspaceId, descriptor.workspaceId]);
  });

  test("creates different dedicated workspaces for identical Feishu chat ids in different tenants", async () => {
    let snapshot = createSnapshot();
    const channel = new FakeChannel();
    const createdWorkspaceIds: string[] = [];
    const runtime = new DesktopFeishuBotRuntime(
      {
        read: async () => snapshot,
        write: async (next) => {
          snapshot = next;
        },
        mutate: async (mutator) => {
          const result = await mutator(snapshot);
          return result;
        },
      },
      {
        createSession: async (input) => ({
          created: true,
          item: {
            sessionId: `${input.workspaceId}-session`,
            workspaceId: input.workspaceId,
            title: input.title ?? "Feishu chat",
            status: "idle",
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z",
            metadata: input.metadata,
          },
        }),
        sendMessage: async (input) => ({
          detail: {
            sessionId: input.sessionId,
            workspaceId: input.workspaceId ?? "workspace-created",
            title: "Feishu chat",
            status: "idle",
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:01.000Z",
            runs: [],
            toolCalls: [],
            interactions: [],
            pendingInteractions: [],
            checkpoints: [],
            timeline: [],
            messages: [{
              messageId: "assistant-1",
              sessionId: input.sessionId,
              role: "assistant",
              createdAt: 2,
              parts: [{ type: "text", partId: "p1", text: "done" }],
            }],
          },
        }),
      },
      {
        getSession: async () => null,
      },
      createWorkspacePort({ createdWorkspaceIds }),
      createActionExecutor(),
      createSemanticClassifier(),
      createLogger(),
      {
        createChannel: () => channel,
        now: () => new Date("2026-05-25T00:00:00.000Z"),
      },
    );

    await runtime.start();
    await channel.emitMessage({
      messageId: "om_tenant_1",
      chatId: "oc_same",
      senderId: "ou_user_1",
      content: "hello",
      raw: {
        header: {
          tenant_key: "tenant-1",
          event_type: "im.message.receive_v1",
        },
      },
    });
    await channel.emitMessage({
      messageId: "om_tenant_2",
      chatId: "oc_same",
      senderId: "ou_user_1",
      content: "hello",
      raw: {
        header: {
          tenant_key: "tenant-2",
          event_type: "im.message.receive_v1",
        },
      },
    });
    await waitFor(() => snapshot.botRuntime.processedMessages.length === 2);

    expect(new Set(createdWorkspaceIds).size).toBe(2);
  });

  test("ignores duplicate Feishu messages after they were already persisted", async () => {
    let snapshot = createSnapshot();
    const channel = new FakeChannel();
    let sendMessageCalls = 0;
    const runtime = new DesktopFeishuBotRuntime(
      {
        read: async () => snapshot,
        write: async (next) => {
          snapshot = next;
        },
        mutate: async (mutator) => {
          const result = await mutator(snapshot);
          return result;
        },
      },
      {
        createSession: async () => ({
          created: true,
          item: {
            sessionId: "session-1",
            workspaceId: "workspace-a",
            title: "Feishu chat",
            status: "idle",
            createdAt: "2026-05-25T00:00:00.000Z",
            updatedAt: "2026-05-25T00:00:00.000Z",
          },
        }),
        sendMessage: async () => {
          sendMessageCalls += 1;
          return {
            detail: {
              sessionId: "session-1",
              workspaceId: "workspace-a",
              title: "Feishu chat",
              status: "idle",
              createdAt: "2026-05-25T00:00:00.000Z",
              updatedAt: "2026-05-25T00:00:01.000Z",
              runs: [],
              toolCalls: [],
              interactions: [],
              pendingInteractions: [],
              checkpoints: [],
              timeline: [],
              messages: [
                {
                  messageId: "assistant-1",
                  sessionId: "session-1",
                  role: "assistant",
                  createdAt: 2,
                  parts: [{ type: "text", partId: "p1", text: "done" }],
                },
              ],
            },
          };
        },
      },
      {
        getSession: async () => null,
      },
      createWorkspacePort(),
      createActionExecutor(),
      createSemanticClassifier(),
      createLogger(),
      {
        createChannel: () => channel,
        now: () => new Date("2026-05-25T00:00:00.000Z"),
      },
    );

    await runtime.start();
    await channel.emitMessage({
      messageId: "om_dup",
      chatId: "oc_1",
      content: "hello",
    });
    await waitFor(() => sendMessageCalls === 1 && snapshot.botRuntime.processedMessages.length === 1);
    await channel.emitMessage({
      messageId: "om_dup",
      chatId: "oc_1",
      content: "hello",
    });
    await waitFor(() => snapshot.bot.latestEvent?.status === "duplicate");

    expect(sendMessageCalls).toBe(1);
    expect(snapshot.bot.latestEvent).toEqual(expect.objectContaining({
      status: "duplicate",
      messageId: "om_dup",
    }));
  });

  test("rebinds legacy bot sessions that do not carry the bot capability metadata", async () => {
    let snapshot = createSnapshot();
    snapshot.botRuntime.bindings = [createBinding({
      sessionId: "session-legacy",
      lastMessageId: "om_old",
    })];
    const channel = new FakeChannel();
    const createdMetadata: Array<Record<string, unknown> | undefined> = [];
    const sentSessionIds: string[] = [];
    const descriptor = buildChannelDedicatedWorkspaceDescriptor({
      channel: "feishu",
      scopeKey: "tenant-1:oc_1",
      label: "tenant-1:oc_1",
    });
    const runtime = new DesktopFeishuBotRuntime(
      {
        read: async () => snapshot,
        write: async (next) => {
          snapshot = next;
        },
        mutate: async (mutator) => {
          const result = await mutator(snapshot);
          return result;
        },
      },
      {
        createSession: async (input) => {
          createdMetadata.push(input.metadata);
          return {
            created: true,
            item: {
              sessionId: "session-2",
              workspaceId: input.workspaceId,
              title: input.title ?? "Feishu chat",
              status: "idle",
              createdAt: "2026-05-25T09:00:00.000Z",
              updatedAt: "2026-05-25T09:00:00.000Z",
              metadata: input.metadata,
            },
          };
        },
        sendMessage: async (input) => {
          sentSessionIds.push(input.sessionId);
          return {
            detail: {
              sessionId: input.sessionId,
              workspaceId: input.workspaceId ?? "workspace-a",
              title: "Feishu chat",
              status: "idle",
              createdAt: "2026-05-25T09:00:00.000Z",
              updatedAt: "2026-05-25T09:00:01.000Z",
              runs: [],
              toolCalls: [],
              interactions: [],
              pendingInteractions: [],
              checkpoints: [],
              timeline: [],
              messages: [{
                messageId: "assistant-1",
                sessionId: input.sessionId,
                role: "assistant",
                createdAt: 2,
                parts: [{ type: "text", partId: "p1", text: "已切到新的飞书会话。" }],
              }],
            },
          };
        },
      },
      {
        getSession: async () => ({
          sessionId: "session-legacy",
          workspaceId: "workspace-a",
          title: "Legacy Feishu chat",
          status: "idle",
          createdAt: "2026-05-25T08:00:00.000Z",
          updatedAt: "2026-05-25T08:05:00.000Z",
        }),
      },
      createWorkspacePort(),
      createActionExecutor(),
      createSemanticClassifier(),
      createLogger(),
      {
        createChannel: () => channel,
        now: () => new Date("2026-05-25T09:00:00.000Z"),
      },
    );

    await runtime.start();
    await channel.emitMessage({
      messageId: "om_legacy",
      chatId: "oc_1",
      content: "继续这个飞书会话",
      raw: {
        header: {
          tenant_key: "tenant-1",
          event_id: "evt_legacy",
          event_type: "im.message.receive_v1",
        },
      },
    });
    await waitFor(() => channel.sent.length === 1 && sentSessionIds.length === 1);

    expect(sentSessionIds).toEqual(["session-2"]);
    expect(createdMetadata[0]).toMatchObject({
      source: expect.objectContaining({
        kind: "feishu_bot",
        conversationKey: "tenant-1:oc_1:root",
      }),
      conversationSettings: {
        capabilityPreferences: {
          "feishu.smartAssistant": true,
        },
      },
      feishuBotPolicy: {
        profile: "feishu_bot_tenant",
        allowUserAccessToken: false,
        allowedActionIds: [
          "calendar.agenda",
          "calendar.find_slot",
          "calendar.create_event",
          "tasks.create",
          "tasks.complete",
        ],
      },
    });
    expect(snapshot.botRuntime.bindings[0]).toEqual(expect.objectContaining({
      key: "tenant-1:oc_1:root",
      sessionId: "session-2",
      workspaceId: descriptor.workspaceId,
    }));
  });

  test("stores a pending action when the conversation tool result requires confirmation", async () => {
    let snapshot = createSnapshot();
    const channel = new FakeChannel();
    const runtime = new DesktopFeishuBotRuntime(
      {
        read: async () => snapshot,
        write: async (next) => {
          snapshot = next;
        },
        mutate: async (mutator) => {
          const result = await mutator(snapshot);
          return result;
        },
      },
      {
        createSession: async (input) => ({
          created: true,
          item: {
            sessionId: "session-1",
            workspaceId: input.workspaceId,
            title: input.title ?? "Feishu chat",
            status: "idle",
            createdAt: "2026-05-25T09:00:00.000Z",
            updatedAt: "2026-05-25T09:00:00.000Z",
            metadata: input.metadata,
          },
        }),
        sendMessage: async (input) => ({
          detail: {
            sessionId: input.sessionId,
            workspaceId: input.workspaceId ?? "workspace-a",
            title: "Feishu chat",
            status: "idle",
            createdAt: "2026-05-25T09:00:00.000Z",
            updatedAt: "2026-05-25T09:00:01.000Z",
            runs: [],
            interactions: [],
            pendingInteractions: [],
            checkpoints: [],
            timeline: [],
            messages: [],
            toolCalls: [{
              callId: "tool-1",
              sessionId: input.sessionId,
              runId: "run-1",
              turnId: "turn-1",
              messageId: "assistant-1",
              toolName: "feishu_execute_smart_assistant_action",
              status: "completed",
              input: {
                actionId: "calendar.create_event",
                workspaceId: "workspace-a",
                title: "AI 落地讨论",
                startAt: "2026-05-25T09:00:00+08:00",
                endAt: "2026-05-25T10:00:00+08:00",
              },
              output: {
                workspaceId: "workspace-a",
                actionId: "calendar.create_event",
                domain: "calendar",
                executionMode: "builtin_runtime",
                executed: false,
                confirmationRequired: true,
                summary: {
                  headline: "准备创建会议",
                  details: ["今天 9:00-10:00", "主题 AI 落地讨论"],
                  nextSuggestedActionIds: [],
                },
                result: {
                  ok: false,
                  stage: "confirmation_required",
                },
                notes: [],
              },
              startedAt: 1,
              updatedAt: 2,
              operation: {
                kind: "tool_execution",
              },
            }],
          },
        }),
      },
      {
        getSession: async () => null,
      },
      createWorkspacePort(),
      createActionExecutor(),
      createSemanticClassifier(),
      createLogger(),
      {
        createChannel: () => channel,
        now: () => new Date("2026-05-25T09:00:00.000Z"),
      },
    );

    await runtime.start();
    await channel.emitMessage({
      messageId: "om_1",
      chatId: "oc_1",
      content: "帮我创建一个今天九点到十点的 AI 落地会议",
      raw: {
        header: {
          tenant_key: "tenant-1",
          event_id: "evt_1",
          event_type: "im.message.receive_v1",
        },
      },
    });
    await waitFor(() => snapshot.botRuntime.pendingActions.length === 1 && channel.sent.length === 1);

    expect(snapshot.botRuntime.pendingActions[0]).toEqual(expect.objectContaining({
      actionId: "calendar.create_event",
      chatId: "oc_1",
      summary: "准备创建会议",
      executeInput: expect.objectContaining({
        userId: "ou_user_1",
        userIdType: "open_id",
        chatId: "oc_1",
        messageId: "om_1",
        attendeeIds: ["ou_user_1"],
      }),
    }));
    expect(channel.sent[0]?.markdown).toContain("准备创建会议");
  });

  test("confirms the pending action with natural language and executes confirm=true", async () => {
    let snapshot = createSnapshot();
    snapshot.botRuntime.bindings = [createBinding()];
    snapshot.botRuntime.pendingActions = [{
      pendingId: "pending_1",
      scopeKey: "tenant-1:oc_1:root",
      chatId: "oc_1",
      messageId: "om_1",
      domain: "calendar",
      actionId: "create_event",
      workspaceId: "workspace-a",
      summary: "准备创建会议",
      details: ["今天 9:00-10:00"],
      executeInput: {
        actionId: "create_event",
        workspaceId: "workspace-a",
        title: "AI 落地讨论",
        startAt: "2026-05-25T09:00:00+08:00",
        endAt: "2026-05-25T10:00:00+08:00",
      },
      initiatorSenderId: "ou_user_1",
      initiatorSenderName: "张三",
      createdAt: "2026-05-25T09:00:00.000Z",
      updatedAt: "2026-05-25T09:00:00.000Z",
      expiresAt: "2026-05-25T09:30:00.000Z",
    }];
    const channel = new FakeChannel();
    const executions: Array<Record<string, unknown>> = [];
    const runtime = new DesktopFeishuBotRuntime(
      {
        read: async () => snapshot,
        write: async (next) => {
          snapshot = next;
        },
        mutate: async (mutator) => {
          const result = await mutator(snapshot);
          return result;
        },
      },
      {
        createSession: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          throw new Error("not used");
        },
      },
      {
        getSession: async () => ({
          sessionId: "session-1",
          workspaceId: "workspace-a",
          title: "Feishu chat",
          status: "idle",
          createdAt: "2026-05-25T09:00:00.000Z",
          updatedAt: "2026-05-25T09:00:00.000Z",
          metadata: buildFeishuBotConversationMetadata({
            tenantKey: "tenant-1",
            chatId: "oc_1",
            conversationKey: "tenant-1:oc_1:root",
          }),
        }),
      },
      createWorkspacePort({ existingWorkspaceIds: ["workspace-a"] }),
      {
        executeSmartAssistantAction: async (input) => {
          executions.push({ ...input });
          return {
            workspaceId: input.workspaceId,
            actionId: input.actionId,
            domain: "calendar",
            executionMode: "builtin_runtime",
            executed: true,
            confirmationRequired: false,
            summary: {
              headline: "会议已创建",
              details: ["AI 落地讨论"],
              nextSuggestedActionIds: [],
            },
            result: { ok: true, eventId: "evt_created" },
            notes: [],
          };
        },
      },
      {
        classify: async () => "confirm" as const,
      },
      createLogger(),
      {
        createChannel: () => channel,
        now: () => new Date("2026-05-25T09:05:00.000Z"),
      },
    );

    await runtime.start();
    await channel.emitMessage({
      messageId: "om_2",
      chatId: "oc_1",
      content: "好的，没问题",
      raw: {
        header: {
          tenant_key: "tenant-1",
          event_id: "evt_2",
          event_type: "im.message.receive_v1",
        },
      },
    });
    await waitFor(() => channel.sent.length === 1 && snapshot.botRuntime.pendingActions.length === 0);

    expect(executions).toEqual([expect.objectContaining({
      actionId: "calendar.create_event",
      confirm: true,
      workspaceId: "workspace-a",
    })]);
    expect(channel.sent[0]?.markdown).toContain("会议已创建");
  });

  test("rejects confirming a blocked pending bot action without executing it", async () => {
    let snapshot = createSnapshot();
    snapshot.botRuntime.bindings = [createBinding()];
    snapshot.botRuntime.pendingActions = [{
      pendingId: "pending_1",
      scopeKey: "tenant-1:oc_1:root",
      tenantKey: "tenant-1",
      chatId: "oc_1",
      messageId: "om_previous",
      domain: "docs",
      actionId: "docs.search",
      workspaceId: "workspace-a",
      summary: "准备搜索文档",
      details: ["关键词: AI 落地"],
      executeInput: {
        actionId: "docs.search",
        executionProfile: "feishu_bot_tenant",
        query: "AI 落地",
      },
      initiatorSenderId: "ou_user_1",
      initiatorSenderName: "Tester",
      createdAt: "2026-05-25T09:00:00.000Z",
      updatedAt: "2026-05-25T09:00:00.000Z",
      expiresAt: "2026-05-25T09:30:00.000Z",
    }];
    const channel = new FakeChannel();
    let executed = false;
    const runtime = new DesktopFeishuBotRuntime(
      {
        read: async () => snapshot,
        write: async (next) => {
          snapshot = next;
        },
        mutate: async (mutator) => {
          const result = await mutator(snapshot);
          return result;
        },
      },
      {
        createSession: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          throw new Error("not used");
        },
      },
      {
        getSession: async () => ({
          sessionId: "session-1",
          workspaceId: "workspace-a",
          title: "Feishu chat",
          status: "idle",
          createdAt: "2026-05-25T09:00:00.000Z",
          updatedAt: "2026-05-25T09:00:00.000Z",
          metadata: buildFeishuBotConversationMetadata({
            tenantKey: "tenant-1",
            chatId: "oc_1",
            conversationKey: "tenant-1:oc_1:root",
          }),
        }),
      },
      createWorkspacePort({ existingWorkspaceIds: ["workspace-a"] }),
      {
        executeSmartAssistantAction: async () => {
          executed = true;
          throw new Error("should not execute blocked action");
        },
      },
      {
        classify: async () => "confirm" as const,
      },
      createLogger(),
      {
        createChannel: () => channel,
        now: () => new Date("2026-05-25T09:05:00.000Z"),
      },
    );

    await runtime.start();
    await channel.emitMessage({
      messageId: "om_confirm",
      chatId: "oc_1",
      senderId: "ou_user_1",
      content: "确认",
      raw: {
        header: {
          event_id: "evt_1",
          event_type: "im.message.receive_v1",
          tenant_key: "tenant-1",
        },
      },
    });
    await waitFor(() => channel.sent.length === 1);

    expect(executed).toBe(false);
    expect(channel.sent[0]?.markdown).toContain("当前飞书机器人未开通此能力。");
  });

  test("expires old pending actions instead of executing a late confirmation", async () => {
    let snapshot = createSnapshot();
    snapshot.botRuntime.bindings = [createBinding()];
    snapshot.botRuntime.pendingActions = [{
      pendingId: "pending_1",
      scopeKey: "tenant-1:oc_1:root",
      chatId: "oc_1",
      messageId: "om_1",
      domain: "calendar",
      actionId: "calendar.create_event",
      workspaceId: "workspace-a",
      summary: "准备创建会议",
      details: [],
      executeInput: {
        actionId: "calendar.create_event",
        workspaceId: "workspace-a",
      },
      createdAt: "2026-05-25T09:00:00.000Z",
      updatedAt: "2026-05-25T09:00:00.000Z",
      expiresAt: "2026-05-25T09:30:00.000Z",
    }];
    const channel = new FakeChannel();
    const runtime = new DesktopFeishuBotRuntime(
      {
        read: async () => snapshot,
        write: async (next) => {
          snapshot = next;
        },
        mutate: async (mutator) => {
          const result = await mutator(snapshot);
          return result;
        },
      },
      {
        createSession: async () => {
          throw new Error("not used");
        },
        sendMessage: async () => {
          throw new Error("not used");
        },
      },
      {
        getSession: async () => ({
          sessionId: "session-1",
          workspaceId: "workspace-a",
          title: "Feishu chat",
          status: "idle",
          createdAt: "2026-05-25T09:00:00.000Z",
          updatedAt: "2026-05-25T09:00:00.000Z",
          metadata: buildFeishuBotConversationMetadata({
            tenantKey: "tenant-1",
            chatId: "oc_1",
            conversationKey: "tenant-1:oc_1:root",
          }),
        }),
      },
      createWorkspacePort(),
      {
        executeSmartAssistantAction: async () => {
          throw new Error("late confirmation should not execute");
        },
      },
      {
        classify: async () => "confirm" as const,
      },
      createLogger(),
      {
        createChannel: () => channel,
        now: () => new Date("2026-05-25T09:45:00.000Z"),
      },
    );

    await runtime.start();
    await channel.emitMessage({
      messageId: "om_2",
      chatId: "oc_1",
      content: "确认",
      raw: {
        header: {
          tenant_key: "tenant-1",
          event_id: "evt_2",
          event_type: "im.message.receive_v1",
        },
      },
    });
    await waitFor(() => channel.sent.length === 1 && snapshot.botRuntime.pendingActions.length === 0);

    expect(channel.sent[0]?.markdown).toContain("已过期");
  });

  test("does not confirm a pending group-thread action from another thread", async () => {
    let snapshot = createSnapshot();
    snapshot.botRuntime.pendingActions = [{
      pendingId: "pending_1",
      scopeKey: "tenant-1:oc_group:thread-1",
      chatId: "oc_group",
      threadId: "thread-1",
      messageId: "om_1",
      domain: "calendar",
      actionId: "calendar.create_event",
      workspaceId: "workspace-a",
      summary: "准备创建会议",
      details: [],
      executeInput: {
        actionId: "calendar.create_event",
        workspaceId: "workspace-a",
      },
      createdAt: "2026-05-25T09:00:00.000Z",
      updatedAt: "2026-05-25T09:00:00.000Z",
      expiresAt: "2026-05-25T09:30:00.000Z",
    }];
    const channel = new FakeChannel();
    let executionCount = 0;
    const runtime = new DesktopFeishuBotRuntime(
      {
        read: async () => snapshot,
        write: async (next) => {
          snapshot = next;
        },
        mutate: async (mutator) => {
          const result = await mutator(snapshot);
          return result;
        },
      },
      {
        createSession: async () => ({
          created: true,
          item: {
            sessionId: "session-2",
            workspaceId: "workspace-a",
            title: "Feishu group thread",
            status: "idle",
            createdAt: "2026-05-25T09:00:00.000Z",
            updatedAt: "2026-05-25T09:00:00.000Z",
            metadata: {},
          },
        }),
        sendMessage: async () => ({
          detail: {
            sessionId: "session-2",
            workspaceId: "workspace-a",
            title: "Feishu group thread",
            status: "idle",
            createdAt: "2026-05-25T09:00:00.000Z",
            updatedAt: "2026-05-25T09:00:01.000Z",
            runs: [],
            messages: [{
              messageId: "assistant-1",
              sessionId: "session-2",
              role: "assistant",
              createdAt: 2,
              parts: [{ type: "text", partId: "p1", text: "这是另一条线程的新对话。" }],
            }],
            toolCalls: [],
            interactions: [],
            pendingInteractions: [],
            checkpoints: [],
            timeline: [],
          },
        }),
      },
      {
        getSession: async () => null,
      },
      createWorkspacePort(),
      {
        executeSmartAssistantAction: async () => {
          executionCount += 1;
          throw new Error("should not execute from another thread");
        },
      },
      {
        classify: async () => "confirm" as const,
      },
      createLogger(),
      {
        createChannel: () => channel,
        now: () => new Date("2026-05-25T09:05:00.000Z"),
      },
    );

    await runtime.start();
    await channel.emitMessage({
      messageId: "om_2",
      chatId: "oc_group",
      content: "好的",
      chatType: "group",
      threadId: "thread-2",
      raw: {
        header: {
          tenant_key: "tenant-1",
          event_id: "evt_2",
          event_type: "im.message.receive_v1",
        },
      },
    });
    await waitFor(() => channel.sent.length === 1);

    expect(executionCount).toBe(0);
    expect(snapshot.botRuntime.pendingActions).toHaveLength(1);
    expect(channel.sent[0]?.markdown).toContain("另一条线程");
  });
});
