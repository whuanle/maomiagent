import type { I18nKey, Translate } from "../i18n";

export type LanguageCode = "zh-CN" | "en-US";

export type AppRouteOwner = "native" | "legacy";

export type AppRouteKey =
  | "chat"
  | "browser"
  | "workspace"
  | "git"
  | "shell"
  | "tasks"
  | "memory"
  | "models"
  | "agents"
  | "mcp"
  | "skills"
  | "feishu"
  | "wechat"
  | "logs"
  | "settings";

export type AppRouteItem = {
  key: AppRouteKey;
  labelKey: I18nKey;
  inMenu: boolean;
  owner: AppRouteOwner;
};

export type TitlebarMenuItem = AppRouteItem & {
  inMenu: true;
};

export const APP_ROUTE_ITEMS: AppRouteItem[] = [
  { key: "chat", labelKey: "菜单.聊天", inMenu: true, owner: "native" },
  { key: "workspace", labelKey: "菜单.工作区", inMenu: true, owner: "native" },
  { key: "git", labelKey: "菜单.Git", inMenu: true, owner: "native" },
  { key: "shell", labelKey: "菜单.Shell", inMenu: false, owner: "legacy" },
  { key: "tasks", labelKey: "菜单.任务", inMenu: true, owner: "native" },
  { key: "memory", labelKey: "菜单.记忆", inMenu: true, owner: "native" },
  { key: "models", labelKey: "菜单.模型", inMenu: true, owner: "native" },
  { key: "agents", labelKey: "菜单.智能体", inMenu: true, owner: "native" },
  { key: "mcp", labelKey: "菜单.MCP", inMenu: true, owner: "native" },
  { key: "skills", labelKey: "菜单.技能", inMenu: true, owner: "native" },
  { key: "feishu", labelKey: "菜单.飞书", inMenu: true, owner: "native" },
  { key: "wechat", labelKey: "菜单.微信", inMenu: true, owner: "native" },
  { key: "logs", labelKey: "菜单.日志", inMenu: true, owner: "native" },
  { key: "settings", labelKey: "菜单.设置", inMenu: true, owner: "native" },
  { key: "browser", labelKey: "菜单.浏览器", inMenu: true, owner: "native" },
];

export const TITLEBAR_MENU_ITEMS: TitlebarMenuItem[] = APP_ROUTE_ITEMS.filter(
  (item): item is TitlebarMenuItem => item.inMenu,
);

export function resolveRouteLabel(item: Pick<AppRouteItem, "labelKey">, t: Translate): string {
  return t(item.labelKey);
}