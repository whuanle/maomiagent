import type {
  FeishuBotTenantCapabilityCatalogView,
  FeishuSmartAssistantDomainKey,
} from "../../../../../shared/desktop-feishu";

export const FEISHU_BOT_TENANT_PROFILE = "feishu_bot_tenant" as const;

export const FEISHU_BOT_TENANT_SCOPES = [
  "calendar:calendar:readonly",
  "calendar:calendar.event:read",
  "calendar:calendar.free_busy:read",
  "calendar:calendar.event:create",
  "calendar:calendar.event:update",
  "task:task:read",
  "task:task:write",
  "task:task:writeonly",
] as const;

export const FEISHU_BOT_TENANT_ALLOWED_ACTION_IDS = [
  "calendar.agenda",
  "calendar.find_slot",
  "calendar.create_event",
  "tasks.create",
  "tasks.complete",
] as const;

export const FEISHU_BOT_TENANT_BLOCKED_ACTION_IDS = [
  "docs.search",
  "docs.read",
  "docs.create",
  "docs.update",
  "meetings.search_records",
  "meetings.read_minutes",
] as const;

function buildReadyAction(input: {
  actionId: (typeof FEISHU_BOT_TENANT_ALLOWED_ACTION_IDS)[number];
  domain: FeishuSmartAssistantDomainKey;
  title: string;
  requiresConfirmation: boolean;
}): FeishuBotTenantCapabilityCatalogView["actions"][number] {
  return {
    actionId: input.actionId,
    domain: input.domain,
    title: input.title,
    status: "ready",
    requiresConfirmation: input.requiresConfirmation,
  };
}

export function buildFeishuBotTenantCapabilityCatalog(): FeishuBotTenantCapabilityCatalogView {
  return {
    profile: FEISHU_BOT_TENANT_PROFILE,
    credentialKind: "tenant_access_token",
    allowUserAccessToken: false,
    identitySource: "bot_app",
    allowedUserIdTypes: ["open_id", "union_id"],
    tenantScopes: [...FEISHU_BOT_TENANT_SCOPES],
    domains: [
      {
        key: "calendar",
        title: "日历",
        status: "ready",
        credentialKind: "tenant_access_token",
        requiredScopes: FEISHU_BOT_TENANT_SCOPES.filter((item) => item.startsWith("calendar:")),
      },
      {
        key: "tasks",
        title: "任务",
        status: "ready",
        credentialKind: "tenant_access_token",
        requiredScopes: FEISHU_BOT_TENANT_SCOPES.filter((item) => item.startsWith("task:")),
        notes: ["仅限应用创建或应用可管理的任务。"],
      },
      {
        key: "docs",
        title: "云文档",
        status: "planned",
        credentialKind: "tenant_access_token",
        requiredScopes: [],
      },
      {
        key: "meetings",
        title: "会议",
        status: "planned",
        credentialKind: "tenant_access_token",
        requiredScopes: [],
      },
    ],
    actions: [
      buildReadyAction({
        actionId: "calendar.agenda",
        domain: "calendar",
        title: "查询日程",
        requiresConfirmation: false,
      }),
      buildReadyAction({
        actionId: "calendar.find_slot",
        domain: "calendar",
        title: "查找空闲时间",
        requiresConfirmation: false,
      }),
      buildReadyAction({
        actionId: "calendar.create_event",
        domain: "calendar",
        title: "创建日程",
        requiresConfirmation: true,
      }),
      buildReadyAction({
        actionId: "tasks.create",
        domain: "tasks",
        title: "创建任务",
        requiresConfirmation: true,
      }),
      buildReadyAction({
        actionId: "tasks.complete",
        domain: "tasks",
        title: "完成任务",
        requiresConfirmation: true,
      }),
    ],
    blockedActionIds: [...FEISHU_BOT_TENANT_BLOCKED_ACTION_IDS],
  };
}
