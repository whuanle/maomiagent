import type { FormInteractionRequest, InteractionOption } from "#maomiagent/kernel/core";

import type { ProjectScopeFormValues } from "./project-scope-flow";

const PROJECT_TYPE_OPTIONS: readonly InteractionOption[] = [
  { value: "Web", label: "Web" },
  { value: "桌面程序", label: "桌面程序" },
  { value: "后台系统", label: "后台系统" },
  { value: "博客/内容站", label: "博客/内容站" },
  { value: "移动应用", label: "移动应用" },
];

const BUSINESS_TYPE_OPTIONS: readonly InteractionOption[] = [
  { value: "数据管理界面", label: "数据管理界面" },
  { value: "工具型工作台", label: "工具型工作台" },
  { value: "内容浏览界面", label: "内容浏览界面" },
  { value: "品牌展示界面", label: "品牌展示界面" },
  { value: "流程操作界面", label: "流程操作界面" },
];

const TARGET_PLATFORM_OPTIONS: readonly InteractionOption[] = [
  { value: "桌面浏览器优先", label: "桌面浏览器优先" },
  { value: "移动浏览器优先", label: "移动浏览器优先" },
  { value: "Windows 桌面端", label: "Windows 桌面端" },
  { value: "macOS 桌面端", label: "macOS 桌面端" },
  { value: "跨平台桌面端", label: "跨平台桌面端" },
];

export function buildProjectScopeInteractionRequest(
  values: ProjectScopeFormValues,
): FormInteractionRequest {
  return {
    kind: "form",
    title: "项目范围确认",
    description: "先确认界面设计范围与约束，提交后我会基于这些信息提出第一个最关键的问题。",
    submitLabel: "确认范围并继续",
    rejectLabel: "暂不继续",
    fields: [
      {
        key: "projectType",
        label: "项目形态",
        kind: "text",
        required: true,
        placeholder: "先点一个推荐项，也可以手动输入项目形态",
        recommendedOptions: PROJECT_TYPE_OPTIONS,
        value: values.projectType,
      },
      {
        key: "businessType",
        label: "界面场景",
        kind: "text",
        required: true,
        placeholder: "先点一个推荐项，也可以手动输入界面场景",
        recommendedOptions: BUSINESS_TYPE_OPTIONS,
        value: values.businessType,
      },
      {
        key: "targetPlatform",
        label: "目标平台",
        kind: "text",
        required: true,
        placeholder: "先点一个推荐项，也可以手动输入目标平台",
        recommendedOptions: TARGET_PLATFORM_OPTIONS,
        value: values.targetPlatform,
      },
      {
        key: "currentObjective",
        label: "当前设计目标",
        kind: "textarea",
        placeholder: "这一轮优先确认哪些 UI 结论",
        value: values.currentObjective,
      },
      {
        key: "deliverySummary",
        label: "交付范围与设计依据",
        kind: "textarea",
        placeholder: "例如：组件规范、页面骨架、设计约束、UI 约束、设计依据",
        value: values.deliverySummary,
      },
    ],
    metadata: {
      moduleId: "ui-designer",
      surface: "ui-designer",
      focusBlock: "projectScope",
      interactionKey: "projectScope",
    },
  };
}

