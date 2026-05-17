import {
  QrcodeOutlined,
  ReloadOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Divider,
  Empty,
  Input,
  Popconfirm,
  Select,
  Switch,
  Table,
  Tag,
  Typography,
  type TableColumnsType,
} from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  WechatAccountConnectionStatus,
  WechatAccountView,
  WechatLoginSessionView,
  WechatStateView,
} from "../../../shared/desktop-wechat";
import type { DesktopWorkspaceItem } from "../../../shared/desktop-workspace";
import { listDesktopWorkspaces } from "../../lib/desktop-workspace";
import {
  clearWechatAccountConversations,
  fetchWechatState,
  pollWechatQrLogin,
  removeWechatAccount,
  saveWechatConfig,
  startWechatQrLogin,
  subscribeWechatMutations,
} from "../../lib/desktop-wechat";
import {
  reserveWechatLoginWindow,
  type ReservedWechatLoginWindow,
} from "../../lib/wechat-login-window";
import { RuntimeModelSelect } from "./components/runtime-model-select";
import { WechatLoginPreview } from "./components/login-preview";
import { WechatToolbarField } from "./components/toolbar-field";
import "./page.css";

const { Text } = Typography;

type Props = {
  active: boolean;
  language: "zh-CN" | "en-US";
};

type WechatConfigDraft = {
  baseUrl: string;
  cdnBaseUrl: string;
  routeTag: string;
  allowWorkspaceSwitch: boolean;
  allowedExecutionWorkspaceIds?: string[];
  selectedChannelId?: string;
  selectedModelId?: string;
};

function isAbortLikeError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.trim().toLowerCase();
  return normalized === "the operation was aborted."
    || normalized === "operation was aborted"
    || normalized === "aborted"
    || normalized.includes("aborterror");
}

function resolveWechatExecutionWorkspaceId(
  state: WechatStateView | null,
  workspaces: DesktopWorkspaceItem[],
): string | undefined {
  return state?.config.selectedWorkspaceId?.trim()
    || state?.config.defaultExecutionWorkspaceId?.trim()
    || workspaces[0]?.workspaceId?.trim()
    || undefined;
}

function formatDateTime(value?: string): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const pad2 = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function buildDraftFromState(state: WechatStateView | null): WechatConfigDraft {
  return {
    baseUrl: state?.config.baseUrl ?? "",
    cdnBaseUrl: state?.config.cdnBaseUrl ?? "",
    routeTag: state?.config.routeTag ?? "",
    allowWorkspaceSwitch: state?.config.allowWorkspaceSwitch === true,
    allowedExecutionWorkspaceIds:
      state?.config.workspaceSwitchScope === "restricted"
        ? (state.config.allowedExecutionWorkspaceIds ?? [])
        : [],
    selectedChannelId: state?.config.selectedChannelId,
    selectedModelId: state?.config.selectedModelId,
  };
}

function resolveWechatWorkspaceSwitchSummary(input: {
  allowWorkspaceSwitch?: boolean;
  workspaceSwitchScope?: "all" | "restricted";
  allowedExecutionWorkspaceIds?: string[];
}): string {
  if (!input.allowWorkspaceSwitch) {
    return "不允许切换";
  }
  if (input.workspaceSwitchScope === "restricted") {
    const count = input.allowedExecutionWorkspaceIds?.length ?? 0;
    return count > 0 ? `限制范围 ${count} 个` : "限制范围";
  }
  return "允许切换到全部普通工作区";
}

function resolveStateRevision(state: WechatStateView | null): number {
  if (!state) {
    return 0;
  }

  let revision = Date.parse(state.updatedAt);
  if (!Number.isFinite(revision)) {
    revision = 0;
  }

  for (const item of state.loginSessions) {
    const loginRevision = Date.parse(item.updatedAt);
    if (Number.isFinite(loginRevision) && loginRevision > revision) {
      revision = loginRevision;
    }
  }

  return revision;
}

function resolveAccountStatusColor(status: WechatAccountConnectionStatus): string {
  if (status === "connected") {
    return "success";
  }
  if (status === "paused") {
    return "warning";
  }
  if (status === "error") {
    return "error";
  }
  if (status === "connecting") {
    return "processing";
  }
  return "default";
}

