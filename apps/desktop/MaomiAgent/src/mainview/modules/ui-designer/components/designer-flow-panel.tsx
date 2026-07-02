import { CheckCircleOutlined } from "@ant-design/icons";
import { Button, Tag } from "antd";
import type { KeyboardEvent } from "react";

import type { UiDesignerStageKey, UiDesignerStageViewModel } from "../services/stage-view-model-resolver";
import { isStageActionVisible, resolveStageActionLabel } from "../services/stage-action-availability";
import { DesignerStatusBar } from "./designer-status-bar";

type DesignerFlowPanelProps = {
  activeStageKey: UiDesignerStageKey;
  pendingStageKey?: UiDesignerStageKey;
  taskStageKey?: UiDesignerStageKey;
  liveTaskState: "idle" | "waiting" | "running";
  liveTaskLabel: string;
  refreshing: boolean;
  stageViewModels: UiDesignerStageViewModel[];
  designPackagePath?: string;
  lockReason?: string;
  missingItems: string[];
  onSelectStage: (stageKey: UiDesignerStageKey) => void;
  onRefresh: () => void;
  onStartStage: (stageKey: UiDesignerStageKey) => void;
};

export function DesignerFlowPanel(props: DesignerFlowPanelProps) {
  const taskStage = props.stageViewModels.find((item) => item.stageKey === props.taskStageKey);

  function handleStageItemKeyDown(
    event: KeyboardEvent<HTMLElement>,
    stageKey: UiDesignerStageKey,
  ) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    props.onSelectStage(stageKey);
  }

  return (
    <section className="ui-designer-pane ui-designer-pane-center" data-testid="ui-designer-center-pane">
      <DesignerStatusBar
        lockReason={props.lockReason}
        missingItems={props.missingItems}
      />

      <div className="ui-designer-panel-scroll">
        <div className="ui-designer-section">
          <div className="ui-designer-section-header">
            <div className="ui-designer-design-path-wrap">
              <span className="ui-designer-status-bar-label">设计包</span>
              <span className="ui-designer-design-path">
                {props.designPackagePath ?? "未准备"}
              </span>
            </div>
          </div>
        </div>

        <div className="ui-designer-section">
          <div className={`ui-designer-live-task-card is-${props.liveTaskState}`}>
            <div className="ui-designer-live-task-head">
              <span className="ui-designer-status-bar-label">当前任务</span>
              <div className="ui-designer-live-task-actions">
                <Tag color={props.liveTaskState === "running" ? "processing" : props.liveTaskState === "waiting" ? "gold" : "default"}>
                  {props.liveTaskLabel}
                </Tag>
                <Button size="small" onClick={props.onRefresh} loading={props.refreshing}>
                  刷新
                </Button>
              </div>
            </div>
            <div className="ui-designer-live-task-title">
              {taskStage?.title ?? "等待选择任务"}
            </div>
            <div className="ui-designer-live-task-summary">
              {taskStage?.summary || "当前没有可执行阶段"}
            </div>
          </div>
        </div>

        <div className="ui-designer-section">
          <div className="ui-designer-stage-list">
            {props.stageViewModels.map((item, index) => {
              const actionVisible = isStageActionVisible(props.stageViewModels, index);
              const pending = props.pendingStageKey === item.stageKey;
              const linkedTask = props.taskStageKey === item.stageKey;

              return (
                <div
                  key={item.stageKey}
                  className={`ui-designer-stage-item${props.activeStageKey === item.stageKey ? " is-active" : ""}${pending ? " is-pending" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-current={props.activeStageKey === item.stageKey ? "true" : undefined}
                  onClick={() => props.onSelectStage(item.stageKey)}
                  onKeyDown={(event) => handleStageItemKeyDown(event, item.stageKey)}
                >
                  <CheckCircleOutlined className={`ui-designer-stage-check${item.status === "complete" ? " is-complete" : ""}`} />
                  <div className="ui-designer-stage-item-content">
                    <div className="ui-designer-stage-item-main">
                      <span className="ui-designer-stage-item-title">{item.title}</span>
                      {linkedTask ? <Tag color="blue">当前任务</Tag> : null}
                      {pending ? <Tag color="processing">待填写</Tag> : null}
                      {actionVisible
                        ? (
                            <Button
                              type="link"
                              className="ui-designer-stage-start-action"
                              onClick={(event) => {
                                event.stopPropagation();
                                props.onStartStage(item.stageKey);
                              }}
                            >
                              {resolveStageActionLabel(item.status, pending)}
                            </Button>
                          )
                        : null}
                    </div>
                    <div className="ui-designer-stage-summary">
                      {item.summary ? item.summary : <Tag>未确认</Tag>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export default DesignerFlowPanel;
