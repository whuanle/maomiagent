import {
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Empty,
  Input,
  Select,
  Tabs,
  Typography,
  type TableProps,
} from "antd";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { DesktopTaskCenterItem } from "../../../shared/desktop-task-center";
import type { LanguageCode } from "../../config/titlebar";
import { AppTableCard } from "../../components/shared/AppTableCard";
import {
  cancelDesktopTask,
  DESKTOP_TASKS_BRIDGE_READY_EVENT,
  DESKTOP_TASKS_INVALIDATED_EVENT,
  getDesktopTaskDetail,
  hasDesktopTasksBridge,
  listDesktopTaskCenter,
  listDesktopTaskWorkspaces,
  pauseDesktopTaskSchedule,
  resumeDesktopTaskSchedule,
  retryDesktopTask,
  runDesktopTaskNow,
} from "../../lib/desktop-tasks";
import { buildConversationSessionTableColumns } from "./components/conversation-session-table-columns";
import { TaskDetailModal } from "./components/task-detail-modal";
import { buildTaskTableColumns } from "./components/task-table-columns";
import {
  buildTaskActionKey,
  buildTaskRowKey,
  normalizeError,
  type TaskActionName,
  type TaskScopeFilter,
  type TaskScheduleFilter,
} from "./helpers";
import {
  buildTaskCenterConversationSessionRows,
  canRunTaskCenterNow,
  compareTaskCenterDisplayOrder,
  hasTaskCenterSchedule,
  isTaskCenterScheduleEnabled,
  isTaskCenterSchedulePaused,
  matchesTaskCenterAttentionFilter,
  matchesTaskCenterConversationStatusFilter,
  matchesTaskCenterScheduleFilter,
  matchesTaskCenterScopeFilter,
  resolveTaskCenterPageTab,
  shouldDisplayTaskCenterOperationalItem,
  type TaskCenterConversationSessionRow,
  type TaskCenterAttentionFilter,
  type TaskCenterConversationStatusFilter,
  type TaskCenterPageTab,
} from "./task-center-helpers";
import { createTasksTranslator } from "./i18n";
import "./page.css";

const { Text } = Typography;

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const TASK_FETCH_LIMIT = 1000;

type Props = {
  language: LanguageCode;
  active: boolean;
};

type WorkspaceOption = {
  label: string;
  value: string;
};

function shouldIgnoreRowOpen(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      "button, a, input, textarea, select, label, .ant-checkbox-wrapper, .ant-checkbox, .ant-table-selection-column, .ant-btn, .ant-switch",
    ),
  );
}

