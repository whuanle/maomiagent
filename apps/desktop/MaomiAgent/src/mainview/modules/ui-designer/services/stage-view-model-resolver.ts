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

type StageStatus = UiDesignerStageViewModel["status"];

const STATUS_RANK: Record<StageStatus, number> = {
  empty: 0,
  partial: 1,
  complete: 2,
};

const MARKDOWN_STAGE_STATUS_ALIASES: Record<UiDesignerStageKey, string[]> = {
  projectScope: ["projectscope", "project scope", "scope", "项目范围", "范围"],
  stack: ["stack", "技术栈"],
  theme: ["theme", "主题", "设计系统基线", "视觉基线"],
  patterns: ["patterns", "组件规范", "组件规范体系"],
  layouts: ["layouts", "布局", "页面布局"],
  pages: ["pages", "页面骨架", "页面骨架与验证壳", "验证壳", "preview-app", "preview app"],
  spec: ["spec", "design-spec", "design spec", "设计规格", "设计规格整理"],
};

const STAGE_HINT_TARGETS: Array<{ hintKey: UiDesignerStageKey; targetKey: UiDesignerStageKey }> = [
  { hintKey: "projectScope", targetKey: "projectScope" },
  { hintKey: "stack", targetKey: "theme" },
  { hintKey: "theme", targetKey: "theme" },
  { hintKey: "patterns", targetKey: "patterns" },
  { hintKey: "layouts", targetKey: "pages" },
  { hintKey: "pages", targetKey: "pages" },
  { hintKey: "spec", targetKey: "spec" },
];

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
  const section = extractMarkdownSection(designSpecMarkdown, "布局")
    || extractMarkdownSection(designSpecMarkdown, "页面骨架与验证壳");
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
  const layoutSection = extractMarkdownSection(designSpecMarkdown, "布局")
    || extractMarkdownSection(designSpecMarkdown, "页面骨架与验证壳");
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

function normalizeComparableText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function readStageStatusHintFromLine(line: string): StageStatus | undefined {
  if (!line.trim()) {
    return undefined;
  }

  const normalized = normalizeComparableText(line);
  if (/(✅|☑️|✔️|\byes\b|\bdone\b|\bcomplete\b|\bcompleted\b|已完成|完成|通过|已确认)/i.test(normalized)) {
    return "complete";
  }

  if (/(⏳|🟡|⚠️|\bpartial\b|\bin progress\b|进行中|部分|待完善|继续完善)/i.test(normalized)) {
    return "partial";
  }

  if (/(❌|⬜|◻|\btodo\b|\bpending\b|\bnot\s+started\b|未确认|未完成|未开始|待补充)/i.test(normalized)) {
    return "empty";
  }

  return undefined;
}

function readMarkdownStageStatusHints(designSpecMarkdown: string): Partial<Record<UiDesignerStageKey, StageStatus>> {
  const hints: Partial<Record<UiDesignerStageKey, StageStatus>> = {};
  const lines = designSpecMarkdown.replace(/\r\n?/g, "\n").split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const statusHint = readStageStatusHintFromLine(line);
    if (!statusHint) {
      continue;
    }

    const normalizedLine = normalizeComparableText(line);
    for (const [stageKey, aliases] of Object.entries(MARKDOWN_STAGE_STATUS_ALIASES) as Array<[UiDesignerStageKey, string[]]>) {
      const matchesAlias = aliases.some((alias) => {
        const normalizedAlias = normalizeComparableText(alias);
        return normalizedLine.includes(normalizedAlias);
      });
      if (!matchesAlias) {
        continue;
      }

      const current = hints[stageKey];
      if (!current || STATUS_RANK[statusHint] > STATUS_RANK[current]) {
        hints[stageKey] = statusHint;
      }
    }
  }

  return hints;
}

