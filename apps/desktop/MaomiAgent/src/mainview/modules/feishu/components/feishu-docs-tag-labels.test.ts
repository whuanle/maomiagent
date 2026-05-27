import { describe, expect, test } from "bun:test"

import { resolveFeishuDocsTagLabel } from "./feishu-docs-tag-labels"

describe("resolveFeishuDocsTagLabel", () => {
  test("falls back to the provided human label when the translation key is missing", () => {
    const t = ((key: string) => key) as never

    expect(resolveFeishuDocsTagLabel("board", "画板块", t)).toBe("画板块")
    expect(resolveFeishuDocsTagLabel("whiteboard", "白板块", t)).toBe("白板块")
  })

  test("returns the translated label when a translation exists", () => {
    const t = ((key: string) => (
      key === "飞书页.文档.预览.块标签.board" ? "画板" : key
    )) as never

    expect(resolveFeishuDocsTagLabel("board", "画板块", t)).toBe("画板")
  })
})