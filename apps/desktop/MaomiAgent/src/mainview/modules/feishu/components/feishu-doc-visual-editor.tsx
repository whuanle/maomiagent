import type { FeishuDocIR } from "../../../../shared/desktop-feishu-doc-ir"
import { Typography } from "antd"
import { useEffect, useRef, useState } from "react"
import type { FeishuTranslate as Translate } from "../types"
import { FeishuDocsLocalPreview } from "./feishu-docs-local-preview"

const { Text } = Typography

type FeishuDocOutlineItem = {
  id: string
  level: number
  text: string
}

export function FeishuDocVisualEditor(props: {
  ir: FeishuDocIR
  mdx: string
  t?: Translate
  mediaPreviewUrls?: Record<string, string>
  mediaPreviewErrors?: Record<string, string>
  whiteboardPreviewUrls?: Record<string, string>
  whiteboardPreviewFocusRects?: Record<string, { left: number; top: number; width: number; height: number }>
  whiteboardPreviewErrors?: Record<string, string>
  onChange: (mdx: string) => void
}) {
  const previewScrollRef = useRef<HTMLDivElement | null>(null)
  const [outlineItems, setOutlineItems] = useState<FeishuDocOutlineItem[]>([])
  const [activeHeadingId, setActiveHeadingId] = useState("")

  useEffect(() => {
    const container = previewScrollRef.current
    if (!container) {
      setOutlineItems([])
      setActiveHeadingId("")
      return
    }

    const nextOutlineItems = Array.from(
      container.querySelectorAll<HTMLElement>("[data-feishu-doc-heading-id][data-feishu-doc-heading-level]"),
    ).map((element) => ({
      id: element.dataset.feishuDocHeadingId ?? element.id,
      level: Number(element.dataset.feishuDocHeadingLevel ?? "1"),
      text: element.textContent?.trim() ?? "",
    })).filter((item) => item.id && item.text)

    setOutlineItems(nextOutlineItems)
    setActiveHeadingId((current) => (
      current && nextOutlineItems.some((item) => item.id === current)
        ? current
        : (nextOutlineItems[0]?.id ?? "")
    ))
  }, [props.mdx])

  const handleJumpToHeading = (headingId: string) => {
    const container = previewScrollRef.current
    if (!container) {
      return
    }

    const target = container.querySelector<HTMLElement>(`[data-feishu-doc-heading-id="${headingId}"]`)
    if (!target) {
      return
    }

    const nextScrollTop = container.scrollTop
      + target.getBoundingClientRect().top
      - container.getBoundingClientRect().top
      - 18

    container.scrollTop = Math.max(nextScrollTop, 0)
    setActiveHeadingId(headingId)
  }

  void props.ir
  void props.onChange
  return (
    <div data-testid="feishu-doc-visual-editor" className="feishu-doc-visual-editor">
      <div className="feishu-doc-visual-preview-pane" ref={previewScrollRef}>
        <FeishuDocsLocalPreview
          markdown={props.mdx}
          t={props.t}
          mediaPreviewUrls={props.mediaPreviewUrls}
          mediaPreviewErrors={props.mediaPreviewErrors}
          whiteboardPreviewUrls={props.whiteboardPreviewUrls}
          whiteboardPreviewFocusRects={props.whiteboardPreviewFocusRects}
          whiteboardPreviewErrors={props.whiteboardPreviewErrors}
        />
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