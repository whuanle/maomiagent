import { describe, expect, test } from "bun:test"

import { buildFeishuDocChatDraftText } from "./feishu-doc-chat-draft"

describe("buildFeishuDocChatDraftText", () => {
  test("reserves leading space for the user task and keeps the caution block above the document context", () => {
    const draft = buildFeishuDocChatDraftText({
      title: "测试文档",
      docId: "doc_token_1",
      resolvedDocId: "resolved_1",
      rootDocId: "root_1",
      url: "https://example.com/doc",
      relativeUpdate: "5 分钟前更新",
      originalRelativePath: ".maomi/feishu-docs/original.md",
      draftRelativePath: ".maomi/feishu-docs/draft.md",
    })

    expect(draft.startsWith("\n\n---\n注意：\n")).toBe(true)
    expect(draft).not.toContain("请在上方填写你的问题或任务。")
    expect(draft).toContain("处理前先读取工作区里的原始 Markdown 文件。")
    expect(draft).toContain("如需生成修改稿，只能写入本地 Markdown 草稿，不要直接改动或推送飞书远端。")
    expect(draft).toContain("<feishu_doc_context>")
    expect(draft).toContain("doc_token: doc_token_1")
    expect(draft).toContain("resolved_document_id: resolved_1")
    expect(draft).toContain("root_doc_token: root_1")
    expect(draft).toContain("create_target: root_doc_token")
    expect(draft).toContain("workflow: read_original_then_edit_local_draft")
    expect(draft).toContain("</feishu_doc_context>")
  })

  test("falls back to querying the workspace root when no root token is known", () => {
    const draft = buildFeishuDocChatDraftText({
      title: "测试文档",
      docId: "doc_token_2",
    })

    expect(draft).toContain("create_target: query_workspace_root_doc_first")
    expect(draft).not.toContain("root_doc_token:")
  })
})
