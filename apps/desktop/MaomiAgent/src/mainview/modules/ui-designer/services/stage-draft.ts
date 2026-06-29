import type { UiDesignerStageKey, UiDesignerStageViewModel } from "./stage-view-model-resolver";

const STAGE_GOAL_MAP: Record<UiDesignerStageKey, string> = {
  projectScope: "明确项目形态、业务类型、目标平台、当前目标与交付范围。",
  stack: "明确技术路线、运行平台、核心框架、UI 方案与工程约束。",
  theme: "明确风格方向、色彩倾向、界面密度、视觉关键词与交互原则。",
  patterns: "明确按钮、输入框、选择器、表格、表单、弹窗、抽屉、标签页、标签、空状态与消息通知等组件规范体系。",
  layouts: "明确导航结构、页面骨架、内容布局、详情策略与响应策略。",
  pages: "明确页面骨架、验证壳、核心模块、主任务流与页面关系。",
  spec: "整理设计规格书的章节覆盖、交付物与待补充内容。",
};

export function buildUiDesignerStageDraft(
  stage: Pick<UiDesignerStageViewModel, "stageKey" | "title" | "summary">,
) {
  return [
    `请继续处理「${stage.title}」阶段。`,
    `阶段目标：${STAGE_GOAL_MAP[stage.stageKey]}`,
    `当前概览：${stage.summary || "未确认"}`,
    "",
    "请先检查当前设计包里这个阶段已经明确了什么、还缺什么。",
    "如果信息不足，只提出当前阶段最关键的一个问题，不要一次问很多。",
    "如果信息已经足够，请直接给出这一阶段的结论和下一步建议。",
  ].join("\n");
}
