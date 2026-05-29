import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

import {
  resolveDesktopFeishuDocMediaPreviewUrl,
  resolveDesktopFeishuDocWhiteboardPreviewUrl,
} from "../../../../shared/desktop-feishu-oauth"
import { normalizeFeishuDocsPreviewHref } from "./feishu-docs-render-utils"

async function source(): Promise<string> {
  return readFile(new URL("./feishu-docs-local-preview.tsx", import.meta.url), "utf8")
}

async function tableLayoutSource(): Promise<string> {
  return readFile(new URL("./feishu-docs-native-table-layout.ts", import.meta.url), "utf8")
}

describe("FeishuDocsLocalPreview", () => {
  test("accepts loopback preview urls for pulled feishu media", () => {
    expect(normalizeFeishuDocsPreviewHref(resolveDesktopFeishuDocMediaPreviewUrl("img_token")))
      .toBe(resolveDesktopFeishuDocMediaPreviewUrl("img_token"))
    expect(normalizeFeishuDocsPreviewHref(resolveDesktopFeishuDocWhiteboardPreviewUrl("board_token")))
      .toBe(resolveDesktopFeishuDocWhiteboardPreviewUrl("board_token"))
    expect(normalizeFeishuDocsPreviewHref("file:///E:/workspace/cache/img.png"))
      .toBe("file:///E:/workspace/cache/img.png")
  })

  test("keeps image, bitable and multiline code on plain preview branches", async () => {
    const previewSource = await source()
    const imageBranch = /if \(input\.name === "image"\) \{([\s\S]*?)\n  if \(/.exec(previewSource)?.[1] ?? ""

    expect(previewSource).toContain('className="feishu-docs-local-preview-plain-media is-image"')
    expect(previewSource).toContain('"feishu-docs-local-preview-plain-block"')
    expect(previewSource).toContain('"is-bitable"')
    expect(previewSource).toContain('className="feishu-docs-local-preview-image-placeholder is-plain"')
    expect(previewSource).toContain('className="is-nested feishu-docs-local-preview-code-block-mdx"')
    expect(previewSource).toContain("<FeishuDocsReadonlyMdxMarkdown")
    expect(previewSource).toContain("buildMarkdownCodeFence(block.code, block.language)")
    expect(previewSource).toContain("<FeishuDocsStaticCodeBlock")
    expect(previewSource).toContain("codeBlockEditorDescriptors: [codeBlockDescriptor]")
    expect(previewSource).toContain("renderHighlightedFeishuDocsCode")
    expect(previewSource).toContain("readFeishuDocsPreviewDimensions(attributes)")
    expect(previewSource).toContain("preferredWidth={imageWidth}")
    expect(previewSource).toContain("buildFeishuDocsHeadingAnchorId(block.text")
    expect(previewSource).toContain('"data-feishu-doc-heading-id": anchorId')
    expect(previewSource).toContain('(token ? input.mediaPreviewUrls?.[token] ?? "" : "")')
    expect(previewSource).toContain('|| readPreferredFeishuDocsAttribute(attributes, ["src", "url", "tmp-download-url", "tmp_download_url"])')
    expect(previewSource).not.toContain("<PreviewPanelSourceEditor")
    expect(imageBranch.length).toBeGreaterThan(0)
    expect(imageBranch).not.toContain("renderNativePropItems(propItems)")
  })

  test("includes native table rendering and diagram-like preview branches", async () => {
    const previewSource = await source()
    const layoutSource = await tableLayoutSource()
    const standaloneTableCallCount = previewSource.match(/return renderStandaloneFeishuTable\(\{/g)?.length ?? 0

    expect(layoutSource).toContain("export function collectNativeTableRows(")
    expect(layoutSource).toContain('"property-column-size"')
    expect(layoutSource).toContain('"property-row-size"')
    expect(layoutSource).toContain('"property-header-row-size"')
    expect(previewSource).toContain("function renderStandaloneFeishuTable(")
    expect(previewSource).toContain('className="feishu-docs-local-preview-table-block"')
    expect(standaloneTableCallCount).toBeGreaterThanOrEqual(4)
    expect(previewSource).toContain('if (input.name === "table") {')
    expect(previewSource).toContain("collectNativeTableRows(attributes, input.childrenNodes)")
    expect(previewSource).toContain("parseFeishuDocsPreviewNodesFromMdxChildren(input.mdastNode.children)")
    expect(previewSource).toContain('className="feishu-docs-local-preview-lark-table-shell"')
    expect(previewSource).toContain('input.name === "board"')
    expect(previewSource).toContain('input.name === "whiteboard"')
    expect(previewSource).toContain('input.name === "mindnote"')
    expect(previewSource).toContain('input.name === "diagram"')
    expect(previewSource).toContain('["token", "mindnote-token", "mindnote_token"]')
    expect(previewSource).toContain('["token", "diagram-token", "diagram_token"]')
    expect(previewSource).toContain('["token", "whiteboard-token", "whiteboard_token"]')
    expect(previewSource).toContain('className="feishu-docs-local-preview-plain-media is-image is-board-preview"')
    expect(previewSource).toContain("const FEISHU_DOCS_BOARD_PREVIEW_MAX_WIDTH = 700")
    expect(previewSource).toContain("const FEISHU_DOCS_BOARD_PREVIEW_MAX_HEIGHT = 700")
    expect(previewSource).toContain("preferredWidth={FEISHU_DOCS_BOARD_PREVIEW_MAX_WIDTH}")
    expect(previewSource).toContain("preferredHeight={FEISHU_DOCS_BOARD_PREVIEW_MAX_HEIGHT}")
  })

  test("renders mermaid diagrams inline, recognizes flowchart sources and falls back from broken preview images", async () => {
    const previewSource = await source()

    expect(previewSource).toContain("const FEISHU_DOCS_DIAGRAM_PREVIEW_MAX_WIDTH = 700")
    expect(previewSource).toContain("const FEISHU_DOCS_DIAGRAM_PREVIEW_MAX_HEIGHT = 700")
    expect(previewSource).toContain('import mermaid from "mermaid"')
    expect(previewSource).toContain("shouldRenderFeishuDocsMermaidBlock")
    expect(previewSource).toContain('ADD_TAGS: ["style"]')
    expect(previewSource).toContain('dangerouslySetInnerHTML={{ __html: svg }}')
    expect(previewSource).toContain("maxWidth: `${FEISHU_DOCS_DIAGRAM_PREVIEW_MAX_WIDTH}px`")
    expect(previewSource).toContain("maxHeight: `${FEISHU_DOCS_DIAGRAM_PREVIEW_MAX_HEIGHT}px`")
    expect(previewSource).toContain("onError={() => setImageFailed(true)}")
    expect(previewSource).toContain('feishu-docs-local-preview-image-placeholder${input.plain ? " is-plain" : ""}')
  })
})
