import type { KernelMetadata } from "#maomiagent/kernel/core";

import {
  FEISHU_BOT_TENANT_ALLOWED_ACTION_IDS,
  FEISHU_BOT_TENANT_PROFILE,
} from "./desktop-feishu-bot-tenant-capability-catalog";

const FEISHU_BOT_TENANT_ACTION_ALIASES: Record<string, string> = {
  agenda: "calendar.agenda",
  find_slot: "calendar.find_slot",
  create_event: "calendar.create_event",
  "task.create": "tasks.create",
  create_task: "tasks.create",
  "task.complete": "tasks.complete",
  complete_task: "tasks.complete",
};

const FEISHU_BOT_TENANT_LEGACY_DOMAIN_ACTION_IDS: Record<string, readonly string[]> = {
  calendar: [
    "calendar.agenda",
    "calendar.find_slot",
    "calendar.create_event",
  ],
  tasks: [
    "tasks.create",
    "tasks.complete",
  ],
  docs: [],
  meetings: [],
};

export function buildFeishuBotConversationMetadata(input: {
  tenantKey?: string;
  chatId: string;
  threadId?: string;
  conversationKey: string;
}): KernelMetadata {
  return {
    source: {
      kind: "feishu_bot",
      tenantKey: input.tenantKey,
      chatId: input.chatId,
      threadId: input.threadId,
      conversationKey: input.conversationKey,
    },
    conversationSettings: {
      capabilityPreferences: {
        "feishu.smartAssistant": true,
      },
    },
    feishuBotPolicy: {
      profile: FEISHU_BOT_TENANT_PROFILE,
      allowUserAccessToken: false,
      allowedActionIds: [...FEISHU_BOT_TENANT_ALLOWED_ACTION_IDS],
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function normalizeFeishuBotTenantActionId(actionId: string) {
  const normalized = actionId.trim();
  if (!normalized) {
    return normalized;
  }

  return FEISHU_BOT_TENANT_ACTION_ALIASES[normalized.toLowerCase()] ?? normalized;
}

function readLegacyFeishuBotAllowedActionIds(
  sessionMetadata: Record<string, unknown> | undefined,
) {
  const policy = asRecord(sessionMetadata?.feishuBotPolicy);
  const allowedDomains = Array.isArray(policy?.allowedDomains)
    ? policy.allowedDomains.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  if (allowedDomains.length === 0) {
    return undefined;
  }

  return [...new Set(
    allowedDomains.flatMap((domain) => FEISHU_BOT_TENANT_LEGACY_DOMAIN_ACTION_IDS[domain.trim().toLowerCase()] ?? [])
  )];
}

export function readFeishuBotAllowedActionIds(
  sessionMetadata: Record<string, unknown> | undefined,
): string[] | undefined {
  const policy = asRecord(sessionMetadata?.feishuBotPolicy);
  const allowedActionIds = policy?.allowedActionIds;
  if (Array.isArray(allowedActionIds)) {
    return [...new Set(allowedActionIds
      .filter((item): item is string => typeof item === "string")
      .map((item) => normalizeFeishuBotTenantActionId(item))
      .filter((item) => (FEISHU_BOT_TENANT_ALLOWED_ACTION_IDS as readonly string[]).includes(item)))];
  }

  return readLegacyFeishuBotAllowedActionIds(sessionMetadata);
}

export function isFeishuBotActionAllowed(
  actionId: string,
  sessionMetadata?: Record<string, unknown>,
) {
  const normalized = normalizeFeishuBotTenantActionId(actionId);
  const allowedActionIds = readFeishuBotAllowedActionIds(sessionMetadata)
    ?? [...FEISHU_BOT_TENANT_ALLOWED_ACTION_IDS];
  return allowedActionIds.includes(normalized);
}

export function hasFeishuBotConversationMetadata(
  sessionMetadata: Record<string, unknown> | undefined,
  expectedConversationKey?: string,
) {
  const source = asRecord(sessionMetadata?.source);
  if (source?.kind !== "feishu_bot") {
    return false;
  }

  if (
    expectedConversationKey
    && typeof source.conversationKey === "string"
    && source.conversationKey.trim().length > 0
    && source.conversationKey.trim() !== expectedConversationKey
  ) {
    return false;
  }

  const conversationSettings = asRecord(sessionMetadata?.conversationSettings);
  const capabilityPreferences = asRecord(conversationSettings?.capabilityPreferences);
  const capabilityEnabled =
    capabilityPreferences?.["feishu.smartAssistant"] === true
    || conversationSettings?.feishuSmartAssistantEnabled === true;
  if (!capabilityEnabled) {
    return false;
  }

  const allowedActionIds = readFeishuBotAllowedActionIds(sessionMetadata);
  if (!allowedActionIds || allowedActionIds.length === 0) {
    return false;
  }

  const policy = asRecord(sessionMetadata?.feishuBotPolicy);
  const hasModernPolicyMarkers =
    Object.prototype.hasOwnProperty.call(policy ?? {}, "profile")
    || Object.prototype.hasOwnProperty.call(policy ?? {}, "allowUserAccessToken");
  if (hasModernPolicyMarkers) {
    if (policy?.profile !== FEISHU_BOT_TENANT_PROFILE || policy?.allowUserAccessToken !== false) {
      return false;
    }
  }

  return FEISHU_BOT_TENANT_ALLOWED_ACTION_IDS.every((actionId) => allowedActionIds.includes(actionId));
}
