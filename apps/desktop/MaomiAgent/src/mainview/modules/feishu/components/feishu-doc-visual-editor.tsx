import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CodeToggle,
  codeBlockPlugin,
  codeMirrorPlugin,
  CreateLink,
  headingsPlugin,
  InsertCodeBlock,
  InsertTable,
  jsxPlugin,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  Separator,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
  type MDXEditorMethods,
} from "@mdxeditor/editor"
import type { FeishuDocIR } from "../../../../shared/desktop-feishu-doc-ir"
import type { FeishuDocBoardSnapshot } from "../../../../shared/desktop-feishu"
import { Typography } from "antd"
import { useEffect, useMemo, useRef, useState } from "react"
import type { FeishuTranslate as Translate } from "../types"
import {
  createFeishuDocsJsxComponentDescriptors,
  FEISHU_DOCS_MARKDOWN_CODE_BLOCK_LANGUAGE_LABELS,
  FeishuDocsLocalPreview,
} from "./feishu-docs-local-preview"

const { Text } = Typography
const FEISHU_DOC_VISUAL_HEADING_SELECTOR = "[data-feishu-doc-heading-id][data-feishu-doc-heading-level], h1, h2, h3, h4, h5, h6"

type FeishuDocOutlineItem = {
  id: string
  level: number
  text: string
}

function FeishuDocVisualToolbar() {
  return (
    <>
      <UndoRedo />
      <Separator />
      <BlockTypeSelect />
      <Separator />
      <BoldItalicUnderlineToggles />
      <CodeToggle />
      <Separator />
      <ListsToggle />
      <Separator />
      <CreateLink />
      <InsertTable />
      <InsertCodeBlock />
    </>
  )
}

function resolveFeishuDocHeadingLevel(element: HTMLElement) {
  const explicitLevel = Number(element.dataset.feishuDocHeadingLevel ?? "")
  if (Number.isFinite(explicitLevel) && explicitLevel > 0) {
    return explicitLevel
  }

  const matchedTagLevel = /^H([1-6])$/.exec(element.tagName)?.[1]
  return Number(matchedTagLevel ?? "1")
}

function collectFeishuDocOutlineItems(container: HTMLElement) {
  const seenIds = new Set<string>()

  return Array.from(container.querySelectorAll<HTMLElement>(FEISHU_DOC_VISUAL_HEADING_SELECTOR)).map((element, index) => {
    const level = resolveFeishuDocHeadingLevel(element)
    const nextId = element.dataset.feishuDocHeadingId ?? element.id ?? `feishu-doc-visual-heading-${index}`

    if (!element.dataset.feishuDocHeadingId) {
      element.dataset.feishuDocHeadingId = nextId
    }

    if (!element.dataset.feishuDocHeadingLevel) {
      element.dataset.feishuDocHeadingLevel = String(level)
    }

    if (!element.id) {
      element.id = nextId
    }

    const text = element.textContent?.trim() ?? ""
    if (!nextId || !text || seenIds.has(nextId)) {
      return null
    }

    seenIds.add(nextId)
    return {
      id: nextId,
      level,
      text,
    }
  }).filter((item): item is FeishuDocOutlineItem => !!item)
}

