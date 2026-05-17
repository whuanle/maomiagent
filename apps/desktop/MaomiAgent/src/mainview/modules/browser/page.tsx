import {
  CopyOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Empty,
  Input,
  Select,
  Space,
  type TableColumnsType,
} from "antd";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { LanguageCode } from "../../config/titlebar";
import { AppTableCard } from "../../components/shared/AppTableCard";
import { fetchActiveWorkspace } from "../../lib/workspace";
import "./page.css";

type Props = {
  language: LanguageCode;
  active: boolean;
};

type BrowserSessionRole = "primary" | "task";
type BrowserSessionStatus = "open" | "closed";

type BrowserSessionItem = {
  workspaceId: string;
  surfaceId: string;
  title: string;
  address: string;
  role: BrowserSessionRole;
  status: BrowserSessionStatus;
  createdAt: string;
  updatedAt: string;
};

type BrowserCopy = {
  searchPlaceholder: string;
  addressPlaceholder: string;
  defaultWindowTitle: string;
  openPrimary: string;
  openTask: string;
  refresh: string;
  roleAll: string;
  rolePrimary: string;
  roleTask: string;
  stateAll: string;
  stateOpen: string;
  stateClosed: string;
  columnSession: string;
  columnAddress: string;
  columnRole: string;
  columnState: string;
  columnUpdatedAt: string;
  columnActions: string;
  actionOpen: string;
  actionCopy: string;
  actionClose: string;
  emptyNoWorkspace: string;
  emptyNoSessions: string;
  loadFailed: string;
  openFailed: string;
  copyDone: string;
};

const STORAGE_KEY = "maomi.desktop.aiBrowser.sessions";

