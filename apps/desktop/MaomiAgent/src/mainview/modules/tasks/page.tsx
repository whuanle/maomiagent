import { App as AntdApp, Empty, Tabs } from "antd";
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
import { TaskCenterToolbar } from "./components/task-center-toolbar";
import { TaskDetailModal } from "./components/task-detail-modal";
import { buildTaskTableColumns } from "./components/task-table-columns";
import {
  buildTaskActionKey,
  buildTaskRowKey,
  normalizeError,
  type TaskActionName,
} from "./helpers";
import { createTasksTranslator } from "./i18n";
import {
  buildTaskCenterListQuery,
  filterTaskCenterItems,
  type TaskCenterCriticalFilter,
  type TaskCenterPageTab,
  type TaskCenterSystemFilter,
} from "./task-center-helpers";
import "./page.css";

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
      "button, a, input, textarea, select, label, .ant-checkbox-wrapper, .ant-checkbox, .ant-btn, .ant-switch",
    ),
  );
}

export function TasksPage(props: Props) {
  const { message } = AntdApp.useApp();
  const t = useMemo(() => createTasksTranslator(props.language), [props.language]);
  const [bridgeReady, setBridgeReady] = useState(() => hasDesktopTasksBridge());
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOption[]>([]);
  const [activeTab, setActiveTab] = useState<TaskCenterPageTab>("critical");
  const [workspaceFilter, setWorkspaceFilter] = useState<string | undefined>(undefined);
  const [criticalFilter, setCriticalFilter] = useState<TaskCenterCriticalFilter>("all");
  const [systemFilter, setSystemFilter] = useState<TaskCenterSystemFilter>("all");
  const [searchText, setSearchText] = useState("");
  const deferredSearchText = useDeferredValue(searchText);
  const [items, setItems] = useState<DesktopTaskCenterItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPageSize, setCurrentPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
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
      const response = await listDesktopTaskCenter(buildTaskCenterListQuery({
        activeTab,
        workspaceId: workspaceFilter,
        q: deferredSearchText,
        limit: TASK_FETCH_LIMIT,
        offset: 0,
      }));

      setItems(response.items);
    } catch (error) {
      message.error(`${t("任务页.反馈.加载失败")}: ${normalizeError(error)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    activeTab,
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

  const visibleItems = useMemo(() => {
    return filterTaskCenterItems({
      activeTab,
      criticalFilter,
      items,
      systemFilter,
    });
  }, [activeTab, criticalFilter, items, systemFilter]);

  const currentTotal = visibleItems.length;
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(currentTotal / currentPageSize)),
    [currentPageSize, currentTotal],
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * currentPageSize;
    return visibleItems.slice(start, start + currentPageSize);
  }, [currentPage, currentPageSize, visibleItems]);

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

  const columns = useMemo(() => buildTaskTableColumns({
    actionLoadingKey,
    tab: activeTab,
    t,
    onOpenDetail: handleOpenDetail,
    onTaskAction: (task, action) => {
      void handleTaskAction(task, action);
    },
  }), [actionLoadingKey, activeTab, handleOpenDetail, handleTaskAction, t]);

  const tabItems = useMemo(() => ([
    {
      key: "critical",
      label: t("任务页.标签.关键任务"),
    },
    {
      key: "system",
      label: t("任务页.标签.系统任务"),
    },
  ]), [t]);

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
                setCurrentPage(1);
              }}
            />
          </div>

          <div className="tasks-page-table-shell">
            <AppTableCard
              className="tasks-page-table-card"
              toolbar={(
                <TaskCenterToolbar
                  activeTab={activeTab}
                  criticalFilter={criticalFilter}
                  loading={loading}
                  refreshing={refreshing}
                  searchText={searchText}
                  systemFilter={systemFilter}
                  t={t}
                  workspaceFilter={workspaceFilter}
                  workspaceOptions={workspaceOptions}
                  onCriticalFilterChange={(value) => {
                    setCriticalFilter(value);
                    setCurrentPage(1);
                  }}
                  onRefresh={() => {
                    void loadWorkspaceOptions();
                    void loadTasks(true);
                  }}
                  onSearchChange={(value) => {
                    setSearchText(value);
                    setCurrentPage(1);
                  }}
                  onSystemFilterChange={(value) => {
                    setSystemFilter(value);
                    setCurrentPage(1);
                  }}
                  onWorkspaceFilterChange={(value) => {
                    setWorkspaceFilter(value);
                    setCurrentPage(1);
                  }}
                />
              )}
              rowKey={buildTaskRowKey}
              columns={columns}
              items={pagedItems}
              loading={loading || refreshing}
              loadingText={t("任务页.提示.加载中")}
              emptyDescription={activeTab === "critical"
                ? t("任务页.提示.无关键任务")
                : t("任务页.提示.无系统任务")}
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
