import { describe, expect, test } from "bun:test";

import { resolveStageViewModels } from "./stage-view-model-resolver";

describe("resolveStageViewModels", () => {
  test("returns the five primary stages in design-system order", () => {
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

    expect(models.map((item) => item.stageKey)).toEqual([
      "projectScope",
      "theme",
      "patterns",
      "pages",
      "spec",
    ]);
  });

  test("marks project scope as partial instead of empty when core scope fields exist", () => {
    const models = resolveStageViewModels({
      scope: {
        projectType: "后台系统",
        businessType: "企业运营平台",
        targetPlatform: "",
        currentObjective: "先确定设计系统边界",
      },
      stack: {},
      theme: {},
      patterns: {},
      layouts: {},
      pages: {},
      designSpecMarkdown: "",
      sourcesMarkdown: "",
    });

    const scopeModel = models.find((item) => item.stageKey === "projectScope");
    expect(scopeModel?.status).toBe("partial");
    expect(scopeModel?.summary).toContain("后台系统");
    expect(scopeModel?.sections[0]?.items[0]?.value).toBe("后台系统");
  });

  test("merges theme and stack artifacts into the design-system baseline stage", () => {
    const models = resolveStageViewModels({
      scope: {},
      stack: {
        technicalRoute: "React SPA",
        runtimePlatform: "桌面浏览器优先",
        coreFramework: "React",
        uiApproach: "Ant Design",
        engineeringTools: ["Vite", "pnpm"],
      },
      theme: {
        style: "理性克制",
        colorTendency: "中性色",
        density: "紧凑",
        visualKeywords: ["秩序", "清晰"],
        interactionPrinciples: ["主任务优先"],
      },
      patterns: {},
      layouts: {},
      pages: {},
      designSpecMarkdown: "",
      sourcesMarkdown: "",
    });

    const themeModel = models.find((item) => item.stageKey === "theme");
    expect(themeModel?.title).toBe("设计系统基线");
    expect(themeModel?.summary).toContain("理性克制");
    expect(themeModel?.sections.map((item) => item.title)).toEqual([
      "视觉基线",
    ]);
    expect(themeModel?.sections[0]?.items[0]?.value).toBe("理性克制");
    expect(themeModel?.sections[0]?.items[3]?.value).toEqual(["秩序", "清晰"]);
  });

  test("treats patterns stage as a component-system checklist instead of page-only patterns", () => {
    const models = resolveStageViewModels({
      scope: {},
      stack: {},
      theme: {},
      patterns: {
        componentSpecs: {
          button: { summary: "主按钮、次按钮、危险按钮，统一高度 32/36" },
          input: { summary: "输入框默认高度 32，支持前后缀与错误态" },
          select: { summary: "单选、多选共用触发器规格" },
          table: { summary: "表头 40，高密度行 40，默认行 48" },
          form: { summary: "标签在上，错误信息就近展示" },
          modal: { summary: "默认 80vh，内容区滚动" },
          drawer: { summary: "用于检查与批量编辑" },
          tabs: { summary: "主任务切换使用 Tabs，不叠加二级面包屑" },
          tag: { summary: "状态标签使用语义色" },
          empty: { summary: "空状态只给操作入口，不写说明性废话" },
          messageNotification: { summary: "短反馈用 message，异步结果用 notification" },
        },
        formPattern: "单列表单 + 分组标题",
        tablePattern: "工具栏 + 主表格",
        modalPattern: "80vh 内容区滚动",
        feedbackPattern: "message + notification",
      },
      layouts: {},
      pages: {},
      designSpecMarkdown: "",
      sourcesMarkdown: "",
    });

    const patternsModel = models.find((item) => item.stageKey === "patterns");
    expect(patternsModel?.title).toBe("组件规范体系");
    expect(patternsModel?.status).toBe("complete");
    expect(patternsModel?.summary).toContain("已覆盖 11/11 类核心组件");
    expect(patternsModel?.sections[0]?.items[0]?.value).toBe("已定义");
    expect(patternsModel?.sections[0]?.items.at(-1)?.value).toBe("已定义");
    expect(patternsModel?.sections[1]?.items[0]?.value).toContain("主按钮");
    expect(patternsModel?.sections[1]?.items.at(-1)?.value).toContain("notification");
  });

  test("renders standardized component spec fields even when summary is omitted", () => {
    const models = resolveStageViewModels({
      scope: {},
      stack: {},
      theme: {},
      patterns: {
        componentSpecs: {
          button: {
            states: ["default", "hover", "disabled"],
            sizeTokens: ["32", "36"],
            usageNotes: "主按钮用于主操作，危险按钮仅用于删除链路",
          },
          input: {
            summary: "输入框默认高度 32，支持前后缀与错误态",
          },
          select: { summary: "单选、多选共用触发器规格" },
          table: { summary: "表头 40，高密度行 40，默认行 48" },
          form: { summary: "标签在上，错误信息就近展示" },
          modal: { summary: "默认 80vh，内容区滚动" },
          drawer: { summary: "用于检查与批量编辑" },
          tabs: { summary: "主任务切换使用 Tabs，不叠加二级面包屑" },
          tag: { summary: "状态标签使用语义色" },
          empty: { summary: "空状态只给操作入口，不写说明性废话" },
          messageNotification: { summary: "短反馈用 message，异步结果用 notification" },
        },
      },
      layouts: {},
      pages: {},
      designSpecMarkdown: "",
      sourcesMarkdown: "",
    });

    const patternsModel = models.find((item) => item.stageKey === "patterns");
    expect(patternsModel?.sections[1]?.items[0]?.value).toContain("状态：default、hover、disabled");
    expect(patternsModel?.sections[1]?.items[0]?.value).toContain("尺寸：32、36");
    expect(patternsModel?.sections[1]?.items[0]?.value).toContain("说明：主按钮用于主操作");
  });

  test("renders object arrays in pages stage as readable text", () => {
    const models = resolveStageViewModels({
      scope: {},
      stack: {},
      theme: {},
      patterns: {
        components: ["Button", "Input", "Select", "Table", "Form", "Modal", "Drawer", "Tabs", "Tag", "Empty", "Message"],
      },
      layouts: {
        navigationStructure: "左侧导航 + 顶部工具栏",
        pageSkeleton: "工具栏 + 主内容区 + 侧边信息",
        contentLayout: "主内容区双栏",
        detailStrategy: "详情抽屉",
      },
      pages: {
        previewShells: [
          { title: "设计稿预览壳", description: "用于主题和布局预览" },
        ],
        componentShowcaseShells: [
          { name: "组件展示壳", summary: "用于按钮、表单、状态组合展示" },
        ],
        exampleFlows: [
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
    expect(pagesModel?.summary).toContain("工具栏 + 主内容区 + 侧边信息");
    expect(pagesModel?.sections[1]?.items[0]?.value).toEqual([
      "设计稿预览壳 / 用于主题和布局预览",
    ]);
    expect(pagesModel?.sections[1]?.items[1]?.value).toEqual([
      "组件展示壳 / 用于按钮、表单、状态组合展示",
    ]);
    expect(pagesModel?.sections[1]?.items[2]?.value).toEqual(["列表 -> 详情"]);
    expect(pagesModel?.sections[1]?.items[3]?.value).toEqual(["筛选条件 -> 结果列表"]);
  });

  test("keeps pages stage partial until component system coverage is complete", () => {
    const models = resolveStageViewModels({
      scope: {},
      stack: {},
      theme: {},
      patterns: {},
      layouts: {
        navigationStructure: "左侧导航",
        pageSkeleton: "工具栏 + 主表格",
      },
      pages: {
        previewShells: ["设计稿预览壳"],
      },
      designSpecMarkdown: "",
      sourcesMarkdown: "",
    });

    const pagesModel = models.find((item) => item.stageKey === "pages");
    expect(pagesModel?.status).toBe("partial");
    expect(pagesModel?.sections[0]?.items[0]?.value).toBe("待先完善组件规范体系");
  });

  test("falls back to design spec layout and page sections when artifacts are empty", () => {
    const models = resolveStageViewModels({
      scope: {},
      stack: {},
      theme: {},
      patterns: {
        components: ["Button", "Input", "Select", "Table", "Form", "Modal", "Drawer", "Tabs", "Tag", "Empty", "Message"],
      },
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
    expect(pagesModel?.summary).toContain("极简");
    expect(pagesModel?.sections[0]?.items[0]?.value).toBe("组件规范体系已确认");
    expect(pagesModel?.sections[0]?.items[1]?.value).toContain("可折叠文件树");
    expect(pagesModel?.sections[0]?.items[2]?.value).toContain("极简");
    expect(pagesModel?.sections[1]?.items[0]?.value).toEqual(["编辑器主页面"]);
    expect(pagesModel?.sections[2]?.items[1]?.value).toEqual([
      "左侧边栏",
      "顶部工具栏",
      "底部状态栏",
      "mdxRenderEditComponent",
    ]);
  });
});
