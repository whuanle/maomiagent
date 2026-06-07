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
    "先读取 `original_markdown_path`。",
    "如需修改、改写、整理或续写，只能写入 `local_draft_path`。",
    "不要直接修改 `original_markdown_path`。",
    "如果缺少 `local_draft_path`，按只读参考处理，并先告知用户。",
    "如果需要更多信息，请读取文档同目录的元数据文件。",
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
