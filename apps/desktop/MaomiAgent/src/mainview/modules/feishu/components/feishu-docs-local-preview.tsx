import {
  FileTextOutlined,
  LinkOutlined,
  PaperClipOutlined,
  PictureOutlined,
  TableOutlined,
} from "@ant-design/icons"
import {
  codeBlockPlugin,
  headingsPlugin,
  jsxPlugin,
  linkPlugin,
  listsPlugin,
  MDXEditor,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  type CodeBlockEditorDescriptor,
  type JsxComponentDescriptor,
  type JsxEditorProps,
} from "@mdxeditor/editor"
import "@mdxeditor/editor/style.css"
import DOMPurify from "dompurify"
import katex from "katex"
import "katex/dist/katex.min.css"
import mermaid from "mermaid"
import { Image, Tag, Typography } from "antd"
import { gfmStrikethroughToMarkdown } from "mdast-util-gfm-strikethrough"
import { gfmTableToMarkdown } from "mdast-util-gfm-table"
import { gfmTaskListItemToMarkdown } from "mdast-util-gfm-task-list-item"
import { mdxToMarkdown } from "mdast-util-mdx"
import { toMarkdown } from "mdast-util-to-markdown"
import { Fragment, useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import type { Root, RootContent } from "mdast"
import type { LanguageCode } from "../../../config/titlebar"
import type { FeishuI18nKey as I18nKey, FeishuTranslate as Translate } from "../types"
import { isDarkThemeMode, readThemeMode } from "../../../theme/antd-theme"
import {
  formatFeishuDocsReminderMeta,
  normalizeFeishuDocsAttributes,
  normalizeFeishuDocsPreviewHref,
  readPreferredFeishuDocsAttribute,
  resolveFeishuDocsCalloutEmoji,
  resolveFeishuDocsCalloutStyle,
  resolveFeishuDocsGridTemplateColumns,
  resolveFeishuDocsUrlHostLabel,
  resolveFeishuDocsViewTypeLabel,
} from "./feishu-docs-render-utils"
import {
  isMarkdownIndentedCodeLine,
  parseMarkdownIndentedCodeBlock,
} from "./feishu-docs-markdown-code"
import { shouldRenderFeishuDocsMermaidBlock } from "./feishu-docs-mermaid"
import { renderHighlightedFeishuDocsCode, resolveFeishuDocsHighlightLanguage } from "./feishu-docs-markdown-highlight"
import { parseFeishuDocsLocalPreview, type FeishuDocsPreviewNode } from "./feishu-docs-local-preview-model"
import {
  collectNativeTableRows,
  TABLE_COLUMN_COUNT_ATTRIBUTE_NAMES,
  TABLE_ROW_COUNT_ATTRIBUTE_NAMES,
  type NativeTableRow,
} from "./feishu-docs-native-table-layout"
import {
  resolveFeishuDocsPreviewBlockName,
  splitFeishuDocsEmbeddedNativeBlocks,
} from "./feishu-docs-embedded-native-blocks"
import { resolveFeishuDocsTagLabel } from "./feishu-docs-tag-labels"
import {
  FEISHU_DOCS_TAG_SPECS,
  normalizeFeishuDocsTagName,
  resolveFeishuDocsTagSpec,
  type FeishuDocsTagSpec,
} from "./feishu-docs-tag-spec"

const { Text } = Typography

type FeishuDocsLocalPreviewProps = {
  t?: Translate
  language?: LanguageCode
  markdown: string
  mediaPreviewUrls?: Record<string, string>
  mediaPreviewErrors?: Record<string, string>
  whiteboardPreviewUrls?: Record<string, string>
  whiteboardPreviewFocusRects?: Record<string, { left: number; top: number; width: number; height: number }>
  whiteboardPreviewErrors?: Record<string, string>
}

type NativePropItem = {
  label: string
  value: string
}

type InlineRenderContext = {
  t?: Translate
  language?: LanguageCode
  headingSlugCounts?: Map<string, number>
}

type InlineTagRenderer = (
  attributes: Record<string, string>,
  content: string | null,
  context: InlineRenderContext,
) => ReactNode

type InlineToken = {
  length: number
  render: (key: string) => ReactNode
}

type MarkdownBlock =
  | {
    kind: "heading"
    level: number
    text: string
  }
  | {
    kind: "paragraph"
    text: string
  }
  | {
    kind: "blockquote"
    blocks: MarkdownBlock[]
  }
  | {
    kind: "unordered_list"
    items: string[]
  }
  | {
    kind: "ordered_list"
    items: string[]
    start: number
  }
  | {
    kind: "code_block"
    code: string
    language?: string
  }
  | {
    kind: "math_block"
    expression: string
  }
  | {
    kind: "table"
    headers: string[]
    aligns: Array<"left" | "center" | "right" | undefined>
    rows: string[][]
  }
  | {
    kind: "divider"
  }

type MarkdownListMarker = {
  ordered: boolean
  indent: number
  start: number
  content: string
}

export type FeishuDocsMdxPreviewContext = {
  t?: Translate
  language: LanguageCode
  mediaPreviewUrls?: Record<string, string>
  mediaPreviewErrors?: Record<string, string>
  whiteboardPreviewUrls?: Record<string, string>
  whiteboardPreviewFocusRects?: Record<string, { left: number; top: number; width: number; height: number }>
  whiteboardPreviewErrors?: Record<string, string>
}

type FeishuDocsMdxMarkdownProps = FeishuDocsMdxPreviewContext & {
  markdown: string
  className?: string
}

type FeishuDocsMdxJsxNode = JsxEditorProps["mdastNode"]

const FEISHU_DOCS_BOARD_PREVIEW_MAX_WIDTH = 700
const FEISHU_DOCS_BOARD_PREVIEW_MAX_HEIGHT = 700
const FEISHU_DOCS_DIAGRAM_PREVIEW_MAX_WIDTH = 700
const FEISHU_DOCS_DIAGRAM_PREVIEW_MAX_HEIGHT = 700

export const FEISHU_DOCS_MARKDOWN_CODE_BLOCK_LANGUAGE_LABELS: Record<string, string> = {
  bash: "Bash",
  c: "C",
  cs: "C#",
  csharp: "C#",
  cpp: "C++",
  "c++": "C++",
  css: "CSS",
  go: "Go",
  html: "HTML",
  java: "Java",
  javascript: "JavaScript",
  js: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  katex: "KaTeX",
  latex: "LaTeX",
  markdown: "Markdown",
  math: "Math",
  mermaid: "Mermaid",
  md: "Markdown",
  plaintext: "Plain Text",
  powershell: "PowerShell",
  ps1: "PowerShell",
  py: "Python",
  python: "Python",
  rs: "Rust",
  rust: "Rust",
  sh: "Shell",
  shell: "Shell",
  shellscript: "Shell",
  sql: "SQL",
  text: "Plain Text",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  xml: "XML",
  yaml: "YAML",
  yml: "YAML",
  zsh: "Zsh",
}

const MATH_CODE_BLOCK_LANGUAGES = new Set(["katex", "latex", "math", "tex"])

const FEISHU_DOCS_READONLY_BLOCKS = new Set([
  "sheet",
  "bitable",
  "board",
  "whiteboard",
  "mindnote",
  "diagram",
  "add-ons",
  "chat-card",
  "source-synced",
  "reference-synced",
  "ai-template",
  "undefined",
  "wiki-catalog",
])

const FEISHU_DOCS_CONTAINER_BLOCKS = new Set([
  "table",
  "table-cell",
  "quote-container",
  "task",
  "okr",
  "okr-objective",
  "okr-key-result",
  "okr-progress",
  "agenda",
  "agenda-item",
  "agenda-item-title",
  "agenda-item-content",
  "lark-table",
])

const FEISHU_DOCS_LARK_TABLE_SECTION_NAMES = new Set([
  "lark-tbody",
  "lark-thead",
])

const FEISHU_DOCS_LARK_TABLE_ROW_NAMES = new Set([
  "lark-tr",
])

const FEISHU_DOCS_LARK_TABLE_CELL_NAMES = new Set([
  "lark-td",
  "lark-th",
])

type NativePreviewNode = Extract<FeishuDocsPreviewNode, { kind: "native_block" }>

type LarkTableRow = {
  key: string
  header: boolean
  cells: NativePreviewNode[]
}

function resolveToneClassName(spec: FeishuDocsTagSpec | null): string {
  if (!spec) {
    return "tone-generic"
  }
  return `tone-${spec.tone}`
}

function previewText(
  t: Translate | undefined,
  key: I18nKey,
  fallback: string,
  params?: Record<string, string | number>,
): string {
  if (!t) {
    return fallback
  }

  const translated = t(key, params)
  return translated === key ? fallback : translated
}

function normalizeMarkdownSource(value: string): string {
  return value.replace(/\r\n/g, "\n")
}

function resolvePreviewErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  return typeof error === "string" ? error.trim() : String(error ?? "").trim()
}

function renderKatexMarkup(expression: string, displayMode: boolean): {
  markup: string
  error: string
} {
  const source = normalizeMarkdownSource(expression).trim()
  if (!source) {
    return {
      markup: "",
      error: "",
    }
  }

  try {
    return {
      markup: katex.renderToString(source, {
        displayMode,
        output: "html",
        strict: "ignore",
        throwOnError: false,
        trust: false,
      }),
      error: "",
    }
  } catch (error) {
    return {
      markup: "",
      error: resolvePreviewErrorMessage(error),
    }
  }
}

function extractImageContentBounds(input: {
  data: Uint8ClampedArray
  width: number
  height: number
}): {
  left: number
  top: number
  right: number
  bottom: number
} | null {
  let left = input.width
  let top = input.height
  let right = -1
  let bottom = -1

  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const index = (y * input.width + x) * 4
      const alpha = input.data[index + 3] ?? 0
      if (alpha < 18) {
        continue
      }

      const red = input.data[index] ?? 255
      const green = input.data[index + 1] ?? 255
      const blue = input.data[index + 2] ?? 255
      const isNearWhite = red >= 248 && green >= 248 && blue >= 248
      if (isNearWhite) {
        continue
      }

      if (x < left) {
        left = x
      }
      if (y < top) {
        top = y
      }
      if (x > right) {
        right = x
      }
      if (y > bottom) {
        bottom = y
      }
    }
  }

  if (right < left || bottom < top) {
    return null
  }

  return {
    left,
    top,
    right,
    bottom,
  }
}

function FeishuDocsPreviewImage(input: {
  src: string
  alt: string
  displayMode?: "default" | "board"
  plain?: boolean
  preferredWidth?: number
  preferredHeight?: number
  focusRect?: {
    left: number
    top: number
    width: number
    height: number
  }
  t?: Translate
}) {
  const [thumbnailSrc, setThumbnailSrc] = useState(input.src)
  const [imageFailed, setImageFailed] = useState(false)
  const imageStyle: (CSSProperties & {
    "--feishu-docs-preview-image-max-width"?: string
    "--feishu-docs-preview-image-max-height"?: string
  }) | undefined = input.preferredWidth || input.preferredHeight
    ? {
        ...(input.preferredWidth ? { "--feishu-docs-preview-image-max-width": `${input.preferredWidth}px` } : {}),
        ...(input.preferredHeight ? { "--feishu-docs-preview-image-max-height": `${input.preferredHeight}px` } : {}),
      }
    : undefined

  useEffect(() => {
    setThumbnailSrc(input.src)
    setImageFailed(false)

    if (
      input.displayMode !== "board"
      || typeof window === "undefined"
      || typeof document === "undefined"
    ) {
      return
    }

    let cancelled = false
    const image = new window.Image()
    image.decoding = "async"
    image.onload = () => {
      if (cancelled) {
        return
      }

      const naturalWidth = image.naturalWidth || image.width
      const naturalHeight = image.naturalHeight || image.height
      if (!naturalWidth || !naturalHeight) {
        return
      }

      try {
        if (input.focusRect) {
          const normalizedRect = (() => {
            const rawLeft = input.focusRect.left
            const rawTop = input.focusRect.top
            const rawWidth = input.focusRect.width
            const rawHeight = input.focusRect.height
            if (![rawLeft, rawTop, rawWidth, rawHeight].every((value) => Number.isFinite(value))) {
              return null
            }

            const rawRight = rawLeft + rawWidth
            const rawBottom = rawTop + rawHeight
            const overflowX = rawRight > naturalWidth * 1.08
            const overflowY = rawBottom > naturalHeight * 1.08
            const scale = overflowX || overflowY
              ? Math.min(
                  naturalWidth / Math.max(rawRight, naturalWidth),
                  naturalHeight / Math.max(rawBottom, naturalHeight),
                )
              : 1
            const left = Math.max(0, Math.round(rawLeft * scale))
            const top = Math.max(0, Math.round(rawTop * scale))
            const width = Math.max(1, Math.round(rawWidth * scale))
            const height = Math.max(1, Math.round(rawHeight * scale))
            if (left >= naturalWidth || top >= naturalHeight) {
              return null
            }

            return {
              left,
              top,
              width: Math.min(width, naturalWidth - left),
              height: Math.min(height, naturalHeight - top),
            }
          })()

          if (normalizedRect && normalizedRect.width > 24 && normalizedRect.height > 24) {
            const cropCanvas = document.createElement("canvas")
            cropCanvas.width = normalizedRect.width
            cropCanvas.height = normalizedRect.height
            const cropContext = cropCanvas.getContext("2d")
            if (cropContext) {
              cropContext.drawImage(
                image,
                normalizedRect.left,
                normalizedRect.top,
                normalizedRect.width,
                normalizedRect.height,
                0,
                0,
                normalizedRect.width,
                normalizedRect.height,
              )
              if (!cancelled) {
                setThumbnailSrc(cropCanvas.toDataURL("image/png"))
                return
              }
            }
          }
        }

        const scanScale = Math.min(1, 1200 / Math.max(naturalWidth, naturalHeight))
        const scanWidth = Math.max(1, Math.round(naturalWidth * scanScale))
        const scanHeight = Math.max(1, Math.round(naturalHeight * scanScale))
        const scanCanvas = document.createElement("canvas")
        scanCanvas.width = scanWidth
        scanCanvas.height = scanHeight
        const scanContext = scanCanvas.getContext("2d", { willReadFrequently: true })
        if (!scanContext) {
          return
        }

        scanContext.drawImage(image, 0, 0, scanWidth, scanHeight)
        const imageData = scanContext.getImageData(0, 0, scanWidth, scanHeight)
        const bounds = extractImageContentBounds({
          data: imageData.data,
          width: scanWidth,
          height: scanHeight,
        })
        if (!bounds) {
          return
        }

        const visibleWidth = bounds.right - bounds.left + 1
        const visibleHeight = bounds.bottom - bounds.top + 1
        const coverage = (visibleWidth * visibleHeight) / (scanWidth * scanHeight)
        if (coverage > 0.88) {
          return
        }

        const padding = Math.max(12, Math.round(Math.max(scanWidth, scanHeight) * 0.035))
        const cropLeft = Math.max(0, bounds.left - padding)
        const cropTop = Math.max(0, bounds.top - padding)
        const cropRight = Math.min(scanWidth - 1, bounds.right + padding)
        const cropBottom = Math.min(scanHeight - 1, bounds.bottom + padding)

        const sourceX = Math.round(cropLeft / scanScale)
        const sourceY = Math.round(cropTop / scanScale)
        const sourceWidth = Math.max(1, Math.round((cropRight - cropLeft + 1) / scanScale))
        const sourceHeight = Math.max(1, Math.round((cropBottom - cropTop + 1) / scanScale))

        const cropCanvas = document.createElement("canvas")
        cropCanvas.width = sourceWidth
        cropCanvas.height = sourceHeight
        const cropContext = cropCanvas.getContext("2d")
        if (!cropContext) {
          return
        }

        cropContext.drawImage(
          image,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          sourceWidth,
          sourceHeight,
        )

        if (!cancelled) {
          setThumbnailSrc(cropCanvas.toDataURL("image/png"))
        }
      } catch {
        // Fall back to the original image when cropping is unavailable.
      }
    }
    image.src = input.src

    return () => {
      cancelled = true
    }
  }, [input.displayMode, input.focusRect, input.src])

  return (
    <div
      className={[
        "feishu-docs-local-preview-image-shell",
        input.displayMode === "board" ? "is-board" : "",
        input.plain ? "is-plain" : "",
      ].filter(Boolean).join(" ")}
      style={imageStyle}
    >
      <div className="feishu-docs-local-preview-image-frame">
        {imageFailed ? (
          <div className={`feishu-docs-local-preview-image-placeholder${input.plain ? " is-plain" : ""}`}>
            <PictureOutlined />
            <Text type="secondary">{input.alt || "预览加载失败"}</Text>
          </div>
        ) : (
          <Image
            className="feishu-docs-local-preview-image"
            rootClassName="feishu-docs-local-preview-image-root"
            src={thumbnailSrc}
            alt={input.alt}
            loading="lazy"
            preview={{
              src: input.src,
            }}
            onError={() => setImageFailed(true)}
          />
        )}
      </div>
    </div>
  )
}

