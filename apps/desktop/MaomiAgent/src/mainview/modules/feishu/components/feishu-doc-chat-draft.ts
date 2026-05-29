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

export function buildFeishuDocChatDraftText(input: FeishuDocChatDraftTextInput): string {
  return [
    "",
    "",
    "---",
    "注意：",
    "",
    "处理前先读取工作区里的原始 Markdown 文件。",
    "如需生成修改稿，只能写入本地 Markdown 草稿，不要直接改动或推送飞书远端。",
    "",
    "<feishu_doc_context>",
    `doc_token: ${input.docId}`,
    input.resolvedDocId && input.resolvedDocId !== input.docId ? `resolved_document_id: ${input.resolvedDocId}` : undefined,
    `title: ${input.title}`,
    input.rootDocId ? `root_doc_token: ${input.rootDocId}` : undefined,
    input.url ? `url: ${input.url}` : undefined,
    input.relativeUpdate ? `updated_at: ${input.relativeUpdate}` : undefined,
    input.originalRelativePath ? `original_markdown_path: ${input.originalRelativePath}` : undefined,
    input.draftRelativePath ? `local_draft_path: ${input.draftRelativePath}` : undefined,
    input.rootDocId ? "create_target: root_doc_token" : "create_target: query_workspace_root_doc_first",
    "workflow: read_original_then_edit_local_draft",
    "</feishu_doc_context>",
  ].filter((item): item is string => item !== undefined).join("\n")
}
