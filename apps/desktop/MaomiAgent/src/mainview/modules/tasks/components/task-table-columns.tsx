import {
  EyeOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  Button,
  Progress,
  Space,
  Tag,
  Tooltip,
  Typography,
  type TableColumnsType,
} from "antd";

import type { DesktopTaskCenterItem } from "../../../../shared/desktop-task-center";
import {
  buildTaskActionKey,
  formatDateTime,
  formatGoalSummary,
  formatIdText,
  priorityLabel,
  taskStatusLabel,
  taskStatusTagColor,
  type TaskActionName,
} from "../helpers";
import type { TasksTranslate as Translate } from "../i18n";
import {
  canCancelTaskCenter,
  canRetryTaskCenter,
  canRunTaskCenterNow,
  hasTaskCenterSchedule,
  isTaskCenterScheduleEnabled,
  isTaskCenterSchedulePaused,
  taskCenterAttentionReason,
  taskCenterAttentionStateLabel,
  taskCenterExposureLabel,
  taskCenterHandlerLabel,
  taskCenterModuleLabel,
  taskCenterNextRunAtLabel,
  taskCenterPhaseLabel,
  taskCenterScheduleLabel,
  taskCenterScheduleStateLabel,
  taskCenterSourceKindLabel,
  type TaskCenterPageTab,
} from "../task-center-helpers";

const { Text } = Typography;

type Input = {
  actionLoadingKey: string | null;
  tab: TaskCenterPageTab;
  t: Translate;
  onOpenDetail: (task: DesktopTaskCenterItem) => void;
  onTaskAction: (task: DesktopTaskCenterItem, action: TaskActionName) => void;
};

function buildContextCell(
  t: Translate,
  tab: TaskCenterPageTab,
  row: DesktopTaskCenterItem,
) {
  const reason = taskCenterAttentionReason(row);
  const secondary = tab === "critical"
    ? reason ?? `${priorityLabel(t, row.priority)} / ${taskCenterPhaseLabel(t, row)}`
    : `${taskCenterHandlerLabel(row)} / ${taskCenterModuleLabel(row)}`;

  return (
    <div className="tasks-page-mode-cell">
      <Space size={[8, 8]} wrap>
        <Tag bordered={false} className="tasks-page-pill tasks-page-pill-type">
          {taskCenterSourceKindLabel(t, row.sourceKind)}
        </Tag>
        <Tag bordered={false} className="tasks-page-pill tasks-page-pill-mode">
          {taskCenterAttentionStateLabel(t, row.attentionState)}
        </Tag>
        {tab === "critical" ? (
          <Tag bordered={false} className="tasks-page-pill tasks-page-pill-mode">
            {taskCenterExposureLabel(t, row.exposure)}
          </Tag>
        ) : null}
      </Space>
      <Text type="secondary">{secondary}</Text>
    </div>
  );
}

