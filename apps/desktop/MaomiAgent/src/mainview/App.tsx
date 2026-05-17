import { App as AntdApp, ConfigProvider, Layout, Tabs, type TabsProps } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  APP_ROUTE_ITEMS,
  TITLEBAR_MENU_ITEMS,
  type AppRouteKey,
  type LanguageCode,
} from "./config/titlebar";
import { LogsPage } from "./components/logs-page/page";
import { SettingsPage } from "./components/settings-page/page";
import { WorkspacePage } from "./components/workspace-page/page";
import { RoutePlaceholder } from "./components/window-shell/RoutePlaceholder";
import { WindowTitlebar } from "./components/window-shell/WindowTitlebar";
import { createTranslator } from "./i18n";
import { parseRouteFromHash, readInitialRoute, resolveVisibleMainviewRoute } from "./lib/app-route";
import { bindNotificationApis } from "./lib/notifications";
import { readShellPreferences, writeShellPreferences } from "./lib/shell-preferences";
import { AgentsPage } from "./modules/agents";
import { ChatPage } from "./modules/chat";
import { BrowserPage } from "./modules/browser";
import { GitPage } from "./modules/git";
import { MemoryPage } from "./modules/memory";
import { ModelsPage } from "./modules/models";
import { McpPage } from "./modules/mcp";
import { SkillsPage } from "./modules/skills";
import { TasksPage } from "./modules/tasks";
import { FeishuPage } from "./modules/feishu";
import { WechatPage } from "./modules/wechat";
import {
  moveTitlebarMenuKey,
  normalizeTitlebarMenuSettings,
  readTitlebarMenuSettings,
  reorderTitlebarMenuKeys,
  resolveCollapsedTitlebarMenuItems,
  resolveExpandedTitlebarMenuItems,
  resolveOrderedTitlebarMenuItems,
  writeTitlebarMenuSettings,
} from "./lib/titlebar-menu-settings";
import { getAntdTheme, type AppThemeMode } from "./theme/antd-theme";
import { applyThemeStylesheet } from "./theme/theme-stylesheet";
import type { RuntimeStatus } from "./types/status";

const NATIVE_ROUTE_ITEMS = APP_ROUTE_ITEMS.filter((route) => route.owner === "native");

function createInitialRuntimeStatus(): RuntimeStatus {
  return {
    loading: false,
    entryUrl: "desktop://mainview",
    healthy: true,
    runtime: {
      runtimeName: "MaomiAgent Desktop",
      version: "0.1.0",
      startedAt: new Date().toISOString(),
      moduleIds: [
        "desktop.foundation",
        "desktop.configuration",
        "desktop.database",
        "desktop.logs",
        "desktop.observability",
        "desktop.window",
        "desktop.workspace",
        "desktop.git",
        "desktop.terminals",
        "desktop.tasks",
        "desktop.agents",
        "desktop.models",
        "desktop.ai",
        "desktop.conversation",
        "desktop.skills",
        "desktop.mcp",
        "desktop.wechat",
        "desktop.shell",
      ],
    },
    request: {
      requestId: "desktop-mainview",
    },
    checkedAt: Date.now(),
  };
}

function renderRouteTabPane(routeKey: string, children: ReactNode) {
  return (
    <div className={`app-route-tabpane${routeKey === "chat" ? " app-route-tabpane-chat" : ""}`}>
      {children}
    </div>
  );
}

function NotificationApiBinder() {
  const { message, notification } = AntdApp.useApp();

  useEffect(() => {
    bindNotificationApis({ message, notification });
    return () => bindNotificationApis(null);
  }, [message, notification]);

  return null;
}

