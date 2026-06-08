import { Empty, Tag } from "antd";

import type { UiDesignerStageViewModel } from "../services/stage-view-model-resolver";

type StageDetailPanelProps = {
  activeStage?: UiDesignerStageViewModel;
};

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
        <Tag>{props.activeStage.status}</Tag>
      </div>
      <div className="ui-designer-stage-detail-summary">{props.activeStage.summary}</div>

      <div className="ui-designer-panel-scroll">
        {props.activeStage.sections.map((section) => (
          <section key={section.key} className="ui-designer-stage-detail-section">
            <div className="ui-designer-section-title">{section.title}</div>
            <div className="ui-designer-stage-detail-list">
              {section.items.map((item) => (
                <div key={`${section.key}-${item.label}`} className="ui-designer-stage-detail-row">
                  <span className="ui-designer-status-bar-label">{item.label}</span>
                  <strong className={item.emphasis ? "ui-designer-stage-detail-value is-emphasis" : "ui-designer-stage-detail-value"}>
                    {Array.isArray(item.value) ? item.value.join(" / ") : String(item.value)}
                  </strong>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

export default StageDetailPanel;
