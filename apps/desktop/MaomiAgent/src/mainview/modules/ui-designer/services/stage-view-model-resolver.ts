export type UiDesignerStageKey =
  | "projectScope"
  | "stack"
  | "theme"
  | "patterns"
  | "layouts"
  | "pages"
  | "spec";

export type UiDesignerStageDetailItem = {
  label: string;
  value: string | string[] | boolean;
  kind: "text" | "tagList" | "boolean" | "paragraph";
  emphasis?: boolean;
};

export type UiDesignerStageViewModel = {
  stageKey: UiDesignerStageKey;
  title: string;
  status: "empty" | "partial" | "complete";
  summary: string;
  sections: Array<{
    key: string;
    title: string;
    items: UiDesignerStageDetailItem[];
  }>;
};

type ResolveStageViewModelsInput = {
  scope: Record<string, unknown>;
  stack: Record<string, unknown>;
  theme: Record<string, unknown>;
  patterns: Record<string, unknown>;
  layouts: Record<string, unknown>;
  pages: Record<string, unknown>;
  designSpecMarkdown: string;
  sourcesMarkdown: string;
};

function readText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readDisplayText(value: unknown): string {
  const text = readText(value);
  if (text) {
    return text;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const record = value as Record<string, unknown>;
  const directionalText = [
    [record.from, record.to],
    [record.source, record.target],
    [record.start, record.end],
  ].flatMap(([from, to]) => {
    const fromText = readDisplayText(from);
    const toText = readDisplayText(to);
    return fromText && toText ? [`${fromText} -> ${toText}`] : [];
  });
  if (directionalText.length > 0) {
    return directionalText[0];
  }

  const preferredTexts = [
    record.label,
    record.title,
    record.name,
    record.summary,
    record.value,
    record.description,
    record.text,
    record.notes,
    record.type,
    record.kind,
  ]
    .map((item) => readDisplayText(item))
    .filter(Boolean);
  if (preferredTexts.length > 0) {
    return Array.from(new Set(preferredTexts)).join(" / ");
  }

  const nestedTexts = Object.values(record)
    .flatMap((item) => Array.isArray(item) ? readList(item) : [readDisplayText(item)])
    .filter(Boolean);
  if (nestedTexts.length > 0) {
    return Array.from(new Set(nestedTexts)).join(" / ");
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function readList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => readDisplayText(item)).filter(Boolean)
    : [];
}

function readNamedList(value: unknown, fallbackKeys: string[] = []) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      const text = readDisplayText(item);
      return text ? [text] : [];
    }

    const record = item as Record<string, unknown>;
    const preferred = [
      record.name,
      record.title,
      record.label,
      ...fallbackKeys.map((key) => record[key]),
    ]
      .map((entry) => readDisplayText(entry))
      .filter(Boolean);

    if (preferred.length > 0) {
      return [preferred[0]];
    }

    const text = readDisplayText(item);
    return text ? [text] : [];
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMarkdownSection(markdown: string, title: string) {
  const normalizedMarkdown = markdown.replace(/\r\n/g, "\n");
  const headingPattern = new RegExp(`^##+\\s*${escapeRegExp(title)}\\s*$`, "m");
  const headingMatch = headingPattern.exec(normalizedMarkdown);
  if (!headingMatch) {
    return "";
  }

  const sectionStart = headingMatch.index + headingMatch[0].length;
  const remaining = normalizedMarkdown.slice(sectionStart);
  const nextHeadingMatch = /^##+\s+/m.exec(remaining);
  const section = nextHeadingMatch
    ? remaining.slice(0, nextHeadingMatch.index)
    : remaining;

  return section.trim();
}

function readMarkdownBulletValue(section: string, label: string) {
  const pattern = new RegExp(`^-\\s*\\*\\*${escapeRegExp(label)}\\*\\*\\s*[:：]\\s*(.+)$`, "m");
  const match = pattern.exec(section);
  return match?.[1]?.trim() ?? "";
}

