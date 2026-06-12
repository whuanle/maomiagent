export type FeishuDocChatDraftTextInput = {
  title: string
  docId: string
  resolvedDocId?: string
  rootDocId?: string
  url?: string
  relativeUpdate?: string
  originalRelativePath?: string
  draftRelativePath?: string
}

function buildFeishuDocChatDraftNoticeLines(): string[] {
  return [
    "",
    "",
    "---",
    "注意：",
    "",
    "本次任务请使用“飞书文档助手”智能体处理。",
    "先读取 `original_markdown_path`，再结合 `local_draft_path` 决定如何改稿。",
    "`original_markdown_path` 与 `local_draft_path` 后面的值就是实际文件路径，读取或写入时必须直接使用该字面量路径。",
    "飞书远端是权威源，本地草稿只是工作副本；如需修改、改写、整理或续写，只能写入 `local_draft_path`。",
    "正文必须是严格 Markdown：`# 标题`、`## 标题`、`- 条目`、`1. 条目`、`> 引用` 这些标记后面必须保留一个空格。",
    "标题层级要连续，段落、列表、引用、todo、callout、代码块、简单表格各自保持独立块语义。",
    "如果草稿较长，优先用 `workspace_read_file` 的 `offset` / `limit` 只读取目标章节附近，不要默认整篇长文一次性读入上下文。",
    "如果 `local_draft_path` 已经有非空正文，优先使用 `workspace_edit_file` 只替换目标章节或连续文本块，不要为了补几节内容先整篇重写。",
    "如果修改分散在多个章节，优先使用 `workspace_apply_patch` 或 `workspace_edit_file`；只有在 `local_draft_path` 为空、内容极短，或者用户明确要求整篇重构时，才使用 `workspace_write_file` 一次性写完整正文。",
    "如果用户要求优化、扩写、补充细节、补流程图、补思维导图或补架构图，且 `local_draft_path` 已有正文，不要先写大段计划或提纲；读取到目标章节后，应尽快直接调用 `workspace_edit_file` 或 `workspace_apply_patch` 开始修改。",
    "遇到图片、附件、同步块、whiteboard、grid、sheet、bitable、board、iframe 或其它未知原生块时，默认保留原样，不要伪装成普通 Markdown。",
    "不要直接修改 `original_markdown_path`。如果缺少 `local_draft_path`，按只读参考处理，并先告知用户。",
    "不要卡在历史工具调用或摘要字段上。局部改稿时按当前 `workspace_edit_file` 工具定义；只有整篇落稿时才按 `workspace_write_file` 工具定义把完整正文放进 `content` 字段。",
    "",
  ]
}

function buildFeishuDocContextLines(input: FeishuDocChatDraftTextInput): string[] {
  return [
    "<feishu_doc_context>",
    `title: ${input.title}`,
    input.originalRelativePath ? `original_markdown_path: ${input.originalRelativePath}` : undefined,
    input.draftRelativePath ? `local_draft_path: ${input.draftRelativePath}` : undefined,
    "</feishu_doc_context>",
  ].filter((item): item is string => item !== undefined)
}

export function buildFeishuDocChatDraftText(input: FeishuDocChatDraftTextInput): string {
  return [
    ...buildFeishuDocChatDraftNoticeLines(),
    ...buildFeishuDocContextLines(input),
  ].join("\n")
}

export function buildFeishuDocChatDraftBatchText(inputs: FeishuDocChatDraftTextInput[]): string {
  const contexts = inputs
    .filter((input) => input.docId.trim())
    .map((input) => buildFeishuDocContextLines(input).join("\n"))

  return [
    ...buildFeishuDocChatDraftNoticeLines(),
    ...contexts.flatMap((context, index) => index === 0 ? [context] : ["", context]),
  ].join("\n")
}
