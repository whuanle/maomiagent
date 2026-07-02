import { PlusOutlined } from "@ant-design/icons";
import {
  App as AntdApp,
  Badge,
  Button,
  Dropdown,
  Empty,
  Input,
  Select,
  Space,
  Tabs,
  Tag,
} from "antd";
import type { MenuProps, TabsProps } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DesktopWorkspaceItem } from "../../../shared/desktop-workspace";
import type {
  DesktopTerminalSessionDetail,
  DesktopTerminalSessionRecord,
  DesktopTerminalShellKind,
} from "../../../shared/desktop-terminals";
import type { LanguageCode } from "../../config/titlebar";
import {
  closeDesktopTerminalSession,
  createDesktopTerminalSession,
  DESKTOP_TERMINALS_BRIDGE_READY_EVENT,
  DESKTOP_TERMINALS_INVALIDATED_EVENT,
  executeDesktopTerminalInput,
  getDesktopTerminalDetail,
  hasDesktopTerminalsBridge,
  listDesktopTerminalSessions,
  resizeDesktopTerminalSession,
} from "../../lib/desktop-terminals";
import {
  hasDesktopWorkspaceBridge,
  listDesktopWorkspaces,
} from "../../lib/desktop-workspace";
import { useConversationWorkspaceSettings } from "../chat/components/conversation-workspace-settings-storage";
import { TerminalViewport } from "./components/terminal-viewport";
import "./page.css";

type Props = {
  active: boolean;
  language: LanguageCode;
  embedded?: boolean;
  boundWorkspaceId?: string;
};

type WorkspaceOption = {
  label: string;
  value: string;
};

function createCopy(language: LanguageCode) {
  if (language === "en-US") {
    return {
      empty: "No terminal sessions yet.",
      bridgeUnavailable: "Desktop bridge is unavailable.",
      create: "New terminal",
      cwdPlaceholder: "Optional working directory",
      workspacePlaceholder: "Workspace",
      commandPlaceholder: "Enter command or shell input",
      execute: "Run",
      sendEnter: "Send Enter",
      close: "Close terminal",
      outputEmpty: "No terminal output yet.",
      loadFailed: "Failed to load terminal sessions",
      createFailed: "Failed to create terminal session",
      executeFailed: "Failed to execute terminal input",
      closeFailed: "Failed to close terminal session",
      outputFailed: "Failed to load terminal output",
      titlePlaceholder: "Optional terminal title",
      exited: "Exited",
      running: "Running",
      failed: "Failed",
      closed: "Closed",
    };
  }

  return {
    empty: "还没有终端会话。",
    bridgeUnavailable: "桌面桥接不可用。",
    create: "新建终端",
    cwdPlaceholder: "可选工作目录",
    workspacePlaceholder: "工作区",
    commandPlaceholder: "输入命令或终端输入",
    execute: "执行",
    sendEnter: "发送回车",
    close: "关闭终端",
    outputEmpty: "还没有终端输出。",
    loadFailed: "加载终端会话失败",
    createFailed: "创建终端会话失败",
    executeFailed: "发送终端输入失败",
    closeFailed: "关闭终端失败",
    outputFailed: "加载终端输出失败",
    titlePlaceholder: "可选终端标题",
    exited: "已退出",
    running: "运行中",
    failed: "失败",
    closed: "已关闭",
  };
}

function resolveStatusLabel(language: LanguageCode, status: DesktopTerminalSessionRecord["status"]) {
  const copy = createCopy(language);
  if (status === "running") {
    return copy.running;
  }
  if (status === "failed") {
    return copy.failed;
  }
  if (status === "closed") {
    return copy.closed;
  }
  return copy.exited;
}

function formatEmbeddedTerminalTabTitle(item: DesktopTerminalSessionRecord, index: number) {
  const title = item.title?.trim();
  if (title) {
    return title;
  }

  return `${item.shellKind.toUpperCase()} ${index + 1}`;
}

