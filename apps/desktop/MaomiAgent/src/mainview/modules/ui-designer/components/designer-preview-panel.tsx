import { AppstoreOutlined, EyeOutlined } from "@ant-design/icons";
import {
  Empty,
  Segmented,
  Spin,
  Tag,
} from "antd";

import type { UiDesignerShellState } from "../hooks/use-ui-designer-shell-state";

type DesignerPreviewPanelProps = Pick<
  UiDesignerShellState,
  | "designerState"
  | "loadingDesignerState"
  | "previewMode"
  | "scope"
  | "stack"
  | "setPreviewMode"
>;

function resolvePreviewStatusTagColor(status: string) {
  if (status === "ready") {
    return "success";
  }
  if (status === "failed") {
    return "error";
  }
  if (status === "starting") {
    return "processing";
  }
  return "default";
}

export function DesignerPreviewPanel(props: DesignerPreviewPanelProps) {
  const preview = props.designerState?.preview;
  const activeUrl = preview?.url?.trim();
  const summaryItems = [
    props.scope.projectType ? `项目类型：${String(props.scope.projectType)}` : "项目类型：待确认",
    props.scope.businessType ? `业务类型：${String(props.scope.businessType)}` : "业务类型：待确认",
    props.stack.framework ? `技术栈：${String(props.stack.framework)}` : "技术栈：待确认",
  ];

  return (
    <section className="ui-designer-pane ui-designer-pane-right" data-testid="ui-designer-right-pane">
      <div className="ui-designer-pane-header">
        <div className="ui-designer-pane-label">预览</div>
        <h2 className="ui-designer-pane-title">预览侧边栏</h2>
      </div>

      <div className="ui-designer-toolbar">
        <Segmented
          block
          value={props.previewMode}
          options={[
            {
              label: "临时预览",
              value: "preview-app",
              icon: <EyeOutlined />,
            },
            {
              label: "正式项目",
              value: "generated-app",
              icon: <AppstoreOutlined />,
            },
          ]}
          onChange={(value) => props.setPreviewMode(value as "preview-app" | "generated-app")}
        />
      </div>

      <div className="ui-designer-preview-meta">
        <Tag color={resolvePreviewStatusTagColor(preview?.status ?? "idle")}>
          {preview?.status ?? "idle"}
        </Tag>
        {typeof preview?.port === "number" ? <Tag>:{preview.port}</Tag> : null}
        {preview?.message ? <span>{preview.message}</span> : null}
      </div>

      <div className="ui-designer-preview-viewport">
        {props.loadingDesignerState
          ? (
              <div className="ui-designer-loading">
                <Spin size="small" />
                <span>正在准备预览</span>
              </div>
            )
          : activeUrl
            ? <iframe className="ui-designer-preview-frame" src={activeUrl} title="UI 设计师预览" />
            : (
                <div className="ui-designer-preview-empty-state">
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={props.previewMode === "generated-app" ? "正式项目尚未启动" : "临时预览尚未启动"}
                  />
                  <div className="ui-designer-preview-summary">
                    {summaryItems.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                </div>
              )}
      </div>
    </section>
  );
}
