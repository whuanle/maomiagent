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
import type { DesktopFeishuActionExecutorPort } from "../../abstraction/ports/desktop-feishu-action-executor.ports";
import type { RuntimeLogger } from "../../../logs";
import type { DesktopWorkspaceQueryPort } from "../../../workspace";
import type {
  DesktopFeishuBotConversationBindingSnapshot,
  DesktopFeishuBotPendingActionDecision,
  DesktopFeishuBotPendingActionSnapshot,
  DesktopFeishuStorePort,
  DesktopFeishuStoreSnapshot,
} from "../../abstraction/ports/desktop-feishu-store.ports";
import type {
  FeishuBotEventInfo,
  FeishuBotPendingActionView,
  FeishuBotProcessedMessage,
  FeishuBotStateView,
  FeishuSmartAssistantActionExecuteResultView,
  FeishuSmartAssistantExecuteActionInput,
} from "../../../../../shared/desktop-feishu";
import { runDesktopFeishuStoreMutation } from "./desktop-feishu-store-mutation";
import {
  buildFeishuBotConversationMetadata,
  hasFeishuBotConversationMetadata,
  isFeishuBotActionAllowed,
  normalizeFeishuBotTenantActionId,
} from "./desktop-feishu-bot-capability-policy";
import {
  actionRequiresConfirmation,
  inferActionDomain,
} from "./action-handlers/desktop-feishu-smart-assistant-action-handler.utils";
import {
  applyFeishuBotActorToActionInput,
  buildFeishuBotTurnMetadata,
  extractFeishuBotActorContext,
  inferFeishuUserIdType,
  type DesktopFeishuBotActorContext,
} from "./desktop-feishu-bot-actor-context";
import type { DesktopFeishuBotSemanticClassifierPort } from "./desktop-feishu-bot-semantic-classifier";

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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
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

function buildConversationInputText(
  actor: DesktopFeishuBotActorContext,
  inputText: string,
) {
  const senderLabel = actor.senderName
    ?? actor.senderOpenId
    ?? actor.senderUserId
    ?? actor.senderUnionId
    ?? actor.senderId;
  return [
    "[飞书消息上下文]",
    `会话类型: ${actor.chatType === "group" ? "群聊" : "私聊"}`,
    `发送者: ${senderLabel}`,
    `发送者ID: ${actor.senderId} (${actor.senderIdType})`,
    actor.senderUserId && actor.senderIdType !== "user_id" ? `发送者UserId: ${actor.senderUserId}` : undefined,
    actor.senderUnionId && actor.senderIdType !== "union_id" ? `发送者UnionId: ${actor.senderUnionId}` : undefined,
    actor.threadId ? `线程: ${actor.threadId}` : undefined,
    "内容:",
    inputText,
  ].filter(Boolean).join("\n");
}

function formatActionResultReply(result: FeishuSmartAssistantActionExecuteResultView) {
  const resultRecord = asRecord(result.result);
  const resultMessage = trimText(resultRecord?.message);
  const detailLines = [...result.summary.details];
  if (resultMessage && !detailLines.includes(resultMessage)) {
    detailLines.push(resultMessage);
  }

  return [result.summary.headline, ...detailLines].filter(Boolean).join("\n")
    || "飞书动作已执行完成。";
}

function didFeishuActionFail(result: FeishuSmartAssistantActionExecuteResultView) {
  const resultRecord = asRecord(result.result);
  return result.executed === false || resultRecord?.ok === false;
}

function formatPendingActionReply(action: DesktopFeishuBotPendingActionSnapshot) {
  return [
    action.summary,
    ...action.details,
    "回复确认即可执行，也可以直接补充修改。",
  ].filter(Boolean).join("\n");
}

function buildPendingActionRevisionPrompt(
  action: DesktopFeishuBotPendingActionSnapshot,
  userReply: string,
) {
  return [
    "你正在处理一个飞书待确认动作的修改请求。",
    `原动作: ${action.actionId}`,
    `原摘要: ${action.summary}`,
    ...action.details.map((item) => `- ${item}`),
    `用户修改: ${userReply}`,
    "请基于最新要求重新规划；如果仍然是写操作，请继续通过飞书工具生成待确认结果，不要默认已经确认。",
  ].join("\n");
}

