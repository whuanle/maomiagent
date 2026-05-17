import {
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Checkbox,
  DatePicker,
  Descriptions,
  Input,
  Modal,
  Popover,
  Select,
  Space,
  Tag,
  Typography,
  type TableColumnsType,
} from "antd";
import dayjs from "dayjs";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { LanguageCode } from "../../config/titlebar";
import type { Translate } from "../../i18n";
import {
  DESKTOP_LOGS_BRIDGE_READY_EVENT,
  clearRuntimeLogsBefore,
  fetchRuntimeLogs,
  fetchRuntimeLogsSummary,
  hasDesktopLogsBridge,
} from "../../lib/desktop-runtime-logs";
import type {
  RuntimeLogLevel,
  RuntimeLogRecord,
  RuntimeLogsQuery,
} from "../../../shared/runtime-logs";
import { AppTableCard } from "../shared/AppTableCard";
import "./page.css";

type Props = {
  language: LanguageCode;
  t: Translate;
  active: boolean;
};

type AssociationKey = "runId" | "taskId" | "traceId";

type AssociationItem = {
  key: AssociationKey;
  value: string;
};

type ToolbarState = {
  searchText: string;
  selectedModule: string;
  selectedLevels: RuntimeLogLevel[];
  dateRange: {
    from?: Date;
    to?: Date;
  };
};

type RuntimeLogsSummaryState = {
  byLevel: Record<string, number>;
  byModule: Record<string, number>;
};

type ToolbarProps = {
  t: Translate;
  moduleOptions: string[];
  summaryByLevel: Record<string, number>;
  allLevelCount: number;
  searching: boolean;
  onApply: (state: ToolbarState) => void;
  onReset: () => void;
  onDelete: () => void;
};

type DetailModalProps = {
  open: boolean;
  selected: RuntimeLogRecord | null;
  t: Translate;
  onClose: () => void;
};

const { Text } = Typography;
const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
const LEVEL_FILTERS: RuntimeLogLevel[] = ["error", "warn", "info", "debug"];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function createDefaultToolbarState(): ToolbarState {
  return {
    searchText: "",
    selectedModule: "",
    selectedLevels: [],
    dateRange: {},
  };
}

function getLevelTagClassName(level: RuntimeLogLevel) {
  return `logs-level-tag logs-level-tag-${level}`;
}

function getAssociationItems(record: Pick<RuntimeLogRecord, "runId" | "taskId" | "traceId">) {
  const items: AssociationItem[] = [];

  if (record.runId?.trim()) {
    items.push({ key: "runId", value: record.runId.trim() });
  }
  if (record.taskId?.trim()) {
    items.push({ key: "taskId", value: record.taskId.trim() });
  }
  if (record.traceId?.trim()) {
    items.push({ key: "traceId", value: record.traceId.trim() });
  }

  return items;
}

function associationLabel(t: Translate, key: AssociationKey) {
  if (key === "runId") {
    return t("日志页.关联.运行");
  }
  if (key === "taskId") {
    return t("日志页.关联.任务");
  }
  return t("日志页.关联.链路");
}

function formatLogContext(context: Record<string, unknown> | undefined): string | null {
  if (!context || Object.keys(context).length === 0) {
    return null;
  }

  try {
    return JSON.stringify(context, null, 2);
  } catch {
    return String(context);
  }
}

function getDefaultClearBeforeDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return date;
}

