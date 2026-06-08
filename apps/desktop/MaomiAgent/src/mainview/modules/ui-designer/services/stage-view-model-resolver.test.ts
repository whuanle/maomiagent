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

  test("renders object arrays in pages stage as readable text", () => {
    const models = resolveStageViewModels({
      scope: {},
      stack: {},
      theme: {},
      patterns: {},
      layouts: {},
      pages: {
        templates: [
          { title: "资源列表页", description: "工具栏 + 主表格" },
          { name: "详情弹窗", summary: "80vh 内滚动" },
        ],
        modules: [
          { label: "筛选工具栏" },
          { value: "主列表" },
        ],
        taskFlows: [
          { from: "列表", to: "详情" },
        ],
        relationships: [
          { source: "筛选条件", target: "结果列表" },
        ],
      },
      designSpecMarkdown: "",
      sourcesMarkdown: "",
    });

    const pagesModel = models.find((item) => item.stageKey === "pages");
    expect(pagesModel?.summary).toContain("资源列表页 / 工具栏 + 主表格");
    expect(pagesModel?.sections[0]?.items[0]?.value).toEqual([
      "资源列表页 / 工具栏 + 主表格",
      "详情弹窗 / 80vh 内滚动",
    ]);
    expect(pagesModel?.sections[0]?.items[2]?.value).toEqual(["列表 -> 详情"]);
    expect(pagesModel?.sections[0]?.items[3]?.value).toEqual(["筛选条件 -> 结果列表"]);
  });

  test("marks patterns stage complete when array-based component artifacts exist", () => {
    const models = resolveStageViewModels({
      scope: {},
      stack: {},
      theme: {},
      patterns: {
        groups: [
          { name: "shadcn/ui基础组件", components: ["Button", "Dialog"] },
          { name: "编辑器容器组件", components: ["EditorContainer"] },
        ],
        patterns: [
          { id: "smart-tab-bar", name: "智能标签栏" },
          { id: "mode-toggle", name: "编辑模式切换" },
        ],
      },
      layouts: {},
      pages: {},
      designSpecMarkdown: "",
      sourcesMarkdown: "",
    });

    const patternsModel = models.find((item) => item.stageKey === "patterns");
    expect(patternsModel?.status).toBe("complete");
    expect(patternsModel?.summary).toContain("shadcn/ui基础组件");
    expect(patternsModel?.summary).toContain("智能标签栏");
    expect(patternsModel?.sections[1]?.items[0]?.value).toEqual([
      "shadcn/ui基础组件",
      "编辑器容器组件",
    ]);
    expect(patternsModel?.sections[1]?.items[1]?.value).toEqual([
      "智能标签栏",
      "编辑模式切换",
    ]);
  });

  test("falls back to design spec layout section when layouts artifact is empty", () => {
    const models = resolveStageViewModels({
      scope: {},
      stack: {},
      theme: {},
      patterns: {},
      layouts: {},
      pages: {},
      designSpecMarkdown: `# UI Design Spec

##布局

- **主编辑区**: 居中沉浸模式，类似 Typora，可全宽或限制最大宽度
- **左侧边栏**: 可折叠文件树（管理本地 MD/MDX 文件）
- **顶部工具栏**: 极简，含模式切换、主题切换、文件操作
- **底部状态栏**: 当前模式、字数统计、文件路径
- **视图切换**: Monaco 源码视图与 mdxeditor 所见即所得视图共享同一主区域
`,
      sourcesMarkdown: "",
    });

    const layoutsModel = models.find((item) => item.stageKey === "layouts");
    expect(layoutsModel?.status).toBe("partial");
    expect(layoutsModel?.summary).toContain("可折叠文件树");
    expect(layoutsModel?.summary).toContain("极简");
    expect(layoutsModel?.sections[0]?.items[0]?.value).toContain("可折叠文件树");
    expect(layoutsModel?.sections[0]?.items[1]?.value).toContain("极简");
    expect(layoutsModel?.sections[0]?.items[2]?.value).toContain("居中沉浸模式");
    expect(layoutsModel?.sections[0]?.items[3]?.value).toContain("共享同一主区域");
  });

  test("falls back to design spec page and component sections when pages artifact is empty", () => {
    const models = resolveStageViewModels({
      scope: {},
      stack: {},
      theme: {},
      patterns: {},
      layouts: {},
      pages: {},
      designSpecMarkdown: `# UI Design Spec

##布局

- **主编辑区**: 居中沉浸模式，类似 Typora，可全宽或限制最大宽度
- **左侧边栏**: 可折叠文件树（管理本地 MD/MDX 文件）
- **顶部工具栏**: 极简，含模式切换、主题切换、文件操作
- **底部状态栏**: 当前模式、字数统计、文件路径
- **视图切换**: Monaco 源码视图与 mdxeditor 所见即所得视图共享同一主区域

##组件复用

- **mdxRenderEditComponent**: 复用 maomi_doc 项目的 MDX 渲染/编辑组件
`,
      sourcesMarkdown: "",
    });

    const pagesModel = models.find((item) => item.stageKey === "pages");
    expect(pagesModel?.status).toBe("partial");
    expect(pagesModel?.summary).toContain("编辑器主页面");
    expect(pagesModel?.summary).toContain("左侧边栏");
    expect(pagesModel?.sections[0]?.items[0]?.value).toEqual(["编辑器主页面"]);
    expect(pagesModel?.sections[0]?.items[1]?.value).toEqual([
      "左侧边栏",
      "顶部工具栏",
      "底部状态栏",
      "mdxRenderEditComponent",
    ]);
    expect(pagesModel?.sections[0]?.items[2]?.value).toEqual(["编辑模式切换"]);
  });
});
