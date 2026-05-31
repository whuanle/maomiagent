import { describe, expect, test } from "bun:test"

import { serializeFeishuDocPreviewSvgElement } from "../feishu-doc-diagram-preview-shared"

describe("feishu-doc-diagram-preview-shared", () => {
  test("serializes svg clones even when they are not instanceof SVGSVGElement", () => {
    const clone = {
      nodeType: 1,
      tagName: "svg",
      attributes: new Map<string, string>(),
      getAttribute(name: string) {
        return this.attributes.get(name) ?? null
      },
      setAttribute(name: string, value: string) {
        this.attributes.set(name, value)
      },
    }
    const svgElement = {
      cloneNode: () => clone,
    } as unknown as SVGSVGElement
    const OriginalXmlSerializer = globalThis.XMLSerializer

    class FakeXmlSerializer {
      serializeToString(node: typeof clone) {
        return `<svg xmlns="${node.getAttribute("xmlns")}" xmlns:xlink="${node.getAttribute("xmlns:xlink")}"></svg>`
      }
    }

    globalThis.XMLSerializer = FakeXmlSerializer as unknown as typeof XMLSerializer

    try {
      expect(serializeFeishuDocPreviewSvgElement(svgElement))
        .toBe('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"></svg>')
    } finally {
      globalThis.XMLSerializer = OriginalXmlSerializer
    }
  })
})
