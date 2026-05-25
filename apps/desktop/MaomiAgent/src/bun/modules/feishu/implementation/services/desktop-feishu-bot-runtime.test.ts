import { describe, expect, test } from "bun:test";

import type {
  FeishuBotStateView,
  FeishuDocContentView,
  FeishuStateView,
} from "../../../../../shared/desktop-feishu";
import type {
  DesktopFeishuStoreSnapshot,
} from "../../abstraction/ports/desktop-feishu-store.ports";
import {
  DesktopFeishuBotRuntime,
  buildDesktopFeishuBotConversationKey,
  extractDesktopFeishuBotReplyText,
} from "./desktop-feishu-bot-runtime";

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
    content: string;
    threadId?: string;
    raw?: unknown;
  }) {
    const event = {
      messageId: input.messageId,
      chatId: input.chatId,
      chatType: "p2p" as const,
      senderId: input.senderId ?? "user_open_id",
      content: input.content,
      rawContentType: "text",
      resources: [],
      mentions: [],
      mentionAll: false,
      mentionedBot: true,
      threadId: input.threadId,
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
      {
        get: async (workspaceId) => ({
          workspaceId,
          name: "Workspace A",
          directoryPath: "E:\\workspace\\MaomiAgent",
          isPinned: true,
          tags: [],
          createdAt: "2026-05-25T00:00:00.000Z",
          updatedAt: "2026-05-25T00:00:00.000Z",
        }),
        list: async () => ({
          items: [
            {
              workspaceId: "workspace-a",
              name: "Workspace A",
              directoryPath: "E:\\workspace\\MaomiAgent",
              isPinned: true,
              tags: [],
              createdAt: "2026-05-25T00:00:00.000Z",
              updatedAt: "2026-05-25T00:00:00.000Z",
            },
          ],
          meta: {
            total: 1,
            limit: 200,
            offset: 0,
            hasMore: false,
          },
        }),
      },
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

    expect(createdSessions).toEqual(["workspace-a"]);
    expect(sentMessages).toEqual(["你好"]);
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
        workspaceId: "workspace-a",
        sessionId: "session-1",
      }),
    ]);
    expect(snapshot.botRuntime.processedMessages).toEqual([
      expect.objectContaining({
        messageId: "om_1",
        conversationKey: "tenant-1:oc_1:root",
        status: "completed",
        workspaceId: "workspace-a",
        sessionId: "session-1",
        responsePreview: "你好，我已经收到你的消息。",
      }),
    ]);
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
      {
        get: async () => null,
        list: async () => ({
          items: [
            {
              workspaceId: "workspace-a",
              name: "Workspace A",
              directoryPath: "E:\\workspace\\MaomiAgent",
              isPinned: true,
              tags: [],
              createdAt: "2026-05-25T00:00:00.000Z",
              updatedAt: "2026-05-25T00:00:00.000Z",
            },
          ],
          meta: {
            total: 1,
            limit: 200,
            offset: 0,
            hasMore: false,
          },
        }),
      },
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
});
