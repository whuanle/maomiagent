import {
  LoggerLevel,
  createLarkChannel,
  type LarkChannel,
  type LarkChannelError,
  type NormalizedMessage,
  type RejectEvent,
  type WSConnectionStatus,
} from "@larksuiteoapi/node-sdk";

import type {
  DesktopConversationCommandPort,
  DesktopConversationQueryPort,
  DesktopConversationSessionDetail,
} from "../../../conversation";
import type { RuntimeLogger } from "../../../logs";
import type { DesktopWorkspaceQueryPort } from "../../../workspace";
import type {
  DesktopFeishuBotConversationBindingSnapshot,
  DesktopFeishuStorePort,
  DesktopFeishuStoreSnapshot,
} from "../../abstraction/ports/desktop-feishu-store.ports";
import type {
  FeishuBotEventInfo,
  FeishuBotProcessedMessage,
  FeishuBotStateView,
} from "../../../../../shared/desktop-feishu";
import { runDesktopFeishuStoreMutation } from "./desktop-feishu-store-mutation";
import { buildFeishuBotConversationMetadata } from "./desktop-feishu-bot-capability-policy";

const FEISHU_BOT_MAX_BINDINGS = 100;
const FEISHU_BOT_MAX_PROCESSED_MESSAGES = 40;

type FeishuBotChannel = Pick<
  LarkChannel,
  "connect" | "disconnect" | "getConnectionStatus" | "on" | "send"
> & {
  botIdentity?: LarkChannel["botIdentity"];
};

type FeishuBotChannelFactory = (input: {
  appId: string;
  appSecret: string;
}) => FeishuBotChannel;

type RawMessageMeta = {
  eventId?: string;
  eventType?: string;
  tenantKey?: string;
};

export interface DesktopFeishuBotRuntimePort {
  start(): Promise<void>;
  sync(): Promise<void>;
  stop(): Promise<void>;
}

type DesktopFeishuBotRuntimeOptions = {
  createChannel?: FeishuBotChannelFactory;
  now?: () => Date;
};

function trimText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}

function compactPreview(value: string, limit = 120): string | undefined {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }

  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readRawMessageMeta(raw: unknown): RawMessageMeta {
  const root = asRecord(raw);
  const header = asRecord(root?.header);

  return {
    eventId: trimText(header?.event_id) ?? trimText(root?.event_id),
    eventType: trimText(header?.event_type) ?? trimText(root?.event_type),
    tenantKey: trimText(header?.tenant_key) ?? trimText(root?.tenant_key),
  };
}

function buildConnectionSignature(input: { appId: string; appSecret: string }) {
  return `${input.appId}\u0000${input.appSecret}`;
}

function mapChannelConnectionStatus(
  status: WSConnectionStatus | undefined,
): FeishuBotStateView["connectionStatus"] {
  switch (status?.state) {
    case "connected":
      return "connected";
    case "connecting":
    case "reconnecting":
      return "connecting";
    case "failed":
      return "error";
    default:
      return "disconnected";
  }
}

export function buildDesktopFeishuBotConversationKey(input: {
  tenantKey?: string;
  chatId: string;
  threadId?: string;
}) {
  return [
    input.tenantKey?.trim() || "default",
    input.chatId.trim(),
    input.threadId?.trim() || "root",
  ].join(":");
}

function extractMessageText(message: DesktopConversationSessionDetail["messages"][number] | undefined) {
  if (!message) {
    return undefined;
  }

  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return text || undefined;
}

function describeFailedRun(detail: Pick<DesktopConversationSessionDetail, "runs">) {
  for (let index = detail.runs.length - 1; index >= 0; index -= 1) {
    const boundary = detail.runs[index]?.boundary;
    if (boundary?.kind === "failed") {
      return trimText(boundary.error?.message);
    }
  }

  return undefined;
}

export function extractDesktopFeishuBotReplyText(
  detail: Pick<DesktopConversationSessionDetail, "messages" | "pendingInteractions" | "runs">,
): string | undefined {
  for (let index = detail.messages.length - 1; index >= 0; index -= 1) {
    const message = detail.messages[index];
    if (message?.role !== "assistant") {
      continue;
    }

    const text = extractMessageText(message);
    if (text) {
      return text;
    }
  }

  if (detail.pendingInteractions.length > 0) {
    return "当前会话需要进一步确认，请先在桌面端完成确认后再继续。";
  }

  const failedReason = describeFailedRun(detail);
  if (failedReason) {
    return `处理失败：${failedReason}`;
  }

  return undefined;
}

