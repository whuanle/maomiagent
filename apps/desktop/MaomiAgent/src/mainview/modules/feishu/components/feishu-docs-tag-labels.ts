import type { FeishuI18nKey as I18nKey, FeishuTranslate as Translate } from "../types"
import { normalizeFeishuDocsTagName } from "./feishu-docs-tag-spec"

const FEISHU_DOCS_TAG_LABEL_KEYS = {
  image: "飞书页.文档.预览.块标签.image",
  file: "飞书页.文档.预览.块标签.file",
  iframe: "飞书页.文档.预览.块标签.iframe",
  callout: "飞书页.文档.预览.块标签.callout",
  grid: "飞书页.文档.预览.块标签.grid",
  "grid-column": "飞书页.文档.预览.块标签.grid-column",
  divider: "飞书页.文档.预览.块标签.divider",
  table: "飞书页.文档.预览.块标签.table",
  "table-cell": "飞书页.文档.预览.块标签.table-cell",
  view: "飞书页.文档.预览.块标签.view",
  sheet: "飞书页.文档.预览.块标签.sheet",
  board: "飞书页.文档.预览.块标签.board",
  bitable: "飞书页.文档.预览.块标签.bitable",
  "link-preview": "飞书页.文档.预览.块标签.link-preview",
  "jira-issue": "飞书页.文档.预览.块标签.jira-issue",
  "quote-container": "飞书页.文档.预览.块标签.quote-container",
  task: "飞书页.文档.预览.块标签.task",
  okr: "飞书页.文档.预览.块标签.okr",
  "okr-objective": "飞书页.文档.预览.块标签.okr-objective",
  "okr-key-result": "飞书页.文档.预览.块标签.okr-key-result",
  "okr-progress": "飞书页.文档.预览.块标签.okr-progress",
  whiteboard: "飞书页.文档.预览.块标签.whiteboard",
  mindnote: "飞书页.文档.预览.块标签.mindnote",
  diagram: "飞书页.文档.预览.块标签.diagram",
  "sub-page-list": "飞书页.文档.预览.块标签.sub-page-list",
  "add-ons": "飞书页.文档.预览.块标签.add-ons",
  "chat-card": "飞书页.文档.预览.块标签.chat-card",
  "source-synced": "飞书页.文档.预览.块标签.source-synced",
  "reference-synced": "飞书页.文档.预览.块标签.reference-synced",
  "mention-user": "飞书页.文档.预览.块标签.mention-user",
  "mention-doc": "飞书页.文档.预览.块标签.mention-doc",
  reminder: "飞书页.文档.预览.块标签.reminder",
  equation: "飞书页.文档.预览.块标签.equation",
  "inline-file": "飞书页.文档.预览.块标签.inline-file",
  "inline-block": "飞书页.文档.预览.块标签.inline-block",
  "wiki-catalog": "飞书页.文档.预览.块标签.wiki-catalog",
  agenda: "飞书页.文档.预览.块标签.agenda",
  "agenda-item": "飞书页.文档.预览.块标签.agenda-item",
  "agenda-item-title": "飞书页.文档.预览.块标签.agenda-item-title",
  "agenda-item-content": "飞书页.文档.预览.块标签.agenda-item-content",
  "lark-table": "飞书页.文档.预览.块标签.lark-table",
} satisfies Record<string, I18nKey>

export function resolveFeishuDocsTagLabel(
  name: string | null | undefined,
  fallback: string,
  t?: Translate,
): string {
  const normalized = normalizeFeishuDocsTagName(name)
  const key = FEISHU_DOCS_TAG_LABEL_KEYS[normalized as keyof typeof FEISHU_DOCS_TAG_LABEL_KEYS]
  if (!key || !t) {
    return fallback
  }

  const translated = t(key)
  return translated === key ? fallback : translated
}
