export type FeishuDocsTagTone = "media" | "callout" | "embed" | "sync" | "generic"

export type FeishuDocsTagPropSpec = {
  name: string
  label: string
  description?: string
}

export type FeishuDocsTagSpec = {
  name: string
  kind: "flow" | "text"
  label: string
  description: string
  tone: FeishuDocsTagTone
  hasChildren: boolean
  props: FeishuDocsTagPropSpec[]
}

export function normalizeFeishuDocsTagName(name: string | null | undefined): string {
  if (!name) {
    return ""
  }
  const normalized = name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()

  if (normalized.startsWith("feishu-") && normalized.length > "feishu-".length) {
    return normalized.slice("feishu-".length)
  }

  return normalized
}

export const FEISHU_DOCS_TAG_SPECS: FeishuDocsTagSpec[] = [
  {
    name: "image",
    kind: "flow",
    label: "图片块",
    description: "飞书图片资源块。通常保留 token、尺寸和对齐方式。",
    tone: "media",
    hasChildren: false,
    props: [
      { name: "token", label: "资源 Token", description: "飞书图片资源标识" },
      { name: "width", label: "宽度" },
      { name: "height", label: "高度" },
      { name: "align", label: "对齐方式" },
    ],
  },
  {
    name: "file",
    kind: "flow",
    label: "文件块",
    description: "飞书附件或文件资源块。Push 时需要保留资源引用关系。",
    tone: "media",
    hasChildren: false,
    props: [
      { name: "token", label: "资源 Token" },
      { name: "name", label: "文件名" },
      { name: "type", label: "文件类型" },
    ],
  },
  {
    name: "iframe",
    kind: "flow",
    label: "嵌入网页",
    description: "飞书网页嵌入块。本地预览优先展示嵌入内容，编辑时保留链接和标题属性。",
    tone: "embed",
    hasChildren: false,
    props: [
      { name: "src", label: "嵌入地址" },
      { name: "url", label: "链接地址" },
      { name: "title", label: "标题" },
      { name: "height", label: "高度" },
    ],
  },
  {
    name: "callout",
    kind: "flow",
    label: "提示块",
    description: "飞书提示 / Callout 块。支持子内容，并保留 emoji 与色彩属性。",
    tone: "callout",
    hasChildren: true,
    props: [
      { name: "emoji", label: "图标 Emoji" },
      { name: "background-color", label: "背景色" },
      { name: "border-color", label: "边框色" },
    ],
  },
  {
    name: "grid",
    kind: "flow",
    label: "分栏块",
    description: "飞书分栏容器。预览模式按多栏布局展示，编辑时保留结构顺序。",
    tone: "embed",
    hasChildren: true,
    props: [],
  },
  {
    name: "grid-column",
    kind: "flow",
    label: "分栏列",
    description: "飞书分栏列节点。通常作为 grid 的子节点存在。",
    tone: "embed",
    hasChildren: true,
    props: [
      { name: "width", label: "列宽" },
    ],
  },
  {
    name: "divider",
    kind: "flow",
    label: "分割线块",
    description: "飞书 Divider 块。预览模式按文档分隔线展示。",
    tone: "generic",
    hasChildren: false,
    props: [],
  },
  {
    name: "table",
    kind: "flow",
    label: "表格块",
    description: "飞书 Table 块。当前优先保留结构层级和子单元格关系。",
    tone: "embed",
    hasChildren: true,
    props: [],
  },
  {
    name: "table-cell",
    kind: "flow",
    label: "表格单元格",
    description: "飞书 TableCell 块。通常作为表格结构的子节点存在。",
    tone: "embed",
    hasChildren: true,
    props: [],
  },
  {
    name: "view",
    kind: "flow",
    label: "视图块",
    description: "飞书附件或资源的视图配置块。文件块预览时通常需要一起识别。",
    tone: "embed",
    hasChildren: false,
    props: [
      { name: "type", label: "视图类型" },
      { name: "mode", label: "视图模式" },
    ],
  },
  {
    name: "sheet",
    kind: "flow",
    label: "电子表格块",
    description: "飞书电子表格嵌入块。富文本模式以语义卡片展示，建议在原始标签模式下改属性。",
    tone: "embed",
    hasChildren: false,
    props: [],
  },
  {
    name: "board",
    kind: "flow",
    label: "画板块",
    description: "飞书 Board 块。当前优先保留块语义和外部引用信息。",
    tone: "embed",
    hasChildren: false,
    props: [],
  },
  {
    name: "bitable",
    kind: "flow",
    label: "多维表格块",
    description: "飞书 Bitable 块。当前优先保留结构和标签，不做深度内嵌编辑。",
    tone: "embed",
    hasChildren: false,
    props: [],
  },
  {
    name: "link-preview",
    kind: "flow",
    label: "链接预览块",
    description: "飞书链接预览卡片。本地预览显示标题、链接和摘要。",
    tone: "embed",
    hasChildren: false,
    props: [
      { name: "url", label: "链接地址" },
      { name: "title", label: "标题" },
      { name: "description", label: "摘要" },
    ],
  },
  {
    name: "jira-issue",
    kind: "flow",
    label: "Jira 事项块",
    description: "飞书 JiraIssue 卡片。当前预览展示 issue key、状态和摘要。",
    tone: "embed",
    hasChildren: false,
    props: [
      { name: "key", label: "Issue Key" },
      { name: "summary", label: "摘要" },
      { name: "status", label: "状态" },
    ],
  },
  {
    name: "quote-container",
    kind: "flow",
    label: "引用容器块",
    description: "飞书 QuoteContainer 块。通常容纳多段引用内容。",
    tone: "callout",
    hasChildren: true,
    props: [],
  },
  {
    name: "task",
    kind: "flow",
    label: "任务块",
    description: "飞书 Task 块。当前保留结构和语义，不做深度任务编辑。",
    tone: "generic",
    hasChildren: true,
    props: [],
  },
  {
    name: "okr",
    kind: "flow",
    label: "OKR 块",
    description: "飞书 OKR 容器块。当前以只读结构块展示。",
    tone: "embed",
    hasChildren: true,
    props: [],
  },
  {
    name: "okr-objective",
    kind: "flow",
    label: "OKR 目标块",
    description: "飞书 OkrObjective 块。当前保留结构和来源语义。",
    tone: "embed",
    hasChildren: true,
    props: [],
  },
  {
    name: "okr-key-result",
    kind: "flow",
    label: "OKR 关键结果块",
    description: "飞书 OkrKeyResult 块。当前保留结构和来源语义。",
    tone: "embed",
    hasChildren: true,
    props: [],
  },
  {
    name: "okr-progress",
    kind: "flow",
    label: "OKR 进展块",
    description: "飞书 OkrProgress 块。当前以只读语义块展示。",
    tone: "embed",
    hasChildren: true,
    props: [],
  },
  {
    name: "whiteboard",
    kind: "flow",
    label: "画板块",
    description: "飞书白板 / 画板块。当前以原生语义卡片占位。",
    tone: "embed",
    hasChildren: false,
    props: [],
  },
  {
    name: "mindnote",
    kind: "flow",
    label: "思维笔记块",
    description: "飞书思维笔记块。富文本模式仅保留块语义和属性摘要。",
    tone: "embed",
    hasChildren: false,
    props: [],
  },
  {
    name: "diagram",
    kind: "flow",
    label: "流程图块",
    description: "飞书流程图 / UML 块。当前优先保留块标签和上下文位置。",
    tone: "embed",
    hasChildren: false,
    props: [],
  },
  {
    name: "sub-page-list",
    kind: "flow",
    label: "子页面列表块",
    description: "飞书子页面列表。当前以只读列表占位保留块位置和属性。",
    tone: "embed",
    hasChildren: false,
    props: [],
  },
  {
    name: "add-ons",
    kind: "flow",
    label: "插件块",
    description: "飞书文档小组件 / Add-ons 块。富文本模式以卡片占位展示。",
    tone: "embed",
    hasChildren: false,
    props: [],
  },
  {
    name: "chat-card",
    kind: "flow",
    label: "会话卡片",
    description: "飞书会话卡片块。当前保留标签与属性，不做卡片内部编辑。",
    tone: "embed",
    hasChildren: false,
    props: [],
  },
  {
    name: "source-synced",
    kind: "flow",
    label: "同步源块",
    description: "飞书同步块源内容。当前以只读语义块展示，避免在富文本模式误改。",
    tone: "sync",
    hasChildren: false,
    props: [],
  },
  {
    name: "reference-synced",
    kind: "flow",
    label: "同步引用块",
    description: "飞书同步块引用。当前以只读语义块展示，建议在原始标签模式下检查属性。",
    tone: "sync",
    hasChildren: false,
    props: [],
  },
  {
    name: "undefined",
    kind: "flow",
    label: "未识别块",
    description: "当前版本尚未识别具体类型的飞书原始块。预览模式保留块位置和属性，避免内容直接漏成原始标签文本。",
    tone: "generic",
    hasChildren: true,
    props: [
      { name: "block-id", label: "块 ID" },
      { name: "blockId", label: "块 ID" },
    ],
  },
  {
    name: "mention-user",
    kind: "text",
    label: "用户提及",
    description: "飞书用户 mention 行内节点。预览模式按 @用户 标签展示。",
    tone: "generic",
    hasChildren: false,
    props: [
      { name: "name", label: "用户名称" },
      { name: "user-id", label: "用户 ID" },
    ],
  },
  {
    name: "mention-doc",
    kind: "text",
    label: "文档提及",
    description: "飞书文档 mention 行内节点。预览模式保留标题和链接。",
    tone: "generic",
    hasChildren: false,
    props: [
      { name: "title", label: "文档标题" },
      { name: "url", label: "文档链接" },
      { name: "doc-id", label: "文档 ID" },
    ],
  },
  {
    name: "reminder",
    kind: "text",
    label: "提醒",
    description: "飞书提醒行内节点。预览模式展示提醒内容和时间。",
    tone: "generic",
    hasChildren: false,
    props: [
      { name: "text", label: "提醒文本" },
      { name: "time", label: "提醒时间" },
      { name: "date", label: "提醒日期" },
      { name: "status", label: "提醒状态" },
    ],
  },
  {
    name: "equation",
    kind: "text",
    label: "公式",
    description: "飞书公式行内节点。预览模式保留 latex / formula 内容。",
    tone: "generic",
    hasChildren: false,
    props: [
      { name: "formula", label: "公式文本" },
      { name: "latex", label: "LaTeX" },
    ],
  },
  {
    name: "inline-file",
    kind: "text",
    label: "行内附件",
    description: "飞书行内文件节点。预览模式显示附件名称和 token。",
    tone: "media",
    hasChildren: false,
    props: [
      { name: "name", label: "文件名" },
      { name: "token", label: "资源 Token" },
    ],
  },
  {
    name: "inline-block",
    kind: "text",
    label: "块引用",
    description: "飞书行内块引用。预览模式保留引用标题和块 ID。",
    tone: "generic",
    hasChildren: false,
    props: [
      { name: "title", label: "块标题" },
      { name: "block-id", label: "块 ID" },
    ],
  },
  {
    name: "wiki-catalog",
    kind: "flow",
    label: "旧版子页面列表块",
    description: "飞书 WikiCatalog 块。当前以只读语义块展示。",
    tone: "embed",
    hasChildren: false,
    props: [
      { name: "wiki-token", label: "Wiki Token" },
    ],
  },
  {
    name: "agenda",
    kind: "flow",
    label: "议程块",
    description: "飞书 Agenda 块。当前保留结构层级和只读语义。",
    tone: "embed",
    hasChildren: true,
    props: [],
  },
  {
    name: "agenda-item",
    kind: "flow",
    label: "议程项块",
    description: "飞书 AgendaItem 块。通常包含标题和内容子块。",
    tone: "embed",
    hasChildren: true,
    props: [],
  },
  {
    name: "agenda-item-title",
    kind: "flow",
    label: "议程项标题块",
    description: "飞书 AgendaItemTitle 块。当前保留其文本语义。",
    tone: "embed",
    hasChildren: true,
    props: [
      { name: "align", label: "对齐方式" },
    ],
  },
  {
    name: "agenda-item-content",
    kind: "flow",
    label: "议程项内容块",
    description: "飞书 AgendaItemContent 块。当前保留其结构语义。",
    tone: "embed",
    hasChildren: true,
    props: [],
  },
  {
    name: "lark-table",
    kind: "flow",
    label: "飞书表格块",
    description: "兼容现有本地草稿中的 lark-table 标签，预览时按表格容器处理。",
    tone: "embed",
    hasChildren: true,
    props: [],
  },
]

export function resolveFeishuDocsTagSpec(name: string | null | undefined): FeishuDocsTagSpec | null {
  const normalized = normalizeFeishuDocsTagName(name)
  if (!normalized) {
    return null
  }
  return FEISHU_DOCS_TAG_SPECS.find((item) => item.name === normalized) ?? null
}
