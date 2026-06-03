import { useState } from "react";
import type { LanguageCode, TitlebarMenuItem } from "../../config/titlebar";
import type { Translate } from "../../i18n";
import type { TitlebarMenuDropPosition } from "../../lib/titlebar-menu-settings";
import type { AppThemeMode } from "../../theme/antd-theme";
import type { RuntimeStatus } from "../../types/status";
import { AppUpdatePanel } from "./components/app-update-panel";
import { AvatarSettingsPanel } from "./components/avatar-settings-panel";
import { DesktopPreferencesPanel } from "./components/desktop-preferences-panel";
import { MenuSettingsPanel } from "./components/menu-settings-panel";
import { RuntimeInfoPanel } from "./components/runtime-info-panel";
import "./page.css";

type SettingsPageSection = "preferences" | "avatar" | "menu" | "runtime";

type Props = {
  active: boolean;
  status: RuntimeStatus;
  language: LanguageCode;
  themeMode: AppThemeMode;
  t: Translate;
  orderedMenuItems: TitlebarMenuItem[];
  collapsedMenuKeys: TitlebarMenuItem["key"][];
  onSelectTheme: (mode: AppThemeMode) => void;
  onSelectLanguage: (language: LanguageCode) => void;
  onMenuCollapsedChange: (key: TitlebarMenuItem["key"], collapsed: boolean) => void;
  onMoveMenuItem: (key: TitlebarMenuItem["key"], direction: "up" | "down") => void;
  onReorderMenuItems: (
    sourceKey: TitlebarMenuItem["key"],
    targetKey: TitlebarMenuItem["key"],
    position: TitlebarMenuDropPosition,
  ) => void;
  onResetMenuSettings: () => void;
};

export function SettingsPage(props: Props) {
  const [activeSection, setActiveSection] = useState<SettingsPageSection>("preferences");
  const pageTitle = activeSection === "menu"
    ? props.t("设置页.标题.标题栏菜单")
    : activeSection === "runtime"
      ? props.t("设置页.标题.运行时消息")
      : activeSection === "avatar"
        ? props.t("设置页.标题.对话头像设置")
        : props.t("设置页.标题.桌面偏好");

  return (
    <section className="settings-page">
      <div className="settings-page-shell">
        <aside className="settings-page-sidebar app-section-nav">
          <nav className="settings-page-sidebar-nav app-section-nav-list" aria-label={props.t("设置页.导航.设置")}>
            <button type="button" className={`settings-page-category app-section-nav-button${activeSection === "preferences" ? " is-active" : ""}`} aria-current={activeSection === "preferences" ? "page" : undefined} onClick={() => setActiveSection("preferences")}>
              {props.t("设置页.标题.桌面偏好")}
            </button>
            <button type="button" className={`settings-page-category app-section-nav-button${activeSection === "avatar" ? " is-active" : ""}`} aria-current={activeSection === "avatar" ? "page" : undefined} onClick={() => setActiveSection("avatar")}>
              {props.t("设置页.标题.对话头像设置")}
            </button>
            <button type="button" className={`settings-page-category app-section-nav-button${activeSection === "menu" ? " is-active" : ""}`} aria-current={activeSection === "menu" ? "page" : undefined} onClick={() => setActiveSection("menu")}>
              {props.t("设置页.标题.标题栏菜单")}
            </button>
            <button type="button" className={`settings-page-category app-section-nav-button${activeSection === "runtime" ? " is-active" : ""}`} aria-current={activeSection === "runtime" ? "page" : undefined} onClick={() => setActiveSection("runtime")}>
              {props.t("设置页.标题.运行时消息")}
            </button>
          </nav>
        </aside>

        <section className="settings-page-content">
          <header className="settings-page-header">
            <h1>{pageTitle}</h1>
          </header>

          <div className="settings-page-panel">
            {activeSection === "menu" ? (
              <MenuSettingsPanel
                t={props.t}
                menuItems={props.orderedMenuItems}
                collapsedMenuKeys={props.collapsedMenuKeys}
                onMenuCollapsedChange={props.onMenuCollapsedChange}
                onMoveMenuItem={props.onMoveMenuItem}
                onReorderMenuItems={props.onReorderMenuItems}
                onResetMenuSettings={props.onResetMenuSettings}
              />
            ) : activeSection === "runtime" ? (
              <div className="settings-page-card-stack">
                <RuntimeInfoPanel
                  t={props.t}
                  language={props.language}
                  status={props.status}
                />
                <AppUpdatePanel
                  t={props.t}
                  status={props.status}
                />
              </div>
            ) : activeSection === "avatar" ? (
              <AvatarSettingsPanel
                active={props.active}
                language={props.language}
                t={props.t}
              />
            ) : (
              <DesktopPreferencesPanel
                t={props.t}
                language={props.language}
                themeMode={props.themeMode}
                onSelectTheme={props.onSelectTheme}
                onSelectLanguage={props.onSelectLanguage}
              />
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

export default SettingsPage;