export default function App() {
  const initialPreferences = useMemo(() => readShellPreferences(), []);
  const initialRoute = useMemo(() => readInitialRoute(), []);
  const [language, setLanguage] = useState<LanguageCode>(initialPreferences.language);
  const [themeMode, setThemeMode] = useState<AppThemeMode>(initialPreferences.themeMode);
  const [activeRoute, setActiveRoute] = useState<AppRouteKey>(initialRoute);
  const [chatTerminalRevealToken, setChatTerminalRevealToken] = useState<number | undefined>(
    () => initialRoute === "shell" ? 1 : undefined,
  );
  const [status] = useState<RuntimeStatus>(() => createInitialRuntimeStatus());
  const [menuSettings, setMenuSettings] = useState(() =>
    readTitlebarMenuSettings(TITLEBAR_MENU_ITEMS),
  );
  const previousActiveRouteRef = useRef<AppRouteKey>(initialRoute);

  const antdTheme = useMemo(() => getAntdTheme(themeMode), [themeMode]);
  const antdLocale = language === "en-US" ? enUS : zhCN;
  const t = useMemo(() => createTranslator(language), [language]);

  useEffect(() => {
    writeShellPreferences({ version: 1, language, themeMode });
    applyThemeStylesheet(themeMode);
  }, [language, themeMode]);

  useEffect(() => {
    writeTitlebarMenuSettings(menuSettings, TITLEBAR_MENU_ITEMS);
  }, [menuSettings]);

  useEffect(() => {
    const handleHashChange = () => {
      setActiveRoute(parseRouteFromHash(window.location.hash) ?? "chat");
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    const currentRoute = parseRouteFromHash(window.location.hash);
    if (currentRoute === activeRoute) {
      return;
    }
    const nextUrl = new URL(window.location.href);
    nextUrl.hash = activeRoute;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [activeRoute]);

  useEffect(() => {
    if (activeRoute === "shell" && previousActiveRouteRef.current !== "shell") {
      setChatTerminalRevealToken((current) => typeof current === "number" ? current + 1 : 1);
    }

    previousActiveRouteRef.current = activeRoute;
  }, [activeRoute]);

  const visibleRoute = resolveVisibleMainviewRoute(activeRoute);

  const orderedMenuItems = useMemo(() => {
    return resolveOrderedTitlebarMenuItems(TITLEBAR_MENU_ITEMS, menuSettings.orderedMenuKeys);
  }, [menuSettings.orderedMenuKeys]);

  const expandedMenuItems = useMemo(() => {
    return resolveExpandedTitlebarMenuItems(
      TITLEBAR_MENU_ITEMS,
      menuSettings.collapsedMenuKeys,
      menuSettings.orderedMenuKeys,
    );
  }, [menuSettings.collapsedMenuKeys, menuSettings.orderedMenuKeys]);

  const collapsedMenuItems = useMemo(() => {
    return resolveCollapsedTitlebarMenuItems(
      TITLEBAR_MENU_ITEMS,
      menuSettings.collapsedMenuKeys,
      menuSettings.orderedMenuKeys,
    );
  }, [menuSettings.collapsedMenuKeys, menuSettings.orderedMenuKeys]);

  const routeTabItems = useMemo<NonNullable<TabsProps["items"]>>(() => {
    return NATIVE_ROUTE_ITEMS.map((route) => ({
      key: route.key,
      label: route.key,
      destroyOnHidden: false,
      children: route.key === visibleRoute
        ? renderRouteTabPane(
            route.key,
            route.key === "chat" ? (
              <ChatPage
                active={route.key === visibleRoute}
                language={language}
                revealTerminalToken={chatTerminalRevealToken}
              />
            ) : route.key === "browser" ? (
              <BrowserPage
                active={route.key === visibleRoute}
                language={language}
              />
            ) : route.key === "workspace" ? (
              <WorkspacePage
                active={route.key === visibleRoute}
                language={language}
                t={t}
              />
            ) : route.key === "git" ? (
              <GitPage
                active={route.key === visibleRoute}
                language={language}
              />
            ) : route.key === "tasks" ? (
              <TasksPage
                active={route.key === visibleRoute}
                language={language}
              />
            ) : route.key === "memory" ? (
              <MemoryPage
                active={route.key === visibleRoute}
                language={language}
              />
            ) : route.key === "models" ? (
              <ModelsPage
                active={route.key === visibleRoute}
                language={language}
                t={t}
              />
            ) : route.key === "agents" ? (
              <AgentsPage
                active={route.key === visibleRoute}
                language={language}
                t={t}
              />
            ) : route.key === "mcp" ? (
              <McpPage
                active={route.key === visibleRoute}
                t={t}
              />
            ) : route.key === "skills" ? (
              <SkillsPage
                active={route.key === visibleRoute}
                language={language}
                t={t}
              />
            ) : route.key === "feishu" ? (
              <FeishuPage
                active={route.key === visibleRoute}
                t={t as unknown as (key: string, params?: Record<string, string | number>) => string}
              />
            ) : route.key === "settings" ? (
              <SettingsPage
                status={status}
                language={language}
                themeMode={themeMode}
                t={t}
                orderedMenuItems={orderedMenuItems}
                collapsedMenuKeys={menuSettings.collapsedMenuKeys}
                onSelectTheme={setThemeMode}
                onSelectLanguage={setLanguage}
                onMenuCollapsedChange={(key, collapsed) => {
                  setMenuSettings((current) => normalizeTitlebarMenuSettings({
                    ...current,
                    collapsedMenuKeys: collapsed
                      ? [...current.collapsedMenuKeys, key]
                      : current.collapsedMenuKeys.filter((item) => item !== key),
                  }, TITLEBAR_MENU_ITEMS));
                }}
                onMoveMenuItem={(key, direction) => {
                  setMenuSettings((current) => normalizeTitlebarMenuSettings({
                    ...current,
                    orderedMenuKeys: moveTitlebarMenuKey(current.orderedMenuKeys, key, direction),
                  }, TITLEBAR_MENU_ITEMS));
                }}
                onReorderMenuItems={(sourceKey, targetKey, position) => {
                  setMenuSettings((current) => normalizeTitlebarMenuSettings({
                    ...current,
                    orderedMenuKeys: reorderTitlebarMenuKeys(
                      current.orderedMenuKeys,
                      sourceKey,
                      targetKey,
                      position,
                    ),
                  }, TITLEBAR_MENU_ITEMS));
                }}
                onResetMenuSettings={() => {
                  setMenuSettings(normalizeTitlebarMenuSettings(undefined, TITLEBAR_MENU_ITEMS));
                }}
              />
            ) : route.key === "logs" ? (
              <LogsPage
                active={route.key === visibleRoute}
                language={language}
                t={t}
              />
            ) : route.key === "wechat" ? (
              <WechatPage
                active={route.key === visibleRoute}
                language={language}
              />
            ) : (
              <RoutePlaceholder
                route={route}
                status={status}
                language={language}
                t={t}
              />
            ),
          )
        : null,
    }));
  }, [chatTerminalRevealToken, language, menuSettings.collapsedMenuKeys, orderedMenuItems, status, t, themeMode, visibleRoute]);

  return (
    <ConfigProvider locale={antdLocale} theme={antdTheme}>
      <AntdApp>
        <NotificationApiBinder />
        <Layout className="app-shell">
          <WindowTitlebar
            status={status}
            language={language}
            t={t}
            themeMode={themeMode}
            isSettingsActive={visibleRoute === "settings"}
            menuItems={expandedMenuItems}
            collapsedMenuItems={collapsedMenuItems}
            activeMenuKey={visibleRoute}
            onMenuSelect={setActiveRoute}
            onOpenSettings={() => setActiveRoute("settings")}
            onSelectTheme={setThemeMode}
            onToggleLanguage={() => setLanguage((current) => current === "zh-CN" ? "en-US" : "zh-CN")}
          />

          <Layout.Content className="app-content" data-route={visibleRoute}>
            <Tabs
              className="app-route-tabs-shell"
              activeKey={visibleRoute}
              animated={false}
              destroyOnHidden={false}
              items={routeTabItems}
            />
          </Layout.Content>
        </Layout>
      </AntdApp>
    </ConfigProvider>
  );
}