function applyStageStatusHints(
  models: UiDesignerStageViewModel[],
  hints: Partial<Record<UiDesignerStageKey, StageStatus>>,
): UiDesignerStageViewModel[] {
  if (Object.keys(hints).length === 0) {
    return models;
  }

  const mergedHints: Partial<Record<UiDesignerStageKey, StageStatus>> = {};
  for (const { hintKey, targetKey } of STAGE_HINT_TARGETS) {
    const hint = hints[hintKey];
    if (!hint) {
      continue;
    }

    const current = mergedHints[targetKey];
    if (!current || STATUS_RANK[hint] > STATUS_RANK[current]) {
      mergedHints[targetKey] = hint;
    }
  }

  return models.map((model) => {
    const hint = mergedHints[model.stageKey];
    if (!hint || STATUS_RANK[hint] <= STATUS_RANK[model.status]) {
      return model;
    }

    const summary = model.summary.startsWith("未确认") || model.summary.startsWith("未整理")
      ? (hint === "complete"
          ? `${model.title}已确认`
          : "部分已确认")
      : model.summary;

    return {
      ...model,
      status: hint,
      summary,
    };
  });
}

const REQUIRED_COMPONENT_SPECS = [
  { key: "button", label: "按钮", aliases: ["按钮", "button"] },
  { key: "input", label: "输入框", aliases: ["输入框", "input"] },
  { key: "select", label: "选择器", aliases: ["选择器", "select", "selector"] },
  { key: "table", label: "表格", aliases: ["表格", "table"] },
  { key: "form", label: "表单", aliases: ["表单", "form"] },
  { key: "modal", label: "弹窗", aliases: ["弹窗", "modal", "dialog"] },
  { key: "drawer", label: "抽屉", aliases: ["抽屉", "drawer"] },
  { key: "tabs", label: "标签页", aliases: ["标签页", "tabs", "tab"] },
  { key: "tag", label: "标签", aliases: ["标签", "tag"] },
  { key: "empty", label: "空状态", aliases: ["空状态", "empty"] },
  { key: "messageNotification", label: "消息通知", aliases: ["消息通知", "消息", "通知", "message", "notification", "messageNotification"] },
] as const;

function readComponentSpecSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return readDisplayText(value);
  }

  const record = value as Record<string, unknown>;
  const summary = readText(record.summary);
  if (summary) {
    return summary;
  }

  const states = readList(record.states);
  const sizeTokens = readList(record.sizeTokens);
  const usageNotes = readText(record.usageNotes);

  return [
    states.length > 0 ? `状态：${states.join("、")}` : "",
    sizeTokens.length > 0 ? `尺寸：${sizeTokens.join("、")}` : "",
    usageNotes ? `说明：${usageNotes}` : "",
  ].filter(Boolean).join(" / ");
}

function normalizePatternComponentNames(patterns: Record<string, unknown>) {
  const componentSpecs = patterns.componentSpecs && typeof patterns.componentSpecs === "object" && !Array.isArray(patterns.componentSpecs)
    ? patterns.componentSpecs as Record<string, unknown>
    : {};
  const names = new Set<string>();

  for (const name of Object.keys(componentSpecs)) {
    names.add(name.trim().toLowerCase());
  }

  for (const name of readList(patterns.components)) {
    names.add(name.trim().toLowerCase());
  }

  for (const name of readNamedList(patterns.groups, ["components"])) {
    names.add(name.trim().toLowerCase());
  }

  for (const name of readNamedList(patterns.patterns, ["id", "description"])) {
    names.add(name.trim().toLowerCase());
  }

  return names;
}

