import { describe, expect, test } from "bun:test"

import { renderHighlightedFeishuDocsCode, resolveFeishuDocsHighlightLanguage } from "./feishu-docs-markdown-highlight"

describe("feishu docs markdown highlight", () => {
  test("maps common fence aliases to highlight.js language ids", () => {
    expect(resolveFeishuDocsHighlightLanguage("cs")).toBe("csharp")
    expect(resolveFeishuDocsHighlightLanguage("tsx")).toBe("typescript")
    expect(resolveFeishuDocsHighlightLanguage("text")).toBeUndefined()
  })

  test("auto-detects and highlights unlabeled multiline code blocks", () => {
    const highlighted = renderHighlightedFeishuDocsCode({
      code: [
        "public class Test",
        "{",
        "    public int Id { get; set; }",
        "}",
      ].join("\n"),
    })

    expect(highlighted.html).toBeTruthy()
    expect(highlighted.html).toContain("hljs-")
  })
})