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
  { value: "后台管理系统", label: "后台管理系统" },
  { value: "工具产品", label: "工具产品" },
  { value: "内容站", label: "内容站" },
  { value: "企业官网", label: "企业官网" },
  { value: "电商业务", label: "电商业务" },
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
    description: "先确认项目范围，提交后我会基于这些信息提出第一个最关键的问题。",
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
        label: "业务类型",
        kind: "text",
        required: true,
        placeholder: "先点一个推荐项，也可以手动输入业务类型",
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
        label: "当前目标",
        kind: "textarea",
        placeholder: "这一轮想先确认什么",
        value: values.currentObjective,
      },
      {
        key: "deliverySummary",
        label: "交付范围",
        kind: "textarea",
        placeholder: "希望这一步最后产出什么",
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

