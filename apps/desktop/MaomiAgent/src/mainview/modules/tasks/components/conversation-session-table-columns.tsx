import {
  EyeOutlined,
} from "@ant-design/icons";
import {
  Button,
  Space,
  Tag,
  Tooltip,
  Typography,
  type TableColumnsType,
} from "antd";

import type { TasksTranslate as Translate } from "../i18n";
import {
  formatDateTime,
  formatGoalSummary,
  formatIdText,
  taskStatusLabel,
  taskStatusTagColor,
} from "../helpers";
import {
  taskCenterAttentionStateLabel,
  type TaskCenterConversationSessionRow,
} from "../task-center-helpers";

const { Text } = Typography;

type Input = {
  t: Translate;
  onOpenDetail: (row: TaskCenterConversationSessionRow) => void;
};

export function buildConversationSessionTableColumns(
  input: Input,
): TableColumnsType<TaskCenterConversationSessionRow> {
  const { t, onOpenDetail } = input;

  return [
    {
      title: t("任务页.列.会话"),
      key: "session",
      width: 320,
      render: (_, row) => (
        <div className="tasks-page-task-cell">
          <div className="tasks-page-task-title">{row.representativeTask.title}</div>
          <div className="tasks-page-task-goal">{formatGoalSummary(row.representativeTask.summary)}</div>
          <Space size={[8, 8]} wrap className="tasks-page-task-meta">
            <Text type="secondary">{formatIdText(row.sessionId)}</Text>
            <Text type="secondary">{row.workspaceId}</Text>
          </Space>
        </div>
      ),
    },
    {
      title: t("任务页.列.会话概览"),
      key: "summary",
      width: 320,
      render: (_, row) => (
        <div className="tasks-page-mode-cell">
          <Text>{t("任务页.文案.会话任务汇总", {
            运行中: String(row.activeTaskCount),
            失败: String(row.failedTaskCount),
            总数: String(row.taskCount),
          })}</Text>
          <Text type="secondary" className="tasks-page-session-task-list">
            {row.titles.slice(0, 3).join(" / ")}
          </Text>
        </div>
      ),
    },
    {
      title: t("任务页.列.状态"),
      key: "status",
      width: 220,
      render: (_, row) => (
        <Space size={[8, 8]} wrap>
          <Tag color={taskStatusTagColor(row.representativeTask.lifecycleStatus)}>
            {taskStatusLabel(t, row.representativeTask.lifecycleStatus)}
          </Tag>
          {row.representativeTask.attentionState !== "none" ? (
            <Tag bordered={false} className="tasks-page-pill tasks-page-pill-mode">
              {taskCenterAttentionStateLabel(t, row.representativeTask.attentionState)}
            </Tag>
          ) : null}
        </Space>
      ),
    },
    {
      title: t("任务页.列.更新时间"),
      key: "updatedAt",
      width: 168,
      render: (_, row) => <Text type="secondary">{formatDateTime(row.updatedAt)}</Text>,
    },
    {
      title: t("任务页.列.操作"),
      key: "actions",
      width: 88,
      render: (_, row) => (
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
        </Space>
      ),
    },
  ];
}