export function FeishuDocVisualEditor(props: {
  ir: FeishuDocIR
  mdx: string
  editable?: boolean
  t?: Translate
  mediaPreviewUrls?: Record<string, string>
  mediaPreviewErrors?: Record<string, string>
  boardSnapshots?: Record<string, FeishuDocBoardSnapshot>
  onChange: (mdx: string) => void
}) {
  const previewScrollRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<MDXEditorMethods>(null)
  const syncedMarkdownRef = useRef<string | null>(null)
  const [outlineItems, setOutlineItems] = useState<FeishuDocOutlineItem[]>([])
  const [activeHeadingId, setActiveHeadingId] = useState("")
  const [editorRenderMarkdown, setEditorRenderMarkdown] = useState(props.mdx)
  const editorResetKey = `${props.ir.document.id}:${props.ir.document.revisionId}:${props.editable ? "edit" : "preview"}`

  const jsxComponentDescriptors = useMemo(
    () => createFeishuDocsJsxComponentDescriptors({
      t: props.t,
      language: "zh-CN",
      mediaPreviewUrls: props.mediaPreviewUrls,
      mediaPreviewErrors: props.mediaPreviewErrors,
      boardSnapshots: props.boardSnapshots,
    }),
    [
      props.boardSnapshots,
      props.mediaPreviewErrors,
      props.mediaPreviewUrls,
      props.t,
    ],
  )

  const editorPlugins = useMemo(() => [
    headingsPlugin({ allowedHeadingLevels: [1, 2, 3, 4, 5, 6] }),
    quotePlugin(),
    listsPlugin(),
    linkPlugin(),
    linkDialogPlugin(),
    thematicBreakPlugin(),
    tablePlugin(),
    codeBlockPlugin({ defaultCodeBlockLanguage: "text" }),
    codeMirrorPlugin({ codeBlockLanguages: FEISHU_DOCS_MARKDOWN_CODE_BLOCK_LANGUAGE_LABELS }),
    jsxPlugin({ jsxComponentDescriptors }),
    markdownShortcutPlugin(),
    toolbarPlugin({
      toolbarClassName: "feishu-doc-visual-rich-toolbar",
      toolbarContents: () => <FeishuDocVisualToolbar />,
    }),
  ], [jsxComponentDescriptors])

  useEffect(() => {
    setEditorRenderMarkdown(props.mdx)
    syncedMarkdownRef.current = null
  }, [editorResetKey])

  useEffect(() => {
    if (!props.editable) {
      return
    }

    const nextMarkdown = props.mdx
    if (syncedMarkdownRef.current !== nextMarkdown) {
      setEditorRenderMarkdown(nextMarkdown)
    }

    if (syncedMarkdownRef.current === nextMarkdown) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      editorRef.current?.setMarkdown(nextMarkdown)
      syncedMarkdownRef.current = nextMarkdown
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [props.editable, props.mdx])

  useEffect(() => {
    const container = previewScrollRef.current
    if (!container) {
      setOutlineItems([])
      setActiveHeadingId("")
      return
    }

    let frame = 0
    const updateOutline = () => {
      frame = 0
      const nextOutlineItems = collectFeishuDocOutlineItems(container)
      setOutlineItems(nextOutlineItems)
      setActiveHeadingId((current) => (
        current && nextOutlineItems.some((item) => item.id === current)
          ? current
          : (nextOutlineItems[0]?.id ?? "")
      ))
    }

    const scheduleOutlineUpdate = () => {
      if (frame) {
        window.cancelAnimationFrame(frame)
      }

      frame = window.requestAnimationFrame(updateOutline)
    }

    scheduleOutlineUpdate()

    const observer = new MutationObserver(() => {
      scheduleOutlineUpdate()
    })

    observer.observe(container, {
      subtree: true,
      childList: true,
      characterData: true,
    })

    return () => {
      observer.disconnect()
      if (frame) {
        window.cancelAnimationFrame(frame)
      }
    }
  }, [props.editable, props.mdx])

  const resolveScrollContainer = () => {
    const container = previewScrollRef.current
    if (!container || !props.editable) {
      return container
    }

    return container.querySelector<HTMLElement>(".mdxeditor-root-contenteditable") ?? container
  }

  const handleJumpToHeading = (headingId: string) => {
    const container = previewScrollRef.current
    const scrollContainer = resolveScrollContainer()
    if (!container || !scrollContainer) {
      return
    }

    const target = container.querySelector<HTMLElement>(`[data-feishu-doc-heading-id="${headingId}"]`)
    if (!target) {
      return
    }

    const nextScrollTop = scrollContainer.scrollTop
      + target.getBoundingClientRect().top
      - scrollContainer.getBoundingClientRect().top
      - 18

    scrollContainer.scrollTop = Math.max(nextScrollTop, 0)
    setActiveHeadingId(headingId)
  }

  const handleEditorChange = (nextMarkdown: string, initialMarkdownNormalize: boolean) => {
    if (initialMarkdownNormalize || syncedMarkdownRef.current === nextMarkdown) {
      return
    }

    syncedMarkdownRef.current = nextMarkdown
    setEditorRenderMarkdown(nextMarkdown)
    props.onChange(nextMarkdown)
  }

  return (
    <div data-testid="feishu-doc-visual-editor" className="feishu-doc-visual-editor">
      <div
        className={[
          "feishu-doc-visual-preview-pane",
          props.editable ? "is-editable" : "",
        ].filter(Boolean).join(" ")}
        ref={previewScrollRef}
      >
        {props.editable ? (
          <MDXEditor
            key={`feishu-doc-visual-editor:${editorResetKey}`}
            ref={editorRef}
            markdown={editorRenderMarkdown}
            trim={false}
            spellCheck={false}
            className="feishu-docs-local-preview-editor feishu-doc-visual-rich-editor"
            contentEditableClassName="feishu-docs-local-preview-markdown feishu-doc-visual-rich-content"
            plugins={editorPlugins}
            onChange={handleEditorChange}
          />
        ) : (
          <FeishuDocsLocalPreview
            markdown={props.mdx}
            t={props.t}
            mediaPreviewUrls={props.mediaPreviewUrls}
            mediaPreviewErrors={props.mediaPreviewErrors}
            boardSnapshots={props.boardSnapshots}
          />
        )}
      </div>
      <aside className="feishu-doc-visual-outline" aria-label={props.t ? props.t("飞书页.文档.大纲.标题") : "大纲"}>
        <div className="feishu-doc-visual-outline-head">
          <Text strong>{props.t ? props.t("飞书页.文档.大纲.标题") : "大纲"}</Text>
        </div>
        <div className="feishu-doc-visual-outline-body">
          {outlineItems.length > 0 ? outlineItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={[
                "feishu-doc-visual-outline-item",
                activeHeadingId === item.id ? "is-active" : "",
              ].filter(Boolean).join(" ")}
              style={{ paddingInlineStart: `${12 + Math.max(0, item.level - 1) * 14}px` }}
              onClick={() => handleJumpToHeading(item.id)}
            >
              <span className="feishu-doc-visual-outline-item-text">{item.text}</span>
            </button>
          )) : (
            <div className="feishu-doc-visual-outline-empty">
              <Text type="secondary">
                {props.t ? props.t("飞书页.文档.大纲.空状态") : "当前文档没有可显示的大纲。"}
              </Text>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
