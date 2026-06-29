import { expect, test } from "bun:test";

import {
  normalizeStageResultResponse,
  normalizeStageSchemaResponse,
} from "./stage-schema-service";

test("normalizeStageSchemaResponse maps AI schema fields into renderer fields", () => {
  const schema = normalizeStageSchemaResponse({
    stageKey: "theme",
    title: "设计系统基线",
    description: "请确认主题与落地约束。",
    submitLabel: "确认基线",
    cancelLabel: "取消",
    allowSkip: false,
    fields: [
      {
        key: "style",
        label: "风格方向",
        kind: "singleSelect",
        required: true,
        placeholder: "",
        defaultText: "现代轻量",
        defaultBoolean: false,
        defaultValues: [],
        options: [
          { label: "现代轻量", value: "现代轻量" },
          { label: "理性克制", value: "理性克制" },
        ],
      },
      {
        key: "uiApproach",
        label: "UI 方案",
        kind: "text",
        required: true,
        placeholder: "例如：Ant Design、Fluent UI",
        defaultText: "",
        defaultBoolean: false,
        defaultValues: [],
        options: [],
      },
      {
        key: "constraints",
        label: "关键约束",
        kind: "multiSelect",
        required: false,
        placeholder: "",
        defaultText: "",
        defaultBoolean: false,
        defaultValues: ["桌面浏览器优先"],
        options: [
          { label: "桌面浏览器优先", value: "桌面浏览器优先" },
          { label: "优先主任务路径", value: "优先主任务路径" },
        ],
      },
    ],
  }, "theme");

  expect(schema.stageKey).toBe("theme");
  expect(schema.fields).toHaveLength(3);
  expect(schema.fields[0]).toEqual({
    key: "style",
    label: "风格方向",
    kind: "singleSelect",
    required: true,
    defaultValue: "现代轻量",
    options: [
      { label: "现代轻量", value: "现代轻量" },
      { label: "理性克制", value: "理性克制" },
    ],
  });
  expect(schema.fields[1]).toEqual({
    key: "uiApproach",
    label: "UI 方案",
    kind: "text",
    required: true,
    placeholder: "例如：Ant Design、Fluent UI",
    defaultValue: undefined,
  });
  expect(schema.fields[2]).toEqual({
    key: "constraints",
    label: "关键约束",
    kind: "multiSelect",
    required: false,
    defaultValue: ["桌面浏览器优先"],
    options: [
      { label: "桌面浏览器优先", value: "桌面浏览器优先" },
      { label: "优先主任务路径", value: "优先主任务路径" },
    ],
  });
});

test("normalizeStageResultResponse accepts theme stage results that update theme and stack together", () => {
  const result = normalizeStageResultResponse({
    stageKey: "theme",
    summary: "现代轻量 / React / Ant Design",
    detail: {
      notes: "主题基线已确认，并补齐设计落地约束。",
      highlights: ["暖中性色板", "桌面浏览器优先"],
    },
    artifacts: {
      theme: {
        format: "json",
        content: JSON.stringify({
          style: "现代轻量",
          colorTendency: "暖中性",
          density: "舒展",
        }),
      },
      stack: {
        format: "json",
        content: JSON.stringify({
          technicalRoute: "Web",
          coreFramework: "React",
          uiApproach: "Ant Design",
        }),
      },
    },
    nextSuggestedStage: "patterns",
  }, "theme");

  expect(result.summary).toBe("现代轻量 / React / Ant Design");
  expect(result.detail).toEqual({
    notes: "主题基线已确认，并补齐设计落地约束。",
    highlights: ["暖中性色板", "桌面浏览器优先"],
  });
  expect(result.artifacts).toEqual({
    theme: {
      style: "现代轻量",
      colorTendency: "暖中性",
      density: "舒展",
    },
    stack: {
      technicalRoute: "Web",
      coreFramework: "React",
      uiApproach: "Ant Design",
    },
  });
  expect(result.nextSuggestedStage).toBe("patterns");
});

test("normalizeStageResultResponse keeps patterns componentSpecs structure intact", () => {
  const result = normalizeStageResultResponse({
    stageKey: "patterns",
    summary: "已完成组件规范体系",
    detail: {
      notes: "核心组件规范已统一。",
      highlights: ["按钮与表单统一高度", "表格与弹窗约束已明确"],
    },
    artifacts: {
      patterns: {
        format: "json",
        content: JSON.stringify({
          componentSpecs: {
            button: {
              summary: "主按钮、次按钮、危险按钮统一尺寸",
              states: ["default", "hover", "disabled"],
              sizeTokens: ["32", "36"],
              usageNotes: "主按钮用于主操作",
            },
            form: { summary: "标签在上，错误信息就近展示" },
          },
          feedbackPattern: "message + notification",
        }),
      },
    },
    nextSuggestedStage: "pages",
  }, "patterns");

  expect(result.artifacts).toEqual({
    patterns: {
      componentSpecs: {
        button: {
          summary: "主按钮、次按钮、危险按钮统一尺寸",
          states: ["default", "hover", "disabled"],
          sizeTokens: ["32", "36"],
          usageNotes: "主按钮用于主操作",
        },
        form: { summary: "标签在上，错误信息就近展示" },
      },
      feedbackPattern: "message + notification",
    },
  });
});

test("normalizeStageResultResponse rejects unexpected extra artifact keys", () => {
  expect(() => normalizeStageResultResponse({
    stageKey: "pages",
    summary: "页面骨架已确认",
    detail: {
      notes: "",
      highlights: [],
    },
    artifacts: {
      pages: {
        format: "json",
        content: JSON.stringify({ templates: ["设计稿预览壳"] }),
      },
      theme: {
        format: "json",
        content: JSON.stringify({ style: "不允许" }),
      },
    },
    nextSuggestedStage: "spec",
  }, "pages")).toThrow("错误的阶段产物类型");
});

test("normalizeStageResultResponse still supports legacy single-artifact payloads", () => {
  const result = normalizeStageResultResponse({
    stageKey: "stack",
    summary: "桌面原生 / WPF / Fluent UI",
    detail: {
      notes: "当前更适合 Windows 原生桌面应用路线。",
      highlights: ["优先原生体验", "减少 Web 壳复杂度"],
    },
    artifact: {
      format: "json",
      content: JSON.stringify({
        technicalRoute: "桌面原生",
        runtimePlatform: "Windows",
        coreFramework: "WPF",
        uiApproach: "Fluent UI",
      }),
    },
    nextSuggestedStage: "theme",
  }, "stack");

  expect(result.artifacts).toEqual({
    stack: {
      technicalRoute: "桌面原生",
      runtimePlatform: "Windows",
      coreFramework: "WPF",
      uiApproach: "Fluent UI",
    },
  });
});

test("normalizeStageSchemaResponse surfaces quota errors instead of generic empty form errors", () => {
  expect(() => normalizeStageSchemaResponse({
    stageKey: "stack",
    title: "You've reached your usage limit for this period.",
    description: "Your quota will be refreshed in the next period.",
    submitLabel: "",
    cancelLabel: "",
    allowSkip: false,
    fields: [],
  }, "stack")).toThrow("当前模型额度已用尽");
});