function createDefaultChannel(input: { appId: string; appSecret: string }): FeishuBotChannel {
  return createLarkChannel({
    appId: input.appId,
    appSecret: input.appSecret,
    transport: "websocket",
    policy: {
      dmMode: "open",
      requireMention: false,
      respondToMentionAll: true,
    },
    includeRawEvent: true,
    loggerLevel: LoggerLevel.warn,
    handshakeTimeoutMs: 12_000,
    source: "maomi-desktop-feishu-bot",
  });
}

export class DesktopFeishuBotRuntime implements DesktopFeishuBotRuntimePort {
  private readonly createChannel: FeishuBotChannelFactory;
  private readonly now: () => Date;
  private started = false;
  private generation = 0;
  private channelSignature = "";
  private channel: FeishuBotChannel | null = null;
  private channelUnsubscribers: Array<() => void> = [];
  private connectTask: Promise<void> | null = null;
  private activeMessageCount = 0;

  constructor(
    private readonly store: DesktopFeishuStorePort,
    private readonly conversationCommand: Pick<
      DesktopConversationCommandPort,
      "createSession" | "sendMessage"
    >,
    private readonly conversationQuery: Pick<DesktopConversationQueryPort, "getSession">,
    private readonly workspaceQuery: Pick<DesktopWorkspaceQueryPort, "get" | "list">,
    private readonly logger: RuntimeLogger,
    options: DesktopFeishuBotRuntimeOptions = {},
  ) {
    this.createChannel = options.createChannel ?? createDefaultChannel;
    this.now = options.now ?? (() => new Date());
  }

  async start(): Promise<void> {
    this.started = true;
    await this.sync();
  }

  async sync(): Promise<void> {
    const snapshot = await this.store.read();
    const appId = trimText(snapshot.bot.appId) ?? "";
    const appSecret = trimText(snapshot.bot.appSecret) ?? "";
    const enabled = snapshot.bot.enabled && Boolean(appId && appSecret);

    if (!this.started || !enabled) {
      this.generation += 1;
      await this.teardownChannel();
      await this.writeBotState({
        connectionStatus: "disconnected",
        connectionDetail: undefined,
        queuedConversationCount: 0,
        ...(enabled ? {} : { lastError: undefined }),
      });
      return;
    }

    const nextSignature = buildConnectionSignature({ appId, appSecret });
    if (this.channel && this.channelSignature === nextSignature) {
      await this.applyChannelStatus(this.channel.getConnectionStatus());
      return;
    }

    const generation = ++this.generation;
    await this.teardownChannel();

    const channel = this.createChannel({ appId, appSecret });
    this.channel = channel;
    this.channelSignature = nextSignature;
    this.channelUnsubscribers = [
      channel.on("message", (message) => {
        void this.handleInboundMessage(generation, message);
      }),
      channel.on("reject", (event) => {
        void this.handleRejectedMessage(generation, event);
      }),
      channel.on("reconnecting", () => {
        void this.applyChannelStatus(undefined, {
          generation,
          forcedStatus: "connecting",
          detail: "正在重连飞书 WebSocket。",
        });
      }),
      channel.on("reconnected", () => {
        void this.applyChannelStatus(channel.getConnectionStatus(), {
          generation,
          detail: "飞书 WebSocket 已重连。",
        });
      }),
      channel.on("error", (error) => {
        void this.handleChannelError(generation, error);
      }),
    ];

    await this.writeBotState({
      connectionStatus: "connecting",
      connectionDetail: "正在连接飞书 WebSocket。",
      lastError: undefined,
      queuedConversationCount: this.activeMessageCount,
    });

    this.connectTask = channel.connect()
      .then(async () => {
        if (!this.isCurrentGeneration(generation, channel)) {
          await channel.disconnect().catch(() => undefined);
          return;
        }

        await this.logger.info("Desktop feishu bot websocket connected", {
          context: {
            appId,
          },
        });
        await this.applyChannelStatus(channel.getConnectionStatus(), {
          generation,
          detail: "飞书 WebSocket 已连接。",
        });
      })
      .catch(async (error) => {
        if (!this.isCurrentGeneration(generation, channel)) {
          return;
        }

        await this.handleChannelError(generation, error);
      })
      .finally(() => {
        if (this.connectTask) {
          this.connectTask = null;
        }
      });
  }