export function TasksPage(props: Props) {
  const { message } = AntdApp.useApp();
  const t = useMemo(() => createTasksTranslator(props.language), [props.language]);
  const [bridgeReady, setBridgeReady] = useState(() => hasDesktopTasksBridge());
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOption[]>([]);
  const [activeTab, setActiveTab] = useState<TaskCenterPageTab>("conversation");
  const [workspaceFilter, setWorkspaceFilter] = useState<string | undefined>(undefined);
  const [conversationStatusFilter, setConversationStatusFilter] = useState<TaskCenterConversationStatusFilter>("active");
  const [attentionFilter, setAttentionFilter] = useState<TaskCenterAttentionFilter>("all");
  const [scopeFilter, setScopeFilter] = useState<TaskScopeFilter>("all");
  const [scheduleFilter, setScheduleFilter] = useState<TaskScheduleFilter>("active");
  const [searchText, setSearchText] = useState("");
  const deferredSearchText = useDeferredValue(searchText);
  const [items, setItems] = useState<DesktopTaskCenterItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPageSize, setCurrentPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
  const [batchActionLoading, setBatchActionLoading] = useState<TaskActionName | null>(null);
  const [selectedTaskKeys, setSelectedTaskKeys] = useState<string[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailTask, setDetailTask] = useState<DesktopTaskCenterItem | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getDesktopTaskDetail>> | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const syncBridgeState = () => {
      setBridgeReady(hasDesktopTasksBridge());
    };

    syncBridgeState();
    window.addEventListener(DESKTOP_TASKS_BRIDGE_READY_EVENT, syncBridgeState);
    return () => window.removeEventListener(DESKTOP_TASKS_BRIDGE_READY_EVENT, syncBridgeState);
  }, []);

  const loadWorkspaceOptions = useCallback(async () => {
    if (!props.active || !bridgeReady) {
      return;
    }

    try {
      const response = await listDesktopTaskWorkspaces();
      const options = response.items.map((item) => ({
        label: item.name ? `${item.name} (${item.workspaceId})` : item.workspaceId,
        value: item.workspaceId,
      }));
      setWorkspaceOptions(options);
      setWorkspaceFilter((current) => {
        if (current && options.some((item) => item.value === current)) {
          return current;
        }
        return undefined;
      });
    } catch (error) {
      message.error(`${t("任务页.反馈.加载失败")}: ${normalizeError(error)}`);
    }
  }, [bridgeReady, message, props.active, t]);

  const loadTasks = useCallback(async (silent = false) => {
    if (!props.active || !bridgeReady) {
      return;
    }

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await listDesktopTaskCenter({
        workspaceId: workspaceFilter,
        q: deferredSearchText.trim() || undefined,
        limit: TASK_FETCH_LIMIT,
        offset: 0,
      });

      setItems(response.items);
    } catch (error) {
      message.error(`${t("任务页.反馈.加载失败")}: ${normalizeError(error)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    bridgeReady,
    deferredSearchText,
    message,
    props.active,
    t,
    workspaceFilter,
  ]);

  const loadDetail = useCallback(async (
    task: Pick<DesktopTaskCenterItem, "workspaceId" | "taskId"> | null,
    silent = false,
  ) => {
    if (!bridgeReady || !task) {
      setDetail(null);
      setDetailError(null);
      return;
    }

    if (!silent) {
      setDetailLoading(true);
    }
    setDetailError(null);

    try {
      setDetail(await getDesktopTaskDetail({
        workspaceId: task.workspaceId,
        taskId: task.taskId,
        runLimit: 20,
        runOffset: 0,
      }));
    } catch (error) {
      setDetailError(`${t("任务页.反馈.加载详情失败")}: ${normalizeError(error)}`);
    } finally {
      if (!silent) {
        setDetailLoading(false);
      }
    }
  }, [bridgeReady, t]);

  useEffect(() => {
    if (!props.active) {
      return;
    }
    void loadWorkspaceOptions();
  }, [loadWorkspaceOptions, props.active]);

  useEffect(() => {
    if (!props.active) {
      return;
    }
    void loadTasks(false);
  }, [loadTasks, props.active]);

  useEffect(() => {
    if (!props.active || !bridgeReady) {
      return undefined;
    }

    const handleInvalidated = () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = window.setTimeout(() => {
        void loadTasks(true);
        void loadWorkspaceOptions();
        if (detailTask) {
          void loadDetail(detailTask, true);
        }
      }, 140);
    };

    window.addEventListener(DESKTOP_TASKS_INVALIDATED_EVENT, handleInvalidated as EventListener);
    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      window.removeEventListener(DESKTOP_TASKS_INVALIDATED_EVENT, handleInvalidated as EventListener);
    };
  }, [bridgeReady, detailTask, loadDetail, loadTasks, loadWorkspaceOptions, props.active]);

  useEffect(() => {
    setSelectedTaskKeys((current) =>
      current.filter((key) => {
        return items.some((item) => buildTaskRowKey(item) === key);
      }),
    );
  }, [items]);

  const conversationRows = useMemo(
    () => buildTaskCenterConversationSessionRows(items),
    [items],
  );

  const operationalItems = useMemo(() => {
    return items
      .filter((item) => shouldDisplayTaskCenterOperationalItem(item))
      .sort(compareTaskCenterDisplayOrder);
  }, [items]);

  const filteredConversationRows = useMemo(() => {
    return conversationRows.filter((row) => matchesTaskCenterConversationStatusFilter(row, conversationStatusFilter));
  }, [conversationRows, conversationStatusFilter]);

  const automationItems = useMemo(() => {
    return operationalItems.filter((item) => {
      return resolveTaskCenterPageTab(item) === "automation"
        && matchesTaskCenterScheduleFilter(item, scheduleFilter);
    });
  }, [operationalItems, scheduleFilter]);

  const executionItems = useMemo(() => {
    return operationalItems.filter((item) => {
      return resolveTaskCenterPageTab(item) === "execution"
        && matchesTaskCenterScopeFilter(item, scopeFilter)
        && matchesTaskCenterAttentionFilter(item, attentionFilter);
    });
  }, [attentionFilter, operationalItems, scopeFilter]);

  const visibleTaskItems = useMemo(() => {
    return activeTab === "automation" ? automationItems : executionItems;
  }, [activeTab, automationItems, executionItems]);

  const currentTotal = activeTab === "conversation"
    ? filteredConversationRows.length
    : visibleTaskItems.length;

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(currentTotal / currentPageSize)),
    [currentPageSize, currentTotal],
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pagedConversationRows = useMemo(() => {
    const start = (currentPage - 1) * currentPageSize;
    return filteredConversationRows.slice(start, start + currentPageSize);
  }, [currentPage, currentPageSize, filteredConversationRows]);

  const pagedTaskItems = useMemo(() => {
    const start = (currentPage - 1) * currentPageSize;
    return visibleTaskItems.slice(start, start + currentPageSize);
  }, [currentPage, currentPageSize, visibleTaskItems]);

  const selectableTaskItems = activeTab === "conversation" ? [] : visibleTaskItems;

  const selectedTasks = useMemo(
    () => selectableTaskItems.filter((item) => selectedTaskKeys.includes(buildTaskRowKey(item))),
    [selectableTaskItems, selectedTaskKeys],
  );

  const pauseScheduleCandidates = useMemo(
    () => selectedTasks.filter((item) => hasTaskCenterSchedule(item) && isTaskCenterScheduleEnabled(item)),
    [selectedTasks],
  );

  const runNowCandidates = useMemo(
    () => selectedTasks.filter((item) => canRunTaskCenterNow(item)),
    [selectedTasks],
  );

  const resumeScheduleCandidates = useMemo(
    () => selectedTasks.filter((item) => isTaskCenterSchedulePaused(item)),
    [selectedTasks],
  );

  const handleOpenDetail = useCallback((task: DesktopTaskCenterItem) => {
    setDetailTask(task);
    setDetailOpen(true);
    void loadDetail(task);
  }, [loadDetail]);

  const handleTaskAction = useCallback(async (
    task: Pick<DesktopTaskCenterItem, "workspaceId" | "taskId">,
    action: TaskActionName,
  ) => {
    const loadingKey = buildTaskActionKey(task, action);
    setActionLoadingKey(loadingKey);

    try {
      if (action === "runNow") {
        await runDesktopTaskNow(task.workspaceId, task.taskId);
      } else if (action === "cancel") {
        await cancelDesktopTask(task.workspaceId, task.taskId);
      } else if (action === "retry") {
        await retryDesktopTask(task.workspaceId, task.taskId);
      } else if (action === "pauseSchedule") {
        await pauseDesktopTaskSchedule(task.workspaceId, task.taskId);
      } else {
        await resumeDesktopTaskSchedule(task.workspaceId, task.taskId);
      }

      await loadTasks(true);
      if (detailTask && buildTaskRowKey(detailTask) === buildTaskRowKey(task)) {
        await loadDetail(task, true);
      }
    } catch (error) {
      message.error(`${t("任务页.反馈.操作失败")}: ${normalizeError(error)}`);
      await loadTasks(true);
      if (detailTask && buildTaskRowKey(detailTask) === buildTaskRowKey(task)) {
        await loadDetail(task, true);
      }
    } finally {
      setActionLoadingKey(null);
    }
  }, [detailTask, loadDetail, loadTasks, message, t]);

  const handleBatchAction = useCallback(async (
    action: "runNow" | "pauseSchedule" | "resumeSchedule",
  ) => {
    const targets = action === "runNow"
      ? runNowCandidates
      : action === "pauseSchedule"
        ? pauseScheduleCandidates
        : resumeScheduleCandidates;

    if (targets.length === 0) {
      return;
    }

    setBatchActionLoading(action);

    try {
      await Promise.all(targets.map(async (task) => {
        if (action === "runNow") {
          await runDesktopTaskNow(task.workspaceId, task.taskId);
          return;
        }
        if (action === "pauseSchedule") {
          await pauseDesktopTaskSchedule(task.workspaceId, task.taskId);
          return;
        }
        await resumeDesktopTaskSchedule(task.workspaceId, task.taskId);
      }));

      if (action === "runNow") {
        message.success(t("任务页.反馈.批量立即执行成功", { 数量: String(targets.length) }));
      } else if (action === "pauseSchedule") {
        message.success(t("任务页.反馈.批量暂停调度成功", { 数量: String(targets.length) }));
      } else {
        message.success(t("任务页.反馈.批量恢复调度成功", { 数量: String(targets.length) }));
      }

      await loadWorkspaceOptions();
      await loadTasks(true);

      if (detailTask && targets.some((item) => buildTaskRowKey(item) === buildTaskRowKey(detailTask))) {
        await loadDetail(detailTask, true);
      }
    } catch (error) {
      message.error(`${t("任务页.反馈.批量操作失败")}: ${normalizeError(error)}`);
      await loadWorkspaceOptions();
      await loadTasks(true);
      if (detailTask) {
        await loadDetail(detailTask, true);
      }
    } finally {
      setBatchActionLoading(null);
    }
  }, [
    detailTask,
    loadDetail,
    loadTasks,
    loadWorkspaceOptions,
    message,
    pauseScheduleCandidates,
    runNowCandidates,
    resumeScheduleCandidates,
    t,
  ]);

  const columns = useMemo(() => buildTaskTableColumns({
    actionLoadingKey,
    t,
    onOpenDetail: handleOpenDetail,
    onTaskAction: (task, action) => {
      void handleTaskAction(task, action);
    },
  }), [actionLoadingKey, handleOpenDetail, handleTaskAction, t]);

  const conversationColumns = useMemo(() => buildConversationSessionTableColumns({
    t,
    onOpenDetail: (row) => {
      handleOpenDetail(row.representativeTask);
    },
  }), [handleOpenDetail, t]);

  const rowSelection: TableProps<DesktopTaskCenterItem>["rowSelection"] = useMemo(() => ({
    columnWidth: 40,
    type: "checkbox",
    selectedRowKeys: selectedTaskKeys,
    preserveSelectedRowKeys: false,
    onChange: (keys) => {
      setSelectedTaskKeys(keys as string[]);
    },
  }), [selectedTaskKeys]);

  const tabItems = useMemo(() => {
    return [
      {
        key: "conversation",
        label: `${t("任务页.标签.会话任务")} ${filteredConversationRows.length}`,
      },
      {
        key: "automation",
        label: `${t("任务页.标签.定时任务")} ${automationItems.length}`,
      },
      {
        key: "execution",
        label: `${t("任务页.标签.执行任务")} ${executionItems.length}`,
      },
    ];
  }, [automationItems.length, executionItems.length, filteredConversationRows.length, t]);

  if (!bridgeReady) {
    return (
      <section className="tasks-page">
        <div className="tasks-page-surface">
          <div className="tasks-page-empty-state">
            <Empty description={t("任务页.提示.桥接未就绪")} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="tasks-page">
      <div className="tasks-page-surface">
        <div className="tasks-page-list">
          <div className="tasks-page-tabs-shell">
            <Tabs
              className="tasks-page-tabs"
              activeKey={activeTab}
              items={tabItems}
              onChange={(value) => {
                setActiveTab(value as TaskCenterPageTab);
                setSelectedTaskKeys([]);
                setCurrentPage(1);
              }}
            />
          </div>

          <div className="tasks-page-toolbar-shell">
            <div className="tasks-page-toolbar">
              <Input
                allowClear
                className="tasks-page-search"
                prefix={<SearchOutlined />}
                placeholder={t("任务页.输入.搜索占位")}
                value={searchText}
                onChange={(event) => {
                  setSearchText(event.target.value);
                  setCurrentPage(1);
                }}
              />

              <Select
                allowClear
                className="tasks-page-workspace-select"
                value={workspaceFilter}
                placeholder={t("任务页.筛选.工作区.全部")}
                options={workspaceOptions}
                onChange={(value) => {
                  setWorkspaceFilter(value);
                  setCurrentPage(1);
                }}
              />

              {activeTab === "conversation" ? (
                <Select
                  className="tasks-page-status-select"
                  value={conversationStatusFilter}
                  options={[
                    { label: t("任务页.筛选.状态.进行中"), value: "active" satisfies TaskCenterConversationStatusFilter },
                    { label: t("任务页.筛选.状态.失败"), value: "failed" satisfies TaskCenterConversationStatusFilter },
                    { label: t("任务页.筛选.状态.待处理"), value: "attention" satisfies TaskCenterConversationStatusFilter },
                    { label: t("任务页.筛选.状态.全部"), value: "all" satisfies TaskCenterConversationStatusFilter },
                  ]}
                  onChange={(value) => {
                    setConversationStatusFilter(value);
                    setCurrentPage(1);
                  }}
                />
              ) : null}

              {activeTab === "execution" ? (
                <>
                  <Select
                    className="tasks-page-scope-select"
                    value={scopeFilter}
                    options={[
                      { label: t("任务页.筛选.范围.根任务"), value: "root" satisfies TaskScopeFilter },
                      { label: t("任务页.筛选.范围.全部"), value: "all" satisfies TaskScopeFilter },
                    ]}
                    onChange={(value) => {
                      setScopeFilter(value);
                      setCurrentPage(1);
                    }}
                  />

                  <Select
                    className="tasks-page-status-select"
                    value={attentionFilter}
                    options={[
                      { label: t("任务页.筛选.关注.全部"), value: "all" },
                      { label: t("任务页.值.attention.none"), value: "none" satisfies TaskCenterAttentionFilter },
                      { label: t("任务页.值.attention.background"), value: "background" satisfies TaskCenterAttentionFilter },
                      { label: t("任务页.值.attention.scheduled"), value: "scheduled" satisfies TaskCenterAttentionFilter },
                      { label: t("任务页.值.attention.blocked"), value: "blocked" satisfies TaskCenterAttentionFilter },
                      { label: t("任务页.值.attention.takeover_required"), value: "takeover_required" satisfies TaskCenterAttentionFilter },
                      { label: t("任务页.值.attention.verification_required"), value: "verification_required" satisfies TaskCenterAttentionFilter },
                      { label: t("任务页.值.attention.wrap_up_required"), value: "wrap_up_required" satisfies TaskCenterAttentionFilter },
                      { label: t("任务页.值.attention.failed"), value: "failed" satisfies TaskCenterAttentionFilter },
                    ]}
                    onChange={(value) => {
                      setAttentionFilter(value);
                      setCurrentPage(1);
                    }}
                  />
                </>
              ) : null}

              {activeTab === "automation" ? (
                <Select
                  className="tasks-page-schedule-select"
                  value={scheduleFilter}
                  options={[
                    { label: t("任务页.筛选.调度.全部"), value: "all" },
                    { label: t("任务页.筛选.调度.已调度"), value: "scheduled" },
                    { label: t("任务页.筛选.调度.未调度"), value: "unscheduled" },
                    { label: t("任务页.筛选.调度.生效中"), value: "active" },
                    { label: t("任务页.筛选.调度.已暂停"), value: "paused" },
                  ]}
                  onChange={(value) => {
                    setScheduleFilter(value);
                    setCurrentPage(1);
                  }}
                />
              ) : null}

              {activeTab === "automation" ? (
                <div className="tasks-page-toolbar-group">
                  <Button
                    disabled={runNowCandidates.length === 0}
                    loading={batchActionLoading === "runNow"}
                    onClick={() => {
                      void handleBatchAction("runNow");
                    }}
                  >
                    {t("任务页.按钮.立即执行已选")}
                  </Button>
                  <Button
                    disabled={pauseScheduleCandidates.length === 0}
                    loading={batchActionLoading === "pauseSchedule"}
                    onClick={() => {
                      void handleBatchAction("pauseSchedule");
                    }}
                  >
                    {t("任务页.按钮.暂停已选调度")}
                  </Button>
                  <Button
                    disabled={resumeScheduleCandidates.length === 0}
                    loading={batchActionLoading === "resumeSchedule"}
                    onClick={() => {
                      void handleBatchAction("resumeSchedule");
                    }}
                  >
                    {t("任务页.按钮.恢复已选调度")}
                  </Button>
                  {selectedTasks.length > 0 ? (
                    <Text type="secondary" className="tasks-page-selection-summary">
                      {t("任务页.文案.已选任务", { 数量: String(selectedTasks.length) })}
                    </Text>
                  ) : null}
                </div>
              ) : null}

              <div className="tasks-page-toolbar-group">
                <Button
                  icon={<ReloadOutlined />}
                  loading={loading || refreshing}
                  onClick={() => {
                    void loadWorkspaceOptions();
                    void loadTasks(true);
                  }}
                >
                  {t("任务页.按钮.刷新")}
                </Button>
              </div>
            </div>
          </div>

          <div className="tasks-page-toolbar-divider" aria-hidden="true" />

          <div className="tasks-page-table-shell">
            {activeTab === "conversation" ? (
              <AppTableCard
                className="tasks-page-table-card"
                rowKey={(row: TaskCenterConversationSessionRow) => row.sessionKey}
                columns={conversationColumns}
                items={pagedConversationRows}
                loading={loading || refreshing}
                loadingText={t("任务页.提示.加载中")}
                emptyDescription={t("任务页.提示.无会话任务")}
                pagination={{
                  total: currentTotal,
                  currentPage,
                  currentPageSize,
                  pageSizeOptions: PAGE_SIZE_OPTIONS,
                  totalLabel: t("任务页.文案.分页汇总", {
                    开始: currentTotal === 0 ? 0 : (currentPage - 1) * currentPageSize + 1,
                    结束: currentTotal === 0 ? 0 : Math.min(currentPage * currentPageSize, currentTotal),
                    总数: currentTotal,
                  }),
                  onChange: (nextPage, nextPageSize) => {
                    setCurrentPage(nextPage);
                    setCurrentPageSize(nextPageSize);
                  },
                }}
                scrollX={1200}
                tableProps={{
                  className: "tasks-page-table",
                  rowClassName: (row) => (
                    detailTask && buildTaskRowKey(detailTask) === buildTaskRowKey(row.representativeTask)
                      ? "tasks-page-table-row is-active"
                      : "tasks-page-table-row"
                  ),
                  onRow: (row) => ({
                    onClick(event) {
                      if (shouldIgnoreRowOpen(event.target)) {
                        return;
                      }
                      handleOpenDetail(row.representativeTask);
                    },
                  }),
                }}
              />
            ) : (
              <AppTableCard
                className="tasks-page-table-card"
                rowKey={buildTaskRowKey}
                columns={columns}
                items={pagedTaskItems}
                loading={loading || refreshing}
                loadingText={t("任务页.提示.加载中")}
                emptyDescription={t("任务页.提示.无任务")}
                pagination={{
                  total: currentTotal,
                  currentPage,
                  currentPageSize,
                  pageSizeOptions: PAGE_SIZE_OPTIONS,
                  totalLabel: t("任务页.文案.分页汇总", {
                    开始: currentTotal === 0 ? 0 : (currentPage - 1) * currentPageSize + 1,
                    结束: currentTotal === 0 ? 0 : Math.min(currentPage * currentPageSize, currentTotal),
                    总数: currentTotal,
                  }),
                  onChange: (nextPage, nextPageSize) => {
                    setCurrentPage(nextPage);
                    setCurrentPageSize(nextPageSize);
                  },
                }}
                scrollX={1500}
                tableProps={{
                  className: "tasks-page-table",
                  rowSelection: activeTab === "automation" ? rowSelection : undefined,
                  rowClassName: (row) => (
                    detailTask && buildTaskRowKey(detailTask) === buildTaskRowKey(row)
                      ? "tasks-page-table-row is-active"
                      : "tasks-page-table-row"
                  ),
                  onRow: (row) => ({
                    onClick(event) {
                      if (shouldIgnoreRowOpen(event.target)) {
                        return;
                      }
                      handleOpenDetail(row);
                    },
                  }),
                }}
              />
            )}
          </div>
        </div>

        <TaskDetailModal
          open={detailOpen}
          loading={detailLoading}
          error={detailError}
          detail={detail}
          contextItem={detailTask}
          actionLoadingKey={actionLoadingKey}
          t={t}
          onTaskAction={(task, action) => {
            void handleTaskAction(task, action);
          }}
          onClose={() => {
            setDetailOpen(false);
            setDetailTask(null);
            setDetail(null);
            setDetailError(null);
          }}
        />
      </div>
    </section>
  );
}