function readMarkdownLayoutFallback(designSpecMarkdown: string) {
  const section = extractMarkdownSection(designSpecMarkdown, "布局");
  if (!section) {
    return {
      navigationStructure: "",
      pageSkeleton: "",
      contentLayout: "",
      detailStrategy: "",
      responsiveStrategy: "",
    };
  }

  const mainEditor = readMarkdownBulletValue(section, "主编辑区");
  const leftSidebar = readMarkdownBulletValue(section, "左侧边栏");
  const topToolbar = readMarkdownBulletValue(section, "顶部工具栏");
  const bottomStatusBar = readMarkdownBulletValue(section, "底部状态栏");
  const sharedView = readMarkdownBulletValue(section, "视图切换");

  return {
    navigationStructure: leftSidebar,
    pageSkeleton: [topToolbar, mainEditor, bottomStatusBar].filter(Boolean).join(" / "),
    contentLayout: mainEditor || sharedView,
    detailStrategy: sharedView,
    responsiveStrategy: "",
  };
}

function readMarkdownPagesFallback(designSpecMarkdown: string) {
  const layoutSection = extractMarkdownSection(designSpecMarkdown, "布局");
  const componentSection = extractMarkdownSection(designSpecMarkdown, "组件复用");

  const mainEditor = readMarkdownBulletValue(layoutSection, "主编辑区");
  const leftSidebar = readMarkdownBulletValue(layoutSection, "左侧边栏");
  const topToolbar = readMarkdownBulletValue(layoutSection, "顶部工具栏");
  const bottomStatusBar = readMarkdownBulletValue(layoutSection, "底部状态栏");
  const viewSwitch = readMarkdownBulletValue(layoutSection, "视图切换");

  const pageTemplates = [
    mainEditor ? "编辑器主页面" : "",
  ].filter(Boolean);

  const coreModules = [
    leftSidebar ? "左侧边栏" : "",
    topToolbar ? "顶部工具栏" : "",
    bottomStatusBar ? "底部状态栏" : "",
    ...componentSection
      .split("\n")
      .flatMap((line) => {
        const match = /^\s*-\s*\*\*([^*]+)\*\*/.exec(line.trim());
        return match?.[1]?.trim() ? [match[1].trim()] : [];
      }),
  ].filter(Boolean);

  const taskFlows = [
    viewSwitch ? "编辑模式切换" : "",
  ].filter(Boolean);

  const relationships = [
    leftSidebar && mainEditor ? "左侧边栏 -> 编辑器主页面" : "",
    topToolbar && mainEditor ? "顶部工具栏 -> 编辑器主页面" : "",
  ].filter(Boolean);

  return {
    pageTemplates,
    coreModules,
    taskFlows,
    relationships,
  };
}

function resolveStatus(confirmedCount: number, expectedCount: number): UiDesignerStageViewModel["status"] {
  if (confirmedCount <= 0) {
    return "empty";
  }

  if (confirmedCount < expectedCount) {
    return "partial";
  }

  return "complete";
}

function buildProjectScopeModel(scope: Record<string, unknown>): UiDesignerStageViewModel {
  const projectShape = readText(scope.projectType);
  const businessType = readText(scope.businessType);
  const targetPlatform = readText(scope.targetPlatform);
  const currentObjective = readText(scope.currentObjective || scope.target);
  const deliverySummary = readText(scope.deliverySummary);
  const confirmedCount = [projectShape, businessType, targetPlatform, currentObjective, deliverySummary]
    .filter(Boolean)
    .length;

  return {
    stageKey: "projectScope",
    title: "项目范围确认",
    status: resolveStatus(confirmedCount, 2),
    summary: confirmedCount > 0
      ? [projectShape, businessType, targetPlatform].filter(Boolean).join(" / ")
      : "未确认项目范围",
    sections: [
      {
        key: "scope",
        title: "项目范围",
        items: [
          { label: "项目形态", value: projectShape || "未确认", kind: "text", emphasis: true },
          { label: "业务类型", value: businessType || "未确认", kind: "text" },
          { label: "目标平台", value: targetPlatform || "未确认", kind: "text" },
          { label: "当前目标", value: currentObjective || "未确认", kind: "text" },
          { label: "交付范围", value: deliverySummary || "未确认", kind: "paragraph" },
        ],
      },
    ],
  };
}