function resolveEmbeddedTerminalStatusMeta(
  language: LanguageCode,
  item: DesktopTerminalSessionRecord | null,
): { label: string; badgeStatus: "success" | "default" | "error" } {
  if (!item) {
    return {
      label: language === "en-US" ? "Offline" : "未连接",
      badgeStatus: "default",
    };
  }

  if (item.status === "running") {
    return {
      label: language === "en-US" ? "Running" : "运行中",
      badgeStatus: "success",
    };
  }

  if (item.status === "failed") {
    return {
      label: language === "en-US" ? "Failed" : "异常退出",
      badgeStatus: "error",
    };
  }

  if (typeof item.exitCode === "number" && item.exitCode !== 0) {
    return {
      label: language === "en-US" ? "Exited" : "已退出",
      badgeStatus: "error",
    };
  }

  return {
    label: language === "en-US" ? "Completed" : "已完成",
    badgeStatus: "default",
  };
}

function resolveEmbeddedEmptyDescription(input: {
  language: LanguageCode;
  hasWorkspace: boolean;
  loading: boolean;
  shellOptions: Array<{ label: string; value: DesktopTerminalShellKind }>;
}) {
  if (!input.hasWorkspace) {
    return input.language === "en-US"
      ? "This workspace does not have a usable directory."
      : "当前工作区没有可用目录。";
  }

  if (input.loading) {
    return input.language === "en-US" ? "Preparing terminal..." : "正在准备终端...";
  }

  if (input.shellOptions.length === 0) {
    return input.language === "en-US"
      ? "No terminal profiles are available."
      : "当前环境没有可用终端配置";
  }

  return input.language === "en-US" ? "No terminal session yet." : "还没有终端会话。";
}

function isWindowsRuntime(): boolean {
  if (typeof navigator === "undefined") {
    return true;
  }

  const platform = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  return platform.includes("win");
}

function resolveShellOptions(): Array<{ label: string; value: DesktopTerminalShellKind }> {
  return isWindowsRuntime()
    ? [
        { label: "PowerShell", value: "powershell" },
        { label: "CMD", value: "cmd" },
      ]
    : [
        { label: "sh", value: "sh" },
        { label: "bash", value: "bash" },
      ];
}

function resolvePreferredShellKind(
  preferredShellKind: DesktopTerminalShellKind | undefined,
  shellOptions: Array<{ label: string; value: DesktopTerminalShellKind }>,
): DesktopTerminalShellKind {
  if (preferredShellKind && shellOptions.some((item) => item.value === preferredShellKind)) {
    return preferredShellKind;
  }

  return shellOptions[0]?.value ?? "powershell";
}

const TERMINAL_DETAIL_LIMIT = 120_000;
const TERMINAL_POLL_INTERVAL_MS = 180;

