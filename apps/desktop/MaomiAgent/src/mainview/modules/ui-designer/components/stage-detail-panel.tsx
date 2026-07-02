import { Empty, Tag } from "antd";
import type { ReactNode } from "react";

import type { UiDesignerStageViewModel } from "../services/stage-view-model-resolver";

type StageDetailPanelProps = {
  activeStage?: UiDesignerStageViewModel;
  taskStageKey?: UiDesignerStageViewModel["stageKey"];
  liveTaskState: "idle" | "waiting" | "running";
  liveTaskLabel: string;
};

function resolveStageStatusLabel(status: UiDesignerStageViewModel["status"]) {
  if (status === "complete") {
    return "已完成";
  }

  if (status === "partial") {
    return "待补充";
  }

  return "未开始";
}

function renderDetailValue(item: UiDesignerStageViewModel["sections"][number]["items"][number]): ReactNode {
  if (Array.isArray(item.value)) {
    return (
      <div className="ui-designer-stage-detail-value-list">
        {item.value.map((value) => (
          <div key={`${item.label}-${value}`} className="ui-designer-stage-detail-value-line">
            {value}
          </div>
        ))}
      </div>
    );
  }

  if (typeof item.value === "boolean") {
    return item.value ? "是" : "否";
  }

  return item.value;
}

export function StageDetailPanel(props: StageDetailPanelProps) {
  if (!props.activeStage) {
    return (
      <section className="ui-designer-pane ui-designer-pane-right" data-testid="ui-designer-right-pane">
        <div className="ui-designer-pane-header">
          <div className="ui-designer-pane-label">详情</div>
          <h2 className="ui-designer-pane-title">阶段详情</h2>
        </div>
        <div className="ui-designer-stage-detail-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择一个阶段" />
        </div>
      </section>
    );
  }

  return (
    <section className="ui-designer-pane ui-designer-pane-right" data-testid="ui-designer-right-pane">
      <div className="ui-designer-pane-header">
        <div className="ui-designer-pane-label">详情</div>
        <h2 className="ui-designer-pane-title">当前阶段</h2>
      </div>

      <div className="ui-designer-stage-detail-header">
        <strong className="ui-designer-thread-title">{props.activeStage.title}</strong>
        <Tag>{resolveStageStatusLabel(props.activeStage.status)}</Tag>
      </div>
      <div className="ui-designer-stage-task-status-row">
        <Tag color={props.liveTaskState === "running" ? "processing" : props.liveTaskState === "waiting" ? "gold" : "default"}>
          任务状态：{props.liveTaskLabel}
        </Tag>
        <Tag color={props.taskStageKey === props.activeStage.stageKey ? "blue" : "default"}>
          {props.taskStageKey === props.activeStage.stageKey ? "已对齐当前任务" : "查看历史阶段"}
        </Tag>
      </div>
      <div className="ui-designer-stage-detail-summary">{props.activeStage.summary}</div>

      <div className="ui-designer-panel-scroll">
        {props.activeStage.sections.map((section) => (
          <section key={section.key} className="ui-designer-stage-detail-section">
            <div className="ui-designer-section-title">{section.title}</div>
            <div className="ui-designer-stage-detail-list">
              {section.items.map((item) => (
                <article key={`${section.key}-${item.label}`} className="ui-designer-stage-detail-item">
                  <div className="ui-designer-stage-detail-item-label">{item.label}</div>
                  <div className={item.emphasis ? "ui-designer-stage-detail-value is-emphasis" : "ui-designer-stage-detail-value"}>
                    {renderDetailValue(item)}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

export default StageDetailPanel;
