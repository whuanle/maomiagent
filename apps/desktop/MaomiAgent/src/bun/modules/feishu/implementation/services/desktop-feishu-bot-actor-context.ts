import type { NormalizedMessage } from "@larksuiteoapi/node-sdk";

import type {
  FeishuSmartAssistantExecuteActionInput,
  FeishuUserIdType,
} from "../../../../../shared/desktop-feishu";

export const FEISHU_BOT_ACTOR_METADATA_KEY = "feishuBotActor";

export type DesktopFeishuBotActorContext = {
  chatId: string;
  chatType: "p2p" | "group";
  messageId: string;
  threadId?: string;
  rootId?: string;
  tenantKey?: string;
  senderTenantKey?: string;
  senderId: string;
  senderIdType: FeishuUserIdType;
  senderName?: string;
  senderOpenId?: string;
  senderUserId?: string;
  senderUnionId?: string;
};

function trimText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function pickSenderName(message: NormalizedMessage) {
  return trimText((message as NormalizedMessage & { senderName?: string }).senderName);
}

export function inferFeishuUserIdType(value: string): FeishuUserIdType {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("ou_")) {
    return "open_id";
  }
  if (normalized.startsWith("on_")) {
    return "union_id";
  }
  return "user_id";
}

export function extractFeishuBotActorContext(message: NormalizedMessage): DesktopFeishuBotActorContext {
  const rawRoot = asRecord(message.raw);
  const rawHeader = asRecord(rawRoot?.header);
  const rawSender = asRecord(rawRoot?.sender);
  const rawSenderId = asRecord(rawSender?.sender_id);

  const senderOpenId = trimText(rawSenderId?.open_id);
  const senderUserId = trimText(rawSenderId?.user_id);
  const senderUnionId = trimText(rawSenderId?.union_id);
  const normalizedSenderId = trimText(message.senderId)
    ?? senderOpenId
    ?? senderUserId
    ?? senderUnionId
    ?? "unknown";
  const senderIdType = senderOpenId
    ? "open_id"
    : senderUserId
      ? "user_id"
      : senderUnionId
        ? "union_id"
        : inferFeishuUserIdType(normalizedSenderId);

  return {
    chatId: message.chatId,
    chatType: message.chatType,
    messageId: message.messageId,
    threadId: trimText(message.threadId),
    rootId: trimText(message.rootId),
    tenantKey: trimText(rawHeader?.tenant_key) ?? trimText(rawRoot?.tenant_key),
    senderTenantKey: trimText(rawSender?.tenant_key),
    senderId: normalizedSenderId,
    senderIdType,
    senderName: pickSenderName(message),
    senderOpenId: senderOpenId ?? (senderIdType === "open_id" ? normalizedSenderId : undefined),
    senderUserId: senderUserId ?? (senderIdType === "user_id" ? normalizedSenderId : undefined),
    senderUnionId: senderUnionId ?? (senderIdType === "union_id" ? normalizedSenderId : undefined),
  };
}

export function buildFeishuBotTurnMetadata(
  actor: DesktopFeishuBotActorContext,
): Record<string, unknown> {
  return {
    [FEISHU_BOT_ACTOR_METADATA_KEY]: {
      ...actor,
    },
  };
}

export function readFeishuBotActorContext(
  metadata: Record<string, unknown> | undefined,
): DesktopFeishuBotActorContext | undefined {
  const actor = asRecord(metadata?.[FEISHU_BOT_ACTOR_METADATA_KEY]);
  const senderId = trimText(actor?.senderId);
  const chatId = trimText(actor?.chatId);
  const messageId = trimText(actor?.messageId);
  const chatType = actor?.chatType === "group" ? "group" : actor?.chatType === "p2p" ? "p2p" : undefined;
  if (!senderId || !chatId || !messageId || !chatType) {
    return undefined;
  }

  const senderIdType = actor?.senderIdType === "open_id"
    || actor?.senderIdType === "union_id"
    || actor?.senderIdType === "user_id"
    ? actor.senderIdType
    : inferFeishuUserIdType(senderId);

  return {
    chatId,
    chatType,
    messageId,
    threadId: trimText(actor?.threadId),
    rootId: trimText(actor?.rootId),
    tenantKey: trimText(actor?.tenantKey),
    senderTenantKey: trimText(actor?.senderTenantKey),
    senderId,
    senderIdType,
    senderName: trimText(actor?.senderName),
    senderOpenId: trimText(actor?.senderOpenId),
    senderUserId: trimText(actor?.senderUserId),
    senderUnionId: trimText(actor?.senderUnionId),
  };
}

export function resolveFeishuBotActorUser(actor: DesktopFeishuBotActorContext | undefined) {
  if (!actor) {
    return {
      userId: undefined,
      userIdType: undefined,
    };
  }

  if (actor.senderOpenId) {
    return {
      userId: actor.senderOpenId,
      userIdType: "open_id" as const,
    };
  }
  if (actor.senderUserId) {
    return {
      userId: actor.senderUserId,
      userIdType: "user_id" as const,
    };
  }
  if (actor.senderUnionId) {
    return {
      userId: actor.senderUnionId,
      userIdType: "union_id" as const,
    };
  }

  return {
    userId: actor.senderId,
    userIdType: inferFeishuUserIdType(actor.senderId),
  };
}

function shouldAutoAddActorAsAttendee(actionId: string) {
  const normalized = actionId.trim().toLowerCase();
  return normalized.startsWith("calendar.")
    && /(create|schedule|book)/.test(normalized);
}

export function applyFeishuBotActorToActionInput(
  input: FeishuSmartAssistantExecuteActionInput,
  actor: DesktopFeishuBotActorContext | undefined,
): FeishuSmartAssistantExecuteActionInput {
  if (!actor) {
    return { ...input };
  }

  const actorUser = resolveFeishuBotActorUser(actor);
  const next: FeishuSmartAssistantExecuteActionInput = {
    ...input,
    userId: input.userId ?? actorUser.userId,
    userIdType: input.userIdType ?? actorUser.userIdType,
    chatId: input.chatId ?? actor.chatId,
    messageId: input.messageId ?? actor.messageId,
    threadId: input.threadId ?? actor.threadId,
  };

  if (
    shouldAutoAddActorAsAttendee(next.actionId)
    && (!next.attendeeIds || next.attendeeIds.length === 0)
    && actorUser.userId
  ) {
    next.attendeeIds = [actorUser.userId];
  }

  return next;
}