function parseFeishuDocsPreviewDimension(value: string | undefined): number | undefined {
  const normalized = value?.trim()
  if (!normalized) {
    return undefined
  }

  const parsed = Number.parseFloat(normalized)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined
  }

  return Math.round(parsed)
}

function readFeishuDocsPreviewDimensions(attributes: Record<string, string>): {
  width?: number
  height?: number
} {
  return {
    width: parseFeishuDocsPreviewDimension(readPreferredFeishuDocsAttribute(attributes, ["width"])),
    height: parseFeishuDocsPreviewDimension(readPreferredFeishuDocsAttribute(attributes, ["height"])),
  }
}

function FeishuDocsMathInline(input: {
  expression: string
  t?: Translate
}) {
  const rendered = useMemo(
    () => renderKatexMarkup(input.expression, false),
    [input.expression],
  )
  const normalizedExpression = normalizeMarkdownSource(input.expression).trim()

  if (!rendered.markup) {
    return (
      <code
        className="feishu-docs-local-preview-math-inline is-fallback"
        title={previewText(input.t, "飞书页.文档.预览.公式.渲染失败", "公式渲染失败，已回退源码。")}
      >
        {normalizedExpression}
      </code>
    )
  }

  return (
    <span
      className="feishu-docs-local-preview-math-inline"
      aria-label={previewText(input.t, "飞书页.文档.预览.行内标签.公式", "公式")}
      dangerouslySetInnerHTML={{ __html: rendered.markup }}
    />
  )
}

function FeishuDocsMathBlock(input: {
  expression: string
  t?: Translate
}) {
  const rendered = useMemo(
    () => renderKatexMarkup(input.expression, true),
    [input.expression],
  )
  const normalizedExpression = normalizeMarkdownSource(input.expression).trim()

  return (
    <div className="feishu-docs-local-preview-math-block">
      {rendered.markup ? (
        <div
          className="feishu-docs-local-preview-math-block-rendered"
          dangerouslySetInnerHTML={{ __html: rendered.markup }}
        />
      ) : (
        <pre className="feishu-docs-local-preview-math-block-fallback">
          <code>{normalizedExpression}</code>
        </pre>
      )}
      {rendered.error ? (
        <Text type="secondary" className="feishu-docs-local-preview-math-note">
          {previewText(input.t, "飞书页.文档.预览.公式.渲染失败", "公式渲染失败，已回退源码。")}
        </Text>
      ) : null}
    </div>
  )
}

function FeishuDocsMermaidBlock(input: {
  source: string
  t?: Translate
}) {
  const source = useMemo(
    () => normalizeMarkdownSource(input.source).trim(),
    [input.source],
  )
  const renderId = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const [svg, setSvg] = useState("")
  const [error, setError] = useState("")
  const mermaidTheme = isDarkThemeMode(readThemeMode()) ? "dark" : "default"

  useEffect(() => {
    if (!source || typeof window === "undefined") {
      setSvg("")
      setError("")
      return
    }

    let cancelled = false
    setSvg("")
    setError("")

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: mermaidTheme,
      htmlLabels: false,
    })

    void mermaid.render(`feishu-docs-mermaid-${renderId}`, source)
      .then((rendered) => {
        if (cancelled) {
          return
        }
        setSvg(
          DOMPurify.sanitize(rendered.svg, {
            USE_PROFILES: {
              svg: true,
              svgFilters: true,
            },
            ADD_TAGS: ["style"],
            ADD_ATTR: ["style"],
          }),
        )
        setError("")
      })
      .catch((renderError) => {
        if (cancelled) {
          return
        }
        setSvg("")
        setError(resolvePreviewErrorMessage(renderError))
      })

    return () => {
      cancelled = true
    }
  }, [mermaidTheme, renderId, source])

  return (
    <div className="feishu-docs-local-preview-mermaid-shell">
      {svg ? (
        <div
          className="feishu-docs-local-preview-mermaid-rendered"
          style={{
            maxWidth: `${FEISHU_DOCS_DIAGRAM_PREVIEW_MAX_WIDTH}px`,
            maxHeight: `${FEISHU_DOCS_DIAGRAM_PREVIEW_MAX_HEIGHT}px`,
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <pre className="feishu-docs-local-preview-mermaid-fallback">
          <code>{source}</code>
        </pre>
      )}
      {error ? (
        <Text type="secondary" className="feishu-docs-local-preview-math-note">
          {previewText(
            input.t,
            "飞书页.文档.预览.Mermaid.渲染失败",
            "Mermaid 渲染失败，已回退源码。",
          )}
        </Text>
      ) : null}
    </div>
  )
}

function FeishuDocsInlineNativeTag(input: {
  className?: string
  label: string
  value: string
  meta?: string
  href?: string | null
}) {
  const content = (
    <>
      <span className="feishu-docs-local-preview-inline-label">{input.label}</span>
      <span className="feishu-docs-local-preview-inline-value">{input.value}</span>
      {input.meta ? <span className="feishu-docs-local-preview-inline-meta">{input.meta}</span> : null}
    </>
  )

  if (input.href) {
    return (
      <a
        href={input.href}
        target="_blank"
        rel="noreferrer"
        className={`feishu-docs-local-preview-inline ${input.className ?? ""}`.trim()}
      >
        {content}
      </a>
    )
  }

  return (
    <span className={`feishu-docs-local-preview-inline ${input.className ?? ""}`.trim()}>
      {content}
    </span>
  )
}

function renderInlineMentionUser(attributes: Record<string, string>, t?: Translate) {
  const name = readPreferredFeishuDocsAttribute(attributes, ["name", "title", "user-id", "user_id", "create_user_id"])
    || previewText(t, "飞书页.文档.预览.未命名用户", "未命名用户")
  return <FeishuDocsInlineNativeTag className="is-mention" label="@" value={name} />
}

function renderInlineMentionDoc(attributes: Record<string, string>, t?: Translate) {
  const title = readPreferredFeishuDocsAttribute(attributes, ["title", "name", "doc-id", "doc_id", "token"])
    || previewText(t, "飞书页.文档.预览.未命名文档", "未命名文档")
  return (
    <FeishuDocsInlineNativeTag
      className="is-doc"
      label={previewText(t, "飞书页.文档.预览.行内标签.文档", "文档")}
      value={title}
      href={normalizeFeishuDocsPreviewHref(readPreferredFeishuDocsAttribute(attributes, ["url", "href"]))}
    />
  )
}

function renderInlineReminder(
  attributes: Record<string, string>,
  t?: Translate,
  language: LanguageCode = "zh-CN",
) {
  const text = readPreferredFeishuDocsAttribute(attributes, ["text", "title", "label"])
    || previewText(t, "飞书页.文档.预览.行内标签.提醒", "提醒")
  const time = formatFeishuDocsReminderMeta(attributes, language, t)
  return (
    <FeishuDocsInlineNativeTag
      className="is-reminder"
      label={previewText(t, "飞书页.文档.预览.行内标签.提醒", "提醒")}
      value={text}
      meta={time}
    />
  )
}

function renderInlineEquation(attributes: Record<string, string>, t?: Translate) {
  const formula = readPreferredFeishuDocsAttribute(attributes, ["formula", "latex", "text", "content"])
    || previewText(t, "飞书页.文档.预览.行内标签.公式", "公式")
  return (
    <span className="feishu-docs-local-preview-inline is-equation">
      <span className="feishu-docs-local-preview-inline-label">
        {previewText(t, "飞书页.文档.预览.行内标签.公式", "公式")}
      </span>
      <FeishuDocsMathInline expression={formula} t={t} />
    </span>
  )
}

function renderInlineFile(attributes: Record<string, string>, t?: Translate) {
  const name = readPreferredFeishuDocsAttribute(attributes, ["name", "title", "token", "file-token", "file_token", "source-block-id"])
    || previewText(t, "飞书页.文档.预览.行内标签.附件", "附件")
  return (
    <FeishuDocsInlineNativeTag
      className="is-file"
      label={previewText(t, "飞书页.文档.预览.行内标签.附件", "附件")}
      value={name}
    />
  )
}

function renderInlineBlock(attributes: Record<string, string>, t?: Translate) {
  const title = readPreferredFeishuDocsAttribute(attributes, ["title", "name", "block-id", "block_id"])
    || previewText(t, "飞书页.文档.预览.行内标签.块引用", "块引用")
  return (
    <FeishuDocsInlineNativeTag
      className="is-block"
      label={previewText(t, "飞书页.文档.预览.行内标签.块", "块")}
      value={title}
    />
  )
}

function renderInlineText(
  attributes: Record<string, string>,
  content: string | null,
  context: InlineRenderContext,
) {
  const normalizedAttributes = normalizeFeishuDocsAttributes(attributes)
  const textColorRaw = readPreferredFeishuDocsAttribute(normalizedAttributes, ["text-color", "color"])
  const backgroundColorRaw = readPreferredFeishuDocsAttribute(normalizedAttributes, ["background-color", "background"])
  const calloutStyle = resolveFeishuDocsCalloutStyle(normalizedAttributes)
  const text = content ?? readPreferredFeishuDocsAttribute(normalizedAttributes, ["text", "title", "label", "content"])
  if (!text) {
    return null
  }

  return (
    <span
      style={{
        ...(textColorRaw ? { color: calloutStyle.textColor } : {}),
        ...(backgroundColorRaw ? { backgroundColor: calloutStyle.backgroundColor, borderRadius: 4, paddingInline: 4 } : {}),
      }}
    >
      {renderInlineMarkdownMultiline(text, "inline:text", context)}
    </span>
  )
}

const INLINE_FEISHU_TAG_RENDERERS = {
  "mention-user": (attributes, _content, context) => (
    renderInlineMentionUser(attributes, context.t)
  ),
  "mention-doc": (attributes, _content, context) => (
    renderInlineMentionDoc(attributes, context.t)
  ),
  reminder: (attributes, _content, context) => (
    renderInlineReminder(attributes, context.t, context.language ?? "zh-CN")
  ),
  equation: (attributes, _content, context) => (
    renderInlineEquation(attributes, context.t)
  ),
  "inline-file": (attributes, _content, context) => (
    renderInlineFile(attributes, context.t)
  ),
  "inline-block": (attributes, _content, context) => (
    renderInlineBlock(attributes, context.t)
  ),
  text: (attributes, content, context) => renderInlineText(attributes, content, context),
  br: () => <br />,
} satisfies Record<string, InlineTagRenderer>

const INLINE_FEISHU_TAGS = new Set(
  [
    ...FEISHU_DOCS_TAG_SPECS
      .filter((item) => item.kind === "text")
      .map((item) => item.name),
    "text",
    "br",
  ],
)

function parseTagAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  const attributePattern = /([A-Za-z_:][\w:.-]*)(?:=(?:"([^"]*)"|'([^']*)'|{([^}]*)}|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null

  while ((match = attributePattern.exec(source)) !== null) {
    const name = match[1]?.trim()
    if (!name) {
      continue
    }
    const value = match[2] ?? match[3] ?? match[4] ?? match[5] ?? "true"
    attributes[name] = value.trim()
  }

  return attributes
}

function parseInlineFeishuTagAt(source: string, cursor: number, context: InlineRenderContext): InlineToken | null {
  if (source[cursor] !== "<") {
    return null
  }

  const slice = source.slice(cursor)
  const breakMatch = /^<br\s*\/?>/i.exec(slice)
  if (breakMatch) {
    return {
      length: breakMatch[0].length,
      render: (key) => <Fragment key={key}><br /></Fragment>,
    }
  }

  const selfClosingMatch = /^<([A-Za-z][\w-]*)([^<>]*?)\/>/.exec(slice)
  if (selfClosingMatch) {
    const normalizedName = normalizeFeishuDocsTagName(selfClosingMatch[1] ?? "")
    if (!INLINE_FEISHU_TAGS.has(normalizedName)) {
      return null
    }
    const renderer = INLINE_FEISHU_TAG_RENDERERS[normalizedName as keyof typeof INLINE_FEISHU_TAG_RENDERERS]
    if (!renderer) {
      return null
    }
    const attributes = parseTagAttributes(selfClosingMatch[2] ?? "")
    return {
      length: selfClosingMatch[0].length,
      render: (key) => <Fragment key={key}>{renderer(attributes, null, context)}</Fragment>,
    }
  }

  const openTagMatch = /^<([A-Za-z][\w-]*)([^<>]*?)>/.exec(slice)
  if (!openTagMatch) {
    return null
  }

  const normalizedName = normalizeFeishuDocsTagName(openTagMatch[1] ?? "")
  if (!INLINE_FEISHU_TAGS.has(normalizedName)) {
    return null
  }

  const closeTag = `</${openTagMatch[1]}>`
  const closeIndex = slice.indexOf(closeTag, openTagMatch[0].length)
  if (closeIndex < 0) {
    return null
  }

  const renderer = INLINE_FEISHU_TAG_RENDERERS[normalizedName as keyof typeof INLINE_FEISHU_TAG_RENDERERS]
  if (!renderer) {
    return null
  }

  const content = slice.slice(openTagMatch[0].length, closeIndex)
  const attributes = parseTagAttributes(openTagMatch[2] ?? "")
  if (content.trim() && !readPreferredFeishuDocsAttribute(attributes, ["text", "title", "label", "content"])) {
    attributes.text = content.trim()
  }

  return {
    length: closeIndex + closeTag.length,
    render: (key) => <Fragment key={key}>{renderer(attributes, content, context)}</Fragment>,
  }
}

function parseInlineCodeSpanAt(source: string, cursor: number): InlineToken | null {
  if (source[cursor] !== "`") {
    return null
  }
  const closeIndex = source.indexOf("`", cursor + 1)
  if (closeIndex <= cursor + 1) {
    return null
  }
  const content = source.slice(cursor + 1, closeIndex)
  return {
    length: closeIndex - cursor + 1,
    render: (key) => <code key={key}>{content}</code>,
  }
}

