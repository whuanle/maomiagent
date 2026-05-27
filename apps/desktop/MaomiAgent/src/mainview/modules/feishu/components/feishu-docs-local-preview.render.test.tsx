import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

import {
  resolveDesktopFeishuDocMediaPreviewUrl,
  resolveDesktopFeishuDocWhiteboardPreviewUrl,
} from "../../../../shared/desktop-feishu-oauth"
import { normalizeFeishuDocsPreviewHref } from "./feishu-docs-render-utils"

const workspaceRoot = process.cwd()

async function source(path: string): Promise<string> {
  return readFile(`${workspaceRoot}/${path}`, "utf8")
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
    const previewSource = await source("src/mainview/modules/feishu/components/feishu-docs-local-preview.tsx")
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
    const previewSource = await source("src/mainview/modules/feishu/components/feishu-docs-local-preview.tsx")

    expect(previewSource).toContain("function collectNativeTableRows(")
    expect(previewSource).toContain('if (input.name === "table") {')
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
  })
})