const LogsToolbar = memo(function LogsToolbar(props: ToolbarProps) {
  const {
    t,
    moduleOptions,
    summaryByLevel,
    allLevelCount,
    searching,
    onApply,
    onReset,
    onDelete,
  } = props;
  const [toolbarState, setToolbarState] = useState<ToolbarState>(() => createDefaultToolbarState());
  const [levelFilterOpen, setLevelFilterOpen] = useState(false);

  const orderedSelectedLevels = useMemo(
    () => LEVEL_FILTERS.filter((level) => toolbarState.selectedLevels.includes(level)),
    [toolbarState.selectedLevels],
  );

  const levelFilterLabel = useMemo(() => {
    if (orderedSelectedLevels.length === 0) {
      return t("日志页.字段.全部级别");
    }
    if (orderedSelectedLevels.length <= 2) {
      return orderedSelectedLevels.map((level) => level.toUpperCase()).join(" / ");
    }
    return `${orderedSelectedLevels
      .slice(0, 2)
      .map((level) => level.toUpperCase())
      .join(" / ")} +${orderedSelectedLevels.length - 2}`;
  }, [orderedSelectedLevels, t]);

  const updateToolbarState = useCallback((next: Partial<ToolbarState>) => {
    setToolbarState((current) => ({
      ...current,
      ...next,
    }));
  }, []);

  const handleSearch = useCallback(() => {
    onApply({
      ...toolbarState,
      selectedLevels: orderedSelectedLevels,
    });
  }, [onApply, orderedSelectedLevels, toolbarState]);

  const handleReset = useCallback(() => {
    setToolbarState(createDefaultToolbarState());
    setLevelFilterOpen(false);
    onReset();
  }, [onReset]);

  return (
    <div className="logs-page-toolbar">
      <Input
        className="logs-page-search"
        placeholder={t("日志页.字段.搜索占位")}
        value={toolbarState.searchText}
        prefix={<SearchOutlined />}
        onChange={(event) => updateToolbarState({ searchText: event.target.value })}
        onPressEnter={handleSearch}
      />

      <Select
        className="logs-page-select"
        allowClear={true}
        value={toolbarState.selectedModule || "all"}
        onChange={(value) => updateToolbarState({ selectedModule: value === "all" ? "" : value })}
        options={[
          { label: t("日志页.字段.全部模块"), value: "all" },
          ...moduleOptions.map((module) => ({
            label: module,
            value: module,
          })),
        ]}
      />

      <Popover
        trigger="click"
        placement="bottomLeft"
        open={levelFilterOpen}
        onOpenChange={setLevelFilterOpen}
        overlayClassName="logs-page-level-popover"
        content={(
          <Checkbox.Group
            className="logs-page-level-popover-group"
            value={orderedSelectedLevels}
            onChange={(values) => updateToolbarState({ selectedLevels: values as RuntimeLogLevel[] })}
          >
            {LEVEL_FILTERS.map((level) => (
              <Checkbox
                key={level}
                value={level}
                className={`logs-page-level-popover-option logs-page-level-popover-${level}`}
              >
                {level.toUpperCase()}
              </Checkbox>
            ))}
          </Checkbox.Group>
        )}
      >
        <button
          type="button"
          className={`logs-page-level-trigger${levelFilterOpen ? " is-open" : ""}${orderedSelectedLevels.length > 0 ? " is-active" : ""}`}
          aria-label={t("日志页.字段.全部级别")}
        >
          <span className={`logs-page-level-trigger-text${orderedSelectedLevels.length === 0 ? " is-placeholder" : ""}`}>
            {levelFilterLabel}
          </span>
          {orderedSelectedLevels.length > 0 ? (
            <span className="logs-page-level-trigger-count">{orderedSelectedLevels.length}</span>
          ) : null}
        </button>
      </Popover>

      <DatePicker.RangePicker
        className="logs-page-range-picker"
        showTime
        allowClear
        format="MM/DD HH:mm"
        placeholder={[
          t("日志页.字段.时间范围"),
          t("日志页.字段.时间范围"),
        ]}
        value={[
          toolbarState.dateRange.from ? dayjs(toolbarState.dateRange.from) : null,
          toolbarState.dateRange.to ? dayjs(toolbarState.dateRange.to) : null,
        ]}
        onChange={(values) => {
          updateToolbarState({
            dateRange: {
              from: values?.[0]?.toDate(),
              to: values?.[1]?.toDate(),
            },
          });
        }}
      />

      <div className="logs-page-toolbar-filters">
        <div className="logs-level-summary" aria-label={t("日志页.字段.级别")}>
          <div className="logs-level-summary-item logs-level-summary-all">
            <span className="logs-level-summary-label">{t("日志页.级别.全部")}</span>
            <span className="logs-level-summary-count">{allLevelCount}</span>
          </div>
          {LEVEL_FILTERS.map((level) => (
            <div
              key={level}
              className={`logs-level-summary-item logs-level-summary-${level}`}
            >
              <span className="logs-level-summary-label">{level.toUpperCase()}</span>
              <span className="logs-level-summary-count">{summaryByLevel[level] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="logs-page-toolbar-actions">
        <Button type="primary" icon={<SearchOutlined />} loading={searching} onClick={handleSearch}>
          {t("日志页.按钮.查询")}
        </Button>
        <Button icon={<ReloadOutlined />} onClick={handleReset}>
          {t("日志页.按钮.重置")}
        </Button>
        <Button danger icon={<DeleteOutlined />} onClick={onDelete}>
          {t("日志页.按钮.删除")}
        </Button>
      </div>
    </div>
  );
});

const LogDetailModal = memo(function LogDetailModal(props: DetailModalProps) {
  const { open, selected, t, onClose } = props;

  const associations = useMemo(
    () => (selected ? getAssociationItems(selected) : []),
    [selected],
  );
  const contextText = useMemo(
    () => (selected ? formatLogContext(selected.context) : null),
    [selected],
  );

  return (
    <Modal
      open={open}
      footer={null}
      maskClosable={false}
      title={t("日志页.详情.标题")}
      width="min(84vw, 980px)"
      className="logs-page-modal logs-page-detail-modal"
      onCancel={onClose}
    >
      {selected ? (
        <Descriptions bordered column={1} size="middle" className="logs-page-detail-descriptions">
          <Descriptions.Item label={t("日志页.字段.时间")}>
            {formatDateTime(selected.at)}
          </Descriptions.Item>
          <Descriptions.Item label={t("日志页.字段.级别")}>
            {selected.level}
          </Descriptions.Item>
          <Descriptions.Item label={t("日志页.字段.来源")}>
            {selected.source}
          </Descriptions.Item>
          <Descriptions.Item label={t("日志页.字段.模块")}>
            {selected.module}
          </Descriptions.Item>
          <Descriptions.Item label="ID">
            <Text code>{selected.id}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={t("日志页.列.消息")}>
            {selected.message}
          </Descriptions.Item>
          <Descriptions.Item label={t("日志页.列.关联")}>
            {associations.length > 0 ? (
              <Space orientation="vertical" size={8}>
                {associations.map((association) => (
                  <Space
                    key={`detail-${selected.id}-${association.key}-${association.value}`}
                    size={8}
                    wrap
                    align="start"
                  >
                    <Text type="secondary">{associationLabel(t, association.key)}</Text>
                    <Text>{association.value}</Text>
                  </Space>
                ))}
              </Space>
            ) : (
              <Text type="secondary">{t("日志页.详情.无")}</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label={t("日志页.详情.上下文")}>
            {contextText ? (
              <pre className="logs-page-detail-pre">{contextText}</pre>
            ) : (
              <Text type="secondary">{t("日志页.详情.无")}</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label={t("日志页.详情.栈")}>
            {selected.stack ? (
              <pre className="logs-page-detail-pre">{selected.stack}</pre>
            ) : (
              <Text type="secondary">{t("日志页.详情.无")}</Text>
            )}
          </Descriptions.Item>
        </Descriptions>
      ) : null}
    </Modal>
  );
});

export function LogsPage(props: Props) {
  const { message } = AntdApp.useApp();
  const [bridgeReady, setBridgeReady] = useState(() => hasDesktopLogsBridge());
  const [items, setItems] = useState<RuntimeLogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [summary, setSummary] = useState<RuntimeLogsSummaryState>({
    byLevel: {},
    byModule: {},
  });
  const [query, setQuery] = useState<RuntimeLogsQuery>({
    limit: DEFAULT_PAGE_SIZE,
    offset: 0,
  });
  const [selected, setSelected] = useState<RuntimeLogRecord | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearBefore, setClearBefore] = useState<Date | undefined>(undefined);
  const [clearBeforeError, setClearBeforeError] = useState<string | null>(null);
  const [clearBeforeSuccess, setClearBeforeSuccess] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    const syncBridgeState = () => {
      setBridgeReady(hasDesktopLogsBridge());
    };

    syncBridgeState();
    window.addEventListener(DESKTOP_LOGS_BRIDGE_READY_EVENT, syncBridgeState);
    return () => window.removeEventListener(DESKTOP_LOGS_BRIDGE_READY_EVENT, syncBridgeState);
  }, []);

  const summaryQuery = useMemo<RuntimeLogsQuery>(
    () => ({
      q: query.q,
      source: query.source,
      module: query.module,
      from: query.from,
      to: query.to,
      workspaceId: query.workspaceId,
      runId: query.runId,
      taskId: query.taskId,
      traceId: query.traceId,
    }),
    [
      query.from,
      query.module,
      query.q,
      query.runId,
      query.source,
      query.taskId,
      query.to,
      query.traceId,
      query.workspaceId,
    ],
  );

  const moduleOptions = useMemo(
    () =>
      Object.keys(summary.byModule)
        .filter((item) => item.trim().length > 0)
        .sort((left, right) => left.localeCompare(right, "zh-CN", { sensitivity: "base" })),
    [summary.byModule],
  );

  const allLevelCount = useMemo(
    () => Object.values(summary.byLevel).reduce((count, current) => count + current, 0),
    [summary.byLevel],
  );

  const loadList = useCallback(async () => {
    if (!props.active || !bridgeReady) {
      return;
    }

    try {
      setLoading(true);
      const response = await fetchRuntimeLogs(query);
      setItems(response.items);
      setTotal(response.meta.total);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      message.error(`${props.t("日志页.反馈.加载失败")}: ${text}`);
    } finally {
      setLoading(false);
      setSearching(false);
    }
  }, [bridgeReady, message, props.active, props.t, query]);

  const loadSummary = useCallback(async () => {
    if (!props.active || !bridgeReady) {
      return;
    }

    try {
      const response = await fetchRuntimeLogsSummary(summaryQuery);
      setSummary({
        byLevel: response.byLevel,
        byModule: response.byModule,
      });
    } catch (error) {
      console.error(error);
    }
  }, [bridgeReady, props.active, summaryQuery]);

  const reloadData = useCallback(async () => {
    await Promise.all([loadList(), loadSummary()]);
  }, [loadList, loadSummary]);

  useEffect(() => {
    if (!props.active) {
      return;
    }
    void loadList();
  }, [loadList, props.active]);

  useEffect(() => {
    if (!props.active) {
      return;
    }
    void loadSummary();
  }, [loadSummary, props.active]);

  const handleSearch = useCallback((toolbarState: ToolbarState) => {
    setSearching(true);
    setQuery((current) => ({
      q: toolbarState.searchText.trim() || undefined,
      module: toolbarState.selectedModule.trim() || undefined,
      levels: toolbarState.selectedLevels.length > 0 ? toolbarState.selectedLevels : undefined,
      from: toolbarState.dateRange.from?.toISOString(),
      to: toolbarState.dateRange.to?.toISOString(),
      limit: current.limit || DEFAULT_PAGE_SIZE,
      offset: 0,
    }));
  }, []);

  const handleReset = useCallback(() => {
    setQuery((current) => ({
      limit: current.limit || DEFAULT_PAGE_SIZE,
      offset: 0,
    }));
  }, []);

  const handleOpenClearDialog = useCallback(() => {
    setClearBefore(getDefaultClearBeforeDate());
    setClearBeforeError(null);
    setClearBeforeSuccess(null);
    setClearDialogOpen(true);
  }, []);

  const handleClearBefore = useCallback(async () => {
    if (!bridgeReady) {
      return;
    }
    if (!clearBefore) {
      setClearBeforeError(props.t("日志页.弹窗.清理时间必填"));
      setClearBeforeSuccess(null);
      return;
    }

    try {
      setClearing(true);
      setClearBeforeError(null);
      setClearBeforeSuccess(null);

      await clearRuntimeLogsBefore({
        to: clearBefore.toISOString(),
      });
      const successMessage = props.t("日志页.反馈.截止时间清理完成");

      setClearBeforeSuccess(successMessage);
      message.success(successMessage);
      await reloadData();
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      const failMessage = `${props.t("日志页.反馈.清理失败")}: ${text}`;
      setClearBeforeError(failMessage);
      setClearBeforeSuccess(null);
      message.error(failMessage);
    } finally {
      setClearing(false);
    }
  }, [bridgeReady, clearBefore, message, props.t, reloadData]);

  const currentPageSize = query.limit || DEFAULT_PAGE_SIZE;
  const currentPage = Math.floor((query.offset || 0) / currentPageSize) + 1;

  const handlePaginationChange = useCallback((nextPage: number, nextPageSize: number) => {
    const maxPagesForNextSize = Math.max(1, Math.ceil(total / nextPageSize));
    const safePage = Math.min(Math.max(1, nextPage), maxPagesForNextSize);

    setQuery((current) => ({
      ...current,
      limit: nextPageSize,
      offset: (safePage - 1) * nextPageSize,
    }));
  }, [total]);

  const openDetail = useCallback((record: RuntimeLogRecord) => {
    setSelected(record);
    setDetailOpen(true);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
  }, []);

  const columns = useMemo<TableColumnsType<RuntimeLogRecord>>(
    () => [
      {
        title: props.t("日志页.列.时间"),
        dataIndex: "at",
        key: "at",
        width: 180,
        align: "center",
        render: (value: string) => <Text>{formatDateTime(value)}</Text>,
      },
      {
        title: props.t("日志页.列.级别"),
        dataIndex: "level",
        key: "level",
        width: 96,
        align: "center",
        render: (value: RuntimeLogLevel) => (
          <Tag bordered={false} className={`${getLevelTagClassName(value)} logs-level-tag-plain`}>
            {value.toUpperCase()}
          </Tag>
        ),
      },
      {
        title: props.t("日志页.列.来源"),
        dataIndex: "source",
        key: "source",
        width: 120,
        align: "center",
        render: (value: string) => <Tag className="logs-source-tag">{value}</Tag>,
      },
      {
        title: props.t("日志页.列.模块"),
        dataIndex: "module",
        key: "module",
        width: 220,
        align: "center",
        render: (value: string) => <div title={value}>{value}</div>,
      },
      {
        title: props.t("日志页.列.消息"),
        dataIndex: "message",
        key: "message",
        align: "center",
        render: (value: string) => <div title={value}>{value}</div>,
      },
      {
        title: props.t("日志页.列.关联"),
        key: "association",
        width: 360,
        align: "center",
        render: (_value, record) => {
          const associations = getAssociationItems(record);
          if (associations.length === 0) {
            return <Text type="secondary">-</Text>;
          }

          return (
            <Space orientation="vertical" size={2}>
              {associations.map((association) => (
                <div
                  key={`${record.id}-${association.key}-${association.value}`}
                  title={association.value}
                >
                  {association.value}
                </div>
              ))}
            </Space>
          );
        },
      },
      {
        title: props.t("日志页.列.操作"),
        key: "action",
        width: 96,
        align: "center",
        render: (_value, record) => (
          <Button
            type="link"
            size="small"
            className="logs-action-link"
            onClick={() => openDetail(record)}
          >
            {props.t("日志页.操作.详情")}
          </Button>
        ),
      },
    ],
    [openDetail, props.t],
  );

  const clearDialogMessage =
    clearBeforeError
    ?? clearBeforeSuccess
    ?? props.t("日志页.弹窗.清理时间说明");

  return (
    <div className="logs-page">
      <div className="logs-page-surface">
        <div className="logs-page-toolbar-shell">
          <LogsToolbar
            t={props.t}
            moduleOptions={moduleOptions}
            summaryByLevel={summary.byLevel}
            allLevelCount={allLevelCount}
            searching={searching}
            onApply={handleSearch}
            onReset={handleReset}
            onDelete={handleOpenClearDialog}
          />
        </div>

        <div className="logs-page-table-shell">
          {bridgeReady ? (
            <AppTableCard
              className="logs-page-table-card"
              rowKey="id"
              columns={columns}
              items={items}
              loading={loading}
              loadingText={props.t("日志页.提示.加载中")}
              emptyDescription={props.t("日志页.提示.无日志")}
              scrollX={1400}
              pagination={{
                total,
                currentPage,
                currentPageSize,
                pageSizeOptions: PAGE_SIZE_OPTIONS,
                pageSizeLabel: (size) => props.t("日志页.分页.每页", { 数量: size }),
                totalLabel: props.t("日志页.分页.总条数", { 总数: total }),
                onChange: handlePaginationChange,
              }}
              tableProps={{
                className: "logs-page-table",
              }}
            />
          ) : (
            <div className="logs-page-empty-state">
              <Text type="secondary">
                {props.t("日志页.提示.桌面桥接不可用")}
              </Text>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={clearDialogOpen}
        maskClosable={false}
        width={540}
        title={props.t("日志页.弹窗.清理标题")}
        className="logs-page-modal logs-page-clear-modal"
        okText={clearing ? props.t("日志页.按钮.清理中") : props.t("日志页.按钮.确认清理")}
        cancelText={props.t("日志页.按钮.取消")}
        okButtonProps={{ danger: true, disabled: !clearBefore || clearing, loading: clearing }}
        cancelButtonProps={{ disabled: clearing }}
        onCancel={() => {
          if (clearing) {
            return;
          }
          setClearDialogOpen(false);
          setClearBeforeError(null);
          setClearBeforeSuccess(null);
        }}
        onOk={() => void handleClearBefore()}
      >
        <Space orientation="vertical" size={16} className="logs-page-clear-dialog">
          <Text type="secondary">
            {props.t("日志页.弹窗.清理说明")}
          </Text>
          <div className="logs-page-clear-field">
            <label className="logs-page-clear-label">
              {props.t("日志页.字段.清理截止时间")}
            </label>
            <DatePicker
              showTime
              allowClear={false}
              className="logs-page-clear-picker"
              value={clearBefore ? dayjs(clearBefore) : null}
              format="YYYY-MM-DD HH:mm"
              onChange={(value) => {
                setClearBeforeError(null);
                setClearBeforeSuccess(null);
                setClearBefore(value?.toDate());
              }}
            />
          </div>
          <Text type={clearBeforeError ? "danger" : clearBeforeSuccess ? undefined : "secondary"}>
            {clearDialogMessage}
          </Text>
        </Space>
      </Modal>

      <LogDetailModal
        open={detailOpen}
        selected={selected}
        t={props.t}
        onClose={closeDetail}
      />
    </div>
  );
}

export default LogsPage;