function findBalancedTerminator(source: string, start: number, openChar: string, closeChar: string): number {
  let depth = 0
  let escaped = false

  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === "\\") {
      escaped = true
      continue
    }
    if (char === openChar) {
      depth += 1
      continue
    }
    if (char === closeChar) {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

function parseLinkTarget(rawTarget: string): {
  href: string | null
  title?: string
} {
  const trimmed = rawTarget.trim()
  if (!trimmed) {
    return { href: null }
  }

  const titleMatch = /^(?<href>\S+?)(?:\s+"(?<title>[^"]*)")?$/.exec(trimmed)
  const hrefRaw = titleMatch?.groups?.href ?? trimmed
  const title = titleMatch?.groups?.title

  return {
    href: normalizeFeishuDocsPreviewHref(hrefRaw),
    ...(title ? { title } : {}),
  }
}

function parseInlineImageAt(source: string, cursor: number): InlineToken | null {
  if (!source.startsWith("![", cursor)) {
    return null
  }

  const labelEnd = findBalancedTerminator(source, cursor + 1, "[", "]")
  if (labelEnd < 0 || source[labelEnd + 1] !== "(") {
    return null
  }
  const targetEnd = findBalancedTerminator(source, labelEnd + 1, "(", ")")
  if (targetEnd < 0) {
    return null
  }

  const alt = source.slice(cursor + 2, labelEnd)
  const target = parseLinkTarget(source.slice(labelEnd + 2, targetEnd))
  if (!target.href) {
    return null
  }
  const safeHref = target.href

  return {
    length: targetEnd - cursor + 1,
    render: (key) => (
      <img
        key={key}
        src={safeHref}
        alt={alt}
        title={target.title}
      />
    ),
  }
}

function parseInlineLinkAt(source: string, cursor: number, context: InlineRenderContext): InlineToken | null {
  if (source[cursor] !== "[") {
    return null
  }

  const labelEnd = findBalancedTerminator(source, cursor, "[", "]")
  if (labelEnd < 0 || source[labelEnd + 1] !== "(") {
    return null
  }
  const targetEnd = findBalancedTerminator(source, labelEnd + 1, "(", ")")
  if (targetEnd < 0) {
    return null
  }

  const label = source.slice(cursor + 1, labelEnd)
  const target = parseLinkTarget(source.slice(labelEnd + 2, targetEnd))
  if (!target.href) {
    return null
  }
  const safeHref = target.href

  return {
    length: targetEnd - cursor + 1,
    render: (key) => (
      <a key={key} href={safeHref} target="_blank" rel="noreferrer" title={target.title}>
        {renderInlineMarkdown(label, `${key}:label`, context)}
      </a>
    ),
  }
}

function parseDelimitedInlineToken(
  source: string,
  cursor: number,
  delimiter: string,
  render: (key: string, content: string) => ReactNode,
): InlineToken | null {
  if (!source.startsWith(delimiter, cursor)) {
    return null
  }

  const closeIndex = source.indexOf(delimiter, cursor + delimiter.length)
  if (closeIndex <= cursor + delimiter.length) {
    return null
  }

  const content = source.slice(cursor + delimiter.length, closeIndex)
  if (!content.trim()) {
    return null
  }

  return {
    length: closeIndex - cursor + delimiter.length,
    render: (key) => render(key, content),
  }
}

function findInlineMathTerminator(
  source: string,
  start: number,
  delimiter: string,
): number {
  let escaped = false

  for (let index = start; index < source.length; index += 1) {
    const char = source[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (char === "\\") {
      escaped = true
      continue
    }

    if (char === "\n" && delimiter === "$") {
      return -1
    }

    if (source.startsWith(delimiter, index)) {
      return index
    }
  }

  return -1
}

function parseInlineMathAt(source: string, cursor: number, context: InlineRenderContext): InlineToken | null {
  let opening = ""
  let closing = ""
  let displayMode = false

  if (source.startsWith("\\(", cursor)) {
    opening = "\\("
    closing = "\\)"
  } else if (source.startsWith("\\[", cursor)) {
    opening = "\\["
    closing = "\\]"
    displayMode = true
  } else if (source[cursor] === "$" && source[cursor + 1] !== "$") {
    opening = "$"
    closing = "$"
  } else {
    return null
  }

  const closeIndex = findInlineMathTerminator(source, cursor + opening.length, closing)
  if (closeIndex <= cursor + opening.length) {
    return null
  }

  const content = source.slice(cursor + opening.length, closeIndex).trim()
  if (!content) {
    return null
  }

  return {
    length: closeIndex - cursor + closing.length,
    render: (key) => (
      displayMode
        ? <FeishuDocsMathBlock key={key} expression={content} t={context.t} />
        : <FeishuDocsMathInline key={key} expression={content} t={context.t} />
    ),
  }
}

function parseAutoLinkAt(source: string, cursor: number): InlineToken | null {
  const slice = source.slice(cursor)
  const match = /^(https?:\/\/\S+)/.exec(slice)
  if (!match) {
    return null
  }

  let rawUrl = match[1]
  let suffix = ""
  while (/[),.;!?]$/.test(rawUrl)) {
    suffix = rawUrl.slice(-1) + suffix
    rawUrl = rawUrl.slice(0, -1)
  }

  const safeHref = normalizeFeishuDocsPreviewHref(rawUrl)
  if (!safeHref) {
    return null
  }

  return {
    length: rawUrl.length + suffix.length,
    render: (key) => (
      <Fragment key={key}>
        <a href={safeHref} target="_blank" rel="noreferrer">{rawUrl}</a>
        {suffix}
      </Fragment>
    ),
  }
}

function parseInlineToken(source: string, cursor: number, context: InlineRenderContext): InlineToken | null {
  return parseInlineFeishuTagAt(source, cursor, context)
    ?? parseInlineCodeSpanAt(source, cursor)
    ?? parseInlineMathAt(source, cursor, context)
    ?? parseInlineImageAt(source, cursor)
    ?? parseInlineLinkAt(source, cursor, context)
    ?? parseDelimitedInlineToken(source, cursor, "**", (key, content) => (
      <strong key={key}>{renderInlineMarkdown(content, `${key}:strong`, context)}</strong>
    ))
    ?? parseDelimitedInlineToken(source, cursor, "~~", (key, content) => (
      <del key={key}>{renderInlineMarkdown(content, `${key}:del`, context)}</del>
    ))
    ?? parseDelimitedInlineToken(source, cursor, "*", (key, content) => (
      <em key={key}>{renderInlineMarkdown(content, `${key}:em`, context)}</em>
    ))
    ?? parseAutoLinkAt(source, cursor)
}

function renderInlineMarkdown(source: string, keyPrefix: string, context: InlineRenderContext): ReactNode[] {
  if (!source) {
    return []
  }

  const nodes: ReactNode[] = []
  let cursor = 0
  let textStart = 0
  let textIndex = 0
  let tokenIndex = 0

  const pushText = (text: string) => {
    if (!text) {
      return
    }
    nodes.push(
      <Fragment key={`${keyPrefix}:text:${textIndex}`}>
        {text}
      </Fragment>,
    )
    textIndex += 1
  }

  while (cursor < source.length) {
    const token = parseInlineToken(source, cursor, context)
    if (!token) {
      cursor += 1
      continue
    }

    pushText(source.slice(textStart, cursor))
    nodes.push(token.render(`${keyPrefix}:token:${tokenIndex}`))
    tokenIndex += 1
    cursor += token.length
    textStart = cursor
  }

  pushText(source.slice(textStart))
  return nodes
}

function renderInlineMarkdownMultiline(source: string, keyPrefix: string, context: InlineRenderContext): ReactNode[] {
  const lines = source.split("\n")
  const nodes: ReactNode[] = []

  lines.forEach((line, index) => {
    if (index > 0) {
      nodes.push(<br key={`${keyPrefix}:br:${index}`} />)
    }
    nodes.push(...renderInlineMarkdown(line, `${keyPrefix}:line:${index}`, context))
  })

  return nodes
}

function isBlankLine(line: string): boolean {
  return !line.trim()
}

function isMarkdownDividerLine(line: string): boolean {
  return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)
}

function parseMarkdownListMarker(line: string): MarkdownListMarker | null {
  const unorderedMatch = /^(\s*)[-+*]\s+(.*)$/.exec(line)
  if (unorderedMatch) {
    return {
      ordered: false,
      indent: unorderedMatch[1]?.length ?? 0,
      start: 1,
      content: unorderedMatch[2] ?? "",
    }
  }

  const orderedMatch = /^(\s*)(\d+)\.\s+(.*)$/.exec(line)
  if (orderedMatch) {
    return {
      ordered: true,
      indent: orderedMatch[1]?.length ?? 0,
      start: Number(orderedMatch[2] ?? "1") || 1,
      content: orderedMatch[3] ?? "",
    }
  }

  return null
}

function isMarkdownCodeFenceStart(line: string): {
  fence: string
  language?: string
} | null {
  const match = /^\s*(```+|~~~+)(.*)$/.exec(line)
  if (!match) {
    return null
  }

  const fenceInfo = (match[2] ?? "").trim()
  const language = resolveMarkdownCodeFenceLanguage(fenceInfo)

  return {
    fence: match[1] ?? "",
    ...(language ? { language } : {}),
  }
}

function isMarkdownCodeFenceEnd(line: string, fence: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || trimmed[0] !== fence[0]) {
    return false
  }
  const fenceChars = trimmed.match(/^([`~]+)/)?.[1] ?? ""
  return fenceChars.length >= fence.length && fenceChars[0] === fence[0] && trimmed.slice(fenceChars.length).trim() === ""
}

function resolveMarkdownCodeFenceLanguage(info: string): string | undefined {
  if (!info) {
    return undefined
  }

  const token = info.match(/^(\{[^}]+\}|[^\s]+)/)?.[1] ?? ""
  if (!token) {
    return undefined
  }

  const normalizedToken = token
    .replace(/^\{+/, "")
    .replace(/\}+$/, "")
    .trim()
  if (!normalizedToken) {
    return undefined
  }

  const normalizedLanguage = normalizedToken
    .replace(/^\./, "")
    .replace(/^language-/i, "")
  if (normalizedLanguage) {
    return normalizedLanguage
  }

  return undefined
}

function findSharedLeadingWhitespacePrefix(left: string, right: string): string {
  const maxLength = Math.min(left.length, right.length)
  let index = 0

  while (index < maxLength && left[index] === right[index]) {
    index += 1
  }

  return left.slice(0, index)
}

function normalizeMarkdownCodeBlock(code: string): string {
  const lines = code.split("\n")

  while (lines.length > 0 && !lines[0]?.trim()) {
    lines.shift()
  }
  while (lines.length > 0 && !lines[lines.length - 1]?.trim()) {
    lines.pop()
  }

  let sharedIndent: string | null = null

  for (const line of lines) {
    if (!line.trim()) {
      continue
    }

    const indent = line.match(/^[\t ]*/)?.[0] ?? ""
    sharedIndent = sharedIndent === null
      ? indent
      : findSharedLeadingWhitespacePrefix(sharedIndent, indent)
  }

  if (!sharedIndent) {
    return lines.join("\n")
  }

  return lines.map((line) => (
    line.startsWith(sharedIndent) ? line.slice(sharedIndent.length) : line
  )).join("\n")
}