function buildStackModel(stack: Record<string, unknown>): UiDesignerStageViewModel {
  const technicalRoute = readText(stack.technicalRoute || stack.framework);
  const runtimePlatform = readText(stack.runtimePlatform || stack.buildTool);
  const coreFramework = readText(stack.coreFramework || stack.framework);
  const uiApproach = readText(stack.uiApproach || stack.uiLibrary);
  const engineeringTools = readList(
    stack.engineeringTools ?? (stack.packageManager ? [stack.packageManager] : []),
  );
  const constraints = readList(stack.constraints ?? [
    typeof stack.responsive === "boolean" ? (stack.responsive ? "需要响应式适配" : "不需要响应式适配") : "",
    readText(stack.target),
  ].filter(Boolean));
  const confirmedCount = [technicalRoute, runtimePlatform, coreFramework, uiApproach]
    .filter(Boolean)
    .length;

  return {
    stageKey: "stack",
    title: "技术栈确认",
    status: resolveStatus(confirmedCount, 3),
    summary: confirmedCount > 0
      ? [technicalRoute, coreFramework, uiApproach].filter(Boolean).join(" / ")
      : "未确认技术路线",
    sections: [
      {
        key: "route",
        title: "技术路线",
        items: [
          { label: "技术路线", value: technicalRoute || "未确认", kind: "text" },
          { label: "运行平台", value: runtimePlatform || "未确认", kind: "text" },
          { label: "核心框架", value: coreFramework || "未确认", kind: "text", emphasis: true },
          { label: "UI 方案", value: uiApproach || "未确认", kind: "text" },
        ],
      },
      {
        key: "constraints",
        title: "工程约束",
        items: [
          { label: "工程工具", value: engineeringTools.length > 0 ? engineeringTools : ["未确认"], kind: "tagList" },
          { label: "关键约束", value: constraints.length > 0 ? constraints : ["未确认"], kind: "tagList" },
        ],
      },
    ],
  };
}

function buildThemeModel(theme: Record<string, unknown>): UiDesignerStageViewModel {
  const styleDirection = readText(theme.style);
  const colorTendency = readText(theme.colorTendency);
  const density = readText(theme.density);
  const visualKeywords = readList(theme.visualKeywords ?? theme.keywords);
  const interactionPrinciples = readList(theme.interactionPrinciples ?? theme.principles);
  const confirmedCount = [styleDirection, colorTendency, density].filter(Boolean).length;

  return {
    stageKey: "theme",
    title: "视觉与交互基线",
    status: resolveStatus(confirmedCount, 1),
    summary: confirmedCount > 0
      ? [styleDirection, colorTendency, density].filter(Boolean).join(" / ")
      : "未确认视觉方向",
    sections: [
      {
        key: "baseline",
        title: "视觉基线",
        items: [
          { label: "风格方向", value: styleDirection || "未确认", kind: "text", emphasis: true },
          { label: "色彩倾向", value: colorTendency || "未确认", kind: "text" },
          { label: "界面密度", value: density || "未确认", kind: "text" },
          { label: "视觉关键词", value: visualKeywords.length > 0 ? visualKeywords : ["未确认"], kind: "tagList" },
          { label: "交互原则", value: interactionPrinciples.length > 0 ? interactionPrinciples : ["未确认"], kind: "tagList" },
        ],
      },
    ],
  };
}

function buildPatternModel(patterns: Record<string, unknown>): UiDesignerStageViewModel {
  const formPattern = readText(patterns.formPattern);
  const filterBarPattern = readText(patterns.filterBarPattern);
  const tablePattern = readText(patterns.tablePattern);
  const modalPattern = readText(patterns.modalPattern);
  const feedbackPattern = readText(patterns.feedbackPattern);
  const componentGroups = readNamedList(patterns.groups, ["components"]);
  const patternEntries = readNamedList(patterns.patterns, ["id", "description"]);
  const confirmedCount = [
    formPattern,
    filterBarPattern,
    tablePattern,
    modalPattern,
    feedbackPattern,
    componentGroups.length > 0 ? "groups" : "",
    patternEntries.length > 0 ? "patterns" : "",
  ]
    .filter(Boolean)
    .length;
  const summaryParts = [
    formPattern,
    tablePattern,
    modalPattern,
    ...componentGroups.slice(0, 2),
    ...patternEntries.slice(0, 2),
  ].filter(Boolean);

  return {
    stageKey: "patterns",
    title: "组件模式确认",
    status: resolveStatus(confirmedCount, 1),
    summary: confirmedCount > 0
      ? summaryParts.join(" / ")
      : "未确认组件模式",
    sections: [
      {
        key: "patterns",
        title: "组件模式",
        items: [
          { label: "表单模式", value: formPattern || "未确认", kind: "text" },
          { label: "筛选区模式", value: filterBarPattern || "未确认", kind: "text" },
          { label: "表格模式", value: tablePattern || "未确认", kind: "text" },
          { label: "弹窗模式", value: modalPattern || "未确认", kind: "text" },
          { label: "反馈状态", value: feedbackPattern || "未确认", kind: "text" },
        ],
      },
      {
        key: "artifacts",
        title: "组件产物",
        items: [
          { label: "组件分组", value: componentGroups.length > 0 ? componentGroups : ["未确认"], kind: "tagList" },
          { label: "模式清单", value: patternEntries.length > 0 ? patternEntries : ["未确认"], kind: "tagList" },
        ],
      },
    ],
  };
}

