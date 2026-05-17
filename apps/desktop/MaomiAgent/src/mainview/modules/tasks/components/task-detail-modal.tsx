import {
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  Button,
  Collapse,
  Descriptions,
  Empty,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  type TableColumnsType,
} from "antd";

import type { DesktopTaskCenterItem } from "../../../../shared/desktop-task-center";
import type {
  DesktopTaskDetailResponse,
  DesktopTaskRunRecord,
  DesktopTaskStep,
} from "../../../../shared/desktop-tasks";
import {
  buildTaskActionKey,
  canCancelTaskFromTasksPage,
  canRetryTaskFromTasksPage,
  canRunTaskNowFromTasksPage,
  executionModeLabel,
  formatDateTime,
  hasTaskSchedule,
  isTaskScheduleEnabled,
  isTaskSchedulePaused,
  priorityLabel,
  runTriggerLabel,
  sourceOwnerLabel,
  taskBlockedReason,
  taskDefinitionKeyLabel,
  taskHandlerIdLabel,
  taskHandlerLabel,
  taskLevelLabel,
  taskModuleLabel,
  taskNextRunAtLabel,
  taskPhaseLabel,
  taskRootTaskId,
  taskRunModeLabel,
  taskScheduleLabel,
  taskScheduleStateLabel,
  taskStatusLabel,
  taskStatusTagColor,
  taskStepStatusLabel,
  taskTypeLabel,
  type TaskActionName,
} from "../helpers";
import type { TasksTranslate as Translate } from "../i18n";
import {
  taskCenterAttentionReason,
  taskCenterAttentionStateLabel,
  taskCenterExposureLabel,
  taskCenterPhaseLabel,
  taskCenterSourceKindLabel,
} from "../task-center-helpers";

const { Paragraph, Text, Title } = Typography;

type Props = {
  open: boolean;
  loading: boolean;
  error?: string | null;
  detail: DesktopTaskDetailResponse | null;
  contextItem?: DesktopTaskCenterItem | null;
  actionLoadingKey?: string | null;
  t: Translate;
  onTaskAction?: (
    task: DesktopTaskDetailResponse["item"],
    action: TaskActionName,
  ) => void;
  onClose: () => void;
};

type TaskDetailBodyProps = Omit<Props, "open" | "onClose">;

function buildStepColumns(t: Translate): TableColumnsType<DesktopTaskStep> {
  return [
    {
      title: t("任务页.字段.title"),
      dataIndex: "title",
      key: "title",
    },
    {
      title: t("任务页.字段.agentId"),
      dataIndex: "agentId",
      key: "agentId",
      width: 140,
      render: (value: string | undefined) => value || "-",
    },
    {
      title: t("任务页.列.状态"),
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (value: DesktopTaskStep["status"]) => (
        <Tag color={value === "success" ? "success" : value === "failed" ? "error" : value === "running" ? "processing" : "default"}>
          {taskStepStatusLabel(t, value)}
        </Tag>
      ),
    },
    {
      title: t("任务页.列.时间"),
      key: "time",
      width: 180,
      render: (_, row) => formatDateTime(row.finishedAt || row.startedAt),
    },
  ];
}

function buildRunColumns(t: Translate): TableColumnsType<DesktopTaskRunRecord> {
  return [
    {
      title: t("任务页.列.runId"),
      dataIndex: "runId",
      key: "runId",
      width: 220,
      render: (value: string) => <Text code>{value}</Text>,
    },
    {
      title: t("任务页.列.trigger"),
      dataIndex: "trigger",
      key: "trigger",
      width: 120,
      render: (value: DesktopTaskRunRecord["trigger"]) => runTriggerLabel(t, value),
    },
    {
      title: t("任务页.列.状态"),
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (value: DesktopTaskRunRecord["status"]) => (
        <Tag color={value === "success" ? "success" : value === "failed" ? "error" : value === "running" ? "processing" : "default"}>
          {taskStatusLabel(t, value)}
        </Tag>
      ),
    },
    {
      title: t("任务页.字段.executor"),
      dataIndex: "executor",
      key: "executor",
      width: 180,
    },
    {
      title: t("任务页.列.时间"),
      key: "time",
      width: 180,
      render: (_, row) => formatDateTime(row.finishedAt || row.startedAt),
    },
  ];
}