function createCopy(language: LanguageCode): BrowserCopy {
  if (language === "en-US") {
    return {
      searchPlaceholder: "Search by title / address / session id",
      addressPlaceholder: "Start address (e.g. https://example.com)",
      defaultWindowTitle: "AI Browser",
      openPrimary: "Open Main Window",
      openTask: "Open Task Window",
      refresh: "Refresh",
      roleAll: "All Roles",
      rolePrimary: "Primary",
      roleTask: "Task",
      stateAll: "All States",
      stateOpen: "Open",
      stateClosed: "Closed",
      columnSession: "Session",
      columnAddress: "Address",
      columnRole: "Role",
      columnState: "State",
      columnUpdatedAt: "Updated",
      columnActions: "Actions",
      actionOpen: "Open",
      actionCopy: "Copy",
      actionClose: "Close",
      emptyNoWorkspace: "No active workspace",
      emptyNoSessions: "No browser sessions",
      loadFailed: "Failed to load browser sessions",
      openFailed: "Failed to open browser window",
      copyDone: "Address copied",
    };
  }

  return {
    searchPlaceholder: "按标题 / 地址 / 会话 ID 搜索",
    addressPlaceholder: "启动地址（例如 https://example.com）",
    defaultWindowTitle: "AI 浏览器",
    openPrimary: "打开主窗口",
    openTask: "打开任务窗口",
    refresh: "刷新",
    roleAll: "全部角色",
    rolePrimary: "主会话",
    roleTask: "任务会话",
    stateAll: "全部状态",
    stateOpen: "打开",
    stateClosed: "关闭",
    columnSession: "会话",
    columnAddress: "地址",
    columnRole: "角色",
    columnState: "状态",
    columnUpdatedAt: "更新时间",
    columnActions: "操作",
    actionOpen: "打开",
    actionCopy: "复制",
    actionClose: "关闭",
    emptyNoWorkspace: "当前无活动工作区",
    emptyNoSessions: "暂无浏览器会话",
    loadFailed: "加载浏览器会话失败",
    openFailed: "打开浏览器窗口失败",
    copyDone: "已复制地址",
  };
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeAddress(input: string): string {
  const value = input.trim();
  if (!value) {
    return "";
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

function createSurfaceId() {
  return `surface-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function parseSessions(raw: string | null): BrowserSessionItem[] {
  if (!raw) {
    return [];
  }

  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is BrowserSessionItem => {
        if (!item || typeof item !== "object") {
          return false;
        }

        const candidate = item as Partial<BrowserSessionItem>;
        return typeof candidate.workspaceId === "string"
          && typeof candidate.surfaceId === "string"
          && typeof candidate.title === "string"
          && typeof candidate.address === "string"
          && (candidate.role === "primary" || candidate.role === "task")
          && (candidate.status === "open" || candidate.status === "closed")
          && typeof candidate.createdAt === "string"
          && typeof candidate.updatedAt === "string";
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

function readAllSessions(): BrowserSessionItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  return parseSessions(window.localStorage.getItem(STORAGE_KEY));
}

function writeAllSessions(items: BrowserSessionItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function listWorkspaceSessions(workspaceId: string): BrowserSessionItem[] {
  return readAllSessions().filter((item) => item.workspaceId === workspaceId);
}

function upsertSession(next: BrowserSessionItem): BrowserSessionItem[] {
  const current = readAllSessions();
  const index = current.findIndex((item) => item.surfaceId === next.surfaceId);
  if (index >= 0) {
    current[index] = next;
  } else {
    current.push(next);
  }
  const sorted = current.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  writeAllSessions(sorted);
  return sorted;
}

function openAddress(address: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.open(address, "_blank", "noopener,noreferrer");
}

function formatTime(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) {
    return iso;
  }
  return value.toLocaleString();
}

function matchesQuery(item: BrowserSessionItem, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return item.title.toLowerCase().includes(normalized)
    || item.surfaceId.toLowerCase().includes(normalized)
    || item.address.toLowerCase().includes(normalized);
}

export function BrowserPage(props: Props) {
  const { message } = AntdApp.useApp();
  const copy = useMemo(() => createCopy(props.language), [props.language]);

  const [workspaceId, setWorkspaceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sessions, setSessions] = useState<BrowserSessionItem[]>([]);
  const [searchText, setSearchText] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | BrowserSessionRole>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | BrowserSessionStatus>("open");
  const [openingPrimary, setOpeningPrimary] = useState(false);
  const [openingTask, setOpeningTask] = useState(false);
  const deferredSearchText = useDeferredValue(searchText);

  const loadData = useCallback(async (silent = false) => {
    if (!props.active) {
      return;
    }

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const activeWorkspace = await fetchActiveWorkspace("desktop://browser");
      const nextWorkspaceId = activeWorkspace.active?.workspaceId?.trim() ?? "";
      setWorkspaceId(nextWorkspaceId);
      setSessions(nextWorkspaceId ? listWorkspaceSessions(nextWorkspaceId) : []);
    } catch (error) {
      message.error(`${copy.loadFailed}: ${normalizeError(error)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [copy.loadFailed, message, props.active]);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  const refresh = useCallback(async () => {
    await loadData(true);
  }, [loadData]);

  const createAndOpenSession = useCallback(async (role: BrowserSessionRole) => {
    if (!workspaceId) {
      return;
    }

    const normalizedAddress = normalizeAddress(addressInput);
    if (!normalizedAddress) {
      return;
    }

    const now = new Date().toISOString();
    const next: BrowserSessionItem = {
      workspaceId,
      surfaceId: createSurfaceId(),
      title: copy.defaultWindowTitle,
      address: normalizedAddress,
      role,
      status: "open",
      createdAt: now,
      updatedAt: now,
    };

    try {
      if (role === "primary") {
        setOpeningPrimary(true);
      } else {
        setOpeningTask(true);
      }

      upsertSession(next);
      setSessions(listWorkspaceSessions(workspaceId));
      openAddress(normalizedAddress);
    } catch (error) {
      message.error(`${copy.openFailed}: ${normalizeError(error)}`);
    } finally {
      setOpeningPrimary(false);
      setOpeningTask(false);
    }
  }, [addressInput, copy.defaultWindowTitle, copy.openFailed, message, workspaceId]);

  const handleOpenSession = useCallback((item: BrowserSessionItem) => {
    try {
      openAddress(item.address);
    } catch (error) {
      message.error(`${copy.openFailed}: ${normalizeError(error)}`);
    }
  }, [copy.openFailed, message]);

  const handleCopySession = useCallback(async (item: BrowserSessionItem) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(item.address).catch(() => undefined);
    message.success(copy.copyDone);
  }, [copy.copyDone, message]);

  const handleCloseSession = useCallback((item: BrowserSessionItem) => {
    const now = new Date().toISOString();
    upsertSession({
      ...item,
      status: "closed",
      updatedAt: now,
    });
    setSessions(listWorkspaceSessions(item.workspaceId));
  }, []);

  const filteredSessions = useMemo(() => {
    return sessions.filter((item) => {
      return (roleFilter === "all" ? true : item.role === roleFilter)
        && (statusFilter === "all" ? true : item.status === statusFilter)
        && matchesQuery(item, deferredSearchText);
    });
  }, [deferredSearchText, roleFilter, sessions, statusFilter]);

  const columns = useMemo<TableColumnsType<BrowserSessionItem>>(() => {
    return [
      {
        title: copy.columnSession,
        key: "session",
        width: 280,
        render: (_, item) => (
          <div className="browser-page-row-title">
            <span className="browser-page-row-title-main">{item.title || copy.defaultWindowTitle}</span>
            <span className="browser-page-row-title-sub">{item.surfaceId}</span>
          </div>
        ),
      },
      {
        title: copy.columnAddress,
        dataIndex: "address",
        key: "address",
        width: 360,
        render: (value: string) => (
          <span className="browser-page-row-address" title={value}>{value}</span>
        ),
      },
      {
        title: copy.columnRole,
        key: "role",
        width: 120,
        render: (_, item) => (
          <span className={item.role === "primary" ? "browser-page-tag-primary" : "browser-page-tag-task"}>
            {item.role === "primary" ? copy.rolePrimary : copy.roleTask}
          </span>
        ),
      },
      {
        title: copy.columnState,
        key: "status",
        width: 120,
        render: (_, item) => (
          <span className={item.status === "open" ? "browser-page-tag-open" : "browser-page-tag-closed"}>
            {item.status === "open" ? copy.stateOpen : copy.stateClosed}
          </span>
        ),
      },
      {
        title: copy.columnUpdatedAt,
        dataIndex: "updatedAt",
        key: "updatedAt",
        width: 180,
        render: (value: string) => formatTime(value),
      },
      {
        title: copy.columnActions,
        key: "actions",
        width: 200,
        render: (_, item) => (
          <Space size={4}>
            <Button
              size="small"
              icon={<LinkOutlined />}
              onClick={() => handleOpenSession(item)}
            >
              {copy.actionOpen}
            </Button>
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() => {
                void handleCopySession(item);
              }}
            >
              {copy.actionCopy}
            </Button>
            <Button
              size="small"
              icon={<StopOutlined />}
              disabled={item.status === "closed"}
              onClick={() => handleCloseSession(item)}
            >
              {copy.actionClose}
            </Button>
          </Space>
        ),
      },
    ];
  }, [copy, handleCloseSession, handleCopySession, handleOpenSession]);

  const toolbar = (
    <div className="browser-page-toolbar">
      <Input
        allowClear
        value={searchText}
        className="browser-page-toolbar-search"
        prefix={<SearchOutlined />}
        placeholder={copy.searchPlaceholder}
        onChange={(event) => setSearchText(event.target.value)}
      />
      <Select
        value={roleFilter}
        className="browser-page-toolbar-filter"
        options={[
          { label: copy.roleAll, value: "all" },
          { label: copy.rolePrimary, value: "primary" },
          { label: copy.roleTask, value: "task" },
        ]}
        onChange={(value) => setRoleFilter(value)}
      />
      <Select
        value={statusFilter}
        className="browser-page-toolbar-filter"
        options={[
          { label: copy.stateAll, value: "all" },
          { label: copy.stateOpen, value: "open" },
          { label: copy.stateClosed, value: "closed" },
        ]}
        onChange={(value) => setStatusFilter(value)}
      />
      <Input
        allowClear
        value={addressInput}
        className="browser-page-toolbar-address"
        placeholder={copy.addressPlaceholder}
        onChange={(event) => setAddressInput(event.target.value)}
        onPressEnter={() => {
          void createAndOpenSession("primary");
        }}
      />
      <Button
        icon={<ReloadOutlined />}
        loading={refreshing}
        onClick={() => {
          void refresh();
        }}
      >
        {copy.refresh}
      </Button>
      <Button
        icon={<PlusOutlined />}
        loading={openingTask}
        disabled={!workspaceId}
        onClick={() => {
          void createAndOpenSession("task");
        }}
      >
        {copy.openTask}
      </Button>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        loading={openingPrimary}
        disabled={!workspaceId}
        onClick={() => {
          void createAndOpenSession("primary");
        }}
      >
        {copy.openPrimary}
      </Button>
    </div>
  );

  if (!workspaceId && !loading) {
    return (
      <section className="browser-page">
        <div className="browser-page-surface browser-page-status-wrap">
          <Empty description={copy.emptyNoWorkspace} />
        </div>
      </section>
    );
  }

  return (
    <section className="browser-page">
      <div className="browser-page-surface">
        <div className="browser-page-list">
          <AppTableCard
            className="browser-page-table-card"
            rowKey="surfaceId"
            columns={columns}
            items={filteredSessions}
            loading={loading}
            loadingText={copy.refresh}
            emptyDescription={copy.emptyNoSessions}
            toolbar={toolbar}
            scrollX={1180}
            tableProps={{
              className: "browser-page-table",
            }}
          />
        </div>
      </div>
    </section>
  );
}
