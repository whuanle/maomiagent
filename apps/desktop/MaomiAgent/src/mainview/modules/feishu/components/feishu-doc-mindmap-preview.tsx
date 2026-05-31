import { MindMapViewer, type MindMapViewerRef } from "@xiangfa/mindmap/viewer"
import "@xiangfa/mindmap/style.css"
import { Typography } from "antd"
import { useEffect, useMemo, useRef, useState, type RefObject } from "react"

import { looksLikeMermaidMindmapSource, buildConversationMindmapPreviewData } from "../../../lib/conversation-mindmap-preview"
import type { LanguageCode } from "../../../config/titlebar"
import { isDarkThemeMode, readThemeMode } from "../../../theme/antd-theme"
import type { FeishuTranslate as Translate } from "../types"
import { FeishuDocDiagramPreviewModal } from "./feishu-doc-diagram-preview-modal"
import { FeishuDocDiagramToolbar } from "./feishu-doc-diagram-toolbar"
import {
  downloadFeishuDocPreviewSvg,
  normalizeFeishuDocPreviewMarkdownSource,
  resolveFeishuDocPreviewText,
  serializeFeishuDocPreviewSvgElement,
} from "./feishu-doc-diagram-preview-shared"

const { Text } = Typography

function fitMindmapView(viewer: MindMapViewerRef | null) {
  if (!viewer || typeof window === "undefined") {
    return
  }

  const frame = window.requestAnimationFrame(() => {
    viewer.fitView()
  })

  return () => {
    window.cancelAnimationFrame(frame)
  }
}

function MindmapSurface(props: {
  source: string
  language?: LanguageCode
  mode: "inline" | "modal"
  hostRef?: RefObject<HTMLDivElement | null>
  viewerRef?: RefObject<MindMapViewerRef | null>
  toolbar?: boolean
  onZoomChange?: (zoomLabel: string) => void
}) {
  const localViewerRef = useRef<MindMapViewerRef | null>(null)
  const viewerRef = props.viewerRef ?? localViewerRef
  const previewResult = useMemo(
    () => buildConversationMindmapPreviewData(props.source),
    [props.source],
  )
  const viewerTheme = isDarkThemeMode(readThemeMode()) ? "dark" : "light"

  useEffect(() => {
    if (!previewResult.ok) {
      return undefined
    }

    return fitMindmapView(viewerRef.current)
  }, [previewResult, props.mode, props.source])

  if (!previewResult.ok) {
    return null
  }

  const ariaLabel = props.language === "en-US"
    ? `Mindmap preview for ${previewResult.data.text}`
    : `${previewResult.data.text} 思维导图预览`

  return (
    <div
      ref={props.hostRef}
      className={`feishu-docs-local-preview-mindmap-host is-${props.mode}`}
      role="img"
      aria-label={ariaLabel}
    >
      <MindMapViewer
        key={`${props.mode}:${props.source}`}
        ref={viewerRef}
        data={previewResult.data}
        defaultDirection="both"
        theme={viewerTheme}
        locale={props.language === "en-US" ? "en-US" : "zh-CN"}
        toolbar={props.toolbar ?? false}
        onEvent={(event) => {
          if (
            event.type === "zoomChange"
            && typeof event.zoom === "number"
            && props.onZoomChange
          ) {
            props.onZoomChange(`${Math.round(event.zoom * 100)}%`)
          }
        }}
      />
    </div>
  )
}

