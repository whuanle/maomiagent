import { Button, Dropdown, Tabs, Tooltip, Typography } from "antd";
import { ChevronDown, GitBranch, Globe, Minus, Moon, RefreshCw, Settings2, Sun, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  resolveRouteLabel,
  type AppRouteKey,
  type LanguageCode,
  type TitlebarMenuItem,
} from "../../config/titlebar";
import type { I18nKey, Translate } from "../../i18n";
import {
  DESKTOP_WINDOW_BRIDGE_READY_EVENT,
  hasDesktopWindowBridge,
  isWindowMaximized,
  refreshDesktopMainView,
  runDesktopWindowAction,
} from "../../lib/desktop-window";
import type { AppThemeMode } from "../../theme/antd-theme";
import type { RuntimeStatus } from "../../types/status";
import { StatusPopover } from "./StatusPopover";

const appLogoUrl = "/branding/package.png";
const COLLAPSED_ACTIVE_TAB_KEY = "__collapsed_active__";
const TITLEBAR_DRAG_EXIT_THRESHOLD = 8;

type Props = {
  status: RuntimeStatus;
  language: LanguageCode;
  t: Translate;
  themeMode: AppThemeMode;
  isSettingsActive: boolean;
  menuItems: TitlebarMenuItem[];
  collapsedMenuItems: TitlebarMenuItem[];
  activeMenuKey?: TitlebarMenuItem["key"];
  onMenuSelect: (key: AppRouteKey) => void;
  onOpenSettings: () => void;
  onSelectTheme: (mode: AppThemeMode) => void;
  onToggleLanguage: () => void;
};

function consumeTitlebarEvent(event: ReactMouseEvent<HTMLElement>) {
  event.stopPropagation();
}

function resolveThemeLabel(mode: AppThemeMode, t: Translate) {
  if (mode === "light-modern") {
    return t("标题栏.主题.LightModern");
  }
  if (mode === "light-eye-care") {
    return t("标题栏.主题.LightEyeCare");
  }
  if (mode === "dark") {
    return t("标题栏.主题.暗色");
  }
  if (mode === "tomorrow-night-blue") {
    return t("标题栏.主题.TomorrowNightBlue");
  }
  if (mode === "github") {
    return t("标题栏.主题.GitHub");
  }
  return t("标题栏.主题.亮色");
}

function renderThemeIcon(mode: AppThemeMode, iconSize: number): ReactNode {
  if (mode === "dark" || mode === "tomorrow-night-blue") {
    return <Moon size={iconSize} strokeWidth={1.9} />;
  }
  if (mode === "github") {
    return <GitBranch size={iconSize} strokeWidth={1.9} />;
  }
  return <Sun size={iconSize} strokeWidth={1.9} />;
}

function WindowMaximizeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect
        x="2.25"
        y="2.25"
        width="9.5"
        height="9.5"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function WindowRestoreIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect
        x="4.25"
        y="2.25"
        width="7.5"
        height="7.5"
        rx="1"
        fill="var(--app-surface)"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="2.25"
        y="4.25"
        width="7.5"
        height="7.5"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function WindowTitlebar(props: Props) {
  const [hasWindowControls, setHasWindowControls] = useState(() => hasDesktopWindowBridge());
  const [maximized, setMaximized] = useState(false);
  const titlebarDragGestureRef = useRef<{
    startX: number;
    startY: number;
    maximized: boolean;
    handled: boolean;
  } | null>(null);
  const iconSize = 16;
  const currentThemeLabel = resolveThemeLabel(props.themeMode, props.t);
  const themeMenuLabel = `${props.t("标题栏.主题")} · ${currentThemeLabel}`;
  const nextLanguageLabel = props.language === "zh-CN"
    ? props.t("标题栏.切换到英文")
    : props.t("标题栏.切换到中文");
  const collapsedMenuActive = props.collapsedMenuItems.some((item) => item.key === props.activeMenuKey);
  const expandedMenuActive = props.menuItems.some((item) => item.key === props.activeMenuKey);
  const titlebarTabItems = useMemo(() => {
    const items = props.menuItems.map((item) => ({
      key: item.key,
      label: resolveRouteLabel(item, props.t),
    }));

    if (!collapsedMenuActive) {
      return items;
    }

    return [
      ...items,
      {
        key: COLLAPSED_ACTIVE_TAB_KEY,
        label: <span aria-hidden="true" />,
        disabled: true,
        className: "window-titlebar-menu-tab-ghost",
      },
    ];
  }, [collapsedMenuActive, props.menuItems, props.t]);
  const titlebarTabsActiveKey = expandedMenuActive && props.activeMenuKey
    ? props.activeMenuKey
    : collapsedMenuActive
      ? COLLAPSED_ACTIVE_TAB_KEY
      : props.menuItems[0]?.key;
  const themeMenuItems = useMemo(() => ([
    { key: "light", label: props.t("标题栏.主题.亮色"), icon: <Sun size={iconSize} strokeWidth={1.9} /> },
    { key: "light-modern", label: props.t("标题栏.主题.LightModern"), icon: <Sun size={iconSize} strokeWidth={1.9} /> },
    { key: "light-eye-care", label: props.t("标题栏.主题.LightEyeCare"), icon: <Sun size={iconSize} strokeWidth={1.9} /> },
    { key: "github", label: props.t("标题栏.主题.GitHub"), icon: <GitBranch size={iconSize} strokeWidth={1.9} /> },
    { key: "dark", label: props.t("标题栏.主题.暗色"), icon: <Moon size={iconSize} strokeWidth={1.9} /> },
    { key: "tomorrow-night-blue", label: props.t("标题栏.主题.TomorrowNightBlue"), icon: <Moon size={iconSize} strokeWidth={1.9} /> },
  ]), [iconSize, props.t]);
  const refreshMaximized = useCallback(async () => {
    if (!hasWindowControls) {
      return;
    }
    setMaximized(await isWindowMaximized());
  }, [hasWindowControls]);

  useEffect(() => {
    void refreshMaximized();
  }, [refreshMaximized]);

  useEffect(() => {
    document.documentElement.dataset.desktopWindowMaximized = maximized ? "true" : "false";
    return () => {
      delete document.documentElement.dataset.desktopWindowMaximized;
    };
  }, [maximized]);

  useEffect(() => {
    const updateBridgeState = () => {
      const ready = hasDesktopWindowBridge();
      setHasWindowControls(ready);
      if (ready) {
        void refreshMaximized();
      }
    };

    updateBridgeState();
    window.addEventListener(DESKTOP_WINDOW_BRIDGE_READY_EVENT, updateBridgeState);
    window.addEventListener("resize", updateBridgeState);
    return () => {
      window.removeEventListener(DESKTOP_WINDOW_BRIDGE_READY_EVENT, updateBridgeState);
      window.removeEventListener("resize", updateBridgeState);
    };
  }, [refreshMaximized]);

  useEffect(() => {
    const clearTitlebarDragGesture = () => {
      titlebarDragGestureRef.current = null;
    };

    const handleTitlebarDragMove = (event: MouseEvent) => {
      const dragGesture = titlebarDragGestureRef.current;
      if (!dragGesture || dragGesture.handled || !hasWindowControls) {
        return;
      }

      const moveX = Math.abs(event.clientX - dragGesture.startX);
      const moveY = Math.abs(event.clientY - dragGesture.startY);
      if (moveX < TITLEBAR_DRAG_EXIT_THRESHOLD && moveY < TITLEBAR_DRAG_EXIT_THRESHOLD) {
        return;
      }

      dragGesture.handled = true;
      const action = dragGesture.maximized
        ? runDesktopWindowAction("restoreForDrag", {
          offsetX: event.clientX,
          offsetY: event.clientY,
          windowWidth: window.innerWidth,
        })
        : runDesktopWindowAction("exitFullScreen");

      void action
        .then((state) => {
          setMaximized(state.maximized);
        })
        .catch((error) => {
          console.error(props.t("标题栏.切换窗口状态失败"), error);
        })
        .finally(() => {
          titlebarDragGestureRef.current = null;
        });
    };

    window.addEventListener("mousemove", handleTitlebarDragMove);
    window.addEventListener("mouseup", clearTitlebarDragGesture);
    window.addEventListener("blur", clearTitlebarDragGesture);
    return () => {
      window.removeEventListener("mousemove", handleTitlebarDragMove);
      window.removeEventListener("mouseup", clearTitlebarDragGesture);
      window.removeEventListener("blur", clearTitlebarDragGesture);
    };
  }, [hasWindowControls, props.t]);

  const handleTitlebarDoubleClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-no-maximize]") || !hasWindowControls) {
      return;
    }
    void runDesktopWindowAction("toggleMaximize").then((state) => setMaximized(state.maximized));
  }, [hasWindowControls]);

  const runWindowAction = useCallback(async (
    event: ReactMouseEvent<HTMLElement>,
    action: () => Promise<unknown>,
    errorTitleKey: I18nKey,
  ) => {
    consumeTitlebarEvent(event);
    try {
      await action();
    } catch (error) {
      console.error(props.t(errorTitleKey), error);
    }
  }, [props]);

  const handleTitlebarDragMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!hasWindowControls || event.button !== 0) {
      return;
    }

    titlebarDragGestureRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      maximized,
      handled: false,
    };
  }, [hasWindowControls, maximized]);

  return (
    <header
      className="window-titlebar"
      onDoubleClick={handleTitlebarDoubleClick}
    >
      <div className="window-titlebar-status" data-no-maximize>
        <img src={appLogoUrl} alt="" className="window-titlebar-logo" draggable={false} />
        <Typography.Text className="window-titlebar-status-title">MaomiAgent</Typography.Text>
        <StatusPopover status={props.status} language={props.language} t={props.t} />
      </div>

      <nav className="window-titlebar-menu electrobun-webkit-app-region-no-drag" data-no-drag data-no-maximize aria-label={props.t("标题栏.主导航")}>
        <Tabs
          className={`window-titlebar-menu-tabs${collapsedMenuActive ? " is-collapsed-active" : ""}`}
          activeKey={titlebarTabsActiveKey}
          animated={false}
          onChange={(key) => props.onMenuSelect(key as AppRouteKey)}
          items={titlebarTabItems}
        />
        {props.collapsedMenuItems.length > 0 ? (
          <Dropdown
            trigger={["click"]}
            placement="bottomLeft"
            menu={{
              selectedKeys: props.activeMenuKey ? [props.activeMenuKey] : [],
              items: props.collapsedMenuItems.map((item) => ({
                key: item.key,
                label: resolveRouteLabel(item, props.t),
              })),
              onClick: ({ key }) => props.onMenuSelect(key as AppRouteKey),
            }}
          >
            <Button type="text" data-no-drag className={`window-titlebar-more-trigger electrobun-webkit-app-region-no-drag${collapsedMenuActive ? " is-active" : ""}`} onMouseDown={consumeTitlebarEvent}>
              {props.t("菜单.更多")}
              <ChevronDown size={12} strokeWidth={2} className="window-titlebar-more-icon" />
            </Button>
          </Dropdown>
        ) : null}
      </nav>

      <div
        className="window-titlebar-drag electrobun-webkit-app-region-drag"
        data-desktop-drag-region
        onMouseDown={handleTitlebarDragMouseDown}
      />

      <div className="window-titlebar-right electrobun-webkit-app-region-no-drag" data-no-drag data-no-maximize>
        <div className="titlebar-tool-group electrobun-webkit-app-region-no-drag">
          <Tooltip title={props.t("标题栏.打开设置")}>
            <Button type="text" className={`window-control-btn titlebar-icon-btn${props.isSettingsActive ? " is-active" : ""}`} aria-label={props.t("标题栏.打开设置")} icon={<Settings2 size={iconSize} strokeWidth={1.9} />} data-no-drag onMouseDown={consumeTitlebarEvent} onClick={(event) => { consumeTitlebarEvent(event); props.onOpenSettings(); }} />
          </Tooltip>
          <Dropdown trigger={["click"]} placement="bottomRight" menu={{ selectedKeys: [props.themeMode], items: themeMenuItems, onClick: ({ key }) => props.onSelectTheme(key as AppThemeMode) }}>
            <Tooltip title={themeMenuLabel}>
              <Button type="text" className="window-control-btn titlebar-icon-btn" aria-label={themeMenuLabel} icon={renderThemeIcon(props.themeMode, iconSize)} data-no-drag onMouseDown={consumeTitlebarEvent} />
            </Tooltip>
          </Dropdown>
          <Tooltip title={nextLanguageLabel}>
            <Button type="text" className="window-control-btn titlebar-icon-btn" aria-label={nextLanguageLabel} icon={<Globe size={iconSize} strokeWidth={1.9} />} data-no-drag onMouseDown={consumeTitlebarEvent} onClick={(event) => { consumeTitlebarEvent(event); props.onToggleLanguage(); }} />
          </Tooltip>
          <Tooltip title={props.t("标题栏.刷新界面")}>
            <Button type="text" className="window-control-btn titlebar-icon-btn" aria-label={props.t("标题栏.刷新界面")} icon={<RefreshCw size={iconSize} strokeWidth={1.9} />} data-no-drag onMouseDown={consumeTitlebarEvent} onClick={(event) => { void runWindowAction(event, () => refreshDesktopMainView(), "标题栏.刷新界面失败"); }} />
          </Tooltip>
        </div>

        {hasWindowControls ? (
          <div className="window-controls electrobun-webkit-app-region-no-drag" data-no-maximize>
            <Tooltip title={props.t("标题栏.最小化")}>
              <Button type="text" className="window-control-btn" aria-label={props.t("标题栏.最小化")} icon={<Minus size={iconSize} strokeWidth={1.9} />} data-no-drag onMouseDown={consumeTitlebarEvent} onClick={(event) => { void runWindowAction(event, () => runDesktopWindowAction("minimize"), "标题栏.最小化窗口失败"); }} />
            </Tooltip>
            <Tooltip title={maximized ? props.t("标题栏.还原") : props.t("标题栏.最大化")}>
              <Button
                type="text"
                className="window-control-btn"
                aria-label={maximized ? props.t("标题栏.还原") : props.t("标题栏.最大化")}
                icon={maximized ? <WindowRestoreIcon /> : <WindowMaximizeIcon />}
                data-no-drag
                onMouseDown={consumeTitlebarEvent}
                onClick={(event) => {
                  void runWindowAction(
                    event,
                    () => runDesktopWindowAction("toggleMaximize").then((state) => setMaximized(state.maximized)),
                    "标题栏.切换窗口状态失败",
                  );
                }}
              />
            </Tooltip>
            <Tooltip title={props.t("标题栏.关闭")}>
              <Button type="text" danger className="window-control-btn danger" aria-label={props.t("标题栏.关闭")} icon={<X size={iconSize} strokeWidth={1.9} />} data-no-drag onMouseDown={consumeTitlebarEvent} onClick={(event) => { void runWindowAction(event, () => runDesktopWindowAction("close"), "标题栏.关闭窗口失败"); }} />
            </Tooltip>
          </div>
        ) : null}
      </div>
    </header>
  );
}
