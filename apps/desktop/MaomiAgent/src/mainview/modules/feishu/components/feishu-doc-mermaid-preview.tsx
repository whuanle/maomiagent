import DOMPurify from "dompurify"
import mermaid from "mermaid"
import { Typography } from "antd"
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react"

import { isDarkThemeMode, readThemeMode } from "../../../theme/antd-theme"
import type { FeishuTranslate as Translate } from "../types"
import { FeishuDocDiagramPreviewModal } from "./feishu-doc-diagram-preview-modal"
import { FeishuDocDiagramToolbar } from "./feishu-doc-diagram-toolbar"
import {
  downloadFeishuDocPreviewSvg,
  normalizeFeishuDocPreviewMarkdownSource,
  resolveFeishuDocPreviewErrorMessage,
  resolveFeishuDocPreviewText,
} from "./feishu-doc-diagram-preview-shared"

const { Text } = Typography

const FEISHU_DOCS_DIAGRAM_PREVIEW_MAX_WIDTH = 700
const FEISHU_DOCS_DIAGRAM_PREVIEW_MAX_HEIGHT = 700
const FEISHU_DOCS_DIAGRAM_MIN_SCALE = 0.24
const FEISHU_DOCS_DIAGRAM_MAX_SCALE = 4
const FEISHU_DOCS_DIAGRAM_ZOOM_STEP = 1.18
const FEISHU_DOCS_DIAGRAM_PADDING = 48

type MermaidDiagramSize = {
  width: number
  height: number
}

type MermaidDiagramViewState = {
  scale: number
  panX: number
  panY: number
}

function clampMermaidDiagramScale(value: number) {
  return Math.min(
    FEISHU_DOCS_DIAGRAM_MAX_SCALE,
    Math.max(FEISHU_DOCS_DIAGRAM_MIN_SCALE, value),
  )
}

