import { describe, expect, test } from "bun:test"

import { isMarkdownIndentedCodeLine, parseMarkdownIndentedCodeBlock } from "./feishu-docs-markdown-code"

describe("feishu docs markdown code parsing", () => {
  test("recognizes four-space and tab-indented code lines", () => {
    expect(isMarkdownIndentedCodeLine("    using SqlSugar;")).toBe(true)
    expect(isMarkdownIndentedCodeLine("\tpublic class Test")).toBe(true)
    expect(isMarkdownIndentedCodeLine("  not code")).toBe(false)
  })

  test("parses an indented markdown code block without collapsing inner indentation", () => {
    const lines = [
      "    using SqlSugar;",
      "",
      "    public class Test",
      "    {",
      "        public int Id { get; set; }",
      "    }",
      "",
      "普通段落",
    ]

    const parsed = parseMarkdownIndentedCodeBlock(lines, 0)

    expect(parsed).toEqual({
      block: {
        kind: "code_block",
        code: [
          "using SqlSugar;",
          "",
          "public class Test",
          "{",
          "    public int Id { get; set; }",
          "}",
        ].join("\n"),
      },
      nextIndex: 7,
    })
  })
})