import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent,
} from "react"

import type { FeishuDocBoardSnapshot } from "../../../../shared/desktop-feishu"
import type { FeishuTranslate as Translate } from "../types"
import { FeishuDocDiagramPreviewModal } from "./feishu-doc-diagram-preview-modal"
import { FeishuDocDiagramToolbar } from "./feishu-doc-diagram-toolbar"
import { FeishuDocMermaidPreview } from "./feishu-doc-mermaid-preview"
import { FeishuDocBoardNodeRenderer } from "./feishu-doc-board-node-renderer"
import {
  downloadFeishuDocPreviewSvg,
  resolveFeishuDocPreviewText,
  serializeFeishuDocPreviewSvgElement,
} from "./feishu-doc-diagram-preview-shared"

const FEISHU_DOC_BOARD_PREVIEW_MAX_WIDTH = 760
const FEISHU_DOC_BOARD_PREVIEW_MAX_HEIGHT = 760
const FEISHU_DOC_BOARD_MIN_SCALE = 0.18
const FEISHU_DOC_BOARD_MAX_SCALE = 4
const FEISHU_DOC_BOARD_ZOOM_STEP = 1.18
const FEISHU_DOC_BOARD_PADDING = 32

type BoardViewState = {
  scale: number
  panX: number
  panY: number
}

function clampBoardScale(value: number) {
  return Math.min(
    FEISHU_DOC_BOARD_MAX_SCALE,
    Math.max(FEISHU_DOC_BOARD_MIN_SCALE, value),
  )
}

function buildBoardFitViewState(
  snapshot: FeishuDocBoardSnapshot,
  viewportWidth: number,
  viewportHeight: number,
): BoardViewState {
  const safeWidth = Math.max(viewportWidth - FEISHU_DOC_BOARD_PADDING, 160)
  const safeHeight = Math.max(viewportHeight - FEISHU_DOC_BOARD_PADDING, 160)
  const scale = clampBoardScale(
    Math.min(safeWidth / snapshot.viewport.width, safeHeight / snapshot.viewport.height),
  )

  return {
    scale,
    panX: (viewportWidth - snapshot.viewport.width * scale) / 2,
    panY: (viewportHeight - snapshot.viewport.height * scale) / 2,
  }
}

function zoomBoardView(
  current: BoardViewState,
  nextScale: number,
  anchorX: number,
  anchorY: number,
): BoardViewState {
  return {
    scale: nextScale,
    panX: anchorX - ((anchorX - current.panX) / current.scale) * nextScale,
    panY: anchorY - ((anchorY - current.panY) / current.scale) * nextScale,
  }
}

