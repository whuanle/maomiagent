import { expect, test } from "bun:test";

import type { UiDesignerInteractionSchema } from "./stage-schema-types";
import {
  buildUiDesignerStageInteractionId,
  buildUiDesignerStageInteractionRequest,
} from "./stage-interaction";

test("stage interaction request maps schema fields into shared chat form fields", () => {
  const schema: UiDesignerInteractionSchema = {
    stageKey: "stack",
    title: "技术栈确认",
    description: "请确认关键技术路线。",
    submitLabel: "确认技术栈",
    cancelLabel: "取消",
    allowSkip: false,
    fields: [
      {
        key: "route",
        label: "技术路线",
        kind: "singleSelect",
        required: true,
        options: [{ label: "桌面壳 + Web", value: "桌面壳 + Web" }],
        defaultValue: "桌面壳 + Web",
      },
      {
        key: "framework",
        label: "核心框架",
        kind: "text",
        required: true,
        placeholder: "例如 React",
        defaultValue: "React",
      },
      {
        key: "constraints",
        label: "工程约束",
        kind: "multiSelect",
        required: false,
        options: [{ label: "优先桌面体验", value: "优先桌面体验" }],
        defaultValue: ["优先桌面体验"],
      },
      {
        key: "confirmed",
        label: "是否确认",
        kind: "boolean",
        required: false,
        defaultValue: true,
      },
    ],
  };

  const request = buildUiDesignerStageInteractionRequest(schema);

  expect(request.kind).toBe("form");
  expect(request.title).toBe("技术栈确认");
  expect(request.submitLabel).toBe("确认技术栈");
  expect(request.rejectLabel).toBe("取消");
  expect(request.fields).toEqual([
    {
      key: "route",
      label: "技术路线",
      kind: "select",
      required: true,
      value: "桌面壳 + Web",
      options: [{ label: "桌面壳 + Web", value: "桌面壳 + Web" }],
    },
    {
      key: "framework",
      label: "核心框架",
      kind: "text",
      required: true,
      placeholder: "例如 React",
      value: "React",
    },
    {
      key: "constraints",
      label: "工程约束",
      kind: "multiselect",
      required: false,
      value: ["优先桌面体验"],
      options: [{ label: "优先桌面体验", value: "优先桌面体验" }],
    },
    {
      key: "confirmed",
      label: "是否确认",
      kind: "boolean",
      required: false,
      value: true,
    },
  ]);
  expect(buildUiDesignerStageInteractionId("stack")).toBe("ui-designer:stage:stack");
});
