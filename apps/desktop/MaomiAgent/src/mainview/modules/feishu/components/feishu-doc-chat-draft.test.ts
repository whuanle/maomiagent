import { describe, expect, test } from "bun:test"

import {
  buildFeishuDocChatDraftBatchText,
  buildFeishuDocChatDraftText,
} from "./feishu-doc-chat-draft"

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
    expect(draft).toContain("本次任务请使用“飞书文档助手”智能体处理。")
    expect(draft).toContain("先读取 `original_markdown_path`")
    expect(draft).toContain("`original_markdown_path` 与 `local_draft_path` 后面的值就是实际文件路径")
    expect(draft).toContain("本地草稿只是工作副本")
    expect(draft).toContain("严格 Markdown")
    expect(draft).toContain("`# 标题`")
    expect(draft).toContain("`workspace_edit_file`")
    expect(draft).toContain("`workspace_apply_patch`")
    expect(draft).toContain("`content` 字段")
    expect(draft).toContain("不要先写大段计划或提纲")
    expect(draft).toContain("不要直接修改 `original_markdown_path`。如果缺少 `local_draft_path`")
    expect(draft).toContain("<feishu_doc_context>")
    expect(draft).toContain("title: 测试文档")
    expect(draft).toContain("original_markdown_path: .maomi/feishu-docs/original.md")
    expect(draft).toContain("local_draft_path: .maomi/feishu-docs/draft.md")
    expect(draft).not.toContain("doc_token:")
    expect(draft).not.toContain("resolved_document_id:")
    expect(draft).not.toContain("root_doc_token:")
    expect(draft).not.toContain("url:")
    expect(draft).not.toContain("updated_at:")
    expect(draft).not.toContain("create_target:")
    expect(draft).not.toContain("workflow:")
    expect(draft).toContain("</feishu_doc_context>")
  })

  test("keeps read-only context when no local draft path exists", () => {
    const draft = buildFeishuDocChatDraftText({
      title: "只读文档",
      docId: "doc_token_readonly",
      originalRelativePath: ".maomi/feishu-docs/readonly/original.md",
    })

    expect(draft).toContain("title: 只读文档")
    expect(draft).toContain("original_markdown_path: .maomi/feishu-docs/readonly/original.md")
    expect(draft).not.toContain("local_draft_path:")
  })

  test("builds independent context blocks for multiple selected documents", () => {
    const draft = buildFeishuDocChatDraftBatchText([
      {
        title: "需求说明",
        docId: "doc_token_1",
        originalRelativePath: ".maomi/feishu-docs/requirements/original.md",
      },
      {
        title: "技术方案",
        docId: "doc_token_2",
        draftRelativePath: ".maomi/feishu-docs/design/draft.md",
      },
    ])

    expect(draft.startsWith("\n\n---\n注意：\n")).toBe(true)
    expect(draft.match(/<feishu_doc_context>/g)?.length).toBe(2)
    expect(draft).toContain("title: 需求说明")
    expect(draft).toContain("original_markdown_path: .maomi/feishu-docs/requirements/original.md")
    expect(draft).toContain("title: 技术方案")
    expect(draft).toContain("local_draft_path: .maomi/feishu-docs/design/draft.md")
    expect(draft).not.toContain("doc_token:")
  })
})