export function buildTaskTableColumns(input: Input): TableColumnsType<DesktopTaskCenterItem> {
  const {
    actionLoadingKey,
    tab,
    t,
    onOpenDetail,
    onTaskAction,
  } = input;

  return [
    {
      title: t("任务页.列.任务"),
      key: "task",
      width: 360,
      render: (_, row) => (
        <div className="tasks-page-task-cell">
          <div className="tasks-page-task-title">{row.title}</div>
          <div className="tasks-page-task-goal">{formatGoalSummary(row.summary)}</div>
          <Space size={[8, 8]} wrap className="tasks-page-task-meta">
            <Text type="secondary">{formatIdText(row.taskId)}</Text>
            {tab === "critical" ? <Text type="secondary">{row.workspaceId}</Text> : null}
            {row.linkedSessionId ? <Text type="secondary">{formatIdText(row.linkedSessionId)}</Text> : null}
            {tab === "system" && row.identityKey ? (
              <Text type="secondary">{formatIdText(row.identityKey)}</Text>
            ) : null}
          </Space>
          {row.lifecycleStatus === "running" || row.lifecycleStatus === "queued" ? (
            <Progress
              percent={Math.max(0, Math.min(100, Math.round(row.progress)))}
              size="small"
              showInfo={false}
            />
          ) : null}
        </div>
      ),
    },
    {
      title: t("任务页.列.当前状态"),
      key: "statusSummary",
      width: 300,
      render: (_, row) => buildContextCell(t, tab, row),
    },
    {
      title: t("任务页.列.调度"),
      key: "schedule",
      width: 240,
      render: (_, row) => (
        <div className="tasks-page-schedule-cell">
          <Space size={[8, 8]} wrap>
            <Tag bordered={false} className="tasks-page-pill tasks-page-pill-schedule">
              {taskCenterScheduleLabel(t, row)}
            </Tag>
            {hasTaskCenterSchedule(row) ? (
              <Tag bordered={false} className="tasks-page-pill tasks-page-pill-schedule-state">
                {taskCenterScheduleStateLabel(t, row)}
              </Tag>
            ) : null}
          </Space>
          <Text type="secondary">
            {hasTaskCenterSchedule(row)
              ? `${taskCenterScheduleStateLabel(t, row)} / ${taskCenterNextRunAtLabel(row)}`
              : t("任务页.值.schedule.none")}
          </Text>
        </div>
      ),
    },
    {
      title: t("任务页.列.更新时间"),
      key: "updatedAt",
      width: 168,
      render: (_, row) => <Text type="secondary">{formatDateTime(row.updatedAt)}</Text>,
    },
    {
      title: t("任务页.列.状态"),
      key: "status",
      width: 110,
      render: (_, row) => (
        <Tag color={taskStatusTagColor(row.lifecycleStatus)}>
          {taskStatusLabel(t, row.lifecycleStatus)}
        </Tag>
      ),
    },
    {
      title: t("任务页.列.操作"),
      key: "actions",
      width: 180,
      render: (_, row) => {
        const canRunNow = canRunTaskCenterNow(row);
        const canRetry = canRetryTaskCenter(row);
        const canCancel = canCancelTaskCenter(row);

        return (
          <Space size={2} className="tasks-page-row-actions">
            <Tooltip title={t("任务页.按钮.详情")}>
              <Button
                type="text"
                className="tasks-page-action-button"
                icon={<EyeOutlined />}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenDetail(row);
                }}
              />
            </Tooltip>
            {canRunNow ? (
              <Tooltip title={t("任务页.按钮.立即执行")}>
                <Button
                  type="text"
                  className="tasks-page-action-button"
                  icon={<PlayCircleOutlined />}
                  loading={actionLoadingKey === buildTaskActionKey(row, "runNow")}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTaskAction(row, "runNow");
                  }}
                />
              </Tooltip>
            ) : null}
            {isTaskCenterScheduleEnabled(row) ? (
              <Tooltip title={t("任务页.按钮.暂停调度")}>
                <Button
                  type="text"
                  className="tasks-page-action-button"
                  icon={<PauseCircleOutlined />}
                  loading={actionLoadingKey === buildTaskActionKey(row, "pauseSchedule")}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTaskAction(row, "pauseSchedule");
                  }}
                />
              </Tooltip>
            ) : null}
            {isTaskCenterSchedulePaused(row) ? (
              <Tooltip title={t("任务页.按钮.恢复调度")}>
                <Button
                  type="text"
                  className="tasks-page-action-button"
                  icon={<PlayCircleOutlined />}
                  loading={actionLoadingKey === buildTaskActionKey(row, "resumeSchedule")}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTaskAction(row, "resumeSchedule");
                  }}
                />
              </Tooltip>
            ) : null}
            {canCancel ? (
              <Tooltip title={t("任务页.按钮.取消")}>
                <Button
                  danger
                  type="text"
                  className="tasks-page-action-button"
                  icon={<StopOutlined />}
                  loading={actionLoadingKey === buildTaskActionKey(row, "cancel")}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTaskAction(row, "cancel");
                  }}
                />
              </Tooltip>
            ) : null}
            {canRetry ? (
              <Tooltip title={t("任务页.按钮.重试")}>
                <Button
                  type="text"
                  className="tasks-page-action-button"
                  icon={<ReloadOutlined />}
                  loading={actionLoadingKey === buildTaskActionKey(row, "retry")}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTaskAction(row, "retry");
                  }}
                />
              </Tooltip>
            ) : null}
          </Space>
        );
      },
    },
  ];
}
