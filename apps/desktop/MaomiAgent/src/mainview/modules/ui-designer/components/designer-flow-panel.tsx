import { CheckCircleOutlined } from "@ant-design/icons";
import { Button, Tag } from "antd";

import type { UiDesignerStageKey, UiDesignerStageViewModel } from "../services/stage-view-model-resolver";
import { DesignerStatusBar } from "./designer-status-bar";

type DesignerFlowPanelProps = {
  activeStageKey: UiDesignerStageKey;
  stageViewModels: UiDesignerStageViewModel[];
  designPackagePath?: string;
  lockReason?: string;
  missingItems: string[];
  onSelectStage: (stageKey: UiDesignerStageKey) => void;
  onStartStage: (stageKey: UiDesignerStageKey) => void;
};

function resolveStageActionLabel(status: UiDesignerStageViewModel["status"]) {
  return status === "empty" ? "开始设计" : "重新设计";
}

export function DesignerFlowPanel(props: DesignerFlowPanelProps) {
  return (
    <section className="ui-designer-pane ui-designer-pane-center" data-testid="ui-designer-center-pane">
      <div className="ui-designer-pane-header">
        <div className="ui-designer-pane-label">流程</div>
        <h2 className="ui-designer-pane-title">流程 / 任务 / 清单</h2>
      </div>

      <DesignerStatusBar
        lockReason={props.lockReason}
        missingItems={props.missingItems}
      />

      <div className="ui-designer-panel-scroll">
        <div className="ui-designer-section">
          <div className="ui-designer-section-header">
            <div className="ui-designer-section-title">流程 / 任务 / 清单</div>
            <div className="ui-designer-design-path-wrap">
              <span className="ui-designer-status-bar-label">设计包路径</span>
              <span className="ui-designer-design-path">
                {props.designPackagePath ?? "未准备"}
              </span>
            </div>
          </div>
        </div>

        <div className="ui-designer-section">
          <div className="ui-designer-section-title">内置阶段</div>
          <div className="ui-designer-stage-list">
            {props.stageViewModels.map((item) => (
              <button
                key={item.stageKey}
                type="button"
                className={`ui-designer-stage-item${props.activeStageKey === item.stageKey ? " is-active" : ""}`}
                onClick={() => props.onSelectStage(item.stageKey)}
              >
                <CheckCircleOutlined className={`ui-designer-stage-check${item.status === "complete" ? " is-complete" : ""}`} />
                <div className="ui-designer-stage-item-content">
                  <div className="ui-designer-stage-item-main">
                    <span className="ui-designer-stage-item-title">{item.title}</span>
                    <Button
                      type="link"
                      className="ui-designer-stage-start-action"
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onStartStage(item.stageKey);
                      }}
                    >
                      {resolveStageActionLabel(item.status)}
                    </Button>
                  </div>
                  <div className="ui-designer-stage-summary">
                    {item.summary ? item.summary : <Tag>未确认</Tag>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default DesignerFlowPanel;
