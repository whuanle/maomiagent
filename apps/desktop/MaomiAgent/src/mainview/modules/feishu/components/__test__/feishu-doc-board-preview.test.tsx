import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

async function boardPreviewSource(): Promise<string> {
  return readFile(new URL("../feishu-doc-board-preview.tsx", import.meta.url), "utf8")
}

async function boardNodeRendererSource(): Promise<string> {
  return readFile(new URL("../feishu-doc-board-node-renderer.tsx", import.meta.url), "utf8")
}

describe("FeishuDocBoardPreview", () => {
  test("renders local board svg surfaces instead of remote preview images", async () => {
    const previewSource = await boardPreviewSource()

    expect(previewSource).toContain('className="feishu-docs-local-preview-diagram-trigger is-board"')
    expect(previewSource).toContain('<BoardSvgSurface snapshot={snapshot} mode="inline" />')
    expect(previewSource).toContain('className="feishu-doc-board-viewport"')
    expect(previewSource).toContain('className="feishu-doc-board-canvas"')
    expect(previewSource).toContain("FeishuDocDiagramToolbar")
    expect(previewSource).toContain("downloadFeishuDocPreviewSvg")
    expect(previewSource).not.toContain('className="feishu-doc-board-preview-shell"')
    expect(previewSource).not.toContain('className="feishu-doc-board-inline-canvas"')
    expect(previewSource).not.toContain("<img")
    expect(previewSource).not.toContain("tmpDownloadUrl")
  })

  test("keeps unsupported native boards as local placeholder nodes", async () => {
    const previewSource = await boardPreviewSource()
    const nodeRendererSource = await boardNodeRendererSource()

    expect(previewSource).toContain("function createPlaceholderSnapshot")
    expect(previewSource).toContain('kind: "unsupported"')
    expect(nodeRendererSource).toContain('className="feishu-doc-board-node feishu-doc-board-node-unsupported"')
    expect(nodeRendererSource).toContain('strokeDasharray="8 6"')
    expect(nodeRendererSource).toContain('node.kind === "connector"')
    expect(nodeRendererSource).toContain('node.kind === "shape"')
  })
})