function buildPendingActionActorContext(
  action: DesktopFeishuBotPendingActionSnapshot,
  fallbackActor: DesktopFeishuBotActorContext,
): DesktopFeishuBotActorContext {
  const senderId = trimText(action.initiatorSenderId) ?? fallbackActor.senderId;
  const senderIdType = inferFeishuUserIdType(senderId);
  return {
    ...fallbackActor,
    chatId: action.chatId,
    messageId: action.messageId,
    threadId: action.threadId ?? fallbackActor.threadId,
    tenantKey: action.tenantKey ?? fallbackActor.tenantKey,
    senderId,
    senderIdType,
    senderName: trimText(action.initiatorSenderName) ?? fallbackActor.senderName,
    senderOpenId: senderIdType === "open_id" ? senderId : fallbackActor.senderOpenId,
    senderUserId: senderIdType === "user_id" ? senderId : fallbackActor.senderUserId,
    senderUnionId: senderIdType === "union_id" ? senderId : fallbackActor.senderUnionId,
  };
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
    private readonly actionExecutor: Pick<DesktopFeishuActionExecutorPort, "executeSmartAssistantAction">,
    private readonly semanticClassifier: DesktopFeishuBotSemanticClassifierPort,
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
    const actor = extractFeishuBotActorContext(message);
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

    let inboundText = trimText(message.content);
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
      let conversationInputText = buildConversationInputText(actor, inboundText);
      const pendingAction = snapshot.botRuntime.pendingActions
        .find((item) => item.scopeKey === conversationKey);
      if (pendingAction) {
        if (pendingAction.expiresAt <= nowIso(this.now)) {
          await this.clearPendingAction(pendingAction.scopeKey);
          const reply = "之前的待确认操作已过期，请重新描述你的需求。";
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
            detail: "待确认操作已过期。",
          });
          return;
        }

        const decision = await this.classifyPendingActionReply({
          pendingAction,
          binding,
          inboundText,
          selectedChannelId: trimText(snapshot.bot.selectedChannelId),
          selectedModelId: trimText(snapshot.bot.selectedModelId),
        });

        if (decision === "confirm") {
          if (!isFeishuBotActionAllowed(pendingAction.actionId)) {
            await this.clearPendingAction(pendingAction.scopeKey);
            const reply = "当前飞书机器人未开通此能力。";
            await this.sendReply(message, reply);
            await this.markProcessedMessage({
              messageId: message.messageId,
              status: "failed",
              workspaceId: binding.workspaceId,
              sessionId: binding.sessionId,
              responsePreview: compactPreview(reply),
            });
            await this.writeLatestEvent({
              ...eventInfoBase,
              status: "failed",
              detail: "飞书待确认动作命中了未开放能力。",
            });
            await this.writeBotState({
              lastError: reply,
            });
            return;
          }

          const executeInput = applyFeishuBotActorToActionInput({
            ...pendingAction.executeInput,
            actionId: normalizeFeishuBotTenantActionId(
              trimText(pendingAction.executeInput.actionId) ?? pendingAction.actionId
            ),
            workspaceId: pendingAction.workspaceId ?? binding.workspaceId,
            executionProfile: "feishu_bot_tenant",
            confirm: true,
          }, buildPendingActionActorContext(pendingAction, actor));
          if (actionRequiresConfirmation(executeInput.actionId) && !trimText(executeInput.userId)) {
            throw new Error("当前飞书消息缺少可用的发送者身份，无法执行这次待确认写操作。");
          }
          const result = await this.actionExecutor.executeSmartAssistantAction(executeInput);
          const reply = formatActionResultReply(result);
          const failed = didFeishuActionFail(result);
          if (!failed) {
            await this.clearPendingAction(pendingAction.scopeKey);
          }
          await this.sendReply(message, reply);
          await this.markProcessedMessage({
            messageId: message.messageId,
            status: failed ? "failed" : "completed",
            workspaceId: binding.workspaceId,
            sessionId: binding.sessionId,
            responsePreview: compactPreview(reply),
          });
          await this.writeLatestEvent({
            ...eventInfoBase,
            status: failed ? "failed" : "processed",
            detail: failed ? "飞书待确认动作执行失败。" : "飞书待确认动作已执行完成。",
          });
          await this.writeBotState({
            lastError: failed ? reply : undefined,
          });
          return;
        }

        if (decision === "cancel") {
          await this.clearPendingAction(pendingAction.scopeKey);
          const reply = "已取消这次待确认操作。";
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
            detail: "飞书待确认动作已取消。",
          });
          return;
        }

        if (decision === "unclear") {
          const reply = "我没法判断你是要执行、取消，还是修改这次待确认操作，请再说明确一点。";
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
            detail: "飞书待确认动作需要更明确的回复。",
          });
          return;
        }

        if (decision === "new_request") {
          await this.clearPendingAction(pendingAction.scopeKey);
        } else if (decision === "modify") {
          conversationInputText = buildPendingActionRevisionPrompt(pendingAction, conversationInputText);
        }
      }

      const detail = await this.conversationCommand.sendMessage({
        sessionId: binding.sessionId,
        workspaceId: binding.workspaceId,
        text: conversationInputText,
        selectedChannelId: trimText(snapshot.bot.selectedChannelId),
        selectedModelId: trimText(snapshot.bot.selectedModelId),
        metadata: buildFeishuBotTurnMetadata(actor),
      });
      const pendingFromTurn = this.buildPendingActionFromConversationTurn({
        detail: detail.detail,
        scopeKey: conversationKey,
        tenantKey: rawMeta.tenantKey,
        chatId: message.chatId,
        threadId,
        workspaceId: binding.workspaceId,
        messageId: message.messageId,
        actor,
      });
      if (pendingFromTurn) {
        await this.upsertPendingAction(pendingFromTurn);
      }
      const reply = pendingFromTurn
        ? formatPendingActionReply(pendingFromTurn)
        : extractDesktopFeishuBotReplyText(detail.detail)
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
      if (existingSession && hasFeishuBotConversationMetadata(existingSession.metadata, input.conversationKey)) {
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

  private async upsertPendingAction(action: DesktopFeishuBotPendingActionSnapshot) {
    await this.mutateStore((snapshot) => {
      snapshot.botRuntime.pendingActions = [
        action,
        ...snapshot.botRuntime.pendingActions.filter((item) => item.scopeKey !== action.scopeKey),
      ].slice(0, FEISHU_BOT_MAX_PROCESSED_MESSAGES);
      snapshot.bot.updatedAt = nowIso(this.now);
    });
  }

  private async clearPendingAction(scopeKey: string) {
    await this.mutateStore((snapshot) => {
      snapshot.botRuntime.pendingActions = snapshot.botRuntime.pendingActions
        .filter((item) => item.scopeKey !== scopeKey);
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

  private buildPendingActionFromConversationTurn(input: {
    detail: DesktopConversationSessionDetail;
    scopeKey: string;
    tenantKey?: string;
    chatId: string;
    threadId?: string;
    workspaceId: string;
    messageId: string;
    actor: DesktopFeishuBotActorContext;
  }): DesktopFeishuBotPendingActionSnapshot | undefined {
    const toolCall = [...input.detail.toolCalls].reverse().find((item) =>
      item.toolName === "feishu_execute_smart_assistant_action"
      && item.status === "completed");
    const output = asRecord(toolCall?.output);
    const summary = asRecord(output?.summary);
    const toolInput = asRecord(toolCall?.input);
    const rawActionId = trimText(toolInput?.actionId);
    const actionId = rawActionId ? normalizeFeishuBotTenantActionId(rawActionId) : undefined;
    const domain = trimText(output?.domain) as FeishuBotPendingActionView["domain"] | undefined;

    if (output?.confirmationRequired !== true || !toolCall || !toolInput || !actionId) {
      return undefined;
    }

    const createdAt = nowIso(this.now);
    const resolvedDomain = rawActionId !== actionId
      ? inferActionDomain(actionId)
      : domain ?? inferActionDomain(actionId);
    return {
      pendingId: `pending_${crypto.randomUUID()}`,
      scopeKey: input.scopeKey,
      tenantKey: input.tenantKey,
      chatId: input.chatId,
      threadId: input.threadId,
      messageId: input.messageId,
      domain: resolvedDomain,
      actionId,
      workspaceId: input.workspaceId,
      summary: trimText(summary?.headline) ?? `准备执行 ${actionId}`,
      details: asStringArray(summary?.details),
      executeInput: applyFeishuBotActorToActionInput({
        ...(toolCall.input as Record<string, unknown>),
        actionId,
        executionProfile: "feishu_bot_tenant",
        workspaceId: input.workspaceId,
      } as FeishuSmartAssistantExecuteActionInput, input.actor),
      initiatorSenderId: input.actor.senderId,
      initiatorSenderName: trimText(input.actor.senderName),
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(this.now().getTime() + 30 * 60_000).toISOString(),
    };
  }

  private async classifyPendingActionReply(input: {
    pendingAction: DesktopFeishuBotPendingActionSnapshot;
    binding: DesktopFeishuBotConversationBindingSnapshot;
    inboundText: string;
    selectedChannelId?: string;
    selectedModelId?: string;
  }): Promise<DesktopFeishuBotPendingActionDecision> {
    return this.semanticClassifier.classify({
      workspaceId: input.binding.workspaceId,
      selectedChannelId: input.selectedChannelId,
      selectedModelId: input.selectedModelId,
      pendingAction: input.pendingAction,
      replyText: input.inboundText,
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
