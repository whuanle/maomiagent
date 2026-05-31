import type { FeishuTranslate as Translate } from "../types"
import { hasDesktopWindowBridge, saveDesktopTextFileWithDialog } from "../../../lib/desktop-window"

export function resolveFeishuDocPreviewText(
  t: Translate | undefined,
  key: string,
  fallback: string,
  params?: Record<string, string | number>,
) {
  if (!t) {
    return fallback
  }

  const translated = t(key, params)
  return translated === key ? fallback : translated
}

export function normalizeFeishuDocPreviewMarkdownSource(value: string) {
  return value.replace(/\r\n/g, "\n")
}

export function resolveFeishuDocPreviewErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  return typeof error === "string" ? error.trim() : String(error ?? "").trim()
}

function ensureSvgNamespace(svgMarkup: string): string {
  const trimmed = svgMarkup.trim()
  if (!trimmed.startsWith("<svg") || /\sxmlns=/.test(trimmed)) {
    return trimmed
  }

  return trimmed.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"')
}

function isSerializableSvgElement(value: unknown): value is Element {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as {
    nodeType?: unknown
    nodeName?: unknown
    tagName?: unknown
    getAttribute?: unknown
    setAttribute?: unknown
  }
  const nodeName = typeof candidate.nodeName === "string"
    ? candidate.nodeName
    : typeof candidate.tagName === "string"
      ? candidate.tagName
      : ""

  return candidate.nodeType === 1
    && nodeName.toLowerCase() === "svg"
    && typeof candidate.getAttribute === "function"
    && typeof candidate.setAttribute === "function"
}

export function serializeFeishuDocPreviewSvgElement(
  svgElement: SVGSVGElement | null | undefined,
): string {
  if (!svgElement || typeof XMLSerializer === "undefined") {
    return ""
  }

  const clone = svgElement.cloneNode(true)
  if (!isSerializableSvgElement(clone)) {
    return ""
  }
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  }
  if (!clone.getAttribute("xmlns:xlink")) {
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink")
  }

  return ensureSvgNamespace(new XMLSerializer().serializeToString(clone))
}

export async function downloadFeishuDocPreviewSvg(fileName: string, svgMarkup: string) {
  const normalizedSvgMarkup = ensureSvgNamespace(svgMarkup)
  if (!normalizedSvgMarkup.trim()) {
    return
  }

  if (hasDesktopWindowBridge()) {
    try {
      await saveDesktopTextFileWithDialog({
        suggestedName: fileName,
        content: normalizedSvgMarkup,
        filters: [{
          name: "SVG Image",
          extensions: ["svg"],
        }],
      })
    } catch (error) {
      console.error("Failed to save SVG through desktop dialog.", error)
    }
    return
  }
  if (typeof document === "undefined" || typeof Blob === "undefined") {
    return
  }
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return
  }

  const blob = new Blob([normalizedSvgMarkup], {
    type: "image/svg+xml;charset=utf-8",
  })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.rel = "noopener"
  anchor.style.display = "none"
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 0)
}
