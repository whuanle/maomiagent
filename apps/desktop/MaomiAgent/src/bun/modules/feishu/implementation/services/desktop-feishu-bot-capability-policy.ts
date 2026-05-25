import type { KernelMetadata } from "#maomiagent/kernel/core";

import type { FeishuSmartAssistantDomainKey } from "../../../../../shared/desktop-feishu";

export const FEISHU_BOT_ALLOWED_SMART_ASSISTANT_DOMAINS = [
  "docs",
  "calendar",
  "tasks",
  "meetings",
] as const satisfies readonly FeishuSmartAssistantDomainKey[];

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
      allowedDomains: [...FEISHU_BOT_ALLOWED_SMART_ASSISTANT_DOMAINS],
    },
  };
}

export function readFeishuBotAllowedDomains(
  sessionMetadata: Record<string, unknown> | undefined,
): FeishuSmartAssistantDomainKey[] | undefined {
  const policy = sessionMetadata?.feishuBotPolicy;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    return undefined;
  }

  const allowedDomains = (policy as Record<string, unknown>).allowedDomains;
  if (!Array.isArray(allowedDomains)) {
    return undefined;
  }

  return allowedDomains.filter((item): item is FeishuSmartAssistantDomainKey =>
    typeof item === "string"
    && (FEISHU_BOT_ALLOWED_SMART_ASSISTANT_DOMAINS as readonly string[]).includes(item));
}