function resolveLoginStatusColor(status: WechatLoginSessionView["status"]): string {
  if (status === "confirmed") {
    return "success";
  }
  if (status === "expired" || status === "failed") {
    return "error";
  }
  if (status === "scanned") {
    return "processing";
  }
  return "warning";
}

function resolveLoginStatusLabel(status: WechatLoginSessionView["status"]): string {
  if (status === "pending") {
    return "准备中";
  }
  if (status === "wait") {
    return "等待扫码";
  }
  if (status === "scanned") {
    return "已扫码";
  }
  if (status === "confirmed") {
    return "已确认";
  }
  if (status === "expired") {
    return "已过期";
  }
  return "失败";
}

export function WechatPage(props: Props) {
  const { message } = App.useApp();
  const [state, setState] = useState<WechatStateView | null>(null);
  const [workspaces, setWorkspaces] = useState<DesktopWorkspaceItem[]>([]);
  const [draftConfig, setDraftConfig] = useState<WechatConfigDraft>(() => buildDraftFromState(null));
  const [loading, setLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [startingLogin, setStartingLogin] = useState(false);
  const [pollingLogin, setPollingLogin] = useState(false);
  const [openingLoginPage, setOpeningLoginPage] = useState(false);
  const [accountActionKey, setAccountActionKey] = useState("");
  const [activeLoginSessionKey, setActiveLoginSessionKey] = useState("");
  const stateRef = useRef<WechatStateView | null>(null);
  const loginWindowRef = useRef<ReservedWechatLoginWindow | null>(null);
  const loadRequestVersionRef = useRef(0);
  const foregroundLoadCountRef = useRef(0);
  const totalAccountCount = state?.accounts.length ?? 0;
  const liveAccountCount = state?.accounts.filter((item) =>
    item.connectionStatus === "connected" || item.connectionStatus === "connecting").length ?? 0;
  const hasLoadedState = state !== null;
  const isInitialStateLoading = !hasLoadedState;
  const isTableLoading = loading || isInitialStateLoading;

  const closeLoginWindow = useCallback(() => {
    loginWindowRef.current?.close();
    loginWindowRef.current = null;
  }, []);

  const reserveAndTrackLoginWindow = useCallback(() => {
    closeLoginWindow();
    const reserved = reserveWechatLoginWindow();
    loginWindowRef.current = reserved;
    return reserved;
  }, [closeLoginWindow]);

  const commitWechatState = useCallback((
    nextState: WechatStateView,
    options?: {
      allowEmptyAccounts?: boolean;
    },
  ) => {
    const currentState = stateRef.current;
    const currentRevision = resolveStateRevision(currentState);
    const nextRevision = resolveStateRevision(nextState);
    const currentHasAccounts = (currentState?.accounts.length ?? 0) > 0;
    const nextHasAccounts = nextState.accounts.length > 0;

    if (nextRevision < currentRevision) {
      return false;
    }

    if (
      !options?.allowEmptyAccounts
      && currentHasAccounts
      && !nextHasAccounts
      && nextRevision <= currentRevision
    ) {
      return false;
    }

    stateRef.current = nextState;
    setState(nextState);
    setDraftConfig(buildDraftFromState(nextState));
    setActiveLoginSessionKey((current) => {
      if (current && nextState.loginSessions.some((item) => item.sessionKey === current)) {
        return current;
      }

      return nextState.loginSessions[0]?.sessionKey ?? "";
    });
    return true;
  }, []);

  const loadData = useCallback(async (silent = false) => {
    const requestVersion = loadRequestVersionRef.current + 1;
    loadRequestVersionRef.current = requestVersion;

    if (!props.active) {
      return;
    }

    if (!silent) {
      foregroundLoadCountRef.current += 1;
      setLoading(true);
    }

    try {
      const [wechatStateResult, workspaceListResult] = await Promise.allSettled([
        fetchWechatState(),
        listDesktopWorkspaces({
          limit: 200,
          offset: 0,
        }),
      ]);
      if (requestVersion !== loadRequestVersionRef.current) {
        return;
      }

      if (wechatStateResult.status === "rejected") {
        throw wechatStateResult.reason;
      }

      commitWechatState(wechatStateResult.value);
      if (workspaceListResult.status === "fulfilled") {
        setWorkspaces(workspaceListResult.value.items);
      }
    } catch (error) {
      if (!isAbortLikeError(error)) {
        message.error(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (!silent) {
        foregroundLoadCountRef.current = Math.max(0, foregroundLoadCountRef.current - 1);
        if (foregroundLoadCountRef.current === 0) {
          setLoading(false);
        }
      }
    }
  }, [commitWechatState, message, props.active]);

  useEffect(() => {
    if (!props.active) {
      return;
    }
    void loadData(false);
  }, [loadData, props.active]);

  useEffect(() => {
    if (!props.active) {
      return;
    }

    return subscribeWechatMutations(() => {
      void loadData(true);
    });
  }, [loadData, props.active]);

  const currentLoginSession = useMemo(() => {
    if (!state?.loginSessions.length) {
      return null;
    }

    return state.loginSessions.find((item) => item.sessionKey === activeLoginSessionKey)
      ?? state.loginSessions[0]
      ?? null;
  }, [activeLoginSessionKey, state?.loginSessions]);

  const workspaceOptions = useMemo(
    () => workspaces.map((item) => ({
      label: `${item.name} · ${item.workspaceId}`,
      value: item.workspaceId,
    })),
    [workspaces],
  );

  const pollLoginSession = useCallback(async (sessionKey: string) => {
    if (!props.active || !sessionKey.trim()) {
      return;
    }

    try {
      setPollingLogin(true);
      const result = await pollWechatQrLogin({
        sessionKey,
      });
      commitWechatState(result.state);
      setActiveLoginSessionKey(result.item.sessionKey);

      if (result.connected) {
        closeLoginWindow();
        message.success("微信账号已接入");
      }
    } catch (error) {
      if (!isAbortLikeError(error)) {
        message.error(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setPollingLogin(false);
    }
  }, [closeLoginWindow, commitWechatState, message, props.active]);

  useEffect(() => {
    if (!props.active) {
      return;
    }
    if (
      !currentLoginSession
      || !["pending", "wait", "scanned"].includes(currentLoginSession.status)
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void pollLoginSession(currentLoginSession.sessionKey);
    }, 2_000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [currentLoginSession, pollLoginSession, props.active]);

  useEffect(() => {
    if (currentLoginSession?.status === "confirmed") {
      closeLoginWindow();
    }
  }, [closeLoginWindow, currentLoginSession?.status]);

  useEffect(() => {
    return () => {
      closeLoginWindow();
    };
  }, [closeLoginWindow]);

  const handleSaveConfig = useCallback(async () => {
    try {
      setSavingConfig(true);
      const executionWorkspaceId = resolveWechatExecutionWorkspaceId(stateRef.current, workspaces);
      const nextState = await saveWechatConfig({
        baseUrl: draftConfig.baseUrl.trim() || undefined,
        cdnBaseUrl: draftConfig.cdnBaseUrl.trim() || undefined,
        routeTag: draftConfig.routeTag.trim() || undefined,
        selectedWorkspaceId: executionWorkspaceId,
        defaultExecutionWorkspaceId: executionWorkspaceId,
        allowWorkspaceSwitch: draftConfig.allowWorkspaceSwitch,
        workspaceSwitchScope:
          draftConfig.allowWorkspaceSwitch && (draftConfig.allowedExecutionWorkspaceIds?.length ?? 0) > 0
            ? "restricted"
            : "all",
        allowedExecutionWorkspaceIds: draftConfig.allowWorkspaceSwitch
          ? (draftConfig.allowedExecutionWorkspaceIds?.length
              ? draftConfig.allowedExecutionWorkspaceIds
              : [])
          : [],
        selectedChannelId: draftConfig.selectedChannelId?.trim() || undefined,
        selectedModelId: draftConfig.selectedModelId?.trim() || undefined,
      });
      commitWechatState(nextState);
      message.success("微信配置已保存");
    } catch (error) {
      if (!isAbortLikeError(error)) {
        message.error(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setSavingConfig(false);
    }
  }, [commitWechatState, draftConfig, message, workspaces]);

  const handleStartLogin = useCallback(async () => {
    const loginWindow = reserveAndTrackLoginWindow();

    try {
      setStartingLogin(true);
      setOpeningLoginPage(true);
      const result = await startWechatQrLogin({
        force: Boolean(currentLoginSession),
      });
      setActiveLoginSessionKey(result.sessionKey);
      if (!result.item.qrcodeUrl?.trim()) {
        closeLoginWindow();
        message.warning("二维码地址未返回，请稍后重试");
      } else {
        const opened = await loginWindow.open(result.item.qrcodeUrl);
        if (!opened || loginWindow.blocked) {
          message.warning("扫码页窗口打开失败，请使用“打开扫码页”重试");
        } else {
          message.success(result.message);
        }
      }
      await loadData(true);
    } catch (error) {
      closeLoginWindow();
      if (!isAbortLikeError(error)) {
        message.error(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setStartingLogin(false);
      setOpeningLoginPage(false);
    }
  }, [closeLoginWindow, currentLoginSession, loadData, message, reserveAndTrackLoginWindow]);

  const handleOpenLoginPage = useCallback(async (session: WechatLoginSessionView) => {
    if (!session.qrcodeUrl?.trim()) {
      message.warning("当前扫码页地址不可用");
      return;
    }

    const loginWindow = reserveAndTrackLoginWindow();

    try {
      setOpeningLoginPage(true);
      const opened = await loginWindow.open(session.qrcodeUrl);
      if (!opened || loginWindow.blocked) {
        message.warning("扫码页窗口打开失败，请稍后重试");
      }
    } catch (error) {
      closeLoginWindow();
      if (!isAbortLikeError(error)) {
        message.error(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setOpeningLoginPage(false);
    }
  }, [closeLoginWindow, message, reserveAndTrackLoginWindow]);

  const handleClearAccountConversations = useCallback(async (accountId: string) => {
    try {
      setAccountActionKey(`${accountId}:clear`);
      const nextState = await clearWechatAccountConversations(accountId);
      commitWechatState(nextState, {
        allowEmptyAccounts: true,
      });
      message.success("微信对话已清空");
    } catch (error) {
      if (!isAbortLikeError(error)) {
        message.error(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setAccountActionKey("");
    }
  }, [commitWechatState, message]);

  const handleRemoveAccount = useCallback(async (accountId: string) => {
    try {
      setAccountActionKey(`${accountId}:remove`);
      const nextState = await removeWechatAccount(accountId);
      commitWechatState(nextState, {
        allowEmptyAccounts: true,
      });
      message.success("微信账号已移除");
    } catch (error) {
      if (!isAbortLikeError(error)) {
        message.error(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setAccountActionKey("");
    }
  }, [commitWechatState, message]);

  const accountColumns = useMemo<TableColumnsType<WechatAccountView>>(
    () => [
      {
        title: "账号",
        dataIndex: "accountId",
        key: "accountId",
        width: 260,
        render: (value: string, record) => (
          <div className="wechat-page-primary-cell">
            <div>{value}</div>
            <Text type="secondary">{record.userId || "未返回用户 ID"}</Text>
          </div>
        ),
      },
      {
        title: "状态",
        dataIndex: "connectionStatus",
        key: "connectionStatus",
        width: 120,
        align: "center",
        render: (value: WechatAccountConnectionStatus) => (
          <Tag color={resolveAccountStatusColor(value)}>{value}</Tag>
        ),
      },
      {
        title: "最近入站",
        dataIndex: "lastInboundAt",
        key: "lastInboundAt",
        width: 180,
        align: "center",
        render: (value?: string) => formatDateTime(value),
      },
      {
        title: "最近回发",
        dataIndex: "lastOutboundAt",
        key: "lastOutboundAt",
        width: 180,
        align: "center",
        render: (value?: string) => formatDateTime(value),
      },
      {
        title: "错误",
        dataIndex: "lastError",
        key: "lastError",
        ellipsis: true,
        render: (value?: string) => value || "-",
      },
      {
        title: "操作",
        key: "action",
        width: 168,
        align: "center",
        fixed: "right",
        render: (_value, record) => {
          const clearing = accountActionKey === `${record.accountId}:clear`;
          const removing = accountActionKey === `${record.accountId}:remove`;

          return (
            <div className="wechat-page-record-actions">
              <Popconfirm
                title="清空这个账号下的对话？"
                okText="清空"
                cancelText="取消"
                onConfirm={() => handleClearAccountConversations(record.accountId)}
              >
                <Button
                  type="text"
                  size="small"
                  loading={clearing}
                  disabled={removing}
                >
                  清空消息
                </Button>
              </Popconfirm>

              <Popconfirm
                title="移除这个微信账号？"
                okText="移除"
                cancelText="取消"
                onConfirm={() => handleRemoveAccount(record.accountId)}
              >
                <Button
                  danger
                  type="text"
                  size="small"
                  loading={removing}
                  disabled={clearing}
                >
                  移除
                </Button>
              </Popconfirm>
            </div>
          );
        },
      },
    ],
    [accountActionKey, handleClearAccountConversations, handleRemoveAccount],
  );

  const summaryTag = isInitialStateLoading
    ? <Tag color="processing">读取中</Tag>
    : currentLoginSession
      ? (
          <Tag color={resolveLoginStatusColor(currentLoginSession.status)}>
            {resolveLoginStatusLabel(currentLoginSession.status)}
          </Tag>
        )
      : liveAccountCount > 0
        ? <Tag color="success">已接入</Tag>
        : null;

  const summaryText = isInitialStateLoading
    ? "正在读取微信接入状态"
    : currentLoginSession
      ? `当前状态：${currentLoginSession.message}`
      : liveAccountCount > 0
        ? `当前在线 ${liveAccountCount} 个微信账号`
        : "先生成二维码，再使用微信扫码登录";

  return (
    <div className="wechat-page">
      <div className="wechat-page-surface wechat-page-layout">
        <aside className="wechat-page-sidebar">
          <div className="wechat-page-panel">
            <div className="wechat-page-section-head">
              <div className="wechat-page-section-copy">
                <div className="wechat-page-panel-title">接入配置</div>
                <Text type="secondary">保存配置后即可发起扫码接入。</Text>
              </div>
            </div>

            <div className="wechat-page-form">
              <WechatToolbarField label="Base URL">
                <Input
                  value={draftConfig.baseUrl}
                  placeholder="https://ilinkai.weixin.qq.com"
                  onChange={(event) => {
                    setDraftConfig((current) => ({
                      ...current,
                      baseUrl: event.target.value,
                    }));
                  }}
                />
              </WechatToolbarField>

              <WechatToolbarField label="CDN URL">
                <Input
                  value={draftConfig.cdnBaseUrl}
                  placeholder="https://novac2c.cdn.weixin.qq.com/c2c"
                  onChange={(event) => {
                    setDraftConfig((current) => ({
                      ...current,
                      cdnBaseUrl: event.target.value,
                    }));
                  }}
                />
              </WechatToolbarField>

              <WechatToolbarField label="路由标签">
                <Input
                  value={draftConfig.routeTag}
                  placeholder="可选"
                  onChange={(event) => {
                    setDraftConfig((current) => ({
                      ...current,
                      routeTag: event.target.value,
                    }));
                  }}
                />
              </WechatToolbarField>

              <Divider className="wechat-page-panel-divider" />

              <WechatToolbarField label="允许切换工作区">
                <Switch
                  className="wechat-page-workspace-switch"
                  checked={draftConfig.allowWorkspaceSwitch}
                  onChange={(checked) => {
                    setDraftConfig((current) => ({
                      ...current,
                      allowWorkspaceSwitch: checked,
                    }));
                  }}
                />
              </WechatToolbarField>

              <WechatToolbarField label="切换范围">
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  disabled={!draftConfig.allowWorkspaceSwitch}
                  value={draftConfig.allowedExecutionWorkspaceIds ?? []}
                  placeholder={
                    draftConfig.allowWorkspaceSwitch
                      ? "留空表示全部普通工作区"
                      : "开启工作区切换后可设置"
                  }
                  optionFilterProp="label"
                  options={workspaceOptions}
                  onChange={(value) => {
                    setDraftConfig((current) => ({
                      ...current,
                      allowedExecutionWorkspaceIds: value,
                    }));
                  }}
                />
              </WechatToolbarField>
            </div>

            <Divider className="wechat-page-panel-divider" />

            <div className="wechat-page-sidebar-actions">
              <WechatToolbarField label="模型">
                <RuntimeModelSelect
                  allowClear
                  showSearch
                  selectedChannelId={draftConfig.selectedChannelId}
                  selectedModelId={draftConfig.selectedModelId}
                  placeholder="未选择"
                  notFoundContent="暂无可用模型"
                  onInvalidSelection={() => {
                    setDraftConfig((current) => ({
                      ...current,
                      selectedModelId: undefined,
                    }));
                  }}
                  onChange={(patch) => {
                    setDraftConfig((current) => ({
                      ...current,
                      selectedChannelId: patch.selectedChannelId,
                      selectedModelId: patch.selectedModelId,
                    }));
                  }}
                />
              </WechatToolbarField>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={savingConfig}
                onClick={() => {
                  void handleSaveConfig();
                }}
              >
                保存配置
              </Button>
              <Button
                icon={<ReloadOutlined />}
                loading={loading}
                onClick={() => {
                  void loadData(false);
                }}
              >
                刷新
              </Button>
              {!isInitialStateLoading ? (
                <Button
                  type="primary"
                  ghost
                  icon={<QrcodeOutlined />}
                  loading={startingLogin || pollingLogin}
                  onClick={() => {
                    void handleStartLogin();
                  }}
                >
                  {currentLoginSession ? "重新生成二维码" : "生成二维码"}
                </Button>
              ) : null}
            </div>
          </div>
        </aside>

        <section className="wechat-page-main">
          <div className="wechat-page-panel">
            <div className="wechat-page-section-head">
              <div className="wechat-page-section-copy">
                <div className="wechat-page-panel-title">接入信息</div>
                <Text type="secondary">{summaryText}</Text>
              </div>
              {summaryTag}
            </div>

            <div className="wechat-page-summary-grid">
              <div className="wechat-page-summary-item">
                <span>在线账号</span>
                <strong>{liveAccountCount}</strong>
              </div>
              <div className="wechat-page-summary-item">
                <span>账号记录</span>
                <strong>{totalAccountCount}</strong>
              </div>
              <div className="wechat-page-summary-item">
                <span>扫码状态</span>
                <strong>
                  {currentLoginSession
                    ? resolveLoginStatusLabel(currentLoginSession.status)
                    : "无"}
                </strong>
              </div>
              <div className="wechat-page-summary-item">
                <span>默认工作区</span>
                <strong>主页工作区</strong>
              </div>
              <div className="wechat-page-summary-item">
                <span>工作区切换</span>
                <strong>{resolveWechatWorkspaceSwitchSummary(state?.config ?? {})}</strong>
              </div>
            </div>

            <Divider className="wechat-page-content-divider" />

            <WechatLoginPreview
              loading={isInitialStateLoading}
              session={currentLoginSession}
              formatDateTime={formatDateTime}
              onOpen={(session) => {
                void handleOpenLoginPage(session);
              }}
              openDisabled={openingLoginPage}
              connectedAccountCount={liveAccountCount}
            />
          </div>

          <div className="wechat-page-panel wechat-page-records-panel">
            <div className="wechat-page-section-head">
              <div className="wechat-page-section-copy">
                <div className="wechat-page-panel-title">接入账号记录</div>
                <Text type="secondary">同一个微信号只能保留一个在线连接。</Text>
              </div>
            </div>

            <Divider className="wechat-page-content-divider" />

            <div className="wechat-page-records-shell">
              <Table<WechatAccountView>
                rowKey="accountId"
                size="middle"
                tableLayout="fixed"
                className="wechat-page-records-table"
                columns={accountColumns}
                dataSource={state?.accounts ?? []}
                pagination={false}
                loading={isTableLoading}
                scroll={{
                  x: "max-content",
                }}
                locale={{
                  emptyText: (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="还没有接入微信账号"
                    />
                  ),
                }}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default WechatPage;