function buildLayoutModel(
  layouts: Record<string, unknown>,
  designSpecMarkdown: string,
): UiDesignerStageViewModel {
  const markdownFallback = readMarkdownLayoutFallback(designSpecMarkdown);
  const explicitNavigationStructure = readText(layouts.navigationStructure);
  const explicitPageSkeleton = readText(layouts.pageSkeleton);
  const explicitContentLayout = readText(layouts.contentLayout);
  const explicitDetailStrategy = readText(layouts.detailStrategy);
  const explicitResponsiveStrategy = readText(layouts.responsiveStrategy);
  const navigationStructure = explicitNavigationStructure || markdownFallback.navigationStructure;
  const pageSkeleton = explicitPageSkeleton || markdownFallback.pageSkeleton;
  const contentLayout = explicitContentLayout || markdownFallback.contentLayout;
  const detailStrategy = explicitDetailStrategy || markdownFallback.detailStrategy;
  const responsiveStrategy = explicitResponsiveStrategy || markdownFallback.responsiveStrategy;
  const confirmedCount = [navigationStructure, pageSkeleton, contentLayout, detailStrategy, responsiveStrategy]
    .filter(Boolean)
    .length;
  const hasExplicitLayoutData = [
    explicitNavigationStructure,
    explicitPageSkeleton,
    explicitContentLayout,
    explicitDetailStrategy,
    explicitResponsiveStrategy,
  ].some(Boolean);
  const status = !hasExplicitLayoutData && confirmedCount > 0
    ? "partial"
    : resolveStatus(confirmedCount, 1);

  return {
    stageKey: "layouts",
    title: "布局设计",
    status,
    summary: confirmedCount > 0
      ? [navigationStructure, pageSkeleton].filter(Boolean).join(" / ")
      : "未确认布局方案",
    sections: [
      {
        key: "layouts",
        title: "布局策略",
        items: [
          { label: "导航结构", value: navigationStructure || "未确认", kind: "text" },
          { label: "页面骨架", value: pageSkeleton || "未确认", kind: "text" },
          { label: "内容布局", value: contentLayout || "未确认", kind: "text" },
          { label: "详情策略", value: detailStrategy || "未确认", kind: "text" },
          { label: "响应策略", value: responsiveStrategy || "未确认", kind: "text" },
        ],
      },
    ],
  };
}

