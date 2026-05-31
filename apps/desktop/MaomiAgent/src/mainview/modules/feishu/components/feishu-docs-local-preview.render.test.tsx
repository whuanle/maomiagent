import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

import {
  resolveDesktopFeishuDocMediaPreviewUrl,
} from "../../../../shared/desktop-feishu-oauth"
import { normalizeFeishuDocsPreviewHref } from "./feishu-docs-render-utils"

async function source(relativePath = "./feishu-docs-local-preview.tsx"): Promise<string> {
  return readFile(new URL(relativePath, import.meta.url), "utf8")
}

async function tableLayoutSource(): Promise<string> {
  return readFile(new URL("./feishu-docs-native-table-layout.ts", import.meta.url), "utf8")
}

async function diagramModalSource(): Promise<string> {
  return readFile(new URL("./feishu-doc-diagram-preview-modal.tsx", import.meta.url), "utf8")
}

async function diagramToolbarSource(): Promise<string> {
  return readFile(new URL("./feishu-doc-diagram-toolbar.tsx", import.meta.url), "utf8")
}

describe("FeishuDocsLocalPreview", () => {
  test("accepts loopback preview urls for pulled feishu media", () => {
    expect(normalizeFeishuDocsPreviewHref(resolveDesktopFeishuDocMediaPreviewUrl("img_token")))
      .toBe(resolveDesktopFeishuDocMediaPreviewUrl("img_token"))
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
    expect(previewSource).toContain('const boardType = readPreferredFeishuDocsAttribute(attributes, ["type"])')
    expect(previewSource).toContain('extractNativePreviewSource(input.childrenNodes)')
    expect(previewSource).toContain("renderMermaidNativePreview({")
    expect(previewSource).toContain('import { FeishuDocBoardPreview } from "./feishu-doc-board-preview"')
    expect(previewSource).toContain("<FeishuDocBoardPreview")
    expect(previewSource).toContain('snapshot={token ? input.boardSnapshots?.[token] : undefined}')
    expect(previewSource).not.toContain('className="feishu-docs-local-preview-plain-media is-image is-board-preview"')
    expect(previewSource).not.toContain("whiteboardPreviewUrls")
    expect(previewSource).not.toContain("whiteboardPreviewFocusRects")
    expect(previewSource).not.toContain("whiteboardPreviewErrors")
  })

  test("renders mermaid diagrams inline, recognizes flowchart sources and falls back from broken preview images", async () => {
    const previewSource = await source()
    const modalSource = await diagramModalSource()
    const toolbarSource = await diagramToolbarSource()
    const mermaidPreviewSource = await source("./feishu-doc-mermaid-preview.tsx")
    const mindmapPreviewSource = await source("./feishu-doc-mindmap-preview.tsx")

    expect(previewSource).toContain('import { looksLikeMermaidMindmapSource } from "../../../lib/conversation-mindmap-preview"')
    expect(previewSource).toContain('import { FeishuDocMermaidPreview } from "./feishu-doc-mermaid-preview"')
    expect(previewSource).toContain('import { FeishuDocMindmapPreview } from "./feishu-doc-mindmap-preview"')
    expect(previewSource).toContain("shouldRenderFeishuDocsMermaidBlock")
    expect(previewSource).toContain("looksLikeMermaidMindmapSource(block.code)")
    expect(previewSource).toContain("<FeishuDocMindmapPreview")
    expect(previewSource).toContain("<FeishuDocMermaidPreview")
    expect(previewSource).toContain("onError={() => setImageFailed(true)}")
    expect(previewSource).toContain('feishu-docs-local-preview-image-placeholder${input.plain ? " is-plain" : ""}')

    expect(mermaidPreviewSource).toContain('import mermaid from "mermaid"')
    expect(mermaidPreviewSource).toContain("const FEISHU_DOCS_DIAGRAM_PREVIEW_MAX_WIDTH = 700")
    expect(mermaidPreviewSource).toContain("const FEISHU_DOCS_DIAGRAM_PREVIEW_MAX_HEIGHT = 700")
    expect(mermaidPreviewSource).toContain('ADD_TAGS: ["style"]')
    expect(mermaidPreviewSource).toContain('dangerouslySetInnerHTML={{ __html: props.svg }}')
    expect(mermaidPreviewSource).toContain("FeishuDocDiagramPreviewModal")
    expect(mermaidPreviewSource).toContain("FeishuDocDiagramToolbar")
    expect(mermaidPreviewSource).toContain("downloadFeishuDocPreviewSvg")
    expect(mermaidPreviewSource).toContain('className="feishu-doc-diagram-viewport"')
    expect(mermaidPreviewSource).toContain('width: size ? `${size.width}px` : undefined')
    expect(mermaidPreviewSource).toContain('height: size ? `${size.height}px` : undefined')
    expect(mermaidPreviewSource).toContain('className="feishu-docs-local-preview-diagram-trigger is-mermaid"')
    expect(mermaidPreviewSource).not.toContain('className="feishu-docs-local-preview-mermaid-shell"')

    expect(mindmapPreviewSource).toContain('import { MindMapViewer, type MindMapViewerRef } from "@xiangfa/mindmap/viewer"')
    expect(mindmapPreviewSource).toContain("buildConversationMindmapPreviewData")
    expect(mindmapPreviewSource).toContain("looksLikeMermaidMindmapSource")
    expect(mindmapPreviewSource).toContain("viewer.fitView()")
    expect(mindmapPreviewSource).toContain("FeishuDocDiagramToolbar")
    expect(mindmapPreviewSource).toContain("serializeFeishuDocPreviewSvgElement")
    expect(mindmapPreviewSource).toContain("downloadFeishuDocPreviewSvg")
    expect(mindmapPreviewSource).toContain('className="feishu-docs-local-preview-diagram-trigger is-mindmap"')
    expect(mindmapPreviewSource).toContain('className={`feishu-docs-local-preview-mindmap-host is-${props.mode}`}') 
    expect(mindmapPreviewSource).not.toContain('className="feishu-docs-local-preview-mindmap-shell"')
    expect(mindmapPreviewSource).not.toContain('className={`feishu-docs-local-preview-mindmap-frame is-${props.mode}`}') 
    expect(mindmapPreviewSource).toContain("FeishuDocDiagramPreviewModal")

    expect(modalSource).toContain("title={null}")
    expect(modalSource).toContain("footer={null}")
    expect(modalSource).toContain('width="min(1560px, calc(100vw - 32px))"')

    expect(toolbarSource).toContain("DownloadOutlined")
    expect(toolbarSource).toContain("ExpandOutlined")
    expect(toolbarSource).toContain("MinusOutlined")
    expect(toolbarSource).toContain("PlusOutlined")
    expect(toolbarSource).toContain('role="toolbar"')
  })
})
