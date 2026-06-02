import { Alert, Splitter } from "antd";

import type { UiDesignerPageProps } from "../types";
import { useUiDesignerShellState } from "../hooks/use-ui-designer-shell-state";
import { ConversationRail } from "./conversation-rail";
import { DesignerFlowPanel } from "./designer-flow-panel";
import { DesignerPreviewPanel } from "./designer-preview-panel";

type UiDesignerWorkspaceShellProps = UiDesignerPageProps;

export function UiDesignerWorkspaceShell(props: UiDesignerWorkspaceShellProps) {
  const state = useUiDesignerShellState({
    active: props.active,
  });

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
          <DesignerFlowPanel {...state} />
        </Splitter.Panel>
        <Splitter.Panel min={320} defaultSize="30%">
          <DesignerPreviewPanel {...state} />
        </Splitter.Panel>
      </Splitter>
    </div>
  );
}