function readMermaidDiagramSize(svgMarkup: string): MermaidDiagramSize | null {
  const viewBoxMatch = svgMarkup.match(/\bviewBox=(['"])([^'"]+)\1/i)?.[2]
  if (viewBoxMatch) {
    const values = viewBoxMatch
      .trim()
      .split(/[\s,]+/)
      .map((value) => Number.parseFloat(value))
      .filter((value) => Number.isFinite(value))
    if (values.length === 4 && values[2] > 0 && values[3] > 0) {
      return {
        width: values[2],
        height: values[3],
      }
    }
  }

  const width = Number.parseFloat(
    svgMarkup.match(/\bwidth=(['"])([^'"]+)\1/i)?.[2] ?? "",
  )
  const height = Number.parseFloat(
    svgMarkup.match(/\bheight=(['"])([^'"]+)\1/i)?.[2] ?? "",
  )
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return { width, height }
  }

  return null
}

function buildMermaidFitViewState(
  size: MermaidDiagramSize,
  viewportWidth: number,
  viewportHeight: number,
): MermaidDiagramViewState {
  const safeWidth = Math.max(viewportWidth - FEISHU_DOCS_DIAGRAM_PADDING, 160)
  const safeHeight = Math.max(viewportHeight - FEISHU_DOCS_DIAGRAM_PADDING, 160)
  const scale = clampMermaidDiagramScale(
    Math.min(safeWidth / size.width, safeHeight / size.height),
  )

  return {
    scale,
    panX: (viewportWidth - size.width * scale) / 2,
    panY: (viewportHeight - size.height * scale) / 2,
  }
}

function zoomMermaidDiagramView(
  current: MermaidDiagramViewState,
  nextScale: number,
  anchorX: number,
  anchorY: number,
): MermaidDiagramViewState {
  return {
    scale: nextScale,
    panX: anchorX - ((anchorX - current.panX) / current.scale) * nextScale,
    panY: anchorY - ((anchorY - current.panY) / current.scale) * nextScale,
  }
}

function MermaidSvgSurface(props: {
  svg: string
  mode: "inline" | "modal"
}) {
  return (
    <div
      className={`feishu-docs-local-preview-mermaid-rendered is-${props.mode}`}
      style={props.mode === "inline"
        ? {
            maxWidth: `${FEISHU_DOCS_DIAGRAM_PREVIEW_MAX_WIDTH}px`,
            maxHeight: `${FEISHU_DOCS_DIAGRAM_PREVIEW_MAX_HEIGHT}px`,
          }
        : undefined}
      dangerouslySetInnerHTML={{ __html: props.svg }}
    />
  )
}

function MermaidModalSurface(props: {
  svg: string
  t?: Translate
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    panX: number
    panY: number
  } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [viewState, setViewState] = useState<MermaidDiagramViewState>({
    scale: 1,
    panX: 0,
    panY: 0,
  })
  const size = useMemo(
    () => readMermaidDiagramSize(props.svg),
    [props.svg],
  )
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

  function fitToViewport() {
    if (!size || !viewportRef.current) {
      return
    }
    setViewState(
      buildMermaidFitViewState(
        size,
        viewportRef.current.clientWidth,
        viewportRef.current.clientHeight,
      ),
    )
  }

  function updateZoom(
    scaleResolver: (currentScale: number) => number,
    anchorX: number,
    anchorY: number,
  ) {
    setViewState((current) => zoomMermaidDiagramView(
      current,
      clampMermaidDiagramScale(scaleResolver(current.scale)),
      anchorX,
      anchorY,
    ))
  }

  function handleZoomIn() {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }
    updateZoom(
      (currentScale) => currentScale * FEISHU_DOCS_DIAGRAM_ZOOM_STEP,
      viewport.clientWidth / 2,
      viewport.clientHeight / 2,
    )
  }

  function handleZoomOut() {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }
    updateZoom(
      (currentScale) => currentScale / FEISHU_DOCS_DIAGRAM_ZOOM_STEP,
      viewport.clientWidth / 2,
      viewport.clientHeight / 2,
    )
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!viewportRef.current) {
      return
    }
    event.preventDefault()
    const rect = viewportRef.current.getBoundingClientRect()
    const factor = event.deltaY < 0 ? FEISHU_DOCS_DIAGRAM_ZOOM_STEP : 1 / FEISHU_DOCS_DIAGRAM_ZOOM_STEP
    updateZoom(
      (currentScale) => currentScale * factor,
      event.clientX - rect.left,
      event.clientY - rect.top,
    )
  }

  function stopDragging(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
      setDragging(false)
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: viewState.panX,
      panY: viewState.panY,
    }
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return
    }
    setViewState((current) => ({
      ...current,
      panX: dragRef.current!.panX + event.clientX - dragRef.current!.startX,
      panY: dragRef.current!.panY + event.clientY - dragRef.current!.startY,
    }))
  }

  function handleExportSvg() {
    downloadFeishuDocPreviewSvg("feishu-mermaid-diagram.svg", props.svg)
  }

  useEffect(() => {
    if (!size) {
      return undefined
    }

    const frame = window.requestAnimationFrame(() => {
      fitToViewport()
    })

    function handleResize() {
      fitToViewport()
    }

    window.addEventListener("resize", handleResize)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", handleResize)
    }
  }, [size])

  return (
    <div className={`feishu-doc-diagram-stage is-mermaid${dragging ? " is-dragging" : ""}`}>
      <FeishuDocDiagramToolbar
        toolbarLabel={toolbarLabel}
        zoomInLabel={zoomInLabel}
        zoomOutLabel={zoomOutLabel}
        fitLabel={fitLabel}
        exportSvgLabel={exportSvgLabel}
        zoomLabel={`${Math.round(viewState.scale * 100)}%`}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFit={fitToViewport}
        onExportSvg={handleExportSvg}
      />
      <div
        ref={viewportRef}
        className="feishu-doc-diagram-viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onPointerLeave={stopDragging}
        onWheel={handleWheel}
      >
        <div
          className="feishu-doc-diagram-canvas"
          style={{
            width: size ? `${size.width}px` : undefined,
            height: size ? `${size.height}px` : undefined,
            transform: `translate(${viewState.panX}px, ${viewState.panY}px) scale(${viewState.scale})`,
          }}
        >
          <MermaidSvgSurface svg={props.svg} mode="modal" />
        </div>
      </div>
    </div>
  )
}

export function FeishuDocMermaidPreview(props: {
  source: string
  t?: Translate
}) {
  const source = useMemo(
    () => normalizeFeishuDocPreviewMarkdownSource(props.source).trim(),
    [props.source],
  )
  const renderId = useId().replace(/[^a-zA-Z0-9_-]/g, "")
  const [svg, setSvg] = useState("")
  const [error, setError] = useState("")
  const [previewOpen, setPreviewOpen] = useState(false)
  const mermaidTheme = isDarkThemeMode(readThemeMode()) ? "dark" : "neutral"
  const previewActionLabel = resolveFeishuDocPreviewText(
    props.t,
    "飞书页.文档.预览.Mermaid.查看大图",
    "查看 Mermaid 大图",
  )

  useEffect(() => {
    setPreviewOpen(false)
  }, [source])

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
        setError(resolveFeishuDocPreviewErrorMessage(renderError))
      })

    return () => {
      cancelled = true
    }
  }, [mermaidTheme, renderId, source])

  return (
    <>
      {svg ? (
        <button
          type="button"
          className="feishu-docs-local-preview-diagram-trigger is-mermaid"
          aria-label={previewActionLabel}
          title={previewActionLabel}
          onClick={() => setPreviewOpen(true)}
        >
          <MermaidSvgSurface svg={svg} mode="inline" />
        </button>
      ) : (
        <pre className="feishu-docs-local-preview-mermaid-fallback">
          <code>{source}</code>
        </pre>
      )}
      {error ? (
        <Text type="secondary" className="feishu-docs-local-preview-math-note">
          {resolveFeishuDocPreviewText(
            props.t,
            "飞书页.文档.预览.Mermaid.渲染失败",
            "Mermaid 渲染失败，已回退源码。",
          )}
        </Text>
      ) : null}
      <FeishuDocDiagramPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      >
        {svg ? (
          <MermaidModalSurface svg={svg} t={props.t} />
        ) : (
          <pre className="feishu-docs-local-preview-mermaid-fallback">
            <code>{source}</code>
          </pre>
        )}
      </FeishuDocDiagramPreviewModal>
    </>
  )
}