function buildMarkdownCodeFence(code: string, language?: string): string {
  const normalizedLanguage = language?.trim() ?? ""
  const fenceChar = code.includes("```") ? "~" : "`"
  const fencePattern = fenceChar === "`" ? /`{3,}/g : /~{3,}/g
  let longestFence = 0

  for (const match of code.matchAll(fencePattern)) {
    longestFence = Math.max(longestFence, match[0].length)
  }

  const fence = fenceChar.repeat(Math.max(3, longestFence + 1))
  return `${fence}${normalizedLanguage}\n${code}\n${fence}`
}

function resolveMarkdownCodeBlockLanguageLabel(language?: string): string | undefined {
  const normalized = language?.trim()
  if (!normalized) {
    return undefined
  }

  const lowerCaseLanguage = normalized.toLowerCase()
  const mappedLabel = FEISHU_DOCS_MARKDOWN_CODE_BLOCK_LANGUAGE_LABELS[lowerCaseLanguage]
  if (mappedLabel) {
    return mappedLabel
  }

  const words = normalized.replace(/[_-]+/g, " ").trim()
  if (!words) {
    return undefined
  }

  if (words.length <= 4) {
    return words.toUpperCase()
  }

  return words.replace(/\b\w/g, (character) => character.toUpperCase())
}

function normalizeFeishuDocsHeadingText(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function buildFeishuDocsHeadingAnchorId(text: string, slugCounts: Map<string, number>): string {
  const normalizedText = normalizeFeishuDocsHeadingText(text)
  const slugBase = normalizedText
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    || "section"
  const nextCount = (slugCounts.get(slugBase) ?? 0) + 1
  slugCounts.set(slugBase, nextCount)
  return nextCount === 1 ? `feishu-doc-heading-${slugBase}` : `feishu-doc-heading-${slugBase}-${nextCount}`
}

function isMathCodeBlockLanguage(language?: string): boolean {
  return MATH_CODE_BLOCK_LANGUAGES.has(language?.trim().toLowerCase() ?? "")
}

function isMarkdownMathBlockStart(line: string): boolean {
  const trimmed = line.trim()
  return trimmed === "$$"
    || trimmed === "\\["
    || (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4)
    || (trimmed.startsWith("\\[") && trimmed.endsWith("\\]") && trimmed.length > 4)
}

function parseMarkdownMathBlock(lines: string[], startIndex: number): {
  block: Extract<MarkdownBlock, { kind: "math_block" }>
  nextIndex: number
} | null {
  const trimmed = (lines[startIndex] ?? "").trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4) {
    return {
      block: {
        kind: "math_block",
        expression: trimmed.slice(2, -2).trim(),
      },
      nextIndex: startIndex + 1,
    }
  }

  if (trimmed.startsWith("\\[") && trimmed.endsWith("\\]") && trimmed.length > 4) {
    return {
      block: {
        kind: "math_block",
        expression: trimmed.slice(2, -2).trim(),
      },
      nextIndex: startIndex + 1,
    }
  }

  let closingMarker = ""
  if (trimmed === "$$") {
    closingMarker = "$$"
  } else if (trimmed === "\\[") {
    closingMarker = "\\]"
  } else {
    return null
  }

  const expressionLines: string[] = []
  let index = startIndex + 1
  while (index < lines.length && (lines[index] ?? "").trim() !== closingMarker) {
    expressionLines.push(lines[index] ?? "")
    index += 1
  }
  if (index < lines.length) {
    index += 1
  }

  return {
    block: {
      kind: "math_block",
      expression: normalizeMarkdownSource(expressionLines.join("\n")).trim(),
    },
    nextIndex: index,
  }
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed) {
    return []
  }

  const source = trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")

  const cells: string[] = []
  let current = ""
  let escaped = false

  for (const char of source) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === "\\") {
      escaped = true
      continue
    }
    if (char === "|") {
      cells.push(current.trim())
      current = ""
      continue
    }
    current += char
  }

  if (escaped) {
    current += "\\"
  }

  cells.push(current.trim())
  return cells
}

function isMarkdownTableSeparatorLine(line: string): boolean {
  const cells = splitMarkdownTableRow(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")))
}

function resolveMarkdownTableAlign(cell: string): "left" | "center" | "right" | undefined {
  const compact = cell.replace(/\s+/g, "")
  if (!compact) {
    return undefined
  }
  if (compact.startsWith(":") && compact.endsWith(":")) {
    return "center"
  }
  if (compact.endsWith(":")) {
    return "right"
  }
  if (compact.startsWith(":")) {
    return "left"
  }
  return undefined
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
  const header = lines[index] ?? ""
  const separator = lines[index + 1] ?? ""
  return header.includes("|") && isMarkdownTableSeparatorLine(separator)
}

function isMarkdownBlockquoteLine(line: string): boolean {
  return /^\s*>\s?/.test(line)
}

function isParagraphBoundary(lines: string[], index: number): boolean {
  const line = lines[index] ?? ""
  if (isBlankLine(line)) {
    return true
  }
  if (isMarkdownMathBlockStart(line)) {
    return true
  }
  if (isMarkdownCodeFenceStart(line)) {
    return true
  }
  if (isMarkdownIndentedCodeLine(line)) {
    return true
  }
  if (/^\s{0,3}#{1,6}\s+/.test(line)) {
    return true
  }
  if (isMarkdownDividerLine(line)) {
    return true
  }
  if (isMarkdownBlockquoteLine(line)) {
    return true
  }
  if (parseMarkdownListMarker(line)) {
    return true
  }
  if (isMarkdownTableStart(lines, index)) {
    return true
  }
  return false
}

function parseMarkdownListBlock(lines: string[], startIndex: number): {
  block: MarkdownBlock
  nextIndex: number
} {
  const firstMarker = parseMarkdownListMarker(lines[startIndex] ?? "")
  if (!firstMarker) {
    return {
      block: {
        kind: "unordered_list",
        items: [],
      },
      nextIndex: startIndex + 1,
    }
  }

  const items: string[] = []
  let index = startIndex

  while (index < lines.length) {
    const marker = parseMarkdownListMarker(lines[index] ?? "")
    if (!marker || marker.ordered !== firstMarker.ordered || marker.indent !== firstMarker.indent) {
      break
    }

    const itemLines = [marker.content]
    index += 1

    while (index < lines.length) {
      const currentLine = lines[index] ?? ""
      const nextMarker = parseMarkdownListMarker(currentLine)

      if (nextMarker && nextMarker.ordered === firstMarker.ordered && nextMarker.indent === firstMarker.indent) {
        break
      }

      if (isBlankLine(currentLine)) {
        const followingMarker = parseMarkdownListMarker(lines[index + 1] ?? "")
        if (followingMarker && followingMarker.ordered === firstMarker.ordered && followingMarker.indent === firstMarker.indent) {
          index += 1
          break
        }
        itemLines.push("")
        index += 1
        continue
      }

      if ((currentLine.match(/^\s*/)?.[0].length ?? 0) > firstMarker.indent) {
        itemLines.push(currentLine.trimStart())
        index += 1
        continue
      }

      break
    }

    while (itemLines.length > 0 && !itemLines[itemLines.length - 1]?.trim()) {
      itemLines.pop()
    }
    items.push(itemLines.join("\n").trim())
  }

  return {
    block: firstMarker.ordered
      ? {
        kind: "ordered_list",
        items,
        start: firstMarker.start,
      }
      : {
        kind: "unordered_list",
        items,
      },
    nextIndex: index,
  }
}

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const normalized = normalizeMarkdownSource(markdown)
  if (!normalized.trim()) {
    return []
  }

  const lines = normalized.split("\n")
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ""

    if (isBlankLine(line)) {
      index += 1
      continue
    }

    const mathBlock = parseMarkdownMathBlock(lines, index)
    if (mathBlock) {
      blocks.push(mathBlock.block)
      index = mathBlock.nextIndex
      continue
    }

    const fence = isMarkdownCodeFenceStart(line)
    if (fence) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !isMarkdownCodeFenceEnd(lines[index] ?? "", fence.fence)) {
        codeLines.push(lines[index] ?? "")
        index += 1
      }
      if (index < lines.length) {
        index += 1
      }
      blocks.push({
        kind: "code_block",
        code: normalizeMarkdownCodeBlock(codeLines.join("\n")),
        language: fence.language,
      })
      continue
    }

    const indentedCodeBlock = parseMarkdownIndentedCodeBlock(lines, index)
    if (indentedCodeBlock) {
      blocks.push(indentedCodeBlock.block)
      index = indentedCodeBlock.nextIndex
      continue
    }

    const headingMatch = /^\s{0,3}(#{1,6})\s+(.*?)\s*$/.exec(line)
    if (headingMatch) {
      blocks.push({
        kind: "heading",
        level: headingMatch[1]?.length ?? 1,
        text: headingMatch[2] ?? "",
      })
      index += 1
      continue
    }

    if (isMarkdownDividerLine(line)) {
      blocks.push({ kind: "divider" })
      index += 1
      continue
    }

    if (isMarkdownTableStart(lines, index)) {
      const headers = splitMarkdownTableRow(lines[index] ?? "")
      const aligns = splitMarkdownTableRow(lines[index + 1] ?? "").map(resolveMarkdownTableAlign)
      const rows: string[][] = []
      index += 2

      while (index < lines.length) {
        const rowLine = lines[index] ?? ""
        if (isBlankLine(rowLine) || !rowLine.includes("|")) {
          break
        }
        const cells = splitMarkdownTableRow(rowLine)
        rows.push(headers.map((_, cellIndex) => cells[cellIndex] ?? ""))
        index += 1
      }

      blocks.push({
        kind: "table",
        headers,
        aligns,
        rows,
      })
      continue
    }

    if (isMarkdownBlockquoteLine(line)) {
      const quoteLines: string[] = []
      while (index < lines.length) {
        const quoteLine = lines[index] ?? ""
        if (isBlankLine(quoteLine)) {
          quoteLines.push("")
          index += 1
          continue
        }
        if (!isMarkdownBlockquoteLine(quoteLine)) {
          break
        }
        quoteLines.push(quoteLine.replace(/^\s*>\s?/, ""))
        index += 1
      }
      blocks.push({
        kind: "blockquote",
        blocks: parseMarkdownBlocks(quoteLines.join("\n")),
      })
      continue
    }

    if (parseMarkdownListMarker(line)) {
      const parsedList = parseMarkdownListBlock(lines, index)
      blocks.push(parsedList.block)
      index = parsedList.nextIndex
      continue
    }

    const paragraphLines: string[] = [line]
    index += 1
    while (index < lines.length && !isParagraphBoundary(lines, index)) {
      paragraphLines.push(lines[index] ?? "")
      index += 1
    }
    blocks.push({
      kind: "paragraph",
      text: paragraphLines.join("\n").trim(),
    })
  }

  return blocks
}

function renderMarkdownHeading(
  block: Extract<MarkdownBlock, { kind: "heading" }>,
  key: string,
  context: InlineRenderContext,
) {
  const content = renderInlineMarkdownMultiline(block.text, `${key}:content`, context)
  const anchorId = buildFeishuDocsHeadingAnchorId(block.text, context.headingSlugCounts ?? new Map())
  const headingProps = {
    id: anchorId,
    "data-feishu-doc-heading-id": anchorId,
    "data-feishu-doc-heading-level": String(block.level),
  }

  switch (block.level) {
    case 1:
      return <h1 key={key} {...headingProps}>{content}</h1>
    case 2:
      return <h2 key={key} {...headingProps}>{content}</h2>
    case 3:
      return <h3 key={key} {...headingProps}>{content}</h3>
    case 4:
      return <h4 key={key} {...headingProps}>{content}</h4>
    case 5:
      return <h5 key={key} {...headingProps}>{content}</h5>
    default:
      return <h6 key={key} {...headingProps}>{content}</h6>
  }
}

function renderMarkdownCodeBlock(
  block: Extract<MarkdownBlock, { kind: "code_block" }>,
  key: string,
  context: InlineRenderContext,
) {
  if (isMathCodeBlockLanguage(block.language)) {
    return (
      <div key={key} className="feishu-docs-local-preview-code-block is-math" data-language={block.language}>
        <FeishuDocsMathBlock expression={block.code} t={context.t} />
      </div>
    )
  }

  if (shouldRenderFeishuDocsMermaidBlock({ language: block.language, source: block.code })) {
    return (
      <div key={key} className="feishu-docs-local-preview-code-block is-mermaid" data-language={block.language}>
        <FeishuDocsMermaidBlock source={block.code} t={context.t} />
      </div>
    )
  }

  const fencedMarkdown = buildMarkdownCodeFence(block.code, block.language)

  return (
    <FeishuDocsReadonlyMdxMarkdown
      key={key}
      markdown={fencedMarkdown}
      t={context.t}
      language={context.language ?? "zh-CN"}
      className="is-nested feishu-docs-local-preview-code-block-mdx"
    />
  )
}

function FeishuDocsStaticCodeBlock(props: {
  code: string
  language?: string
  t?: Translate
}) {
  const normalizedCode = normalizeMarkdownCodeBlock(props.code)
  const languageLabel = resolveMarkdownCodeBlockLanguageLabel(props.language)
  const highlighted = useMemo(
    () => renderHighlightedFeishuDocsCode({
      code: normalizedCode,
      language: props.language,
    }),
    [normalizedCode, props.language],
  )
  const highlightLanguage = highlighted.language ?? resolveFeishuDocsHighlightLanguage(props.language)

  return (
    <section className="feishu-docs-local-preview-code-block" data-language={props.language || undefined}>
      {languageLabel ? (
        <div className="feishu-docs-local-preview-code-block-head">
          <span className="feishu-docs-local-preview-code-block-language">{languageLabel}</span>
        </div>
      ) : null}
      <pre className="feishu-docs-local-preview-code-block-pre">
        {highlighted.html ? (
          <code
            className={[
              "feishu-docs-local-preview-code-block-code",
              "hljs",
              highlightLanguage ? `language-${highlightLanguage}` : "",
            ].filter(Boolean).join(" ")}
            dangerouslySetInnerHTML={{ __html: highlighted.html }}
          />
        ) : (
          <code className="feishu-docs-local-preview-code-block-code">{normalizedCode}</code>
        )}
      </pre>
    </section>
  )
}

function renderPlainNativeBlock(children: ReactNode, className?: string) {
  return (
    <section className={["feishu-docs-local-preview-plain-block", className ?? ""].filter(Boolean).join(" ")}>
      {children}
    </section>
  )
}

function renderMarkdownListItemContent(text: string, keyPrefix: string, context: InlineRenderContext) {
  const segments = splitFeishuDocsEmbeddedNativeBlocks(text)
  if (segments.length === 1 && segments[0]?.kind === "markdown") {
    return renderInlineMarkdownMultiline(segments[0].text, `${keyPrefix}:markdown`, context)
  }

  return segments.map((segment, index) => {
    const key = `${keyPrefix}:segment:${index}`
    if (segment.kind === "markdown") {
      return (
        <div key={key} className="feishu-docs-local-preview-list-item-segment">
          {renderInlineMarkdownMultiline(segment.text, `${key}:markdown`, context)}
        </div>
      )
    }

    return (
      <FeishuDocsNativeBlockPreview
        key={key}
        name={segment.name}
        attributes={segment.attributes}
        childrenNodes={[]}
        t={context.t}
        language={context.language}
        headingSlugCounts={context.headingSlugCounts}
      />
    )
  })
}

function renderMarkdownBlocks(blocks: MarkdownBlock[], keyPrefix: string, context: InlineRenderContext): ReactNode[] {
  return blocks.map((block, index) => {
    const key = `${keyPrefix}:${block.kind}:${index}`

    switch (block.kind) {
      case "heading":
        return renderMarkdownHeading(block, key, context)
      case "paragraph":
        return <p key={key}>{renderInlineMarkdownMultiline(block.text, `${key}:paragraph`, context)}</p>
      case "blockquote":
        return (
          <blockquote key={key}>
            {renderMarkdownBlocks(block.blocks, `${key}:blockquote`, context)}
          </blockquote>
        )
      case "unordered_list":
        return (
          <ul key={key}>
            {block.items.map((item, itemIndex) => (
              <li key={`${key}:item:${itemIndex}`}>
                {renderMarkdownListItemContent(item, `${key}:item:${itemIndex}`, context)}
              </li>
            ))}
          </ul>
        )
      case "ordered_list":
        return (
          <ol key={key} start={block.start}>
            {block.items.map((item, itemIndex) => (
              <li key={`${key}:item:${itemIndex}`}>
                {renderMarkdownListItemContent(item, `${key}:item:${itemIndex}`, context)}
              </li>
            ))}
          </ol>
        )
      case "code_block":
        return renderMarkdownCodeBlock(block, key, context)
      case "math_block":
        return <FeishuDocsMathBlock key={key} expression={block.expression} t={context.t} />
      case "table":
        return (
          <table key={key}>
            <thead>
              <tr>
                {block.headers.map((header, cellIndex) => (
                  <th key={`${key}:head:${cellIndex}`} style={block.aligns[cellIndex] ? { textAlign: block.aligns[cellIndex] } : undefined}>
                    {renderInlineMarkdownMultiline(header, `${key}:head:${cellIndex}`, context)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`${key}:row:${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${key}:row:${rowIndex}:cell:${cellIndex}`} style={block.aligns[cellIndex] ? { textAlign: block.aligns[cellIndex] } : undefined}>
                      {renderInlineMarkdownMultiline(cell, `${key}:row:${rowIndex}:cell:${cellIndex}`, context)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )
      case "divider":
        return (
          <div key={key} className="feishu-docs-local-preview-divider" aria-hidden="true">
            <span className="feishu-docs-local-preview-divider-line" />
          </div>
        )
      default:
        return null
    }
  })
}

function resolveBlockIcon(spec: FeishuDocsTagSpec | null) {
  if (!spec) {
    return <FileTextOutlined />
  }
  if (spec.name === "image") {
    return <PictureOutlined />
  }
  if (spec.name === "file") {
    return <PaperClipOutlined />
  }
  if (spec.tone === "embed") {
    return <TableOutlined />
  }
  if (spec.tone === "sync") {
    return <LinkOutlined />
  }
  return <FileTextOutlined />
}

function renderPreviewMarkdown(
  markdown: string,
  key: string,
  context: InlineRenderContext,
) {
  const blocks = parseMarkdownBlocks(markdown)

  return (
    <div key={key} className="feishu-docs-local-preview-markdown">
      {renderMarkdownBlocks(blocks, `${key}:markdown`, context)}
    </div>
  )
}

function renderPreviewNodes(
  nodes: FeishuDocsPreviewNode[],
  mediaPreviewUrls?: Record<string, string>,
  mediaPreviewErrors?: Record<string, string>,
  whiteboardPreviewUrls?: Record<string, string>,
  whiteboardPreviewFocusRects?: Record<string, { left: number; top: number; width: number; height: number }>,
  whiteboardPreviewErrors?: Record<string, string>,
  t?: Translate,
  language: LanguageCode = "zh-CN",
  headingSlugCounts?: Map<string, number>,
): ReactNode[] {
  const context: InlineRenderContext = {
    t,
    language,
    headingSlugCounts: headingSlugCounts ?? new Map(),
  }

  return nodes.map((node) => {
    if (node.kind === "markdown") {
      return renderPreviewMarkdown(node.markdown, node.key, context)
    }

    return (
      <FeishuDocsNativeBlockPreview
        key={node.key}
        name={node.name}
        attributes={node.attributes}
        childrenNodes={node.children}
        mediaPreviewUrls={mediaPreviewUrls}
        mediaPreviewErrors={mediaPreviewErrors}
        whiteboardPreviewUrls={whiteboardPreviewUrls}
        whiteboardPreviewFocusRects={whiteboardPreviewFocusRects}
        whiteboardPreviewErrors={whiteboardPreviewErrors}
        t={t}
        language={language}
        headingSlugCounts={context.headingSlugCounts}
      />
    )
  })
}

function pushNativeProp(
  items: NativePropItem[],
  label: string,
  attributes: Record<string, string>,
  names: string[],
  transform?: (value: string) => string,
) {
  const value = readPreferredFeishuDocsAttribute(attributes, names)
  if (!value) {
    return
  }
  items.push({
    label,
    value: transform ? transform(value) : value,
  })
}

function buildNativePropItems(
  name: string,
  attributes: Record<string, string>,
  t?: Translate,
): NativePropItem[] {
  const items: NativePropItem[] = []
  pushNativeProp(items, "Token", attributes, ["token", "file-token", "file_token"])
  pushNativeProp(items, "ID", attributes, ["id", "block-id", "block_id"])
  pushNativeProp(items, "Key", attributes, ["key", "issue-key", "issue_key"])
  pushNativeProp(items, previewText(t, "飞书页.文档.预览.属性.来源块", "来源块"), attributes, ["source-block-id", "source_block_id"])
  pushNativeProp(items, previewText(t, "飞书页.文档.预览.属性.对象类型", "对象类型"), attributes, ["obj-type", "obj_type"])
  pushNativeProp(
    items,
    previewText(t, "飞书页.文档.预览.属性.视图", "视图"),
    attributes,
    ["view-type", "view_type"],
    (value) => resolveFeishuDocsViewTypeLabel(value, t),
  )
  if (name === "grid") {
    pushNativeProp(items, previewText(t, "飞书页.文档.预览.属性.列数", "列数"), attributes, ["column-size", "column_size"])
  }
  if (name === "grid-column") {
    pushNativeProp(
      items,
      previewText(t, "飞书页.文档.预览.属性.宽度占比", "宽度占比"),
      attributes,
      ["width-ratio", "width_ratio", "width"],
    )
  }
  if (name === "table") {
    pushNativeProp(items, previewText(t, "飞书页.文档.预览.属性.列数", "列数"), attributes, [...TABLE_COLUMN_COUNT_ATTRIBUTE_NAMES])
    pushNativeProp(items, previewText(t, "飞书页.文档.预览.属性.行数", "行数"), attributes, [...TABLE_ROW_COUNT_ATTRIBUTE_NAMES])
  }
  if (name === "iframe") {
    pushNativeProp(items, previewText(t, "飞书页.文档.预览.属性.组件类型", "组件类型"), attributes, ["component-type", "component_type", "type"])
  }
  if (name === "link-preview") {
    pushNativeProp(items, previewText(t, "飞书页.文档.预览.属性.链接类型", "链接类型"), attributes, ["url-type", "url_type"])
  }
  if (name === "wiki-catalog") {
    pushNativeProp(items, "Wiki", attributes, ["wiki-token", "wiki_token"])
  }
  return items.slice(0, 4)
}

function renderNativePropItems(items: NativePropItem[]) {
  if (items.length === 0) {
    return null
  }
  return (
    <div className="feishu-docs-local-preview-native-props">
      {items.map((item) => (
        <span key={`${item.label}:${item.value}`} className="feishu-docs-local-preview-native-prop">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </span>
      ))}
    </div>
  )
}

function renderNativeBlockHeader(input: {
  title: string
  description?: string
  readonlyTagText?: string
  readonly?: boolean
  extraBadges?: string[]
}) {
  return (
    <>
      <div className="feishu-docs-local-preview-native-head">
        <span className="feishu-docs-local-preview-native-title">{input.title}</span>
        {input.readonly ? <Tag bordered={false}>{input.readonlyTagText || "只读"}</Tag> : null}
        {input.extraBadges?.map((badge) => <Tag key={badge} bordered={false}>{badge}</Tag>)}
      </div>
      {input.description ? (
        <Text type="secondary" className="feishu-docs-local-preview-native-description">
          {input.description}
        </Text>
      ) : null}
    </>
  )
}

function renderStandaloneFeishuTable(input: {
  headRows?: ReactNode[]
  bodyRows?: ReactNode[]
}) {
  return (
    <section className="feishu-docs-local-preview-table-block">
      <div className="feishu-docs-local-preview-lark-table-shell">
        <table className="feishu-docs-local-preview-lark-table">
          {input.headRows && input.headRows.length > 0 ? (
            <thead>{input.headRows}</thead>
          ) : null}
          {input.bodyRows && input.bodyRows.length > 0 ? (
            <tbody>{input.bodyRows}</tbody>
          ) : null}
        </table>
      </div>
    </section>
  )
}

function collectLarkTableRows(
  nodes: FeishuDocsPreviewNode[],
  section: "head" | "body" = "body",
): LarkTableRow[] {
  const rows: LarkTableRow[] = []

  for (const node of nodes) {
    if (node.kind !== "native_block") {
      continue
    }

    if (FEISHU_DOCS_LARK_TABLE_SECTION_NAMES.has(node.name)) {
      rows.push(...collectLarkTableRows(node.children, node.name === "lark-thead" ? "head" : "body"))
      continue
    }

    if (!FEISHU_DOCS_LARK_TABLE_ROW_NAMES.has(node.name)) {
      continue
    }

    const cells = node.children.filter(
      (child): child is NativePreviewNode => (
        child.kind === "native_block" && FEISHU_DOCS_LARK_TABLE_CELL_NAMES.has(child.name)
      ),
    )

    rows.push({
      key: node.key,
      header: section === "head" || cells.some((cell) => cell.name === "lark-th"),
      cells,
    })
  }

  return rows
}

function FeishuDocsNativeBlockPreview(input: {
  t?: Translate
  language?: LanguageCode
  name: string
  attributes: Record<string, string>
  childrenNodes: FeishuDocsPreviewNode[]
  headingSlugCounts?: Map<string, number>
  mediaPreviewUrls?: Record<string, string>
  mediaPreviewErrors?: Record<string, string>
  whiteboardPreviewUrls?: Record<string, string>
  whiteboardPreviewFocusRects?: Record<string, { left: number; top: number; width: number; height: number }>
  whiteboardPreviewErrors?: Record<string, string>
}) {
  const previewBlockName = resolveFeishuDocsPreviewBlockName({
    name: input.name,
    attributes: input.attributes,
    hasChildren: input.childrenNodes.length > 0,
  })

  if (previewBlockName === "divider" && input.name !== "divider") {
    return (
      <section
        className="feishu-docs-local-preview-divider"
        aria-label={previewText(input.t, "飞书页.文档.预览.标签.分割线", "分割线")}
      >
        <span className="feishu-docs-local-preview-divider-line" />
      </section>
    )
  }

  const spec = resolveFeishuDocsTagSpec(input.name)
  const title = resolveFeishuDocsTagLabel(input.name, spec?.label ?? input.name, input.t)
  const attributes = normalizeFeishuDocsAttributes(input.attributes)
  const description = readPreferredFeishuDocsAttribute(attributes, ["summary", "description", "text", "title", "name"])
  const propItems = buildNativePropItems(input.name, attributes, input.t)

  if (input.name === "callout") {
    const calloutStyle = resolveFeishuDocsCalloutStyle(attributes)
    const calloutTitle = readPreferredFeishuDocsAttribute(attributes, ["title", "label", "name"])
    const emoji = resolveFeishuDocsCalloutEmoji(
      readPreferredFeishuDocsAttribute(attributes, ["emoji", "emoji-id", "emoji_id"]),
    )
    return (
      <section
        className="feishu-docs-local-preview-callout"
        style={{
          background: calloutStyle.backgroundColor,
          borderColor: calloutStyle.borderColor,
          ...(calloutStyle.textColor ? { color: calloutStyle.textColor } : {}),
        }}
      >
        <div className="feishu-docs-local-preview-callout-head">
          <span className="feishu-docs-local-preview-callout-emoji">{emoji.symbol}</span>
          {calloutTitle ? <Text strong>{calloutTitle}</Text> : null}
          {emoji.label ? <Tag bordered={false}>{emoji.label}</Tag> : null}
        </div>
        <div className="feishu-docs-local-preview-callout-body">
          {input.childrenNodes.length > 0 ? renderPreviewNodes(
            input.childrenNodes,
            input.mediaPreviewUrls,
            input.mediaPreviewErrors,
            input.whiteboardPreviewUrls,
            input.whiteboardPreviewFocusRects,
            input.whiteboardPreviewErrors,
            input.t,
            input.language,
            input.headingSlugCounts,
          ) : (
            <Text type="secondary">
              {previewText(input.t, "飞书页.文档.预览.空状态.当前提示块无内容", "当前提示块没有内容。")}
            </Text>
          )}
        </div>
      </section>
    )
  }

  if (input.name === "divider") {
    return (
      <section
        className="feishu-docs-local-preview-divider"
        aria-label={previewText(input.t, "飞书页.文档.预览.标签.分割线", "分割线")}
      >
        <span className="feishu-docs-local-preview-divider-line" />
      </section>
    )
  }

  if (input.name === "grid") {
    const columnNodes = input.childrenNodes.filter(
      (node): node is Extract<FeishuDocsPreviewNode, { kind: "native_block" }> => (
        node.kind === "native_block" && node.name === "grid-column"
      ),
    )
    const otherNodes = input.childrenNodes.filter((node) => !(node.kind === "native_block" && node.name === "grid-column"))
    const templateColumns = resolveFeishuDocsGridTemplateColumns(
      columnNodes.map((columnNode) => readPreferredFeishuDocsAttribute(columnNode.attributes, ["width-ratio", "width_ratio", "width"])),
    )
    const columnCount = Math.max(columnNodes.length, 1)
    return (
      <section className="feishu-docs-local-preview-grid">
        <div
          className="feishu-docs-local-preview-grid-columns"
          style={{
            gridTemplateColumns: templateColumns || `repeat(${columnCount}, minmax(0, 1fr))`,
          }}
        >
          {columnNodes.map((columnNode) => (
            <div key={columnNode.key} className="feishu-docs-local-preview-grid-column">
              {columnNode.children.length > 0 ? renderPreviewNodes(
                columnNode.children,
                input.mediaPreviewUrls,
                input.mediaPreviewErrors,
                input.whiteboardPreviewUrls,
                input.whiteboardPreviewFocusRects,
                input.whiteboardPreviewErrors,
                input.t,
                input.language,
                input.headingSlugCounts,
              ) : (
                <Text type="secondary">
                  {previewText(input.t, "飞书页.文档.预览.空状态.当前分栏无内容", "当前分栏没有内容。")}
                </Text>
              )}
            </div>
          ))}
        </div>
        {otherNodes.length > 0 ? (
          <div className="feishu-docs-local-preview-grid-tail">
            {renderPreviewNodes(
              otherNodes,
              input.mediaPreviewUrls,
              input.mediaPreviewErrors,
              input.whiteboardPreviewUrls,
              input.whiteboardPreviewFocusRects,
              input.whiteboardPreviewErrors,
              input.t,
              input.language,
              input.headingSlugCounts,
            )}
          </div>
        ) : null}
      </section>
    )
  }

  if (input.name === "grid-column") {
    return (
      <section className="feishu-docs-local-preview-grid-column is-standalone">
        {renderNativePropItems(propItems)}
        {input.childrenNodes.length > 0 ? renderPreviewNodes(
          input.childrenNodes,
          input.mediaPreviewUrls,
          input.mediaPreviewErrors,
          input.whiteboardPreviewUrls,
          input.whiteboardPreviewFocusRects,
          input.whiteboardPreviewErrors,
          input.t,
          input.language,
          input.headingSlugCounts,
        ) : (
          <Text type="secondary">
            {previewText(input.t, "飞书页.文档.预览.空状态.当前分栏无内容", "当前分栏没有内容。")}
          </Text>
        )}
      </section>
    )
  }

  if (input.name === "lark-table") {
    const rows = collectLarkTableRows(input.childrenNodes)
    if (rows.length > 0) {
      const headRows = rows.filter((row) => row.header)
      const bodyRows = rows.filter((row) => !row.header)
      const visibleBodyRows = bodyRows.length > 0 ? bodyRows : (headRows.length > 0 ? [] : rows)
      const renderCellContent = (cell: NativePreviewNode, keyPrefix: string) => {
        if (cell.children.length > 0) {
          return renderPreviewNodes(
            cell.children,
            input.mediaPreviewUrls,
            input.mediaPreviewErrors,
            input.whiteboardPreviewUrls,
            input.whiteboardPreviewFocusRects,
            input.whiteboardPreviewErrors,
            input.t,
            input.language,
            input.headingSlugCounts,
          )
        }

        const cellText = readPreferredFeishuDocsAttribute(
          normalizeFeishuDocsAttributes(cell.attributes),
          ["text", "title", "label", "name", "content", "description", "summary"],
        )

        return cellText
          ? renderInlineMarkdownMultiline(cellText, `${keyPrefix}:text`, {
            t: input.t,
            language: input.language,
          })
          : null
      }

      const renderRow = (row: LarkTableRow, rowIndex: number, cellElement: "td" | "th") => (
        <tr key={row.key || `row:${rowIndex}`}>
          {row.cells.map((cell, cellIndex) => {
            const CellTag = cellElement
            return (
              <CellTag key={`${row.key}:cell:${cellIndex}`}>
                <div className="feishu-docs-local-preview-lark-table-cell">
                  {renderCellContent(cell, `${row.key}:cell:${cellIndex}`)}
                </div>
              </CellTag>
            )
          })}
        </tr>
      )

      return renderStandaloneFeishuTable({
        headRows: headRows.map((row, rowIndex) => renderRow(row, rowIndex, "th")),
        bodyRows: visibleBodyRows.map((row, rowIndex) => renderRow(row, rowIndex, "td")),
      })
    }
  }

  if (input.name === "table") {
    const rows = collectNativeTableRows(attributes, input.childrenNodes)
    if (rows.length > 0) {
      const headRows = rows.filter((row) => row.header)
      const bodyRows = rows.filter((row) => !row.header)
      const visibleBodyRows = bodyRows.length > 0 ? bodyRows : (headRows.length > 0 ? [] : rows)
      const renderCellContent = (cell: NativePreviewNode, keyPrefix: string) => {
        if (cell.children.length > 0) {
          return renderPreviewNodes(
            cell.children,
            input.mediaPreviewUrls,
            input.mediaPreviewErrors,
            input.whiteboardPreviewUrls,
            input.whiteboardPreviewFocusRects,
            input.whiteboardPreviewErrors,
            input.t,
            input.language,
            input.headingSlugCounts,
          )
        }

        const cellText = readPreferredFeishuDocsAttribute(
          normalizeFeishuDocsAttributes(cell.attributes),
          ["text", "title", "label", "name", "content", "description", "summary"],
        )

        return cellText
          ? renderInlineMarkdownMultiline(cellText, `${keyPrefix}:text`, {
            t: input.t,
            language: input.language,
          })
          : null
      }

      const renderRow = (row: NativeTableRow, rowIndex: number) => (
        <tr key={row.key || `row:${rowIndex}`}>
          {row.cells.map((cell, cellIndex) => {
            const CellTag = row.header || cell.header ? "th" : "td"
            return (
              <CellTag
                key={`${row.key}:cell:${cellIndex}`}
                colSpan={Math.max(cell.colSpan, 1)}
                rowSpan={Math.max(cell.rowSpan, 1)}
              >
                <div className="feishu-docs-local-preview-lark-table-cell">
                  {renderCellContent(cell.node, `${row.key}:cell:${cellIndex}`)}
                </div>
              </CellTag>
            )
          })}
        </tr>
      )

      return renderStandaloneFeishuTable({
        headRows: headRows.map((row, rowIndex) => renderRow(row, rowIndex)),
        bodyRows: visibleBodyRows.map((row, rowIndex) => renderRow(row, rowIndex)),
      })
    }
  }

  if (input.name === "image") {
    const token = readPreferredFeishuDocsAttribute(attributes, ["token", "file-token", "file_token"])
    const previewError = token ? input.mediaPreviewErrors?.[token] ?? "" : ""
    const { width: imageWidth, height: imageHeight } = readFeishuDocsPreviewDimensions(attributes)
    const imageUrl =
      (token ? input.mediaPreviewUrls?.[token] ?? "" : "")
      || readPreferredFeishuDocsAttribute(attributes, ["src", "url", "tmp-download-url", "tmp_download_url"])
      || ""
    const safeImageUrl = normalizeFeishuDocsPreviewHref(imageUrl)
    const imageTitle = readPreferredFeishuDocsAttribute(attributes, ["name", "alt", "caption", "caption-content"])
      || previewText(input.t, "飞书页.文档.预览.图片.标题", "图片")
    return (
      <section className="feishu-docs-local-preview-plain-media is-image">
        {safeImageUrl ? (
          <FeishuDocsPreviewImage
            src={safeImageUrl}
            alt={
              readPreferredFeishuDocsAttribute(attributes, ["alt", "name", "caption", "caption-content"])
              || previewText(input.t, "飞书页.文档.预览.图片.alt", "飞书图片")
            }
            displayMode="default"
            plain
            preferredWidth={imageWidth}
            preferredHeight={imageHeight}
            t={input.t}
          />
        ) : (
          <div className="feishu-docs-local-preview-image-placeholder is-plain">
            <PictureOutlined />
            <Text type="secondary">
              {previewError || imageTitle || previewText(input.t, "飞书页.文档.预览.图片.占位", "图片资源预览占位")}
            </Text>
          </div>
        )}
        {safeImageUrl && previewError ? (
          <Text type="secondary" className="feishu-docs-local-preview-plain-media-note">
            {previewError}
          </Text>
        ) : null}
      </section>
    )
  }

  if (
    input.name === "board"
    || input.name === "whiteboard"
    || input.name === "mindnote"
    || input.name === "diagram"
  ) {
    const token = readPreferredFeishuDocsAttribute(
      attributes,
      input.name === "mindnote"
        ? ["token", "mindnote-token", "mindnote_token"]
        : input.name === "diagram"
          ? ["token", "diagram-token", "diagram_token"]
          : ["token", "whiteboard-token", "whiteboard_token"],
    )
    const previewError = token ? input.whiteboardPreviewErrors?.[token] ?? "" : ""
    const imageUrl =
      (token ? input.whiteboardPreviewUrls?.[token] ?? "" : "")
      || readPreferredFeishuDocsAttribute(attributes, ["src", "url", "href", "tmp-download-url", "tmp_download_url"])
      || ""
    const safeImageUrl = normalizeFeishuDocsPreviewHref(imageUrl)
    const boardTitle = readPreferredFeishuDocsAttribute(attributes, ["name", "title"])
      || title
    const focusRect = input.name === "board" || input.name === "whiteboard"
      ? (token ? input.whiteboardPreviewFocusRects?.[token] : undefined)
      : undefined
    return (
      <section className="feishu-docs-local-preview-plain-media is-image is-board-preview">
        {safeImageUrl ? (
          <FeishuDocsPreviewImage
            src={safeImageUrl}
            alt={boardTitle}
            displayMode="board"
            plain
            preferredWidth={FEISHU_DOCS_BOARD_PREVIEW_MAX_WIDTH}
            preferredHeight={FEISHU_DOCS_BOARD_PREVIEW_MAX_HEIGHT}
            focusRect={focusRect}
            t={input.t}
          />
        ) : (
          <div className="feishu-docs-local-preview-image-placeholder is-plain">
            <PictureOutlined />
            <Text type="secondary">{previewError || boardTitle}</Text>
          </div>
        )}
        {safeImageUrl && previewError ? (
          <Text type="secondary" className="feishu-docs-local-preview-plain-media-note">
            {previewError}
          </Text>
        ) : null}
      </section>
    )
  }

  if (input.name === "bitable") {
    const bitableUrl = normalizeFeishuDocsPreviewHref(
      readPreferredFeishuDocsAttribute(attributes, ["url", "href"]),
    )
    const bitableText = readPreferredFeishuDocsAttribute(
      attributes,
      ["text", "content", "description", "summary", "title", "name", "label"],
    ) || description || title
    const childrenContent = input.childrenNodes.length > 0
      ? renderPreviewNodes(
        input.childrenNodes,
        input.mediaPreviewUrls,
        input.mediaPreviewErrors,
        input.whiteboardPreviewUrls,
        input.whiteboardPreviewFocusRects,
        input.whiteboardPreviewErrors,
        input.t,
        input.language,
        input.headingSlugCounts,
      )
      : null

    return renderPlainNativeBlock(
      childrenContent && childrenContent.length > 0 ? (
        childrenContent
      ) : bitableText ? (
        bitableUrl ? (
          <p>
            <a href={bitableUrl} target="_blank" rel="noreferrer" className="feishu-docs-local-preview-link-title">
              {bitableText}
            </a>
          </p>
        ) : (
          <p>{bitableText}</p>
        )
      ) : (
        <Text type="secondary">
          {previewText(input.t, "飞书页.文档.预览.空状态.当前多维表格无内容", "当前多维表格没有可预览内容。")}
        </Text>
      ),
      "is-bitable",
    )
  }

  if (input.name === "equation") {
    const formula = readPreferredFeishuDocsAttribute(input.attributes, ["formula", "latex", "text", "content"])
      || input.childrenNodes
        .filter((child): child is Extract<FeishuDocsPreviewNode, { kind: "markdown" }> => child.kind === "markdown")
        .map((child) => child.markdown)
        .join("\n")
        .trim()

    return (
      <section className={`feishu-docs-local-preview-native-block ${resolveToneClassName(spec)}`}>
        <div className="feishu-docs-local-preview-native-icon">{resolveBlockIcon(spec)}</div>
        <div className="feishu-docs-local-preview-native-meta">
          {renderNativeBlockHeader({
            title,
            readonlyTagText: input.t?.("飞书页.文档.标签.只读"),
            readonly: FEISHU_DOCS_READONLY_BLOCKS.has(input.name),
          })}
          {formula ? (
            <div className="feishu-docs-local-preview-native-children">
              <FeishuDocsMathBlock expression={formula} t={input.t} />
            </div>
          ) : null}
          {renderNativePropItems(propItems)}
        </div>
      </section>
    )
  }

  if (input.name === "file") {
    const token = readPreferredFeishuDocsAttribute(attributes, ["token", "file-token", "file_token"])
    const fileName = readPreferredFeishuDocsAttribute(attributes, ["name", "title"])
      || previewText(input.t, "飞书页.文档.预览.行内标签.附件", "附件")
    const fileUrl =
      readPreferredFeishuDocsAttribute(attributes, ["url", "href", "tmp-download-url", "tmp_download_url"])
      || (token ? input.mediaPreviewUrls?.[token] ?? "" : "")
    const safeFileUrl = normalizeFeishuDocsPreviewHref(fileUrl)
    const viewType = resolveFeishuDocsViewTypeLabel(
      readPreferredFeishuDocsAttribute(attributes, ["view-type", "view_type"]),
      input.t,
    )
    return (
      <section className={`feishu-docs-local-preview-native-block ${resolveToneClassName(spec)} is-file`}>
        <div className="feishu-docs-local-preview-native-icon">{resolveBlockIcon(spec)}</div>
        <div className="feishu-docs-local-preview-native-meta">
          <div className="feishu-docs-local-preview-native-head">
            {safeFileUrl ? (
              <a href={safeFileUrl} target="_blank" rel="noreferrer" className="feishu-docs-local-preview-link-title">
                {fileName}
              </a>
            ) : (
              <span className="feishu-docs-local-preview-native-title">{fileName}</span>
            )}
            {viewType ? <Tag bordered={false}>{viewType}</Tag> : null}
          </div>
          {renderNativePropItems(propItems)}
        </div>
      </section>
    )
  }

  if (input.name === "iframe") {
    const iframeUrl = readPreferredFeishuDocsAttribute(attributes, ["src", "url", "href", "component-url", "component_url", "component.url"])
    const safeIframeUrl = normalizeFeishuDocsPreviewHref(iframeUrl)
    const iframeTitle = readPreferredFeishuDocsAttribute(attributes, ["title", "name"])
      || resolveFeishuDocsTagLabel("iframe", spec?.label ?? "嵌入网页", input.t)
    return (
      <section className={`feishu-docs-local-preview-native-block ${resolveToneClassName(spec)} is-iframe`}>
        <div className="feishu-docs-local-preview-native-meta">
          <div className="feishu-docs-local-preview-native-head">
            <span className="feishu-docs-local-preview-native-title">{iframeTitle}</span>
            {safeIframeUrl ? <Tag bordered={false}>{resolveFeishuDocsUrlHostLabel(safeIframeUrl)}</Tag> : null}
          </div>
          {renderNativePropItems(propItems)}
          {safeIframeUrl ? (
            <div className="feishu-docs-local-preview-iframe-shell">
              <iframe
                className="feishu-docs-local-preview-iframe"
                src={safeIframeUrl}
                title={iframeTitle}
                loading="lazy"
              />
            </div>
          ) : (
            <div className="feishu-docs-local-preview-image-placeholder is-compact">
              <LinkOutlined />
              <Text type="secondary">
                {previewText(input.t, "飞书页.文档.预览.空状态.当前嵌入块无可预览地址", "当前嵌入块没有可预览的网页地址。")}
              </Text>
            </div>
          )}
        </div>
      </section>
    )
  }

  if (input.name === "link-preview") {
    const previewUrl = readPreferredFeishuDocsAttribute(attributes, ["url", "href"])
    const safePreviewUrl = normalizeFeishuDocsPreviewHref(previewUrl)
    const previewTitle = readPreferredFeishuDocsAttribute(attributes, ["title", "name"]) || previewUrl || title
    const previewDescription = readPreferredFeishuDocsAttribute(attributes, ["description", "summary", "text"])
    return (
      <section className={`feishu-docs-local-preview-native-block ${resolveToneClassName(spec)} is-link-preview`}>
        <div className="feishu-docs-local-preview-native-meta">
          <div className="feishu-docs-local-preview-link-card">
            <span className="feishu-docs-local-preview-link-eyebrow">
              {previewText(input.t, "飞书页.文档.预览.链接预览.眉标", "链接预览")}
            </span>
            {safePreviewUrl ? (
              <a
                href={safePreviewUrl}
                target="_blank"
                rel="noreferrer"
                className="feishu-docs-local-preview-link-title"
              >
                {previewTitle}
              </a>
            ) : (
              <span className="feishu-docs-local-preview-link-title">{previewTitle}</span>
            )}
            {previewDescription ? <Text type="secondary">{previewDescription}</Text> : null}
            {renderNativePropItems(propItems)}
            {previewUrl ? (
              <Text type="secondary" className="feishu-docs-local-preview-link-url">
                {previewUrl}
              </Text>
            ) : null}
          </div>
        </div>
      </section>
    )
  }

  if (input.name === "jira-issue") {
    const issueKey = readPreferredFeishuDocsAttribute(attributes, ["key", "issue-key", "issue_key", "id"]) || "Jira"
    const issueSummary = readPreferredFeishuDocsAttribute(attributes, ["summary", "title", "name", "description"])
      || previewText(input.t, "飞书页.文档.预览.Jira.未提供摘要", "未提供摘要")
    const issueStatus = readPreferredFeishuDocsAttribute(attributes, ["status", "state"])
    const issueAssignee = readPreferredFeishuDocsAttribute(attributes, ["assignee", "owner"])
    return (
      <section className={`feishu-docs-local-preview-native-block ${resolveToneClassName(spec)} is-jira-issue`}>
        <div className="feishu-docs-local-preview-native-meta">
          <div className="feishu-docs-local-preview-native-head">
            <span className="feishu-docs-local-preview-native-title">{issueKey}</span>
            {issueStatus ? <Tag bordered={false}>{issueStatus}</Tag> : null}
          </div>
          <Text>{issueSummary}</Text>
          {issueAssignee ? (
            <Text type="secondary">
              {previewText(input.t, "飞书页.文档.预览.Jira.负责人", "负责人：{姓名}", { 姓名: issueAssignee })}
            </Text>
          ) : null}
          {renderNativePropItems(propItems)}
        </div>
      </section>
    )
  }

  return (
    <section
      className={`feishu-docs-local-preview-native-block ${resolveToneClassName(spec)}${FEISHU_DOCS_CONTAINER_BLOCKS.has(input.name) ? " is-container" : ""}`}
    >
      <div className="feishu-docs-local-preview-native-icon">{resolveBlockIcon(spec)}</div>
      <div className="feishu-docs-local-preview-native-meta">
        {renderNativeBlockHeader({
          title,
          description: input.childrenNodes.length === 0 ? description : undefined,
          readonlyTagText: input.t?.("飞书页.文档.标签.只读"),
          readonly: FEISHU_DOCS_READONLY_BLOCKS.has(input.name),
          extraBadges: FEISHU_DOCS_CONTAINER_BLOCKS.has(input.name)
            ? [input.t ? input.t("飞书页.文档.标签.容器") : "容器"]
            : undefined,
        })}
        {renderNativePropItems(propItems)}
        {input.childrenNodes.length > 0 ? (
          <div className="feishu-docs-local-preview-native-children">
            {renderPreviewNodes(
              input.childrenNodes,
              input.mediaPreviewUrls,
              input.mediaPreviewErrors,
              input.whiteboardPreviewUrls,
              input.whiteboardPreviewFocusRects,
              input.whiteboardPreviewErrors,
              input.t,
              input.language,
              input.headingSlugCounts,
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function isFeishuDocsMdxJsxNode(node: RootContent): node is FeishuDocsMdxJsxNode {
  return node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement"
}

function readFeishuDocsMdxAttributes(node: FeishuDocsMdxJsxNode): Record<string, string> {
  const attributes: Record<string, string> = {}

  for (const attribute of node.attributes ?? []) {
    if (!attribute || attribute.type !== "mdxJsxAttribute" || !attribute.name) {
      continue
    }

    const value = attribute.value
    if (typeof value === "string") {
      attributes[attribute.name] = value
      continue
    }

    if (value === null || value === undefined) {
      attributes[attribute.name] = "true"
      continue
    }

    if (typeof value === "object" && "value" in value && typeof value.value === "string") {
      attributes[attribute.name] = value.value
    }
  }

  return normalizeFeishuDocsAttributes(attributes)
}

function serializeFeishuDocsMdxChildren(children: RootContent[] | undefined): string {
  if (!children || children.length === 0) {
    return ""
  }

  try {
    const root: Root = {
      type: "root",
      children,
    }

    return toMarkdown(root, {
      extensions: [
        mdxToMarkdown(),
        gfmTableToMarkdown(),
        gfmStrikethroughToMarkdown(),
        gfmTaskListItemToMarkdown(),
      ],
    }).trim()
  } catch {
    return children.map((child) => (
      "value" in child && typeof child.value === "string" ? child.value : ""
    )).join("\n").trim()
  }
}

function parseFeishuDocsPreviewNodesFromMdxChildren(children: RootContent[] | undefined): FeishuDocsPreviewNode[] {
  const markdown = serializeFeishuDocsMdxChildren(children)
  return markdown ? parseFeishuDocsLocalPreview(markdown) : []
}

type FeishuDocsMdxLarkTableRow = {
  key: string
  header: boolean
  cells: FeishuDocsMdxJsxNode[]
}

function collectLarkTableRowsFromMdx(
  nodes: RootContent[] | undefined,
  keyPrefix = "lark-row",
  section: "head" | "body" = "body",
): FeishuDocsMdxLarkTableRow[] {
  if (!nodes || nodes.length === 0) {
    return []
  }

  const rows: FeishuDocsMdxLarkTableRow[] = []

  nodes.forEach((node, nodeIndex) => {
    if (!isFeishuDocsMdxJsxNode(node)) {
      return
    }

    const name = normalizeFeishuDocsTagName(node.name ?? "")
    const nodeKey = `${keyPrefix}:${nodeIndex}`

    if (FEISHU_DOCS_LARK_TABLE_SECTION_NAMES.has(name)) {
      rows.push(...collectLarkTableRowsFromMdx(
        node.children,
        nodeKey,
        name === "lark-thead" ? "head" : "body",
      ))
      return
    }

    if (!FEISHU_DOCS_LARK_TABLE_ROW_NAMES.has(name)) {
      return
    }

    const cells = (node.children ?? []).filter((child): child is FeishuDocsMdxJsxNode => (
      isFeishuDocsMdxJsxNode(child)
      && FEISHU_DOCS_LARK_TABLE_CELL_NAMES.has(normalizeFeishuDocsTagName(child.name ?? ""))
    ))

    rows.push({
      key: nodeKey,
      header: section === "head" || cells.some((cell) => normalizeFeishuDocsTagName(cell.name ?? "") === "lark-th"),
      cells,
    })
  })

  return rows
}

function FeishuDocsReadonlyMdxMarkdown(props: FeishuDocsMdxMarkdownProps) {
  const codeBlockDescriptor = useMemo<CodeBlockEditorDescriptor>(() => ({
    match: () => true,
    priority: 100,
    Editor: (editorProps) => {
      if (isMathCodeBlockLanguage(editorProps.language)) {
        return <FeishuDocsMathBlock expression={editorProps.code} t={props.t} />
      }

      if (shouldRenderFeishuDocsMermaidBlock({ language: editorProps.language, source: editorProps.code })) {
        return <FeishuDocsMermaidBlock source={editorProps.code} t={props.t} />
      }

      return (
        <FeishuDocsStaticCodeBlock
          code={editorProps.code}
          language={editorProps.language}
          t={props.t}
        />
      )
    },
  }), [props.t])

  const jsxComponentDescriptors = useMemo<JsxComponentDescriptor[]>(() => createFeishuDocsJsxComponentDescriptors(props), [
    props.language,
    props.mediaPreviewErrors,
    props.mediaPreviewUrls,
    props.t,
    props.whiteboardPreviewErrors,
    props.whiteboardPreviewFocusRects,
    props.whiteboardPreviewUrls,
  ])

  const plugins = useMemo(() => [
    headingsPlugin({ allowedHeadingLevels: [1, 2, 3, 4, 5, 6] }),
    quotePlugin(),
    listsPlugin(),
    linkPlugin(),
    thematicBreakPlugin(),
    tablePlugin(),
    codeBlockPlugin({
      defaultCodeBlockLanguage: "text",
      codeBlockEditorDescriptors: [codeBlockDescriptor],
    }),
    jsxPlugin({
      jsxComponentDescriptors,
    }),
  ], [codeBlockDescriptor, jsxComponentDescriptors])

  return (
    <MDXEditor
      markdown={props.markdown}
      readOnly
      trim={false}
      spellCheck={false}
      className={`feishu-docs-local-preview-editor ${props.className ?? ""}`.trim()}
      contentEditableClassName="feishu-docs-local-preview-markdown"
      plugins={plugins}
    />
  )
}

export function createFeishuDocsJsxComponentDescriptors(
  input: FeishuDocsMdxPreviewContext,
): JsxComponentDescriptor[] {
  return [
    {
      name: "*",
      kind: "flow",
      props: [],
      hasChildren: true,
      Editor: ({ mdastNode }) => (
        <FeishuDocsMdxJsxPreviewNode
          mdastNode={mdastNode}
          t={input.t}
          language={input.language}
          mediaPreviewUrls={input.mediaPreviewUrls}
          mediaPreviewErrors={input.mediaPreviewErrors}
          whiteboardPreviewUrls={input.whiteboardPreviewUrls}
          whiteboardPreviewFocusRects={input.whiteboardPreviewFocusRects}
          whiteboardPreviewErrors={input.whiteboardPreviewErrors}
        />
      ),
    },
  ]
}

function FeishuDocsMdxChildrenPreview(props: {
  markdown: string
} & FeishuDocsMdxPreviewContext) {
  if (!props.markdown.trim()) {
    return null
  }

  return (
    <FeishuDocsReadonlyMdxMarkdown
      markdown={props.markdown}
      t={props.t}
      language={props.language}
      mediaPreviewUrls={props.mediaPreviewUrls}
      mediaPreviewErrors={props.mediaPreviewErrors}
      whiteboardPreviewUrls={props.whiteboardPreviewUrls}
      whiteboardPreviewFocusRects={props.whiteboardPreviewFocusRects}
      whiteboardPreviewErrors={props.whiteboardPreviewErrors}
      className="is-nested"
    />
  )
}

function FeishuDocsMdxJsxPreviewNode(props: {
  mdastNode: FeishuDocsMdxJsxNode
} & FeishuDocsMdxPreviewContext) {
  const name = normalizeFeishuDocsTagName(props.mdastNode.name ?? "")
  const attributes = readFeishuDocsMdxAttributes(props.mdastNode)
  const childMarkdown = serializeFeishuDocsMdxChildren(props.mdastNode.children)
  const inlineContext: InlineRenderContext = {
    t: props.t,
    language: props.language,
  }

  if (name === "br") {
    return <br />
  }

  if (props.mdastNode.type === "mdxJsxTextElement" || INLINE_FEISHU_TAGS.has(name)) {
    switch (name) {
      case "mention-user":
        return renderInlineMentionUser(attributes, props.t)
      case "mention-doc":
        return renderInlineMentionDoc(attributes, props.t)
      case "reminder":
        return renderInlineReminder(attributes, props.t, props.language)
      case "equation":
        return renderInlineEquation(attributes, props.t)
      case "inline-file":
        return renderInlineFile(attributes, props.t)
      case "inline-block":
        return renderInlineBlock(attributes, props.t)
      case "text":
        return renderInlineText(attributes, childMarkdown || null, inlineContext)
      default: {
        const spec = resolveFeishuDocsTagSpec(name)
        const label = resolveFeishuDocsTagLabel(name, spec?.label ?? name, props.t)
        const value = readPreferredFeishuDocsAttribute(
          attributes,
          ["text", "title", "label", "name", "content", "description", "summary"],
        ) || childMarkdown || label
        return (
          <FeishuDocsInlineNativeTag label={label} value={value} />
        )
      }
    }
  }

  return (
    <FeishuDocsMdxBlockPreview
      mdastNode={props.mdastNode}
      name={name}
      attributes={attributes}
      childMarkdown={childMarkdown}
      t={props.t}
      language={props.language}
      mediaPreviewUrls={props.mediaPreviewUrls}
      mediaPreviewErrors={props.mediaPreviewErrors}
      whiteboardPreviewUrls={props.whiteboardPreviewUrls}
      whiteboardPreviewFocusRects={props.whiteboardPreviewFocusRects}
      whiteboardPreviewErrors={props.whiteboardPreviewErrors}
    />
  )
}

function FeishuDocsMdxBlockPreview(input: {
  mdastNode: FeishuDocsMdxJsxNode
  name: string
  attributes: Record<string, string>
  childMarkdown: string
} & FeishuDocsMdxPreviewContext) {
  const previewBlockName = resolveFeishuDocsPreviewBlockName({
    name: input.name,
    attributes: input.attributes,
    hasChildren: input.childMarkdown.trim().length > 0,
  })

  if (previewBlockName === "divider" && input.name !== "divider") {
    return (
      <section
        className="feishu-docs-local-preview-divider"
        aria-label={previewText(input.t, "飞书页.文档.预览.标签.分割线", "分割线")}
      >
        <span className="feishu-docs-local-preview-divider-line" />
      </section>
    )
  }

  const spec = resolveFeishuDocsTagSpec(input.name)
  const title = resolveFeishuDocsTagLabel(input.name, spec?.label ?? input.name, input.t)
  const description = readPreferredFeishuDocsAttribute(
    input.attributes,
    ["summary", "description", "text", "title", "name"],
  )
  const propItems = buildNativePropItems(input.name, input.attributes, input.t)
  const renderChildrenContent = () => (
    <FeishuDocsMdxChildrenPreview
      markdown={input.childMarkdown}
      t={input.t}
      language={input.language}
      mediaPreviewUrls={input.mediaPreviewUrls}
      mediaPreviewErrors={input.mediaPreviewErrors}
      whiteboardPreviewUrls={input.whiteboardPreviewUrls}
      whiteboardPreviewFocusRects={input.whiteboardPreviewFocusRects}
      whiteboardPreviewErrors={input.whiteboardPreviewErrors}
    />
  )

  if (input.name === "callout") {
    const calloutStyle = resolveFeishuDocsCalloutStyle(input.attributes)
    const calloutTitle = readPreferredFeishuDocsAttribute(input.attributes, ["title", "label", "name"])
    const emoji = resolveFeishuDocsCalloutEmoji(
      readPreferredFeishuDocsAttribute(input.attributes, ["emoji", "emoji-id", "emoji_id"]),
    )
    const childrenContent = renderChildrenContent()

    return (
      <section
        className="feishu-docs-local-preview-callout"
        style={{
          background: calloutStyle.backgroundColor,
          borderColor: calloutStyle.borderColor,
          ...(calloutStyle.textColor ? { color: calloutStyle.textColor } : {}),
        }}
      >
        <div className="feishu-docs-local-preview-callout-head">
          <span className="feishu-docs-local-preview-callout-emoji">{emoji.symbol}</span>
          {calloutTitle ? <Text strong>{calloutTitle}</Text> : null}
          {emoji.label ? <Tag bordered={false}>{emoji.label}</Tag> : null}
        </div>
        <div className="feishu-docs-local-preview-callout-body">
          {childrenContent ?? (
            <Text type="secondary">
              {previewText(input.t, "飞书页.文档.预览.空状态.当前提示块无内容", "当前提示块没有内容。")}
            </Text>
          )}
        </div>
      </section>
    )
  }

  if (input.name === "divider") {
    return (
      <section
        className="feishu-docs-local-preview-divider"
        aria-label={previewText(input.t, "飞书页.文档.预览.标签.分割线", "分割线")}
      >
        <span className="feishu-docs-local-preview-divider-line" />
      </section>
    )
  }

  if (input.name === "grid") {
    const columnNodes = (input.mdastNode.children ?? []).filter((child): child is FeishuDocsMdxJsxNode => (
      isFeishuDocsMdxJsxNode(child) && normalizeFeishuDocsTagName(child.name ?? "") === "grid-column"
    ))
    const otherChildren = (input.mdastNode.children ?? []).filter((child) => !(
      isFeishuDocsMdxJsxNode(child) && normalizeFeishuDocsTagName(child.name ?? "") === "grid-column"
    ))
    const templateColumns = resolveFeishuDocsGridTemplateColumns(
      columnNodes.map((columnNode) => readPreferredFeishuDocsAttribute(
        readFeishuDocsMdxAttributes(columnNode),
        ["width-ratio", "width_ratio", "width"],
      )),
    )
    const columnCount = Math.max(columnNodes.length, 1)
    const otherMarkdown = serializeFeishuDocsMdxChildren(otherChildren)

    return (
      <section className="feishu-docs-local-preview-grid">
        <div
          className="feishu-docs-local-preview-grid-columns"
          style={{
            gridTemplateColumns: templateColumns || `repeat(${columnCount}, minmax(0, 1fr))`,
          }}
        >
          {columnNodes.map((columnNode, columnIndex) => (
            <div key={`grid-column:${columnIndex}`} className="feishu-docs-local-preview-grid-column">
              <FeishuDocsMdxJsxPreviewNode
                mdastNode={columnNode}
                t={input.t}
                language={input.language}
                mediaPreviewUrls={input.mediaPreviewUrls}
                mediaPreviewErrors={input.mediaPreviewErrors}
                whiteboardPreviewUrls={input.whiteboardPreviewUrls}
                whiteboardPreviewFocusRects={input.whiteboardPreviewFocusRects}
                whiteboardPreviewErrors={input.whiteboardPreviewErrors}
              />
            </div>
          ))}
        </div>
        {otherMarkdown ? (
          <div className="feishu-docs-local-preview-grid-tail">
            <FeishuDocsMdxChildrenPreview
              markdown={otherMarkdown}
              t={input.t}
              language={input.language}
              mediaPreviewUrls={input.mediaPreviewUrls}
              mediaPreviewErrors={input.mediaPreviewErrors}
              whiteboardPreviewUrls={input.whiteboardPreviewUrls}
              whiteboardPreviewFocusRects={input.whiteboardPreviewFocusRects}
              whiteboardPreviewErrors={input.whiteboardPreviewErrors}
            />
          </div>
        ) : null}
      </section>
    )
  }

  if (input.name === "grid-column") {
    const childrenContent = renderChildrenContent()

    return (
      <section className="feishu-docs-local-preview-grid-column is-standalone">
        {renderNativePropItems(propItems)}
        {childrenContent ?? (
          <Text type="secondary">
            {previewText(input.t, "飞书页.文档.预览.空状态.当前分栏无内容", "当前分栏没有内容。")}
          </Text>
        )}
      </section>
    )
  }

  if (input.name === "lark-table") {
    const rows = collectLarkTableRowsFromMdx(input.mdastNode.children)
    if (rows.length > 0) {
      const headRows = rows.filter((row) => row.header)
      const bodyRows = rows.filter((row) => !row.header)
      const visibleBodyRows = bodyRows.length > 0 ? bodyRows : (headRows.length > 0 ? [] : rows)
      const renderCellContent = (cell: FeishuDocsMdxJsxNode, keyPrefix: string) => {
        const cellMarkdown = serializeFeishuDocsMdxChildren(cell.children)
        if (cellMarkdown) {
          return renderInlineMarkdownMultiline(cellMarkdown, `${keyPrefix}:text`, {
            t: input.t,
            language: input.language,
          })
        }

        const cellText = readPreferredFeishuDocsAttribute(
          readFeishuDocsMdxAttributes(cell),
          ["text", "title", "label", "name", "content", "description", "summary"],
        )

        return cellText
          ? renderInlineMarkdownMultiline(cellText, `${keyPrefix}:fallback`, {
            t: input.t,
            language: input.language,
          })
          : null
      }

      const renderRow = (row: FeishuDocsMdxLarkTableRow, rowIndex: number, cellElement: "td" | "th") => (
        <tr key={row.key || `row:${rowIndex}`}>
          {row.cells.map((cell, cellIndex) => {
            const CellTag = cellElement
            return (
              <CellTag key={`${row.key}:cell:${cellIndex}`}>
                <div className="feishu-docs-local-preview-lark-table-cell">
                  {renderCellContent(cell, `${row.key}:cell:${cellIndex}`)}
                </div>
              </CellTag>
            )
          })}
        </tr>
      )

      return renderStandaloneFeishuTable({
        headRows: headRows.map((row, rowIndex) => renderRow(row, rowIndex, "th")),
        bodyRows: visibleBodyRows.map((row, rowIndex) => renderRow(row, rowIndex, "td")),
      })
    }
  }

  if (input.name === "table") {
    const previewChildren = parseFeishuDocsPreviewNodesFromMdxChildren(input.mdastNode.children)
    const rows = collectNativeTableRows(input.attributes, previewChildren)
    if (rows.length > 0) {
      const headRows = rows.filter((row) => row.header)
      const bodyRows = rows.filter((row) => !row.header)
      const visibleBodyRows = bodyRows.length > 0 ? bodyRows : (headRows.length > 0 ? [] : rows)
      const renderCellContent = (cell: NativePreviewNode, keyPrefix: string) => {
        if (cell.children.length > 0) {
          return renderPreviewNodes(
            cell.children,
            input.mediaPreviewUrls,
            input.mediaPreviewErrors,
            input.whiteboardPreviewUrls,
            input.whiteboardPreviewFocusRects,
            input.whiteboardPreviewErrors,
            input.t,
            input.language,
          )
        }

        const cellText = readPreferredFeishuDocsAttribute(
          normalizeFeishuDocsAttributes(cell.attributes),
          ["text", "title", "label", "name", "content", "description", "summary"],
        )

        return cellText
          ? renderInlineMarkdownMultiline(cellText, `${keyPrefix}:text`, {
            t: input.t,
            language: input.language,
          })
          : null
      }

      const renderRow = (row: NativeTableRow, rowIndex: number) => (
        <tr key={row.key || `row:${rowIndex}`}>
          {row.cells.map((cell, cellIndex) => {
            const CellTag = row.header || cell.header ? "th" : "td"
            return (
              <CellTag
                key={`${row.key}:cell:${cellIndex}`}
                colSpan={Math.max(cell.colSpan, 1)}
                rowSpan={Math.max(cell.rowSpan, 1)}
              >
                <div className="feishu-docs-local-preview-lark-table-cell">
                  {renderCellContent(cell.node, `${row.key}:cell:${cellIndex}`)}
                </div>
              </CellTag>
            )
          })}
        </tr>
      )

      return renderStandaloneFeishuTable({
        headRows: headRows.map((row, rowIndex) => renderRow(row, rowIndex)),
        bodyRows: visibleBodyRows.map((row, rowIndex) => renderRow(row, rowIndex)),
      })
    }
  }

  if (
    input.name === "board"
    || input.name === "whiteboard"
    || input.name === "mindnote"
    || input.name === "diagram"
  ) {
    const token = readPreferredFeishuDocsAttribute(
      input.attributes,
      input.name === "mindnote"
        ? ["token", "mindnote-token", "mindnote_token"]
        : input.name === "diagram"
          ? ["token", "diagram-token", "diagram_token"]
          : ["token", "whiteboard-token", "whiteboard_token"],
    )
    const previewError = token ? input.whiteboardPreviewErrors?.[token] ?? "" : ""
    const imageUrl =
      (token ? input.whiteboardPreviewUrls?.[token] ?? "" : "")
      || readPreferredFeishuDocsAttribute(input.attributes, ["src", "url", "href", "tmp-download-url", "tmp_download_url"])
      || ""
    const safeImageUrl = normalizeFeishuDocsPreviewHref(imageUrl)
    const boardTitle = readPreferredFeishuDocsAttribute(input.attributes, ["name", "title"])
      || title
    const focusRect = input.name === "board" || input.name === "whiteboard"
      ? (token ? input.whiteboardPreviewFocusRects?.[token] : undefined)
      : undefined
    return (
      <section className="feishu-docs-local-preview-plain-media is-image is-board-preview">
        {safeImageUrl ? (
          <FeishuDocsPreviewImage
            src={safeImageUrl}
            alt={boardTitle}
            displayMode="board"
            plain
            preferredWidth={FEISHU_DOCS_BOARD_PREVIEW_MAX_WIDTH}
            preferredHeight={FEISHU_DOCS_BOARD_PREVIEW_MAX_HEIGHT}
            focusRect={focusRect}
            t={input.t}
          />
        ) : (
          <div className="feishu-docs-local-preview-image-placeholder is-plain">
            <PictureOutlined />
            <Text type="secondary">{previewError || boardTitle}</Text>
          </div>
        )}
        {safeImageUrl && previewError ? (
          <Text type="secondary" className="feishu-docs-local-preview-plain-media-note">
            {previewError}
          </Text>
        ) : null}
      </section>
    )
  }

  if (input.name === "image") {
    const token = readPreferredFeishuDocsAttribute(input.attributes, ["token", "file-token", "file_token"])
    const previewError = token ? input.mediaPreviewErrors?.[token] ?? "" : ""
    const { width: imageWidth, height: imageHeight } = readFeishuDocsPreviewDimensions(input.attributes)
    const imageUrl =
      (token ? input.mediaPreviewUrls?.[token] ?? "" : "")
      || readPreferredFeishuDocsAttribute(input.attributes, ["src", "url", "tmp-download-url", "tmp_download_url"])
      || ""
    const safeImageUrl = normalizeFeishuDocsPreviewHref(imageUrl)
    const imageTitle = readPreferredFeishuDocsAttribute(input.attributes, ["name", "alt", "caption", "caption-content"])
      || previewText(input.t, "飞书页.文档.预览.图片.标题", "图片")
    return (
      <section className={`feishu-docs-local-preview-native-block ${resolveToneClassName(spec)} is-image`}>
        {safeImageUrl ? (
          <FeishuDocsPreviewImage
            src={safeImageUrl}
            alt={
              readPreferredFeishuDocsAttribute(input.attributes, ["alt", "name", "caption", "caption-content"])
              || previewText(input.t, "飞书页.文档.预览.图片.alt", "飞书图片")
            }
            displayMode="default"
            preferredWidth={imageWidth}
            preferredHeight={imageHeight}
            t={input.t}
          />
        ) : (
          <div className="feishu-docs-local-preview-image-placeholder">
            <PictureOutlined />
            <Text type="secondary">
              {imageTitle || previewText(input.t, "飞书页.文档.预览.图片.占位", "图片资源预览占位")}
            </Text>
          </div>
        )}
        {imageTitle ? (
          <div className="feishu-docs-local-preview-native-meta">
            <div className="feishu-docs-local-preview-native-caption">
              <Text type="secondary">{imageTitle}</Text>
            </div>
            {previewError ? (
              <Text type="secondary" className="feishu-docs-local-preview-native-description">
                {previewError}
              </Text>
            ) : null}
            {renderNativePropItems(propItems)}
          </div>
        ) : previewError ? (
          <div className="feishu-docs-local-preview-native-meta">
            <Text type="secondary" className="feishu-docs-local-preview-native-description">
              {previewError}
            </Text>
            {renderNativePropItems(propItems)}
          </div>
        ) : null}
      </section>
    )
  }

  if (input.name === "file") {
    const token = readPreferredFeishuDocsAttribute(input.attributes, ["token", "file-token", "file_token"])
    const fileName = readPreferredFeishuDocsAttribute(input.attributes, ["name", "title"])
      || previewText(input.t, "飞书页.文档.预览.行内标签.附件", "附件")
    const fileUrl =
      readPreferredFeishuDocsAttribute(input.attributes, ["url", "href", "tmp-download-url", "tmp_download_url"])
      || (token ? input.mediaPreviewUrls?.[token] ?? "" : "")
    const safeFileUrl = normalizeFeishuDocsPreviewHref(fileUrl)
    const viewType = resolveFeishuDocsViewTypeLabel(
      readPreferredFeishuDocsAttribute(input.attributes, ["view-type", "view_type"]),
      input.t,
    )
    return (
      <section className={`feishu-docs-local-preview-native-block ${resolveToneClassName(spec)} is-file`}>
        <div className="feishu-docs-local-preview-native-icon">{resolveBlockIcon(spec)}</div>
        <div className="feishu-docs-local-preview-native-meta">
          <div className="feishu-docs-local-preview-native-head">
            {safeFileUrl ? (
              <a href={safeFileUrl} target="_blank" rel="noreferrer" className="feishu-docs-local-preview-link-title">
                {fileName}
              </a>
            ) : (
              <span className="feishu-docs-local-preview-native-title">{fileName}</span>
            )}
            {viewType ? <Tag bordered={false}>{viewType}</Tag> : null}
          </div>
          {renderNativePropItems(propItems)}
        </div>
      </section>
    )
  }

  if (input.name === "iframe") {
    const iframeUrl = readPreferredFeishuDocsAttribute(
      input.attributes,
      ["src", "url", "href", "component-url", "component_url", "component.url"],
    )
    const safeIframeUrl = normalizeFeishuDocsPreviewHref(iframeUrl)
    const iframeTitle = readPreferredFeishuDocsAttribute(input.attributes, ["title", "name"])
      || resolveFeishuDocsTagLabel("iframe", spec?.label ?? "嵌入网页", input.t)
    return (
      <section className={`feishu-docs-local-preview-native-block ${resolveToneClassName(spec)} is-iframe`}>
        <div className="feishu-docs-local-preview-native-meta">
          <div className="feishu-docs-local-preview-native-head">
            <span className="feishu-docs-local-preview-native-title">{iframeTitle}</span>
            {safeIframeUrl ? <Tag bordered={false}>{resolveFeishuDocsUrlHostLabel(safeIframeUrl)}</Tag> : null}
          </div>
          {renderNativePropItems(propItems)}
          {safeIframeUrl ? (
            <div className="feishu-docs-local-preview-iframe-shell">
              <iframe
                className="feishu-docs-local-preview-iframe"
                src={safeIframeUrl}
                title={iframeTitle}
                loading="lazy"
              />
            </div>
          ) : (
            <div className="feishu-docs-local-preview-image-placeholder is-compact">
              <LinkOutlined />
              <Text type="secondary">
                {previewText(input.t, "飞书页.文档.预览.空状态.当前嵌入块无可预览地址", "当前嵌入块没有可预览的网页地址。")}
              </Text>
            </div>
          )}
        </div>
      </section>
    )
  }

  if (input.name === "link-preview") {
    const previewUrl = readPreferredFeishuDocsAttribute(input.attributes, ["url", "href"])
    const safePreviewUrl = normalizeFeishuDocsPreviewHref(previewUrl)
    const previewTitle = readPreferredFeishuDocsAttribute(input.attributes, ["title", "name"]) || previewUrl || title
    const previewDescription = readPreferredFeishuDocsAttribute(input.attributes, ["description", "summary", "text"])
    return (
      <section className={`feishu-docs-local-preview-native-block ${resolveToneClassName(spec)} is-link-preview`}>
        <div className="feishu-docs-local-preview-native-meta">
          <div className="feishu-docs-local-preview-link-card">
            <span className="feishu-docs-local-preview-link-eyebrow">
              {previewText(input.t, "飞书页.文档.预览.链接预览.眉标", "链接预览")}
            </span>
            {safePreviewUrl ? (
              <a
                href={safePreviewUrl}
                target="_blank"
                rel="noreferrer"
                className="feishu-docs-local-preview-link-title"
              >
                {previewTitle}
              </a>
            ) : (
              <span className="feishu-docs-local-preview-link-title">{previewTitle}</span>
            )}
            {previewDescription ? <Text type="secondary">{previewDescription}</Text> : null}
            {renderNativePropItems(propItems)}
            {previewUrl ? (
              <Text type="secondary" className="feishu-docs-local-preview-link-url">
                {previewUrl}
              </Text>
            ) : null}
          </div>
        </div>
      </section>
    )
  }

  if (input.name === "jira-issue") {
    const issueKey = readPreferredFeishuDocsAttribute(input.attributes, ["key", "issue-key", "issue_key", "id"]) || "Jira"
    const issueSummary = readPreferredFeishuDocsAttribute(input.attributes, ["summary", "title", "name", "description"])
      || previewText(input.t, "飞书页.文档.预览.Jira.未提供摘要", "未提供摘要")
    const issueStatus = readPreferredFeishuDocsAttribute(input.attributes, ["status", "state"])
    const issueAssignee = readPreferredFeishuDocsAttribute(input.attributes, ["assignee", "owner"])
    return (
      <section className={`feishu-docs-local-preview-native-block ${resolveToneClassName(spec)} is-jira-issue`}>
        <div className="feishu-docs-local-preview-native-meta">
          <div className="feishu-docs-local-preview-native-head">
            <span className="feishu-docs-local-preview-native-title">{issueKey}</span>
            {issueStatus ? <Tag bordered={false}>{issueStatus}</Tag> : null}
          </div>
          <Text>{issueSummary}</Text>
          {issueAssignee ? (
            <Text type="secondary">
              {previewText(input.t, "飞书页.文档.预览.Jira.负责人", "负责人：{姓名}", { 姓名: issueAssignee })}
            </Text>
          ) : null}
          {renderNativePropItems(propItems)}
        </div>
      </section>
    )
  }

  const childrenContent = renderChildrenContent()

  return (
    <section
      className={`feishu-docs-local-preview-native-block ${resolveToneClassName(spec)}${FEISHU_DOCS_CONTAINER_BLOCKS.has(input.name) ? " is-container" : ""}`}
    >
      <div className="feishu-docs-local-preview-native-icon">{resolveBlockIcon(spec)}</div>
      <div className="feishu-docs-local-preview-native-meta">
        {renderNativeBlockHeader({
          title,
          description: !childrenContent ? description : undefined,
          readonlyTagText: input.t?.("飞书页.文档.标签.只读"),
          readonly: FEISHU_DOCS_READONLY_BLOCKS.has(input.name),
          extraBadges: FEISHU_DOCS_CONTAINER_BLOCKS.has(input.name)
            ? [input.t ? input.t("飞书页.文档.标签.容器") : "容器"]
            : undefined,
        })}
        {renderNativePropItems(propItems)}
        {childrenContent ? (
          <div className="feishu-docs-local-preview-native-children">
            {childrenContent}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function FeishuDocsLocalPreview(props: FeishuDocsLocalPreviewProps) {
  const language = props.language ?? "zh-CN"
  const normalizedMarkdown = props.markdown.replace(/\r\n/g, "\n")
  // Keep browser and test/SSR output on the same parser. The readonly MDXEditor path
  // can drop mixed Feishu-native content in the browser and produce a blank preview.
  const fallbackNodes = useMemo(
    () => parseFeishuDocsLocalPreview(normalizedMarkdown),
    [normalizedMarkdown],
  )

  return (
    <div className="feishu-docs-local-preview-shell">
      <div className="feishu-docs-local-preview">
        {normalizedMarkdown.trim() ? (
          renderPreviewNodes(
            fallbackNodes,
            props.mediaPreviewUrls,
            props.mediaPreviewErrors,
            props.whiteboardPreviewUrls,
            props.whiteboardPreviewFocusRects,
            props.whiteboardPreviewErrors,
            props.t,
            language,
          )
        ) : (
          <div className="feishu-docs-local-preview-empty">
            <Text type="secondary">
              {props.t ? props.t("飞书页.文档.空状态.当前文档无可预览内容") : "当前文档没有可预览内容。"}
            </Text>
          </div>
        )}
      </div>
    </div>
  )
}