export function ShellPage(props: Props) {
  const { message } = AntdApp.useApp();
  const copy = useMemo(() => createCopy(props.language), [props.language]);
  const shellOptions = useMemo(() => resolveShellOptions(), []);
  const boundWorkspaceId = props.boundWorkspaceId?.trim() || undefined;
  const [bridgeReady, setBridgeReady] = useState(() => hasDesktopTerminalsBridge());
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOption[]>([]);
  const [sessions, setSessions] = useState<DesktopTerminalSessionRecord[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined);
  const [detail, setDetail] = useState<DesktopTerminalSessionDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [viewportError, setViewportError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | undefined>(boundWorkspaceId);
  const [shellKind, setShellKind] = useState<DesktopTerminalShellKind>(shellOptions[0]?.value ?? "powershell");
  const [cwd, setCwd] = useState("");
  const [title, setTitle] = useState("");
  const detailRequestRef = useRef(0);
  const pendingCreatedSessionIdRef = useRef<string | null>(null);
  const hasWorkspaceBinding = Boolean((boundWorkspaceId || selectedWorkspaceId)?.trim());
  const { settings: workspaceSettings } = useConversationWorkspaceSettings(boundWorkspaceId || selectedWorkspaceId);
  const shellMenuItems = useMemo<NonNullable<MenuProps["items"]>>(
    () => shellOptions.map((option) => ({
      key: option.value,
      label: option.label,
    })),
    [shellOptions],
  );

  useEffect(() => {
    if (!boundWorkspaceId) {
      return;
    }

    setSelectedWorkspaceId(boundWorkspaceId);
  }, [boundWorkspaceId]);

  useEffect(() => {
    setShellKind(resolvePreferredShellKind(workspaceSettings.defaultTerminalShellKind, shellOptions));
  }, [shellOptions, workspaceSettings.defaultTerminalShellKind, boundWorkspaceId, selectedWorkspaceId]);

  const loadWorkspaces = useCallback(async () => {
    if (!props.active || !bridgeReady || !hasDesktopWorkspaceBridge() || boundWorkspaceId) {
      return;
    }

    const response = await listDesktopWorkspaces({ limit: 200, offset: 0 });
    setWorkspaceOptions(response.items.map((item: DesktopWorkspaceItem) => ({
      label: item.name ? `${item.name} (${item.workspaceId})` : item.workspaceId,
      value: item.workspaceId,
    })));
  }, [boundWorkspaceId, bridgeReady, props.active]);

  const loadSessions = useCallback(async () => {
    if (!props.active || !bridgeReady) {
      return;
    }

    setLoading(true);
    try {
      const response = await listDesktopTerminalSessions({ limit: 200, offset: 0 });
      const nextItems = boundWorkspaceId
        ? response.items.filter((item) => item.workspaceId === boundWorkspaceId)
        : response.items;
      setSessions(nextItems);
      setActiveSessionId((current) => {
        if (pendingCreatedSessionIdRef.current) {
          return pendingCreatedSessionIdRef.current;
        }

        if (current && nextItems.some((item) => item.sessionId === current)) {
          return current;
        }

        return nextItems[0]?.sessionId;
      });

      if (pendingCreatedSessionIdRef.current && nextItems.some((item) => item.sessionId === pendingCreatedSessionIdRef.current)) {
        pendingCreatedSessionIdRef.current = null;
      }
    } catch (error) {
      message.error(`${copy.loadFailed}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }, [boundWorkspaceId, bridgeReady, copy.loadFailed, message, props.active]);

  const loadDetail = useCallback(async (sessionId: string | undefined) => {
    detailRequestRef.current += 1;
    const requestId = detailRequestRef.current;

    if (!props.active || !bridgeReady || !sessionId) {
      setDetail(null);
      setDetailError(null);
      return;
    }

    try {
      const nextDetail = await getDesktopTerminalDetail({ sessionId, limit: TERMINAL_DETAIL_LIMIT });
      if (detailRequestRef.current !== requestId) {
        return;
      }

      setDetail(nextDetail);
      if (nextDetail?.session) {
        setSessions((current) => current.map((item) => item.sessionId === nextDetail.session.sessionId
          ? nextDetail.session
          : item));
      }
      setDetailError(null);
    } catch (error) {
      if (detailRequestRef.current !== requestId) {
        return;
      }

      setDetailError(`${copy.outputFailed}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [bridgeReady, copy.outputFailed, props.active]);

  useEffect(() => {
    const syncBridgeState = () => {
      setBridgeReady(hasDesktopTerminalsBridge());
    };

    syncBridgeState();
    window.addEventListener(DESKTOP_TERMINALS_BRIDGE_READY_EVENT, syncBridgeState);
    return () => window.removeEventListener(DESKTOP_TERMINALS_BRIDGE_READY_EVENT, syncBridgeState);
  }, []);

  useEffect(() => {
    if (!props.active || !bridgeReady) {
      return;
    }

    void loadWorkspaces();
    void loadSessions();
  }, [bridgeReady, loadSessions, loadWorkspaces, props.active]);

  useEffect(() => {
    void loadDetail(activeSessionId);
  }, [activeSessionId, loadDetail]);

  useEffect(() => {
    if (!props.active || !bridgeReady) {
      return undefined;
    }

    const handleInvalidated = () => {
      void loadSessions();
      void loadDetail(activeSessionId);
    };

    window.addEventListener(DESKTOP_TERMINALS_INVALIDATED_EVENT, handleInvalidated as EventListener);
    return () => window.removeEventListener(DESKTOP_TERMINALS_INVALIDATED_EVENT, handleInvalidated as EventListener);
  }, [activeSessionId, bridgeReady, loadDetail, loadSessions, props.active]);

  useEffect(() => {
    if (!props.active || !detail?.session || detail.session.status !== "running") {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void loadDetail(detail.session.sessionId);
    }, TERMINAL_POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [detail?.revision, detail?.session, loadDetail, props.active]);

  const handleCreate = useCallback(async (nextShellKind?: DesktopTerminalShellKind) => {
    setCreating(true);
    try {
      const session = await createDesktopTerminalSession({
        shellKind: nextShellKind ?? shellKind,
        ...((boundWorkspaceId || selectedWorkspaceId) ? { workspaceId: boundWorkspaceId || selectedWorkspaceId } : {}),
        ...(cwd.trim() ? { cwd: cwd.trim() } : {}),
        ...(title.trim() ? { title: title.trim() } : {}),
      });
      pendingCreatedSessionIdRef.current = session.sessionId;
      setActiveSessionId(session.sessionId);
      setViewportError(null);
      await loadSessions();
      await loadDetail(session.sessionId);
    } catch (error) {
      message.error(`${copy.createFailed}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCreating(false);
    }
  }, [boundWorkspaceId, copy.createFailed, cwd, loadDetail, loadSessions, message, selectedWorkspaceId, shellKind, title]);

  const handleTerminalInput = useCallback((text: string) => {
    if (!activeSessionId) {
      return;
    }

    void executeDesktopTerminalInput(activeSessionId, { text, appendNewline: false }).catch((error) => {
      message.error(`${copy.executeFailed}: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, [activeSessionId, copy.executeFailed, message]);

  const handleTerminalResize = useCallback((sessionId: string, cols: number, rows: number) => {
    void resizeDesktopTerminalSession(sessionId, { cols, rows }).catch(() => undefined);
  }, []);

  const handleViewportError = useCallback((error: Error) => {
    setViewportError(error.message);
  }, []);

  const handleClose = useCallback(async (sessionId: string) => {
    try {
      if (pendingCreatedSessionIdRef.current === sessionId) {
        pendingCreatedSessionIdRef.current = null;
      }

      if (activeSessionId === sessionId) {
        setActiveSessionId(undefined);
      }

      await closeDesktopTerminalSession(sessionId);
      await loadSessions();
      if (activeSessionId !== sessionId) {
        await loadDetail(activeSessionId);
      }
    } catch (error) {
      message.error(`${copy.closeFailed}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [activeSessionId, copy.closeFailed, loadDetail, loadSessions, message]);

  useEffect(() => {
    setViewportError(null);
  }, [activeSessionId]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.sessionId === activeSessionId)
      ?? (detail && detail.session.sessionId === activeSessionId ? detail.session : null),
    [activeSessionId, detail?.session, sessions],
  );
  const activeSessionDetail = activeSession && detail?.session?.sessionId === activeSession.sessionId
    ? detail
    : null;
  const activeSessionTerminalOutput = activeSessionDetail?.rawOutput ?? activeSessionDetail?.output ?? "";
  const terminalSurfaceError = detailError ?? viewportError;
  const embeddedTabItems = useMemo<TabsProps["items"]>(
    () => sessions.map((session, index) => {
      const status = resolveEmbeddedTerminalStatusMeta(props.language, session);

      return {
        key: session.sessionId,
        closable: true,
        label: (
          <Badge
            status={status.badgeStatus}
            text={formatEmbeddedTerminalTabTitle(session, index)}
          />
        ),
        children: null,
      };
    }),
    [props.language, sessions],
  );
  const activeEmbeddedTabId = activeSessionId || activeSession?.sessionId || sessions[0]?.sessionId;

  if (props.embedded) {
    return (
      <section className="shell-page is-embedded">
        <div className="chat-terminal-panel">
          <div className="chat-terminal-head">
            <div className="chat-terminal-tabbar">
              <Tabs
                size="small"
                type="editable-card"
                hideAdd
                className="chat-terminal-tabs"
                activeKey={activeEmbeddedTabId}
                items={embeddedTabItems}
                destroyOnHidden={false}
                onChange={setActiveSessionId}
                onEdit={(targetKey, action) => {
                  if (action === "remove" && typeof targetKey === "string") {
                    void handleClose(targetKey);
                  }
                }}
              />
              <Dropdown
                trigger={["click"]}
                disabled={!hasWorkspaceBinding || shellMenuItems.length === 0 || creating}
                menu={{
                  items: shellMenuItems,
                  onClick: ({ key }) => {
                    void handleCreate(String(key) as DesktopTerminalShellKind);
                  },
                }}
              >
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  loading={creating}
                  disabled={!hasWorkspaceBinding || shellMenuItems.length === 0 || creating}
                  title={copy.create}
                  aria-label={copy.create}
                />
              </Dropdown>
            </div>
          </div>

          <div className="chat-terminal-body">
            {activeSession ? (
              <div className="chat-terminal-session-shell">
                <div className="chat-terminal-output-shell">
                  <TerminalViewport
                    className="chat-terminal-viewport"
                    sessionKey={activeSession.sessionId}
                    output={activeSessionTerminalOutput}
                    status={activeSession.status}
                    onInput={handleTerminalInput}
                    onResize={(cols, rows) => handleTerminalResize(activeSession.sessionId, cols, rows)}
                    onLoadError={handleViewportError}
                  />
                  {terminalSurfaceError ? (
                    <div className="chat-terminal-output-error">{terminalSurfaceError}</div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="chat-terminal-empty">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={resolveEmbeddedEmptyDescription({
                    language: props.language,
                    hasWorkspace: hasWorkspaceBinding,
                    loading,
                    shellOptions,
                  })}
                />
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (!bridgeReady) {
    return (
      <section className={`shell-page${props.embedded ? " is-embedded" : ""}`}>
        <div className="shell-page-surface shell-page-empty-state">
          <Empty description={copy.bridgeUnavailable} />
        </div>
      </section>
    );
  }

  return (
    <section className={`shell-page${props.embedded ? " is-embedded" : ""}`}>
      <div className="shell-page-surface">
        <div className="shell-page-toolbar-shell">
          <div className="shell-page-toolbar">
            {boundWorkspaceId ? null : (
              <Select
                allowClear
                value={selectedWorkspaceId}
                placeholder={copy.workspacePlaceholder}
                className="shell-page-workspace-select"
                options={workspaceOptions}
                onChange={(value) => setSelectedWorkspaceId(value)}
              />
            )}
            <Select
              value={shellKind}
              className="shell-page-shell-select"
              options={shellOptions}
              onChange={(value) => setShellKind(value)}
            />
            <Input
              value={title}
              className="shell-page-title-input"
              placeholder={copy.titlePlaceholder}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Input
              value={cwd}
              className="shell-page-cwd-input"
              placeholder={copy.cwdPlaceholder}
              onChange={(event) => setCwd(event.target.value)}
            />
            <Button type="primary" loading={creating} onClick={() => void handleCreate()}>
              {copy.create}
            </Button>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="shell-page-empty-state">
            <Empty description={loading ? (props.language === "en-US" ? "Loading" : "正在加载") : copy.empty} />
          </div>
        ) : (
          <div className="shell-page-session-shell">
            <Tabs
              className="shell-page-tabs"
              activeKey={activeSessionId}
              destroyOnHidden={false}
              onChange={setActiveSessionId}
              items={sessions.map((session) => ({
                key: session.sessionId,
                label: (
                  <span className="shell-page-tab-label" title={session.title}>
                    <span className="shell-page-tab-text">{session.title}</span>
                    <Tag variant="filled" className={`shell-page-status-tag is-${session.status}`}>
                      {resolveStatusLabel(props.language, session.status)}
                    </Tag>
                  </span>
                ),
                children: null,
              }))}
            />

            {activeSession ? (
              <div className="shell-page-session-stage">
                <div className="shell-page-session-meta">
                  <Space size={10} wrap>
                    <Tag variant="filled" className="shell-page-meta-tag">
                      {activeSession.shellKind}
                    </Tag>
                    <Tag variant="filled" className={`shell-page-status-tag is-${activeSession.status}`}>
                      {resolveStatusLabel(props.language, activeSession.status)}
                    </Tag>
                    {activeSession.workspaceName ? (
                      <Tag variant="filled" className="shell-page-meta-tag is-soft">
                        {activeSession.workspaceName}
                      </Tag>
                    ) : null}
                    <span className="shell-page-meta-path">{activeSession.cwd}</span>
                  </Space>
                  <Button
                    danger
                    size="small"
                    disabled={activeSession.status !== "running"}
                    onClick={() => void handleClose(activeSession.sessionId)}
                  >
                    {copy.close}
                  </Button>
                </div>

                <div className="shell-page-output-shell">
                  <TerminalViewport
                    className="shell-page-terminal-viewport"
                    sessionKey={activeSession.sessionId}
                    output={activeSessionTerminalOutput}
                    status={activeSession.status}
                    onInput={handleTerminalInput}
                    onResize={(cols, rows) => handleTerminalResize(activeSession.sessionId, cols, rows)}
                    onLoadError={handleViewportError}
                  />
                  {terminalSurfaceError ? (
                    <div className="shell-page-output-error">{terminalSurfaceError}</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}