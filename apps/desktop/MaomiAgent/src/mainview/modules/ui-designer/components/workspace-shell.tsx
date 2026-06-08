import { Alert, Splitter } from "antd";
import { useMemo, useState } from "react";

import type { UiDesignerPageProps } from "../types";
import { useUiDesignerShellState } from "../hooks/use-ui-designer-shell-state";
import type { UiDesignerStageKey } from "../services/stage-view-model-resolver";
import { ConversationRail } from "./conversation-rail";
import { DesignerFlowPanel } from "./designer-flow-panel";
import { StageDialog } from "./stage-dialog";
import { StageDetailPanel } from "./stage-detail-panel";

type UiDesignerWorkspaceShellProps = UiDesignerPageProps;

export function UiDesignerWorkspaceShell(props: UiDesignerWorkspaceShellProps) {
  const state = useUiDesignerShellState({
    active: props.active,
  });
  const [activeStageKey, setActiveStageKey] = useState<UiDesignerStageKey>("projectScope");
  const activeStage = useMemo(
    () => state.stageViewModels.find((item) => item.stageKey === activeStageKey) ?? state.stageViewModels[0],
    [activeStageKey, state.stageViewModels],
  );
  const knownStageKeys = useMemo(
    () => new Set(state.stageViewModels.map((item) => item.stageKey)),
    [state.stageViewModels],
  );

  return (
    <div
      className="chat-page-root ui-designer-page"
      data-testid="ui-designer-page"
      data-active={props.active ? "true" : "false"}
      data-language={props.language}
    >
      {state.errorMessage
        ? (
            <Alert
              className="ui-designer-page-alert"
              type="error"
              showIcon
              message="UI 设计师工作台暂时不可用"
              description={state.errorMessage}
            />
          )
        : null}
      <Splitter className="ui-designer-page-splitter">
        <Splitter.Panel min={320} defaultSize="30%">
          <ConversationRail {...state} language={props.language} />
        </Splitter.Panel>
        <Splitter.Panel min={420} defaultSize="40%">
          <DesignerFlowPanel
            activeStageKey={activeStage?.stageKey ?? "projectScope"}
            stageViewModels={state.stageViewModels}
            designPackagePath={state.designerState?.designPackagePath}
            lockReason={state.designerState?.lockReason}
            missingItems={state.designerState?.readiness.missing ?? []}
            onSelectStage={setActiveStageKey}
            onStartStage={(stageKey) => {
              setActiveStageKey(stageKey);
              void state.openStageDialog(stageKey);
            }}
          />
        </Splitter.Panel>
        <Splitter.Panel min={320} defaultSize="30%">
          <StageDetailPanel activeStage={activeStage} />
        </Splitter.Panel>
      </Splitter>
      <StageDialog
        open={Boolean(state.stageDialogState.schema)}
        schema={state.stageDialogState.schema}
        submitting={state.stageDialogState.submitting}
        onCancel={state.closeStageDialog}
        onSubmit={(values) => {
          void state.submitStageDialog(values).then((nextStageKey) => {
            if (nextStageKey && knownStageKeys.has(nextStageKey as UiDesignerStageKey)) {
              setActiveStageKey(nextStageKey as UiDesignerStageKey);
            }
          });
        }}
      />
    </div>
  );
}
