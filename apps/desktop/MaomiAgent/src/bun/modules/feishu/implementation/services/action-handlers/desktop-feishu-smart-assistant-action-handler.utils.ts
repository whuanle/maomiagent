import type { FeishuSmartAssistantDomainKey } from "../../../../../../shared/desktop-feishu";

const ACTION_DOMAIN_ALIASES: Record<string, FeishuSmartAssistantDomainKey> = {
  doc: "docs",
  docs: "docs",
  calendar: "calendar",
  message: "messenger",
  messenger: "messenger",
  drive: "drive",
  base: "base",
  bitable: "base",
  table: "base",
  sheet: "sheets",
  sheets: "sheets",
  task: "tasks",
  tasks: "tasks",
  wiki: "wiki",
  contact: "contact",
  mail: "mail",
  meeting: "meetings",
  meetings: "meetings",
};

const DOMAIN_TITLES: Record<FeishuSmartAssistantDomainKey, string> = {
  docs: "云文档",
  calendar: "日历",
  messenger: "消息",
  drive: "云盘",
  base: "多维表格",
  sheets: "电子表格",
  tasks: "任务",
  wiki: "知识库",
  contact: "通讯录",
  mail: "邮箱",
  meetings: "会议",
};

export function normalizeActionId(actionId: string): string {
  return actionId.trim();
}

export function inferActionDomain(actionId: string): FeishuSmartAssistantDomainKey {
  const normalized = actionId.trim().toLowerCase();
  const prefix = normalized.split(/[.:_/-]/, 1)[0] ?? "";

  return ACTION_DOMAIN_ALIASES[prefix] ?? "docs";
}

export function actionRequiresConfirmation(actionId: string): boolean {
  const normalized = actionId.toLowerCase();
  return /(create|update|delete|remove|rename|move|send|push|upload|write|batch|sync|dispatch)/.test(normalized);
}

export function getDomainTitle(domain: FeishuSmartAssistantDomainKey): string {
  return DOMAIN_TITLES[domain];
}

export function createRoutedSummary(
  domain: FeishuSmartAssistantDomainKey,
  availableRuntimeCount: number,
  actionId: string,
) {
  return {
    headline: `${DOMAIN_TITLES[domain]}已接入动作路由`,
    details: [
      `actionId: ${actionId}`,
      `available runtimes: ${availableRuntimeCount}`,
      "action dispatch uses domain registry handlers",
    ],
    nextSuggestedActionIds: [],
  };
}