function buildPagesModel(
  pages: Record<string, unknown>,
  designSpecMarkdown: string,
): UiDesignerStageViewModel {
  const markdownFallback = readMarkdownPagesFallback(designSpecMarkdown);
  const explicitPageTemplates = readList(pages.templates);
  const explicitCoreModules = readList(pages.modules);
  const explicitTaskFlows = readList(pages.taskFlows);
  const explicitRelationships = readList(pages.relationships);
  const pageTemplates = explicitPageTemplates.length > 0 ? explicitPageTemplates : markdownFallback.pageTemplates;
  const coreModules = explicitCoreModules.length > 0 ? explicitCoreModules : markdownFallback.coreModules;
  const taskFlows = explicitTaskFlows.length > 0 ? explicitTaskFlows : markdownFallback.taskFlows;
  const relationships = explicitRelationships.length > 0 ? explicitRelationships : markdownFallback.relationships;
  const confirmedCount = [pageTemplates.length, coreModules.length, taskFlows.length, relationships.length]
    .filter((count) => count > 0)
    .length;
  const hasExplicitPageData = [
    explicitPageTemplates.length,
    explicitCoreModules.length,
    explicitTaskFlows.length,
    explicitRelationships.length,
  ].some((count) => count > 0);
  const status = !hasExplicitPageData && confirmedCount > 0
    ? "partial"
    : resolveStatus(confirmedCount, 1);

  return {
    stageKey: "pages",
    title: "页面与模块确认",
    status,
    summary: confirmedCount > 0
      ? [
          pageTemplates.length > 0 ? pageTemplates.join("、") : "",
          coreModules.length > 0 ? coreModules.join("、") : "",
        ].filter(Boolean).join(" / ")
      : "未确认页面与模块",
    sections: [
      {
        key: "pages",
        title: "页面结构",
        items: [
          { label: "页面模板", value: pageTemplates.length > 0 ? pageTemplates : ["未确认"], kind: "tagList" },
          { label: "核心模块", value: coreModules.length > 0 ? coreModules : ["未确认"], kind: "tagList" },
          { label: "主任务流", value: taskFlows.length > 0 ? taskFlows : ["未确认"], kind: "tagList" },
          { label: "页面关系", value: relationships.length > 0 ? relationships : ["未确认"], kind: "tagList" },
        ],
      },
    ],
  };
}

function buildSpecModel(designSpecMarkdown: string, sourcesMarkdown: string): UiDesignerStageViewModel {
  const coveredSections = [
    designSpecMarkdown.includes("## 项目范围") ? "项目范围" : "",
    designSpecMarkdown.includes("## 技术栈") ? "技术栈" : "",
    designSpecMarkdown.includes("## 视觉与交互基线") ? "视觉与交互基线" : "",
    designSpecMarkdown.includes("## 页面与模块") ? "页面与模块" : "",
    designSpecMarkdown.includes("## 交付范围") ? "交付范围" : "",
    sourcesMarkdown.includes("http") ? "参考资料" : "",
  ].filter(Boolean);
  const missingSections = [
    coveredSections.includes("项目范围") ? "" : "项目范围",
    coveredSections.includes("技术栈") ? "" : "技术栈",
    coveredSections.includes("视觉与交互基线") ? "" : "视觉与交互基线",
    coveredSections.includes("页面与模块") ? "" : "页面与模块",
    coveredSections.includes("交付范围") ? "" : "交付范围",
    coveredSections.includes("参考资料") ? "" : "参考资料",
  ].filter(Boolean);
  const status = resolveStatus(coveredSections.length, 5);

  return {
    stageKey: "spec",
    title: "设计规格整理",
    status,
    summary: status === "empty"
      ? "未整理设计规格"
      : status === "partial"
        ? `已覆盖 ${coveredSections.length} 项`
        : "设计规格已整理",
    sections: [
      {
        key: "spec",
        title: "规格状态",
        items: [
          { label: "当前状态", value: status === "complete" ? "已完成" : status === "partial" ? "部分完成" : "未开始", kind: "text", emphasis: true },
          { label: "已覆盖章节", value: coveredSections.length > 0 ? coveredSections : ["未确认"], kind: "tagList" },
          { label: "待补充章节", value: missingSections.length > 0 ? missingSections : ["无"], kind: "tagList" },
          { label: "交付物清单", value: [designSpecMarkdown.trim() ? "设计规格书" : "", sourcesMarkdown.trim() ? "参考资料" : ""].filter(Boolean).length > 0
            ? [designSpecMarkdown.trim() ? "设计规格书" : "", sourcesMarkdown.trim() ? "参考资料" : ""].filter(Boolean)
            : ["未确认"], kind: "tagList" },
        ],
      },
    ],
  };
}

export function resolveStageViewModels(input: ResolveStageViewModelsInput): UiDesignerStageViewModel[] {
  return [
    buildProjectScopeModel(input.scope),
    buildStackModel(input.stack),
    buildThemeModel(input.theme),
    buildPatternModel(input.patterns),
    buildLayoutModel(input.layouts, input.designSpecMarkdown),
    buildPagesModel(input.pages, input.designSpecMarkdown),
    buildSpecModel(input.designSpecMarkdown, input.sourcesMarkdown),
  ];
}