  async stop(): Promise<void> {
    this.started = false;
    this.generation += 1;
    await this.teardownChannel();
    await this.writeBotState({
      connectionStatus: "disconnected",
      connectionDetail: undefined,
      queuedConversationCount: 0,
    });
  }

  private isCurrentGeneration(generation: number, channel: FeishuBotChannel) {
    return generation === this.generation && this.channel === channel;
  }

  private async teardownChannel() {
    const channel = this.channel;
    this.channel = null;
    this.channelSignature = "";
    this.connectTask = null;
    this.channelUnsubscribers.splice(0).forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch {
        // Ignore listener cleanup failures during channel swaps.
      }
    });

    if (!channel) {
      return;
    }

    await channel.disconnect().catch(() => undefined);
  }

  private async handleRejectedMessage(generation: number, event: RejectEvent) {
    if (generation !== this.generation) {
      return;
    }

    await this.writeLatestEvent({
      status: "ignored",
      receivedAt: nowIso(this.now),
      messageId: event.messageId,
      chatId: event.chatId,
      detail: `消息被飞书渠道策略忽略: ${event.reason}`,
    });
  }

  private async handleChannelError(generation: number, error: unknown) {
    if (generation !== this.generation) {
      return;
    }

    const message = this.describeError(error);
    await this.logger.warn("Desktop feishu bot websocket error", {
      error,
      context: {
        message,
      },
    });
    await this.writeBotState({
      connectionStatus: this.activeMessageCount > 0 ? "processing" : "error",
      connectionDetail: message,
      lastError: message,
      queuedConversationCount: this.activeMessageCount,
    });
  }

  private async handleInboundMessage(generation: number, message: NormalizedMessage) {
    if (generation !== this.generation) {
      return;
    }
    if (message.senderId === this.channel?.botIdentity?.openId) {
      return;
    }

    const rawMeta = readRawMessageMeta(message.raw);
    const threadId = trimText(message.threadId) ?? trimText(message.rootId);
    const conversationKey = buildDesktopFeishuBotConversationKey({
      tenantKey: rawMeta.tenantKey,
      chatId: message.chatId,
      threadId,
    });
    const eventInfoBase: FeishuBotEventInfo = {
      status: "received",
      receivedAt: nowIso(this.now),
      eventType: rawMeta.eventType ?? "im.message.receive_v1",
      eventId: rawMeta.eventId,
      messageId: message.messageId,
      chatId: message.chatId,
    };

    await this.writeLatestEvent(eventInfoBase);

    const accepted = await this.reserveProcessedMessage({
      messageId: message.messageId,
      eventId: rawMeta.eventId,
      conversationKey,
      queryPreview: compactPreview(message.content || ""),
    });
    if (!accepted) {
      await this.writeLatestEvent({
        ...eventInfoBase,
        status: "duplicate",
        detail: "重复消息已忽略。",
      });
      return;
    }

    const inboundText = trimText(message.content);
    if (!inboundText) {
      const reply = message.resources.length > 0
        ? "当前飞书机器人这一轮只支持文本消息。"
        : "请直接发送要处理的文本内容。";
      await this.sendReply(message, reply);
      await this.markProcessedMessage({
        messageId: message.messageId,
        status: "completed",
        responsePreview: compactPreview(reply),
      });
      await this.writeLatestEvent({
        ...eventInfoBase,
        status: "processed",
        detail: "非文本消息已返回说明。",
      });
      return;
    }

    this.activeMessageCount += 1;
    await this.applyChannelStatus(this.channel?.getConnectionStatus(), {
      generation,
      forcedStatus: "processing",
      detail: "正在处理飞书消息。",
    });

    try {
      const snapshot = await this.store.read();
      const binding = await this.resolveConversationBinding({
        snapshot,
        conversationKey,
        tenantKey: rawMeta.tenantKey,
        chatId: message.chatId,
        threadId,
        messageId: message.messageId,
      });
      const detail = await this.conversationCommand.sendMessage({
        sessionId: binding.sessionId,
        workspaceId: binding.workspaceId,
        text: inboundText,
        selectedChannelId: trimText(snapshot.bot.selectedChannelId),
        selectedModelId: trimText(snapshot.bot.selectedModelId),
      });
      const reply = extractDesktopFeishuBotReplyText(detail.detail)
        ?? "已收到消息，但当前没有可回传的文本结果。";

      await this.sendReply(message, reply);
      await this.markProcessedMessage({
        messageId: message.messageId,
        status: "completed",
        workspaceId: binding.workspaceId,
        sessionId: binding.sessionId,
        responsePreview: compactPreview(reply),
      });
      await this.writeLatestEvent({
        ...eventInfoBase,
        status: "processed",
        detail: "飞书消息已处理完成。",
      });
      await this.writeBotState({
        lastError: undefined,
      });
    } catch (error) {
      const reply = `处理失败：${this.describeError(error)}`;
      try {
        await this.sendReply(message, reply);
      } catch {
        // Keep the original processing failure authoritative.
      }

      await this.markProcessedMessage({
        messageId: message.messageId,
        status: "failed",
        responsePreview: compactPreview(reply),
      });
      await this.writeLatestEvent({
        ...eventInfoBase,
        status: "failed",
        detail: this.describeError(error),
      });
      await this.writeBotState({
        lastError: this.describeError(error),
      });
      await this.logger.error("Desktop feishu bot message processing failed", {
        error,
        context: {
          messageId: message.messageId,
          chatId: message.chatId,
        },
      });
    } finally {
      this.activeMessageCount = Math.max(0, this.activeMessageCount - 1);
      await this.applyChannelStatus(this.channel?.getConnectionStatus(), {
        generation,
      });
    }
  }

  private async sendReply(message: NormalizedMessage, reply: string) {
    if (!this.channel) {
      throw new Error("飞书机器人当前未连接，无法回发消息。");
    }

    await this.channel.send(
      message.chatId,
      { markdown: reply },
      {
        replyTo: message.messageId,
        replyInThread: Boolean(message.threadId || message.rootId),
      },
    );
  }

  private async resolveConversationBinding(input: {
    snapshot: DesktopFeishuStoreSnapshot;
    conversationKey: string;
    tenantKey?: string;
    chatId: string;
    threadId?: string;
    messageId: string;
  }): Promise<DesktopFeishuBotConversationBindingSnapshot> {
    const existingBinding = input.snapshot.botRuntime.bindings.find((item) => item.key === input.conversationKey);
    if (existingBinding) {
      const existingSession = await this.conversationQuery.getSession(existingBinding.sessionId);
      if (existingSession) {
        const updatedBinding = {
          ...existingBinding,
          updatedAt: nowIso(this.now),
          lastMessageId: input.messageId,
        };
        await this.persistBinding(updatedBinding);
        return updatedBinding;
      }
    }

    const workspaceId = await this.resolveExecutionWorkspaceId(input.snapshot);
    const created = await this.conversationCommand.createSession({
      workspaceId,
      title: `Feishu ${input.chatId}`,
      metadata: buildFeishuBotConversationMetadata({
        tenantKey: input.tenantKey,
        chatId: input.chatId,
        threadId: input.threadId,
        conversationKey: input.conversationKey,
      }),
    });
    const binding: DesktopFeishuBotConversationBindingSnapshot = {
      key: input.conversationKey,
      tenantKey: input.tenantKey,
      chatId: input.chatId,
      threadId: input.threadId,
      workspaceId,
      sessionId: created.item.sessionId,
      createdAt: nowIso(this.now),
      updatedAt: nowIso(this.now),
      lastMessageId: input.messageId,
    };
    await this.persistBinding(binding);
    return binding;
  }

  private async resolveExecutionWorkspaceId(snapshot: DesktopFeishuStoreSnapshot) {
    const explicitCandidates = [
      trimText(snapshot.bot.defaultExecutionWorkspaceId),
      trimText(snapshot.bot.selectedWorkspaceId),
      ...(snapshot.bot.allowWorkspaceSwitch
        ? (snapshot.bot.allowedExecutionWorkspaceIds ?? []).map((item) => trimText(item))
        : []),
    ].filter((item): item is string => Boolean(item));

    for (const workspaceId of explicitCandidates) {
      const existing = await this.workspaceQuery.get(workspaceId).catch(() => null);
      if (existing?.workspaceId) {
        return existing.workspaceId;
      }
    }

    const list = await this.workspaceQuery.list({
      limit: 200,
      offset: 0,
    }).catch(() => null);
    const fallback = list?.items.find((item) => trimText(item.workspaceId));
    if (fallback?.workspaceId) {
      return fallback.workspaceId;
    }

    throw new Error("当前没有可用于飞书机器人的工作区。");
  }

  private async persistBinding(binding: DesktopFeishuBotConversationBindingSnapshot) {
    await this.mutateStore((snapshot) => {
      snapshot.botRuntime.bindings = [
        binding,
        ...snapshot.botRuntime.bindings.filter((item) => item.key !== binding.key),
      ].slice(0, FEISHU_BOT_MAX_BINDINGS);
      snapshot.bot.updatedAt = nowIso(this.now);
    });
  }

  private async reserveProcessedMessage(input: {
    messageId: string;
    eventId?: string;
    conversationKey: string;
    queryPreview?: string;
  }) {
    return this.mutateStore((snapshot) => {
      const existing = snapshot.botRuntime.processedMessages.find((item) => item.messageId === input.messageId);
      if (existing) {
        return false;
      }

      const createdAt = nowIso(this.now);
      snapshot.botRuntime.processedMessages.unshift({
        messageId: input.messageId,
        eventId: input.eventId,
        conversationKey: input.conversationKey,
        status: "pending",
        queryPreview: input.queryPreview,
        createdAt,
        updatedAt: createdAt,
      });
      snapshot.botRuntime.processedMessages = snapshot.botRuntime.processedMessages.slice(0, FEISHU_BOT_MAX_PROCESSED_MESSAGES);
      snapshot.bot.updatedAt = createdAt;
      return true;
    });
  }

  private async markProcessedMessage(input: {
    messageId: string;
    status: FeishuBotProcessedMessage["status"];
    workspaceId?: string;
    sessionId?: string;
    responsePreview?: string;
  }) {
    await this.mutateStore((snapshot) => {
      const index = snapshot.botRuntime.processedMessages.findIndex((item) => item.messageId === input.messageId);
      if (index < 0) {
        return;
      }

      const current = snapshot.botRuntime.processedMessages[index];
      snapshot.botRuntime.processedMessages[index] = {
        ...current,
        status: input.status,
        workspaceId: input.workspaceId ?? current.workspaceId,
        sessionId: input.sessionId ?? current.sessionId,
        responsePreview: input.responsePreview ?? current.responsePreview,
        updatedAt: nowIso(this.now),
      };
      snapshot.bot.updatedAt = snapshot.botRuntime.processedMessages[index].updatedAt;
    });
  }

  private async writeLatestEvent(event: FeishuBotEventInfo) {
    await this.writeBotState({
      latestEvent: event,
    });
  }

  private async writeBotState(
    patch: Partial<
      Pick<
        FeishuBotStateView,
        | "connectionStatus"
        | "connectionDetail"
        | "connectionUpdatedAt"
        | "lastError"
        | "latestEvent"
        | "queuedConversationCount"
      >
    >,
  ) {
    await this.mutateStore((snapshot) => {
      const updatedAt = nowIso(this.now);
      snapshot.bot = {
        ...snapshot.bot,
        ...patch,
        connectionUpdatedAt:
          patch.connectionStatus !== undefined
          || patch.connectionDetail !== undefined
          || Object.prototype.hasOwnProperty.call(patch, "lastError")
            ? updatedAt
            : snapshot.bot.connectionUpdatedAt,
        updatedAt,
      };
    });
  }

  private async applyChannelStatus(
    status: WSConnectionStatus | undefined,
    options: {
      generation?: number;
      forcedStatus?: FeishuBotStateView["connectionStatus"];
      detail?: string;
    } = {},
  ) {
    if (options.generation !== undefined && options.generation !== this.generation) {
      return;
    }

    const resolved = this.activeMessageCount > 0
      ? "processing"
      : options.forcedStatus ?? mapChannelConnectionStatus(status);
    await this.writeBotState({
      connectionStatus: resolved,
      connectionDetail: options.detail,
      queuedConversationCount: this.activeMessageCount,
      ...(resolved === "error" ? {} : { lastError: undefined }),
    });
  }

  private async mutateStore<T>(mutator: (snapshot: DesktopFeishuStoreSnapshot) => Promise<T> | T) {
    return runDesktopFeishuStoreMutation(this.store, mutator);
  }

  private describeError(error: unknown) {
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }
    if (typeof error === "string" && error.trim()) {
      return error.trim();
    }
    const channelError = error as Partial<LarkChannelError> | undefined;
    if (typeof channelError?.message === "string" && channelError.message.trim()) {
      return channelError.message.trim();
    }
    return "unknown error";
  }
}
