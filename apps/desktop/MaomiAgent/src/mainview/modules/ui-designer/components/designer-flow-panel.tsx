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
  | "patterns"
  | "pages"
  | "queueRedesignPrompt"
  | "layouts"
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

function summarizeSelectedSections(value: unknown) {
  return Array.isArray(value) && value.length > 0
    ? value.map((item) => String(item)).join("、")
    : "未确认";
}

function hasConfirmedStack(stack: Record<string, unknown>) {
  return typeof stack.framework === "string"
    && stack.framework.trim().length > 0
    && typeof stack.uiLibrary === "string"
    && stack.uiLibrary.trim().length > 0;
}

function hasConfirmedScope(scope: Record<string, unknown>) {
  return Array.isArray(scope.selectedSections) && scope.selectedSections.length > 0;
}

function hasConfirmedTheme(theme: Record<string, unknown>) {
  return typeof theme.style === "string" && theme.style.trim().length > 0;
}

function hasConfirmedPatterns(patterns: Record<string, unknown>) {
  return Array.isArray(patterns.groups) && patterns.groups.length > 0;
}

function hasConfirmedLayouts(layouts: Record<string, unknown>) {
  return Array.isArray(layouts.items) && layouts.items.length > 0;
}

function hasConfirmedPages(pages: Record<string, unknown>) {
  return Array.isArray(pages.templates) && pages.templates.length > 0;
}

function hasConfirmedSources(sourcesMarkdown: string) {
  return sourcesMarkdown.includes("http");
}

export function DesignerFlowPanel(props: DesignerFlowPanelProps) {
  const missingItems = props.designerState?.readiness.missing ?? [];
  const pageTemplates = Array.isArray(props.pages.templates) ? props.pages.templates.map((item) => String(item)) : [];
  const patternGroups = Array.isArray(props.patterns.groups) ? props.patterns.groups.map((item) => String(item)) : [];
  const layoutSource = props.layouts["items"];
  const layoutItems = Array.isArray(layoutSource) ? layoutSource.map((item) => String(item)) : [];
  const stackDesigned = hasConfirmedStack(props.stack);
  const scopeDesigned = stackDesigned && hasConfirmedScope(props.scope);
  const themeDesigned = scopeDesigned && hasConfirmedTheme(props.theme);
  const patternsDesigned = themeDesigned && hasConfirmedPatterns(props.patterns);
  const layoutsDesigned = patternsDesigned && hasConfirmedLayouts(props.layouts);
  const pagesDesigned = layoutsDesigned && hasConfirmedPages(props.pages);
  const sourcesDesigned = stackDesigned && hasConfirmedSources(props.sourcesMarkdown);
  const specDesigned = Boolean(props.designerState?.hasDesignSpec);
  const i18nDesigned = typeof props.stack.i18n === "boolean" || props.sourcesMarkdown.includes("i18n");
  const stageItems = [
    { key: "stack", title: "技术栈确认", completed: stackDesigned, canStart: !stackDesigned },
    { key: "scope", title: "范围确认", completed: scopeDesigned, canStart: false },
    { key: "theme", title: "主题与设计系统", completed: themeDesigned, canStart: false },
    { key: "patterns", title: "组件模式", completed: patternsDesigned, canStart: false },
    { key: "layouts", title: "布局设计", completed: layoutsDesigned, canStart: false },
    { key: "pages", title: "页面模板", completed: pagesDesigned, canStart: false },
    { key: "sources", title: "资料补充", completed: sourcesDesigned && !missingItems.includes("sources.documentation"), canStart: false },
  ] as const;
  const summaryBlocks = [
    {
      key: "stack",
      title: "技术栈",
      designed: stackDesigned,
      summary: joinSummary([
        typeof props.stack.framework === "string" && props.stack.framework.trim() ? props.stack.framework : "未确认框架",
        typeof props.stack.uiLibrary === "string" && props.stack.uiLibrary.trim() ? props.stack.uiLibrary : "未确认 UI 库",
      ]),
    },
    {
      key: "scope",
      title: "范围清单",
      designed: scopeDesigned,
      summary: summarizeSelectedSections(props.scope.selectedSections),
    },
    {
      key: "theme",
      title: "主题",
      designed: themeDesigned,
      summary: typeof props.theme.style === "string" && props.theme.style.trim() ? props.theme.style : "未确认",
    },
    {
      key: "patterns",
      title: "组件模式",
      designed: patternsDesigned,
      summary: patternGroups.length > 0 ? patternGroups.join("、") : "未确认",
    },
    {
      key: "layouts",
      title: "布局",
      designed: layoutsDesigned,
      summary: layoutItems.length > 0 ? layoutItems.join("、") : "未确认",
    },
    {
      key: "pages",
      title: "页面模板",
      designed: pagesDesigned,
      summary: pageTemplates.length > 0 ? pageTemplates.join("、") : "未确认",
    },
    {
      key: "i18n",
      title: "多语言",
      designed: i18nDesigned,
      summary: i18nDesigned ? "已确认" : "未确认",
    },
    {
      key: "spec",
      title: "设计规格书",
      designed: specDesigned,
      summary: specDesigned ? "已生成规格书" : "未生成规格书",
    },
  ];

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
              return (
                <div key={item.key} className="ui-designer-stage-item">
                  <CheckCircleOutlined className={`ui-designer-stage-check${item.completed ? " is-complete" : ""}`} />
                  <span className="ui-designer-stage-item-title">{item.title}</span>
                  {item.canStart
                    ? (
                        <Button
                          type="link"
                          className="ui-designer-stage-start-action"
                          onClick={() => props.queueRedesignPrompt("stack")}
                        >
                          开始设计
                        </Button>
                      )
                    : null}
                </div>
              );
            })}
          </div>
        </div>

        {summaryBlocks.map((block) => (
          <div key={block.key} className="ui-designer-section ui-designer-summary-block">
            <div className="ui-designer-section-header">
              <div className="ui-designer-section-title">{block.title}</div>
              <Button
                type="link"
                disabled={!block.designed}
                onClick={() => props.queueRedesignPrompt(block.key)}
              >
                重新设计
              </Button>
            </div>
            <div className="ui-designer-summary-block-body">
              {block.summary === "未确认"
                ? <Tag>未确认</Tag>
                : block.summary}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
