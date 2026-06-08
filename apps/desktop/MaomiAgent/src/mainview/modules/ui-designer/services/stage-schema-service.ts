import type { UiDesignerInteractionSchema } from "../components/stage-dialog";
import type { UiDesignerStageKey } from "./stage-view-model-resolver";

type RequestStageResultInput = {
  stageKey: UiDesignerStageKey;
  values: Record<string, unknown>;
};

function readText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export async function requestStageSchema(stageKey: UiDesignerStageKey): Promise<UiDesignerInteractionSchema> {
  if (stageKey === "projectScope") {
    return {
      stageKey,
      title: "开始设计",
      description: "先确认这次要做什么，再继续后续阶段。",
      submitLabel: "确认范围",
      cancelLabel: "取消",
      allowSkip: false,
      fields: [
        {
          key: "projectType",
          label: "项目形态",
          kind: "singleSelect",
          required: true,
          defaultValue: "桌面应用",
          options: [
            { label: "桌面应用", value: "桌面应用" },
            { label: "Web 应用", value: "Web 应用" },
            { label: "简单原型", value: "简单原型" },
          ],
        },
        {
          key: "businessType",
          label: "业务类型",
          kind: "text",
          required: true,
          placeholder: "例如：后台系统、工具产品、商城",
        },
      ],
    };
  }

  if (stageKey === "stack") {
    return {
      stageKey,
      title: "技术栈确认",
      description: "请确认当前阶段的技术路线和关键工程约束。",
      submitLabel: "确认技术栈",
      cancelLabel: "取消",
      allowSkip: false,
      fields: [
        {
          key: "technicalRoute",
          label: "技术路线",
          kind: "singleSelect",
          required: true,
          defaultValue: "桌面原生",
          options: [
            { label: "桌面原生", value: "桌面原生" },
            { label: "桌面壳 + Web", value: "桌面壳 + Web" },
            { label: "纯 Web", value: "纯 Web" },
          ],
        },
        {
          key: "coreFramework",
          label: "核心框架",
          kind: "text",
          required: true,
          placeholder: "例如：WPF、WinUI、React、Vue",
        },
        {
          key: "uiApproach",
          label: "UI 方案",
          kind: "text",
          required: true,
          placeholder: "例如：Fluent UI、Ant Design、原生控件",
        },
      ],
    };
  }

  return {
    stageKey,
    title: "重新整理阶段",
    description: "请补充当前阶段需要确认的信息。",
    submitLabel: "确认",
    cancelLabel: "取消",
    allowSkip: false,
    fields: [
      {
        key: "summary",
        label: "阶段结论",
        kind: "textarea",
        required: true,
        placeholder: "请输入当前阶段的结构化结论",
      },
    ],
  };
}

export async function requestStageResult(input: RequestStageResultInput) {
  if (input.stageKey === "projectScope") {
    const projectType = readText(input.values.projectType);
    const businessType = readText(input.values.businessType);
    return {
      stageKey: input.stageKey,
      summary: [projectType, businessType].filter(Boolean).join(" / ") || "未确认项目范围",
      detail: {
        projectShape: projectType,
        businessType,
      },
      artifacts: {
        scope: {
          projectType,
          businessType,
        },
      },
      nextSuggestedStage: "stack",
    };
  }

  if (input.stageKey === "stack") {
    const technicalRoute = readText(input.values.technicalRoute);
    const coreFramework = readText(input.values.coreFramework);
    const uiApproach = readText(input.values.uiApproach);
    return {
      stageKey: input.stageKey,
      summary: [technicalRoute, coreFramework, uiApproach].filter(Boolean).join(" / ") || "未确认技术路线",
      detail: {
        technicalRoute,
        coreFramework,
        uiApproach,
      },
      artifacts: {
        stack: {
          technicalRoute,
          coreFramework,
          uiApproach,
        },
      },
      nextSuggestedStage: "theme",
    };
  }

  const summary = readText(input.values.summary);
  return {
    stageKey: input.stageKey,
    summary: summary || "已更新阶段结论",
    detail: {
      summary,
    },
    artifacts: {},
    nextSuggestedStage: undefined,
  };
}
