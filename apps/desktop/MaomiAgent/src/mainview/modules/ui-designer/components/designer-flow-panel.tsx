import {
  CheckCircleOutlined,
} from "@ant-design/icons";
import {
  Button,
  Tag,
} from "antd";

import type { UiDesignerShellState } from "../hooks/use-ui-designer-shell-state";
import { DesignerStatusBar } from "./designer-status-bar";

type DesignerFlowPanelProps = Pick<
  UiDesignerShellState,
  | "designerState"
  | "pages"
  | "queueRedesignPrompt"
  | "scope"
  | "selectedWorkspace"
  | "sourcesMarkdown"
  | "stack"
  | "theme"
  | "designFiles"
>;

function joinSummary(items: string[]) {
  return items.filter(Boolean).join(" / ");
}

function hasConfirmedStack(stack: Record<string, unknown>) {
  return typeof stack.framework === "string"
    && stack.framework.trim().length > 0
    && typeof stack.uiLibrary === "string"
    && stack.uiLibrary.trim().length > 0;
}

function hasConfirmedProjectScope(scope: Record<string, unknown>) {
  return typeof scope.projectType === "string"
    && scope.projectType.trim().length > 0
    && typeof scope.businessType === "string"
    && scope.businessType.trim().length > 0;
}

function hasConfirmedTheme(theme: Record<string, unknown>) {
  return typeof theme.style === "string" && theme.style.trim().length > 0;
}

function hasConfirmedPages(pages: Record<string, unknown>) {
  return Array.isArray(pages.templates) && pages.templates.length > 0;
}

function hasConfirmedSources(sourcesMarkdown: string) {
  return sourcesMarkdown.includes("http");
}

function hasConfirmedDesignSpec(designSpecMarkdown: string) {
  const normalized = designSpecMarkdown.trim();
  if (!normalized) {
    return false;
  }

  return normalized.includes("## 项目范围")
    || normalized.includes("项目类型：")
    || normalized.includes("页面模板：");
}

export function DesignerFlowPanel(props: DesignerFlowPanelProps) {
  const missingItems = props.designerState?.readiness.missing ?? [];
  const pageTemplates = Array.isArray(props.pages.templates) ? props.pages.templates.map((item) => String(item)) : [];
  const pageModules = Array.isArray(props.pages.modules) ? props.pages.modules.map((item) => String(item)) : [];
  const projectScopeDesigned = hasConfirmedProjectScope(props.scope);
  const stackDesigned = projectScopeDesigned && hasConfirmedStack(props.stack);
  const themeDesigned = stackDesigned && hasConfirmedTheme(props.theme);
  const pagesDesigned = themeDesigned && hasConfirmedPages(props.pages);
  const sourcesDesigned = pagesDesigned && hasConfirmedSources(props.sourcesMarkdown);
  const specDesigned = hasConfirmedDesignSpec(props.designFiles.designSpecMarkdown);
  const stageItems = [
    {
      key: "projectScope",
      title: "项目范围确认",
      completed: projectScopeDesigned,
      summary: joinSummary([
        typeof props.scope.projectType === "string" && props.scope.projectType.trim() ? props.scope.projectType : "未确认项目类型",
        typeof props.scope.businessType === "string" && props.scope.businessType.trim() ? props.scope.businessType : "未确认业务类型",
      ]),
    },
    {
      key: "stack",
      title: "技术栈确认",
      completed: stackDesigned,
      summary: joinSummary([
        typeof props.stack.framework === "string" && props.stack.framework.trim() ? props.stack.framework : "未确认框架",
        typeof props.stack.uiLibrary === "string" && props.stack.uiLibrary.trim() ? props.stack.uiLibrary : "未确认 UI 库",
      ]),
    },
    {
      key: "theme",
      title: "视觉与交互基线",
      completed: themeDesigned,
      summary: joinSummary([
        typeof props.theme.style === "string" && props.theme.style.trim() ? props.theme.style : "未确认风格方向",
        typeof props.theme.colorTendency === "string" && props.theme.colorTendency.trim() ? props.theme.colorTendency : "未确认色彩倾向",
        typeof props.theme.density === "string" && props.theme.density.trim() ? props.theme.density : "未确认界面密度",
      ]),
    },
    {
      key: "pages",
      title: "页面与模块确认",
      completed: pagesDesigned,
      summary: joinSummary([
        pageTemplates.length > 0 ? pageTemplates.join("、") : "未确认页面模板",
        pageModules.length > 0 ? pageModules.join("、") : "未确认业务模块",
      ]),
    },
    {
      key: "spec",
      title: "设计规格整理",
      completed: specDesigned,
      summary: specDesigned
        ? "已生成设计规格书"
        : sourcesDesigned && !missingItems.includes("sources.documentation")
          ? "资料已补充，待生成规格书"
          : "待整理资料与规格书",
    },
  ] as const;
  const nextStageKey = stageItems.find((item) => !item.completed)?.key;

  return (
    <section className="ui-designer-pane ui-designer-pane-center" data-testid="ui-designer-center-pane">
      <div className="ui-designer-pane-header">
        <div className="ui-designer-pane-label">流程</div>
        <h2 className="ui-designer-pane-title">流程 / 任务 / 清单</h2>
      </div>

      <DesignerStatusBar
        lockReason={props.designerState?.lockReason}
        missingItems={missingItems}
      />

      <div className="ui-designer-panel-scroll">
        <div className="ui-designer-section">
          <div className="ui-designer-section-header">
            <div className="ui-designer-section-title">流程 / 任务 / 清单</div>
            <div className="ui-designer-design-path-wrap">
              <span className="ui-designer-status-bar-label">设计包路径</span>
              <span className="ui-designer-design-path">
                {props.designerState?.designPackagePath ?? props.selectedWorkspace?.directoryPath ?? "未准备"}
              </span>
            </div>
          </div>
        </div>

        <div className="ui-designer-section">
          <div className="ui-designer-section-title">内置阶段</div>
          <div className="ui-designer-stage-list">
            {stageItems.map((item) => {
              const canStart = !item.completed && item.key === nextStageKey;
              return (
                <div key={item.key} className="ui-designer-stage-item">
                  <CheckCircleOutlined className={`ui-designer-stage-check${item.completed ? " is-complete" : ""}`} />
                  <div className="ui-designer-stage-item-content">
                    <div className="ui-designer-stage-item-main">
                      <span className="ui-designer-stage-item-title">{item.title}</span>
                      {item.completed
                        ? (
                            <Button
                              type="link"
                              className="ui-designer-stage-start-action"
                              onClick={() => props.queueRedesignPrompt(item.key)}
                            >
                              重新设计
                            </Button>
                          )
                        : null}
                      {canStart
                        ? (
                            <Button
                              type="link"
                              className="ui-designer-stage-start-action"
                              onClick={() => props.queueRedesignPrompt(item.key)}
                            >
                              开始设计
                            </Button>
                          )
                        : null}
                    </div>
                    <div className="ui-designer-stage-summary">
                      {item.summary === "未确认"
                        ? <Tag>未确认</Tag>
                        : item.summary}
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
