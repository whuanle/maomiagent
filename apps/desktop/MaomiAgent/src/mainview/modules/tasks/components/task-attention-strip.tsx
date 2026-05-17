import { Typography } from "antd";

import type { DesktopTaskCenterItem } from "../../../../shared/desktop-task-center";
import {
  formatDateTime,
  formatIdText,
} from "../helpers";
import type { TasksTranslate as Translate } from "../i18n";
import {
  taskCenterAttentionReason,
  taskCenterAttentionStateLabel,
  taskCenterExposureLabel,
  taskCenterSourceKindLabel,
} from "../task-center-helpers";

const { Text } = Typography;

type Props = {
  items: DesktopTaskCenterItem[];
  t: Translate;
  onOpenDetail: (task: DesktopTaskCenterItem) => void;
};

export function TaskAttentionStrip(props: Props) {
  if (props.items.length === 0) {
    return null;
  }

  const visibleItems = props.items.slice(0, 4);
  const overflowCount = Math.max(0, props.items.length - visibleItems.length);

  return (
    <div className="tasks-page-context-strip-shell">
      <div className="tasks-page-context-strip-header">
        <Text className="tasks-page-context-strip-label">
          {props.t("任务页.标题.当前待处理")}
        </Text>
        {overflowCount > 0 ? (
          <Text type="secondary" className="tasks-page-context-strip-count">
            {props.t("任务页.文案.还有更多待处理", { 数量: String(overflowCount) })}
          </Text>
        ) : null}
      </div>

      <div className="tasks-page-context-strip" role="list">
        {visibleItems.map((item) => (
          <div key={item.centerId} role="listitem" className="tasks-page-context-item-shell">
            <button
              type="button"
              className="tasks-page-context-item"
              onClick={() => props.onOpenDetail(item)}
            >
              <div className="tasks-page-context-item-header">
                <div className="tasks-page-context-item-tags">
                  <span className="tasks-page-pill tasks-page-pill-type">
                    {taskCenterSourceKindLabel(props.t, item.sourceKind)}
                  </span>
                  <span className="tasks-page-pill tasks-page-pill-mode">
                    {taskCenterAttentionStateLabel(props.t, item.attentionState)}
                  </span>
                  <span className="tasks-page-pill tasks-page-pill-schedule-state">
                    {taskCenterExposureLabel(props.t, item.exposure)}
                  </span>
                </div>
                <Text type="secondary" className="tasks-page-context-item-time">
                  {formatDateTime(item.updatedAt)}
                </Text>
              </div>

              <div className="tasks-page-context-item-title">{item.title}</div>
              <div className="tasks-page-context-item-summary">
                {taskCenterAttentionReason(item) || item.summary}
              </div>

              <div className="tasks-page-context-item-meta">
                <span>
                  {item.linkedSessionId
                    ? formatIdText(item.linkedSessionId)
                    : props.t("任务页.值.无会话上下文")}
                </span>
                <span>{item.rootTaskId ? formatIdText(item.rootTaskId) : formatIdText(item.taskId)}</span>
              </div>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