function BoardSvgSurface(props: {
  snapshot: FeishuDocBoardSnapshot
  mode: "inline" | "modal"
  svgRef?: RefObject<SVGSVGElement | null>
}) {
  const nodes = useMemo(
    () => [...props.snapshot.nodes].sort((left, right) => left.zIndex - right.zIndex),
    [props.snapshot.nodes],
  )
  const nodesById = useMemo(
    () => new Map(props.snapshot.nodes.map((node) => [node.id, node])),
    [props.snapshot.nodes],
  )

  return (
    <svg
      ref={props.svgRef}
      className={`feishu-doc-board-surface is-${props.mode}`}
      viewBox={`${props.snapshot.viewport.minX} ${props.snapshot.viewport.minY} ${props.snapshot.viewport.width} ${props.snapshot.viewport.height}`}
      width={props.snapshot.viewport.width}
      height={props.snapshot.viewport.height}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${props.snapshot.blockType} board preview`}
    >
      <defs>
        <marker
          id="feishu-doc-board-arrow-triangle"
          markerWidth="12"
          markerHeight="12"
          refX="10"
          refY="6"
          orient="auto-start-reverse"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 12 6 L 0 12 z" fill="currentColor" />
        </marker>
      </defs>
      {nodes.map((node) => (
        <FeishuDocBoardNodeRenderer
          key={node.id}
          node={node}
          nodesById={nodesById}
          viewport={props.snapshot.viewport}
        />
      ))}
    </svg>
  )
}

function BoardModalSurface(props: {
  snapshot: FeishuDocBoardSnapshot
  t?: Translate
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    panX: number
    panY: number
  } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [viewState, setViewState] = useState<BoardViewState>({
    scale: 1,
    panX: 0,
    panY: 0,
  })
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
    if (!viewportRef.current) {
      return
    }
    setViewState(
      buildBoardFitViewState(
        props.snapshot,
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
    setViewState((current) => zoomBoardView(
      current,
      clampBoardScale(scaleResolver(current.scale)),
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
      (currentScale) => currentScale * FEISHU_DOC_BOARD_ZOOM_STEP,
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
      (currentScale) => currentScale / FEISHU_DOC_BOARD_ZOOM_STEP,
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
    const factor = event.deltaY < 0 ? FEISHU_DOC_BOARD_ZOOM_STEP : 1 / FEISHU_DOC_BOARD_ZOOM_STEP
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
    void downloadFeishuDocPreviewSvg(
      `feishu-board-${props.snapshot.token || "preview"}.svg`,
      serializeFeishuDocPreviewSvgElement(svgRef.current),
    )
  }

  useEffect(() => {
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
  }, [props.snapshot.token, props.snapshot.viewport.height, props.snapshot.viewport.width])

  return (
    <div className={`feishu-doc-diagram-stage is-board${dragging ? " is-dragging" : ""}`}>
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
        className="feishu-doc-board-viewport"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onPointerLeave={stopDragging}
        onWheel={handleWheel}
      >
        <div
          className="feishu-doc-board-canvas"
          style={{
            width: `${props.snapshot.viewport.width}px`,
            height: `${props.snapshot.viewport.height}px`,
            transform: `translate(${viewState.panX}px, ${viewState.panY}px) scale(${viewState.scale})`,
          }}
        >
          <BoardSvgSurface
            snapshot={props.snapshot}
            mode="modal"
            svgRef={svgRef}
          />
        </div>
      </div>
    </div>
  )
}

function createPlaceholderSnapshot(title: string): FeishuDocBoardSnapshot {
  return {
    token: "",
    blockType: "board",
    pulledAt: new Date(0).toISOString(),
    supportedNodeCount: 0,
    unsupportedNodeCount: 1,
    viewport: {
      minX: 0,
      minY: 0,
      width: 320,
      height: 180,
    },
    nodes: [{
      id: "placeholder",
      kind: "unsupported",
      rawType: "unavailable",
      supported: false,
      bounds: {
        x: 24,
        y: 24,
        width: 272,
        height: 132,
      },
      zIndex: 0,
      style: {},
      text: {
        content: title,
        horizontalAlign: "center",
        verticalAlign: "mid",
      },
      unsupportedReason: title,
    }],
  }
}

export function FeishuDocBoardPreview(props: {
  snapshot?: FeishuDocBoardSnapshot
  title: string
  align?: string
  t?: Translate
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const snapshot = props.snapshot ?? createPlaceholderSnapshot(props.title)
  const centeredClassName = props.align === "1" ? " is-page-centered" : ""
  const previewActionLabel = resolveFeishuDocPreviewText(
    props.t,
    "飞书页.文档.预览.画板.查看大图",
    "查看画板大图",
  )

  useEffect(() => {
    setPreviewOpen(false)
  }, [snapshot.token, snapshot.pulledAt, snapshot.viewport.height, snapshot.viewport.width])

  if (snapshot.mermaidSource?.trim()) {
    return (
      <div className={`feishu-doc-board-mermaid-fallback${centeredClassName}`}>
        <FeishuDocMermaidPreview source={snapshot.mermaidSource} t={props.t} />
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        className={`feishu-docs-local-preview-diagram-trigger is-board${centeredClassName}`}
        aria-label={previewActionLabel}
        title={previewActionLabel}
        onClick={() => setPreviewOpen(true)}
      >
        <BoardSvgSurface snapshot={snapshot} mode="inline" />
      </button>
      <FeishuDocDiagramPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      >
        <BoardModalSurface snapshot={snapshot} t={props.t} />
      </FeishuDocDiagramPreviewModal>
    </>
  )
}