function buildProjectScopeModel(scope: Record<string, unknown>): UiDesignerStageViewModel {
  const projectShape = readText(scope.projectType);
  const businessType = readText(scope.businessType);
  const targetPlatform = readText(scope.targetPlatform);
  const currentObjective = readText(scope.currentObjective || scope.target);
  const deliverySummary = readText(scope.deliverySummary);
  const coreConfirmedCount = [projectShape, businessType, targetPlatform].filter(Boolean).length;
  const detailConfirmedCount = [currentObjective, deliverySummary].filter(Boolean).length;
  const status = coreConfirmedCount === 0
    ? "empty"
    : coreConfirmedCount < 3 || detailConfirmedCount < 2
      ? "partial"
      : "complete";

  return {
    stageKey: "projectScope",
    title: "项目范围确认",
    status,
    summary: coreConfirmedCount > 0
      ? [projectShape, businessType, targetPlatform].filter(Boolean).join(" / ")
      : "未确认项目范围",
    sections: [
      {
        key: "scope",
        title: "项目范围",
        items: [
          { label: "项目形态", value: projectShape || "未确认", kind: "text", emphasis: true },
          { label: "界面场景", value: businessType || "未确认", kind: "text" },
          { label: "目标平台", value: targetPlatform || "未确认", kind: "text" },
          { label: "当前设计目标", value: currentObjective || "未确认", kind: "text" },
          { label: "交付范围与设计依据", value: deliverySummary || "未确认", kind: "paragraph" },
        ],
      },
    ],
  };
}

