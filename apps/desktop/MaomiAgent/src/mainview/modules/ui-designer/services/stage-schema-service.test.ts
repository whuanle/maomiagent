import { expect, test } from "bun:test";

import {
  normalizeStageResultResponse,
  normalizeStageSchemaResponse,
} from "./stage-schema-service";

test("normalizeStageSchemaResponse maps AI schema fields into renderer fields", () => {
  const schema = normalizeStageSchemaResponse({
    stageKey: "stack",
    title: "技术栈确认",
    description: "请确认关键技术路线。",
    submitLabel: "确认技术栈",
    cancelLabel: "取消",
    allowSkip: false,
    fields: [
      {
        key: "technicalRoute",
        label: "技术路线",
        kind: "singleSelect",
        required: true,
        placeholder: "",
        defaultText: "桌面原生",
        defaultBoolean: false,
        defaultValues: [],
        options: [
          { label: "桌面原生", value: "桌面原生" },
          { label: "桌面壳 + Web", value: "桌面壳 + Web" },
        ],
      },
      {
        key: "coreFramework",
        label: "核心框架",
        kind: "text",
        required: true,
        placeholder: "例如：WPF、WinUI、React",
        defaultText: "",
        defaultBoolean: false,
        defaultValues: [],
        options: [],
      },
      {
        key: "constraints",
        label: "工程约束",
        kind: "multiSelect",
        required: false,
        placeholder: "",
        defaultText: "",
        defaultBoolean: false,
        defaultValues: ["需响应式适配"],
        options: [
          { label: "需响应式适配", value: "需响应式适配" },
          { label: "优先桌面体验", value: "优先桌面体验" },
        ],
      },
    ],
  }, "stack");

  expect(schema.stageKey).toBe("stack");
  expect(schema.fields).toHaveLength(3);
  expect(schema.fields[0]).toEqual({
    key: "technicalRoute",
    label: "技术路线",
    kind: "singleSelect",
    required: true,
    defaultValue: "桌面原生",
    options: [
      { label: "桌面原生", value: "桌面原生" },
      { label: "桌面壳 + Web", value: "桌面壳 + Web" },
    ],
  });
  expect(schema.fields[1]).toEqual({
    key: "coreFramework",
    label: "核心框架",
    kind: "text",
    required: true,
    placeholder: "例如：WPF、WinUI、React",
    defaultValue: undefined,
  });
  expect(schema.fields[2]).toEqual({
    key: "constraints",
    label: "工程约束",
    kind: "multiSelect",
    required: false,
    defaultValue: ["需响应式适配"],
    options: [
      { label: "需响应式适配", value: "需响应式适配" },
      { label: "优先桌面体验", value: "优先桌面体验" },
    ],
  });
});

test("normalizeStageResultResponse parses stage artifact payload", () => {
  const result = normalizeStageResultResponse({
    stageKey: "stack",
    summary: "桌面原生 / WPF / Fluent UI",
    detail: {
      notes: "当前更适合 Windows 原生桌面应用路线。",
      highlights: ["优先原生体验", "减少 Web 壳复杂度"],
    },
    artifact: {
      key: "stack",
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

  expect(result.summary).toBe("桌面原生 / WPF / Fluent UI");
  expect(result.detail).toEqual({
    notes: "当前更适合 Windows 原生桌面应用路线。",
    highlights: ["优先原生体验", "减少 Web 壳复杂度"],
  });
  expect(result.artifacts).toEqual({
    stack: {
      technicalRoute: "桌面原生",
      runtimePlatform: "Windows",
      coreFramework: "WPF",
      uiApproach: "Fluent UI",
    },
  });
  expect(result.nextSuggestedStage).toBe("theme");
});

test("normalizeStageResultResponse rejects mismatched artifact key", () => {
  expect(() => normalizeStageResultResponse({
    stageKey: "theme",
    summary: "现代轻量",
    detail: {
      notes: "",
      highlights: [],
    },
    artifact: {
      key: "stack",
      format: "json",
      content: "{}",
    },
    nextSuggestedStage: "",
  }, "theme")).toThrow("错误的阶段产物类型");
});
