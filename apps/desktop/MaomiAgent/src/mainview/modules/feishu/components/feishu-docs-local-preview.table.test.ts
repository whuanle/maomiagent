import { describe, expect, test } from "bun:test"

import { parseFeishuDocsLocalPreview } from "./feishu-docs-local-preview-model"
import { collectNativeTableRows } from "./feishu-docs-native-table-layout"
import { normalizeFeishuDocsAttributes } from "./feishu-docs-render-utils"

function buildTableCell(text: string): string[] {
  return [
    "<table-cell>",
    text,
    "</table-cell>",
  ]
}

describe("FeishuDocsLocalPreview table rendering", () => {
  test("groups cached property-based table metadata into multiple rows", () => {
    const markdown = [
      '<table property-row-size="3" property-column-size="3" property-header-row-size="1">',
      ...buildTableCell("模块"),
      ...buildTableCell("职责"),
      ...buildTableCell("典型实现"),
      ...buildTableCell("大语言模型 (LLM)"),
      ...buildTableCell("理解指令、推理判断、生成内容"),
      ...buildTableCell("GPT-4、Claude、Gemini 等"),
      ...buildTableCell("工具模块 (Tools)"),
      ...buildTableCell("执行具体操作、获取外部信息"),
      ...buildTableCell("API 调用、代码执行、文件读写"),
      "</table>",
    ].join("\n")

    const table = parseFeishuDocsLocalPreview(markdown)[0]
    expect(table).toMatchObject({
      kind: "native_block",
      name: "table",
    })
    if (!table || table.kind !== "native_block") {
      throw new Error("expected parsed native table block")
    }

    const rows = collectNativeTableRows(
      normalizeFeishuDocsAttributes(table.attributes),
      table.children,
    )

    expect(rows).toHaveLength(3)
    expect(rows[0]?.header).toBe(true)
    expect(rows[0]?.cells.map((cell) => cell.node.children[0]?.kind === "markdown" ? cell.node.children[0].markdown : "")).toEqual([
      "模块",
      "职责",
      "典型实现",
    ])
    expect(rows[1]?.cells.map((cell) => cell.node.children[0]?.kind === "markdown" ? cell.node.children[0].markdown : "")).toEqual([
      "大语言模型 (LLM)",
      "理解指令、推理判断、生成内容",
      "GPT-4、Claude、Gemini 等",
    ])
    expect(rows[2]?.cells.map((cell) => cell.node.children[0]?.kind === "markdown" ? cell.node.children[0].markdown : "")).toEqual([
      "工具模块 (Tools)",
      "执行具体操作、获取外部信息",
      "API 调用、代码执行、文件读写",
    ])
  })
})