function buildThemeModel(
  theme: Record<string, unknown>,
  stack: Record<string, unknown>,
): UiDesignerStageViewModel {
  const styleDirection = readText(theme.style);
  const colorTendency = readText(theme.colorTendency);
  const density = readText(theme.density);
  const visualKeywords = readList(theme.visualKeywords ?? theme.keywords);
  const interactionPrinciples = readList(theme.interactionPrinciples ?? theme.principles);
  const confirmedCount = [
    styleDirection,
    colorTendency,
    density,
  ].filter(Boolean).length;

  return {
    stageKey: "theme",
    title: "设计系统基线",
    status: resolveStatus(confirmedCount, 1),
    summary: confirmedCount > 0
      ? [styleDirection, colorTendency, density].filter(Boolean).join(" / ")
      : "未确认设计系统基线",
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
  const componentSpecs = patterns.componentSpecs && typeof patterns.componentSpecs === "object" && !Array.isArray(patterns.componentSpecs)
    ? patterns.componentSpecs as Record<string, unknown>
    : {};
  const formPattern = readText(patterns.formPattern);
  const filterBarPattern = readText(patterns.filterBarPattern);
  const tablePattern = readText(patterns.tablePattern);
  const modalPattern = readText(patterns.modalPattern);
  const feedbackPattern = readText(patterns.feedbackPattern);
  const componentGroups = readNamedList(patterns.groups, ["components"]);
  const patternEntries = readNamedList(patterns.patterns, ["id", "description"]);
  const componentNames = normalizePatternComponentNames(patterns);
  const componentCoverageItems = REQUIRED_COMPONENT_SPECS.map((item) => ({
    label: item.label,
    value: item.aliases.some((alias) => componentNames.has(alias.toLowerCase()))
      ? "已定义"
      : "待补充",
    kind: "text" as const,
  }));
  const componentSpecItems = REQUIRED_COMPONENT_SPECS.map((item) => {
    const componentSpec = Object.entries(componentSpecs).find(([key]) =>
      item.aliases.some((alias) => key.toLowerCase() === alias.toLowerCase()),
    )?.[1];
    return {
      label: item.label,
      value: readComponentSpecSummary(componentSpec) || "待补充",
      kind: "paragraph" as const,
    };
  });
  const componentCoverageCount = componentCoverageItems.filter((item) => item.value === "已定义").length;
  const baseConfirmedCount = [
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
  const confirmedCount = baseConfirmedCount + componentCoverageCount;
  const summaryParts = [
    `已覆盖 ${componentCoverageCount}/${REQUIRED_COMPONENT_SPECS.length} 类核心组件`,
    formPattern,
    tablePattern,
    modalPattern,
    ...componentGroups.slice(0, 2),
    ...patternEntries.slice(0, 2),
  ].filter(Boolean);
  const status = confirmedCount <= 0
    ? "empty"
    : componentCoverageCount < REQUIRED_COMPONENT_SPECS.length
      ? "partial"
      : "complete";

  return {
    stageKey: "patterns",
    title: "组件规范体系",
    status,
    summary: confirmedCount > 0
      ? summaryParts.join(" / ")
      : "未确认组件规范体系",
    sections: [
      {
        key: "coverage",
        title: "核心组件覆盖",
        items: componentCoverageItems,
      },
      {
        key: "component-specs",
        title: "核心组件规范",
        items: componentSpecItems,
      },
      {
        key: "patterns",
        title: "组件与布局模式",
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

function buildPagesModel(
  layouts: Record<string, unknown>,
  pages: Record<string, unknown>,
  patternsStatus: UiDesignerStageViewModel["status"],
  designSpecMarkdown: string,
): UiDesignerStageViewModel {
  const layoutFallback = readMarkdownLayoutFallback(designSpecMarkdown);
  const markdownFallback = readMarkdownPagesFallback(designSpecMarkdown);
  const explicitNavigationStructure = readText(layouts.navigationStructure);
  const explicitPageSkeleton = readText(layouts.pageSkeleton);
  const explicitContentLayout = readText(layouts.contentLayout);
  const explicitDetailStrategy = readText(layouts.detailStrategy);
  const navigationStructure = explicitNavigationStructure || layoutFallback.navigationStructure;
  const pageSkeleton = explicitPageSkeleton || layoutFallback.pageSkeleton;
  const contentLayout = explicitContentLayout || layoutFallback.contentLayout;
  const detailStrategy = explicitDetailStrategy || layoutFallback.detailStrategy;
  const explicitPageTemplates = readList(pages.templates);
  const explicitCoreModules = readList(pages.modules);
  const explicitTaskFlows = readList(pages.exampleFlows ?? pages.taskFlows);
  const explicitRelationships = readList(pages.relationships);
  const explicitPreviewShells = readList(pages.previewShells);
  const explicitComponentShowcaseShells = readList(pages.componentShowcaseShells);
  const pageTemplates = explicitPageTemplates.length > 0 ? explicitPageTemplates : markdownFallback.pageTemplates;
  const coreModules = explicitCoreModules.length > 0 ? explicitCoreModules : markdownFallback.coreModules;
  const taskFlows = explicitTaskFlows.length > 0 ? explicitTaskFlows : markdownFallback.taskFlows;
  const relationships = explicitRelationships.length > 0 ? explicitRelationships : markdownFallback.relationships;
  const previewShells = explicitPreviewShells.length > 0 ? explicitPreviewShells : pageTemplates.slice(0, 1);
  const componentShowcaseShells = explicitComponentShowcaseShells.length > 0
    ? explicitComponentShowcaseShells
    : coreModules.length > 0 ? ["组件展示壳"] : [];
  const confirmedCount = [
    navigationStructure,
    pageSkeleton,
    contentLayout,
    detailStrategy,
    previewShells.length > 0 ? "previewShells" : "",
    componentShowcaseShells.length > 0 ? "componentShowcaseShells" : "",
    taskFlows.length > 0 ? "taskFlows" : "",
    relationships.length > 0 ? "relationships" : "",
  ].filter(Boolean).length;
  const hasExplicitPageData = [
    explicitPageTemplates.length,
    explicitCoreModules.length,
    explicitTaskFlows.length,
    explicitRelationships.length,
    explicitPreviewShells.length,
    explicitComponentShowcaseShells.length,
  ].some((count) => count > 0);
  const hasExplicitLayoutData = [
    explicitNavigationStructure,
    explicitPageSkeleton,
    explicitContentLayout,
    explicitDetailStrategy,
  ].some(Boolean);
  const resolvedStatus = !hasExplicitPageData && !hasExplicitLayoutData && confirmedCount > 0
    ? "partial"
    : resolveStatus(confirmedCount, 1);
  const status = patternsStatus !== "complete" && resolvedStatus !== "empty"
    ? "partial"
    : resolvedStatus;

  return {
    stageKey: "pages",
    title: "页面骨架与验证壳",
    status,
    summary: confirmedCount > 0
      ? [
          pageSkeleton,
          navigationStructure,
        ].filter(Boolean).join(" / ")
      : "未确认页面骨架与验证壳",
    sections: [
      {
        key: "structure",
        title: "页面骨架",
        items: [
          { label: "前置条件", value: patternsStatus === "complete" ? "组件规范体系已确认" : "待先完善组件规范体系", kind: "text", emphasis: patternsStatus !== "complete" },
          { label: "导航结构", value: navigationStructure || "未确认", kind: "text" },
          { label: "页面骨架", value: pageSkeleton || "未确认", kind: "text" },
          { label: "内容布局", value: contentLayout || "未确认", kind: "text" },
          { label: "详情策略", value: detailStrategy || "未确认", kind: "text" },
        ],
      },
      {
        key: "shells",
        title: "验证壳",
        items: [
          { label: "设计稿预览壳", value: previewShells.length > 0 ? previewShells : ["未确认"], kind: "tagList" },
          { label: "组件展示壳", value: componentShowcaseShells.length > 0 ? componentShowcaseShells : ["未确认"], kind: "tagList" },
          { label: "最小页面演示壳", value: taskFlows.length > 0 ? taskFlows : ["未确认"], kind: "tagList" },
          { label: "页面关系", value: relationships.length > 0 ? relationships : ["未确认"], kind: "tagList" },
        ],
      },
      {
        key: "modules",
        title: "支撑模块",
        items: [
          { label: "页面模板", value: pageTemplates.length > 0 ? pageTemplates : ["未确认"], kind: "tagList" },
          { label: "核心模块", value: coreModules.length > 0 ? coreModules : ["未确认"], kind: "tagList" },
        ],
      },
    ],
  };
}

function buildSpecModel(designSpecMarkdown: string, sourcesMarkdown: string): UiDesignerStageViewModel {
  const coveredSections = [
    designSpecMarkdown.includes("## 项目范围") ? "项目范围" : "",
    designSpecMarkdown.includes("## 设计系统基线")
      || designSpecMarkdown.includes("## 技术栈")
      || designSpecMarkdown.includes("## 视觉与交互基线")
      ? "设计系统基线"
      : "",
    designSpecMarkdown.includes("## 组件规范体系")
      || designSpecMarkdown.includes("## 组件与交互模式")
      || designSpecMarkdown.includes("## 组件模式确认")
      ? "组件规范体系"
      : "",
    designSpecMarkdown.includes("## 页面骨架与验证壳")
      || designSpecMarkdown.includes("## 页面与模块")
      ? "页面骨架与验证壳"
      : "",
    designSpecMarkdown.includes("## 交付范围") ? "交付范围" : "",
    sourcesMarkdown.includes("http") ? "参考资料" : "",
  ].filter(Boolean);
  const missingSections = [
    coveredSections.includes("项目范围") ? "" : "项目范围",
    coveredSections.includes("设计系统基线") ? "" : "设计系统基线",
    coveredSections.includes("组件规范体系") ? "" : "组件规范体系",
    coveredSections.includes("页面骨架与验证壳") ? "" : "页面骨架与验证壳",
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
  const projectScopeModel = buildProjectScopeModel(input.scope);
  const themeModel = buildThemeModel(input.theme, input.stack);
  const patternModel = buildPatternModel(input.patterns);
  const pagesModel = buildPagesModel(input.layouts, input.pages, patternModel.status, input.designSpecMarkdown);
  const specModel = buildSpecModel(input.designSpecMarkdown, input.sourcesMarkdown);

  const models = [
    projectScopeModel,
    themeModel,
    patternModel,
    pagesModel,
    specModel,
  ];

  return applyStageStatusHints(models, readMarkdownStageStatusHints(input.designSpecMarkdown));
}
