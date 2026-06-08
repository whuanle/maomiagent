import { describe, expect, test } from "bun:test";

import { resolveStageViewModels } from "./stage-view-model-resolver";

describe("resolveStageViewModels", () => {
  test("returns empty stack detail when no stack data is present", () => {
    const models = resolveStageViewModels({
      scope: {},
      stack: {},
      theme: {},
      patterns: {},
      layouts: {},
      pages: {},
      designSpecMarkdown: "",
      sourcesMarkdown: "",
    });

    const stackModel = models.find((item) => item.stageKey === "stack");
    expect(stackModel?.status).toBe("empty");
    expect(stackModel?.summary).toBe("未确认技术路线");
    expect(stackModel?.sections[0]?.items[0]).toEqual({
      label: "技术路线",
      value: "未确认",
      kind: "text",
    });
  });

  test("parses complete stack data into summary and detail sections", () => {
    const models = resolveStageViewModels({
      scope: {
        projectType: "桌面应用",
        businessType: "工具产品",
      },
      stack: {
        technicalRoute: "桌面原生",
        runtimePlatform: "Windows",
        coreFramework: "WPF",
        uiApproach: "Fluent UI",
        engineeringTools: ["dotnet", "MSBuild"],
        constraints: ["不做响应式", "优先直接开发"],
      },
      theme: {},
      patterns: {},
      layouts: {},
      pages: {},
      designSpecMarkdown: "",
      sourcesMarkdown: "",
    });

    const stackModel = models.find((item) => item.stageKey === "stack");
    expect(stackModel?.status).toBe("complete");
    expect(stackModel?.summary).toBe("桌面原生 / WPF / Fluent UI");
    expect(stackModel?.sections.map((item) => item.title)).toEqual([
      "技术路线",
      "工程约束",
    ]);
  });
});