function TaskDetailBody(props: TaskDetailBodyProps) {
  const {
    loading,
    error,
    detail,
    contextItem,
    actionLoadingKey,
    t,
    onTaskAction,
  } = props;
  const item = detail?.item ?? null;
  const runs = detail?.runs ?? [];
  const latestRun = runs[0] ?? null;
  const rootTaskId = contextItem?.rootTaskId || (item ? taskRootTaskId(item) : undefined);
  const linkedSessionId = contextItem?.linkedSessionId || item?.linkedSessionId?.trim() || undefined;
  const contextReason = contextItem ? taskCenterAttentionReason(contextItem) : undefined;

  const detailCollapseItems = item ? [
    {
      key: "advanced",
      label: t("任务页.标题.高级运行信息"),
      children: (
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label={t("任务页.字段.workspaceId")}>
            {item.workspaceId}
          </Descriptions.Item>
          <Descriptions.Item label={t("任务页.字段.任务ID")}>
            <Text code>{item.taskId}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={t("任务页.字段.rootTaskId")}>
            {rootTaskId ? <Text code>{rootTaskId}</Text> : "-"}
          </Descriptions.Item>
          <Descriptions.Item label={t("任务页.字段.lastRunId")}>
            {item.lastRunId ? <Text code>{item.lastRunId}</Text> : "-"}
          </Descriptions.Item>
          <Descriptions.Item label={t("任务页.字段.创建时间")}>
            {formatDateTime(item.createdAt)}
          </Descriptions.Item>
          <Descriptions.Item label={t("任务页.字段.更新时间")}>
            {formatDateTime(item.updatedAt)}
          </Descriptions.Item>
          <Descriptions.Item label={t("任务页.字段.handler")}>
            {taskHandlerLabel(item)}
          </Descriptions.Item>
          <Descriptions.Item label={t("任务页.字段.handlerId")}>
            {item.handler?.handlerId ? <Text code>{taskHandlerIdLabel(item)}</Text> : "-"}
          </Descriptions.Item>
          <Descriptions.Item label={t("任务页.字段.moduleId")}>
            {item.handler?.moduleId ? <Text code>{taskModuleLabel(item)}</Text> : "-"}
          </Descriptions.Item>
          <Descriptions.Item label={t("任务页.字段.definitionKey")}>
            {item.handler?.taskKey ? <Text code>{taskDefinitionKeyLabel(item)}</Text> : "-"}
          </Descriptions.Item>
          <Descriptions.Item label={t("任务页.字段.scheduleKind")}>
            {taskScheduleLabel(t, item)}
          </Descriptions.Item>
          <Descriptions.Item label={t("任务页.字段.scheduleEnabled")}>
            {taskScheduleStateLabel(t, item)}
          </Descriptions.Item>
          <Descriptions.Item label={t("任务页.字段.scheduleNextRunAt")}>
            {taskNextRunAtLabel(item)}
          </Descriptions.Item>
          <Descriptions.Item label={t("任务页.字段.sourceOwner")} span={2}>
            {sourceOwnerLabel(t, item)}
          </Descriptions.Item>
        </Descriptions>
      ),
    },
    {
      key: "steps",
      label: t("任务页.标题.步骤"),
      children: item.steps.length > 0 ? (
        <Table
          rowKey="stepId"
          size="small"
          pagination={false}
          columns={buildStepColumns(t)}
          dataSource={item.steps}
          className="tasks-page-detail-table"
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("任务页.提示.无步骤")} />
      ),
    },
    {
      key: "outputs",
      label: t("任务页.标题.产物"),
      children: item.outputs && item.outputs.length > 0 ? (
        <div className="tasks-page-output-list">
          {item.outputs.map((output) => (
            <div key={`${item.taskId}-${output.name}`} className="tasks-page-output-item">
              <Text strong>{output.name}</Text>
              <Paragraph className="tasks-page-output-value">{output.value}</Paragraph>
            </div>
          ))}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("任务页.提示.无产物")} />
      ),
    },
    {
      key: "history",
      label: t("任务页.标题.运行记录"),
      children: runs.length > 0 ? (
        <Table
          rowKey="runId"
          size="small"
          pagination={false}
          columns={buildRunColumns(t)}
          dataSource={runs}
          className="tasks-page-detail-table"
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("任务页.提示.无运行记录")} />
      ),
    },
  ] : [];

  if (loading) {
    return (
      <div className="tasks-page-detail-empty">
        <Empty description={t("任务页.提示.加载中")} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="tasks-page-detail-empty">
        <Empty description={error} />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="tasks-page-detail-empty">
        <Empty description={t("任务页.提示.无详情")} />
      </div>
    );
  }

  return (
    <div className="tasks-page-detail-content">
      <div className="tasks-page-detail-surface">
        <div className="tasks-page-detail-header">
          <Title level={4} className="tasks-page-detail-title">{item.title}</Title>
          <Space size={[8, 8]} wrap>
            <Tag color={taskStatusTagColor(item.status)}>{taskStatusLabel(t, item.status)}</Tag>
            {contextItem ? (
              <>
                <Tag>{taskCenterSourceKindLabel(t, contextItem.sourceKind)}</Tag>
                <Tag>{taskCenterExposureLabel(t, contextItem.exposure)}</Tag>
                <Tag>{taskCenterAttentionStateLabel(t, contextItem.attentionState)}</Tag>
              </>
            ) : (
              <>
                <Tag>{taskLevelLabel(t, item)}</Tag>
                <Tag>{taskTypeLabel(t, item.taskType)}</Tag>
                <Tag>{executionModeLabel(t, item.executionMode)}</Tag>
                <Tag>{taskRunModeLabel(t, item.runMode)}</Tag>
              </>
            )}
            <Tag>{priorityLabel(t, item.priority)}</Tag>
          </Space>
        </div>

        <Space size={[8, 8]} wrap className="tasks-page-detail-actions">
          {canRunTaskNowFromTasksPage(item) ? (
            <Button
              icon={<PlayCircleOutlined />}
              loading={actionLoadingKey === buildTaskActionKey(item, "runNow")}
              onClick={() => onTaskAction?.(item, "runNow")}
            >
              {t("任务页.按钮.立即执行")}
            </Button>
          ) : null}
          {isTaskScheduleEnabled(item) && hasTaskSchedule(item) ? (
            <Button
              icon={<PauseCircleOutlined />}
              loading={actionLoadingKey === buildTaskActionKey(item, "pauseSchedule")}
              onClick={() => onTaskAction?.(item, "pauseSchedule")}
            >
              {t("任务页.按钮.暂停调度")}
            </Button>
          ) : null}
          {isTaskSchedulePaused(item) ? (
            <Button
              icon={<PlayCircleOutlined />}
              loading={actionLoadingKey === buildTaskActionKey(item, "resumeSchedule")}
              onClick={() => onTaskAction?.(item, "resumeSchedule")}
            >
              {t("任务页.按钮.恢复调度")}
            </Button>
          ) : null}
          {canRetryTaskFromTasksPage(item) ? (
            <Button
              icon={<ReloadOutlined />}
              loading={actionLoadingKey === buildTaskActionKey(item, "retry")}
              onClick={() => onTaskAction?.(item, "retry")}
            >
              {t("任务页.按钮.重试")}
            </Button>
          ) : null}
          {canCancelTaskFromTasksPage(item) ? (
            <Button
              danger
              icon={<StopOutlined />}
              loading={actionLoadingKey === buildTaskActionKey(item, "cancel")}
              onClick={() => onTaskAction?.(item, "cancel")}
            >
              {t("任务页.按钮.取消")}
            </Button>
          ) : null}
        </Space>
      </div>

      {contextItem ? (
        <div className="tasks-page-detail-surface">
          <div className="tasks-page-detail-section-title">{t("任务页.标题.当前上下文")}</div>
          <div className="tasks-page-detail-summary-grid">
            <div className="tasks-page-detail-summary-item">
              <Text type="secondary" className="tasks-page-detail-summary-label">
                {t("任务页.字段.sourceKind")}
              </Text>
              <Text className="tasks-page-detail-summary-value">
                {taskCenterSourceKindLabel(t, contextItem.sourceKind)}
              </Text>
            </div>
            <div className="tasks-page-detail-summary-item">
              <Text type="secondary" className="tasks-page-detail-summary-label">
                {t("任务页.字段.exposure")}
              </Text>
              <Text className="tasks-page-detail-summary-value">
                {taskCenterExposureLabel(t, contextItem.exposure)}
              </Text>
            </div>
            <div className="tasks-page-detail-summary-item">
              <Text type="secondary" className="tasks-page-detail-summary-label">
                {t("任务页.字段.attentionState")}
              </Text>
              <Text className="tasks-page-detail-summary-value">
                {taskCenterAttentionStateLabel(t, contextItem.attentionState)}
              </Text>
            </div>
            <div className="tasks-page-detail-summary-item">
              <Text type="secondary" className="tasks-page-detail-summary-label">
                {t("任务页.字段.phase")}
              </Text>
              <Text className="tasks-page-detail-summary-value">
                {taskCenterPhaseLabel(t, contextItem)}
              </Text>
            </div>
            <div className="tasks-page-detail-summary-item">
              <Text type="secondary" className="tasks-page-detail-summary-label">
                {t("任务页.字段.linkedSessionId")}
              </Text>
              <Text className="tasks-page-detail-summary-value">
                {linkedSessionId || t("任务页.值.无会话上下文")}
              </Text>
            </div>
            <div className="tasks-page-detail-summary-item">
              <Text type="secondary" className="tasks-page-detail-summary-label">
                {t("任务页.字段.rootTaskId")}
              </Text>
              <Text code className="tasks-page-detail-summary-value">
                {rootTaskId || "-"}
              </Text>
            </div>
            <div className="tasks-page-detail-summary-item is-wide">
              <Text type="secondary" className="tasks-page-detail-summary-label">
                {t("任务页.字段.attentionReason")}
              </Text>
              <Text className="tasks-page-detail-summary-value">
                {contextReason || t("任务页.值.未设置")}
              </Text>
            </div>
          </div>
        </div>
      ) : null}

      <div className="tasks-page-detail-surface">
        <div className="tasks-page-detail-section-title">{t("任务页.字段.goal")}</div>
        <Paragraph className="tasks-page-detail-goal">{item.goal}</Paragraph>
      </div>

      <div className="tasks-page-detail-surface">
        <div className="tasks-page-detail-section-title">{t("任务页.标题.运行编排")}</div>
        <div className="tasks-page-detail-summary-grid">
          <div className="tasks-page-detail-summary-item">
            <Text type="secondary" className="tasks-page-detail-summary-label">
              {t("任务页.字段.taskLevel")}
            </Text>
            <Text className="tasks-page-detail-summary-value">
              {taskLevelLabel(t, item)}
            </Text>
          </div>
          <div className="tasks-page-detail-summary-item">
            <Text type="secondary" className="tasks-page-detail-summary-label">
              {t("任务页.字段.runMode")}
            </Text>
            <Text className="tasks-page-detail-summary-value">
              {taskRunModeLabel(t, item.runMode)}
            </Text>
          </div>
          <div className="tasks-page-detail-summary-item">
            <Text type="secondary" className="tasks-page-detail-summary-label">
              {t("任务页.字段.phase")}
            </Text>
            <Text className="tasks-page-detail-summary-value">
              {taskPhaseLabel(t, item)}
            </Text>
          </div>
          <div className="tasks-page-detail-summary-item">
            <Text type="secondary" className="tasks-page-detail-summary-label">
              {t("任务页.字段.linkedSessionId")}
            </Text>
            <Text className="tasks-page-detail-summary-value">
              {linkedSessionId || t("任务页.值.会话联动待二期")}
            </Text>
          </div>
          <div className="tasks-page-detail-summary-item">
            <Text type="secondary" className="tasks-page-detail-summary-label">
              {t("任务页.字段.rootTaskId")}
            </Text>
            <Text code className="tasks-page-detail-summary-value">
              {rootTaskId || "-"}
            </Text>
          </div>
          <div className="tasks-page-detail-summary-item is-wide">
            <Text type="secondary" className="tasks-page-detail-summary-label">
              {t("任务页.字段.blockedReason")}
            </Text>
            <Text className="tasks-page-detail-summary-value">
              {taskBlockedReason(item) || t("任务页.值.未设置")}
            </Text>
          </div>
        </div>
      </div>

      <div className="tasks-page-detail-surface">
        <div className="tasks-page-detail-section-title">{t("任务页.标题.最近运行")}</div>
        {latestRun ? (
          <>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label={t("任务页.列.runId")}>
                <Text code>{latestRun.runId}</Text>
              </Descriptions.Item>
              <Descriptions.Item label={t("任务页.列.状态")}>
                <Tag color={taskStatusTagColor(latestRun.status)}>
                  {taskStatusLabel(t, latestRun.status)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t("任务页.列.trigger")}>
                {runTriggerLabel(t, latestRun.trigger)}
              </Descriptions.Item>
              <Descriptions.Item label={t("任务页.字段.executor")}>
                {latestRun.executor}
              </Descriptions.Item>
              <Descriptions.Item label={t("任务页.列.时间")} span={2}>
                {formatDateTime(latestRun.finishedAt || latestRun.startedAt)}
              </Descriptions.Item>
            </Descriptions>
            {latestRun.error?.message ? (
              <Paragraph className="tasks-page-detail-run-error">
                {latestRun.error.message}
              </Paragraph>
            ) : null}
          </>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("任务页.提示.无运行记录")} />
        )}
      </div>

      <div className="tasks-page-detail-surface">
        <Collapse
          ghost
          className="tasks-page-detail-collapse"
          items={detailCollapseItems}
        />
      </div>
    </div>
  );
}

export function TaskDetailModal(props: Props) {
  return (
    <Modal
      open={props.open}
      width="min(92vw, 1120px)"
      title={props.t("任务页.标题.任务详情")}
      footer={null}
      className="tasks-page-detail-modal"
      onCancel={props.onClose}
    >
      <TaskDetailBody
        loading={props.loading}
        error={props.error}
        detail={props.detail}
        contextItem={props.contextItem}
        actionLoadingKey={props.actionLoadingKey}
        t={props.t}
        onTaskAction={props.onTaskAction}
      />
    </Modal>
  );
}