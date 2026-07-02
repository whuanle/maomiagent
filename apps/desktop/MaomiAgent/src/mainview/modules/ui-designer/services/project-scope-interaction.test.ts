import { describe, expect, test } from "bun:test";

import { buildProjectScopeInteractionRequest } from "./project-scope-interaction";

describe("project-scope-interaction", () => {
  test("builds a shared chat form request with recommended options and initial values", () => {
    const request = buildProjectScopeInteractionRequest({
      projectType: "桌面程序",
      businessType: "工具型工作台",
      targetPlatform: "跨平台桌面端",
      currentObjective: "先确定编辑器核心界面",
      deliverySummary: "输出第一版信息架构",
    });

    expect(request.kind).toBe("form");
    expect(request.title).toBe("项目范围确认");
    expect(request.submitLabel).toBe("确认范围并继续");
    expect(request.fields).toHaveLength(5);
    expect(request.fields[0]).toMatchObject({
      key: "projectType",
      kind: "text",
      value: "桌面程序",
    });
    expect(request.fields[0]?.recommendedOptions?.some((option) => option.value === "Web")).toBe(true);
    expect(request.fields[1]?.recommendedOptions?.some((option) => option.value === "工具型工作台")).toBe(true);
    expect(request.fields[2]?.recommendedOptions?.some((option) => option.value === "跨平台桌面端")).toBe(true);
    expect(request.fields[3]).toMatchObject({
      key: "currentObjective",
      kind: "textarea",
      value: "先确定编辑器核心界面",
    });
  });
});