function MindmapModalSurface(props: {
  source: string
  t?: Translate
  language?: LanguageCode
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<MindMapViewerRef | null>(null)
  const [zoomLabel, setZoomLabel] = useState("100%")
  const toolbarLabel = resolveFeishuDocPreviewText(
    props.t,
    "飞书页.文档.预览.工具栏.标签",
    "图形工具栏",
  )
  const zoomInLabel = resolveFeishuDocPreviewText(
    props.t,
    "飞书页.文档.预览.工具栏.放大",
    "放大",
  )
  const zoomOutLabel = resolveFeishuDocPreviewText(
    props.t,
    "飞书页.文档.预览.工具栏.缩小",
    "缩小",
  )
  const fitLabel = resolveFeishuDocPreviewText(
    props.t,
    "飞书页.文档.预览.工具栏.适应画布",
    "适应画布",
  )
  const exportSvgLabel = resolveFeishuDocPreviewText(
    props.t,
    "飞书页.文档.预览.工具栏.导出SVG",
    "导出 SVG",
  )

  function clickMindmapControlButton(index: number) {
    const buttons = hostRef.current?.querySelectorAll<HTMLButtonElement>(".mindmap-control-btn")
    buttons?.[index]?.click()
  }

  function handleFit() {
    viewerRef.current?.fitView()
  }

  function handleExportSvg() {
    const svgElement = hostRef.current?.querySelector<SVGSVGElement>(".mindmap-svg")
    void downloadFeishuDocPreviewSvg(
      "feishu-mindmap-diagram.svg",
      serializeFeishuDocPreviewSvgElement(svgElement),
    )
  }

  return (
    <div className="feishu-doc-diagram-stage is-mindmap">
      <FeishuDocDiagramToolbar
        toolbarLabel={toolbarLabel}
        zoomInLabel={zoomInLabel}
        zoomOutLabel={zoomOutLabel}
        fitLabel={fitLabel}
        exportSvgLabel={exportSvgLabel}
        zoomLabel={zoomLabel}
        onZoomIn={() => clickMindmapControlButton(0)}
        onZoomOut={() => clickMindmapControlButton(1)}
        onFit={handleFit}
        onExportSvg={handleExportSvg}
      />
      <MindmapSurface
        source={props.source}
        language={props.language}
        mode="modal"
        hostRef={hostRef}
        viewerRef={viewerRef}
        toolbar
        onZoomChange={setZoomLabel}
      />
    </div>
  )
}

export function FeishuDocMindmapPreview(props: {
  source: string
  t?: Translate
  language?: LanguageCode
}) {
  const source = useMemo(
    () => normalizeFeishuDocPreviewMarkdownSource(props.source).trim(),
    [props.source],
  )
  const [previewOpen, setPreviewOpen] = useState(false)
  const previewActionLabel = resolveFeishuDocPreviewText(
    props.t,
    "飞书页.文档.预览.思维导图.查看大图",
    "查看思维导图大图",
  )
  const previewResult = useMemo(
    () => looksLikeMermaidMindmapSource(source)
      ? buildConversationMindmapPreviewData(source)
      : { ok: false as const, error: "not a mindmap" },
    [source],
  )

  useEffect(() => {
    setPreviewOpen(false)
  }, [source])

  return (
    <>
      {previewResult.ok ? (
        <button
          type="button"
          className="feishu-docs-local-preview-diagram-trigger is-mindmap"
          aria-label={previewActionLabel}
          title={previewActionLabel}
          onClick={() => setPreviewOpen(true)}
        >
          <MindmapSurface source={source} language={props.language} mode="inline" />
        </button>
      ) : (
        <pre className="feishu-docs-local-preview-mermaid-fallback">
          <code>{source}</code>
        </pre>
      )}
      {!previewResult.ok ? (
        <Text type="secondary" className="feishu-docs-local-preview-math-note">
          {resolveFeishuDocPreviewText(
            props.t,
            "飞书页.文档.预览.思维导图.渲染失败",
            "思维导图渲染失败，已回退源码。",
          )}
        </Text>
      ) : null}
      <FeishuDocDiagramPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      >
        {previewResult.ok ? (
          <MindmapModalSurface
            source={source}
            t={props.t}
            language={props.language}
          />
        ) : (
          <pre className="feishu-docs-local-preview-mermaid-fallback">
            <code>{source}</code>
          </pre>
        )}
      </FeishuDocDiagramPreviewModal>
    </>
  )
}
