import type { FeishuDocBoardNodeSnapshot } from "../../../../shared/desktop-feishu";

import { buildConnectorPath } from "./feishu-doc-board-rendering";

type Props = {
  node: FeishuDocBoardNodeSnapshot
  nodesById: Map<string, FeishuDocBoardNodeSnapshot>
  viewport: {
    minX: number
    minY: number
    width: number
    height: number
  }
}

const DEFAULT_SHAPE_FILL = "#ffffff"
const DEFAULT_SHAPE_STROKE = "#7b8494"
const DEFAULT_TEXT_COLOR = "#1f2329"

function readStyleString(style: Record<string, unknown>, key: string): string {
  const value = style[key]
  return typeof value === "string" ? value.trim() : ""
}

function readBorderWidth(style: Record<string, unknown>) {
  const width = readStyleString(style, "border_width")
  if (width === "bold") {
    return 2.4
  }
  if (width === "wide") {
    return 3
  }
  return 1.4
}

function readStrokeDasharray(style: Record<string, unknown>) {
  const borderStyle = readStyleString(style, "border_style")
  if (borderStyle === "dash") {
    return "8 6"
  }
  if (borderStyle === "dot") {
    return "4 4"
  }
  return undefined
}

function readTextAnchor(horizontalAlign: string | undefined) {
  if (horizontalAlign === "right") {
    return "end"
  }
  if (horizontalAlign === "left") {
    return "start"
  }
  return "middle"
}

function readTextX(node: FeishuDocBoardNodeSnapshot) {
  const horizontalAlign = node.text?.horizontalAlign
  if (horizontalAlign === "left") {
    return node.bounds.x + 14
  }
  if (horizontalAlign === "right") {
    return node.bounds.x + node.bounds.width - 14
  }
  return node.bounds.x + node.bounds.width / 2
}

function readTextY(node: FeishuDocBoardNodeSnapshot, lineCount: number) {
  const verticalAlign = node.text?.verticalAlign
  const fontSize = node.text?.fontSize ?? 14
  const lineHeight = fontSize * 1.35
  const textHeight = lineHeight * lineCount
  if (verticalAlign === "top") {
    return node.bounds.y + 18
  }
  if (verticalAlign === "bottom") {
    return node.bounds.y + node.bounds.height - textHeight - 8
  }
  return node.bounds.y + (node.bounds.height - textHeight) / 2 + 6
}

function renderNodeText(node: FeishuDocBoardNodeSnapshot) {
  const content = node.text?.content?.trim()
  if (!content) {
    return null
  }

  const lines = content.split("\n")
  const fontSize = node.text?.fontSize ?? 14
  const lineHeight = fontSize * 1.35
  const baseX = readTextX(node)
  const baseY = readTextY(node, lines.length)
  const textAnchor = readTextAnchor(node.text?.horizontalAlign)
  const fill = node.text?.color || DEFAULT_TEXT_COLOR
  const weight = node.text?.fontWeight === "bold" ? 700 : 500

  return (
    <text
      x={baseX}
      y={baseY}
      fill={fill}
      fontSize={fontSize}
      fontWeight={weight}
      textAnchor={textAnchor}
      dominantBaseline="hanging"
      className="feishu-doc-board-node-text"
    >
      {lines.map((line, index) => (
        <tspan
          key={`${node.id}:line:${index}`}
          x={baseX}
          dy={index === 0 ? 0 : lineHeight}
        >
          {line}
        </tspan>
      ))}
    </text>
  )
}

function renderShape(node: FeishuDocBoardNodeSnapshot) {
  const fill = readStyleString(node.style, "fill_color") || DEFAULT_SHAPE_FILL
  const stroke = readStyleString(node.style, "border_color") || DEFAULT_SHAPE_STROKE
  const strokeWidth = readBorderWidth(node.style)
  const dasharray = readStrokeDasharray(node.style)
  const commonProps = {
    fill,
    stroke,
    strokeWidth,
    strokeDasharray: dasharray,
    className: "feishu-doc-board-shape",
  }

  let shapeNode
  switch (node.shapeType) {
    case "diamond": {
      const x = node.bounds.x
      const y = node.bounds.y
      const width = node.bounds.width
      const height = node.bounds.height
      const points = [
        `${x + width / 2},${y}`,
        `${x + width},${y + height / 2}`,
        `${x + width / 2},${y + height}`,
        `${x},${y + height / 2}`,
      ].join(" ")
      shapeNode = <polygon points={points} {...commonProps} />
      break
    }
    case "ellipse":
    case "circle":
      shapeNode = (
        <ellipse
          cx={node.bounds.x + node.bounds.width / 2}
          cy={node.bounds.y + node.bounds.height / 2}
          rx={Math.max(node.bounds.width / 2, 1)}
          ry={Math.max(node.bounds.height / 2, 1)}
          {...commonProps}
        />
      )
      break
    case "rect":
      shapeNode = (
        <rect
          x={node.bounds.x}
          y={node.bounds.y}
          width={node.bounds.width}
          height={node.bounds.height}
          {...commonProps}
        />
      )
      break
    default:
      shapeNode = (
        <rect
          x={node.bounds.x}
          y={node.bounds.y}
          width={node.bounds.width}
          height={node.bounds.height}
          rx={14}
          ry={14}
          {...commonProps}
        />
      )
      break
  }

  return (
    <g className="feishu-doc-board-node feishu-doc-board-node-shape">
      {shapeNode}
      {renderNodeText(node)}
    </g>
  )
}

function renderNoteShape(node: FeishuDocBoardNodeSnapshot) {
  const fill = readStyleString(node.style, "fill_color") || "#fef1ce"
  const stroke = readStyleString(node.style, "border_color") || "#000000"
  const strokeWidth = readBorderWidth(node.style)
  const x = node.bounds.x
  const y = node.bounds.y
  const width = node.bounds.width
  const height = node.bounds.height
  const foldSize = Math.max(12, Math.min(18, width * 0.14, height * 0.42))
  const mainPath = [
    `M ${x} ${y}`,
    `H ${x + width - foldSize}`,
    `L ${x + width} ${y + foldSize}`,
    `V ${y + height}`,
    `H ${x}`,
    "Z",
  ].join(" ")
  const foldPath = [
    `M ${x + width - foldSize} ${y}`,
    `L ${x + width - foldSize} ${y + foldSize}`,
    `L ${x + width} ${y + foldSize}`,
    "Z",
  ].join(" ")

  return (
    <g className="feishu-doc-board-node feishu-doc-board-node-note">
      <path
        d={mainPath}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        className="feishu-doc-board-note"
      />
      <path
        d={foldPath}
        fill="rgba(255, 255, 255, 0.38)"
        stroke={stroke}
        strokeWidth={Math.max(1, strokeWidth * 0.9)}
        className="feishu-doc-board-note-fold"
      />
      {renderNodeText(node)}
    </g>
  )
}

function renderLifeLine(node: FeishuDocBoardNodeSnapshot, viewport: Props["viewport"]) {
  const fill = readStyleString(node.style, "fill_color") || "#f0f4fc"
  const stroke = readStyleString(node.style, "border_color") || "#000000"
  const strokeWidth = readBorderWidth(node.style)
  const dasharray = readStrokeDasharray({ border_style: "dot" })
  const centerX = node.bounds.x + node.bounds.width / 2
  const lineStartY = node.bounds.y + node.bounds.height
  const lineEndY = Math.max(
    lineStartY + 24,
    viewport.minY + viewport.height - 24,
  )

  return (
    <g className="feishu-doc-board-node feishu-doc-board-node-lifeline">
      <rect
        x={node.bounds.x}
        y={node.bounds.y}
        width={node.bounds.width}
        height={node.bounds.height}
        rx={8}
        ry={8}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        className="feishu-doc-board-lifeline-head"
      />
      <line
        x1={centerX}
        y1={lineStartY}
        x2={centerX}
        y2={lineEndY}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dasharray}
        className="feishu-doc-board-lifeline-spine"
      />
      {renderNodeText(node)}
    </g>
  )
}

function resolveArrowMarker(value: string | undefined) {
  return value === "triangle_arrow" ? "url(#feishu-doc-board-arrow-triangle)" : undefined
}

function renderConnector(node: FeishuDocBoardNodeSnapshot, nodesById: Map<string, FeishuDocBoardNodeSnapshot>) {
  const path = buildConnectorPath(node, nodesById)
  if (!path) {
    return null
  }

  const stroke = readStyleString(node.style, "border_color") || DEFAULT_SHAPE_STROKE
  const strokeWidth = readBorderWidth(node.style)
  const dasharray = readStrokeDasharray(node.style)

  return (
    <g className="feishu-doc-board-node feishu-doc-board-node-connector">
      <path
        d={path}
        fill="none"
        stroke={stroke}
        color={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dasharray}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerStart={resolveArrowMarker(node.routing?.startArrow)}
        markerEnd={resolveArrowMarker(node.routing?.endArrow)}
        className="feishu-doc-board-connector"
      />
      {renderNodeText(node)}
    </g>
  )
}

function renderUnsupported(node: FeishuDocBoardNodeSnapshot) {
  const label = node.text?.content?.trim()
    || node.unsupportedReason
    || node.rawType
    || "unsupported"

  return (
    <g className="feishu-doc-board-node feishu-doc-board-node-unsupported">
      <rect
        x={node.bounds.x}
        y={node.bounds.y}
        width={Math.max(node.bounds.width, 120)}
        height={Math.max(node.bounds.height, 72)}
        rx={12}
        ry={12}
        fill="rgba(140, 149, 159, 0.06)"
        stroke="rgba(123, 132, 148, 0.88)"
        strokeWidth={1.4}
        strokeDasharray="8 6"
      />
      <text
        x={node.bounds.x + Math.max(node.bounds.width, 120) / 2}
        y={node.bounds.y + Math.max(node.bounds.height, 72) / 2}
        fill={DEFAULT_TEXT_COLOR}
        fontSize={13}
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {label}
      </text>
    </g>
  )
}

export function FeishuDocBoardNodeRenderer(props: Props) {
  if (props.node.kind === "connector") {
    return renderConnector(props.node, props.nodesById)
  }
  if (props.node.kind === "shape") {
    return renderShape(props.node)
  }
  if (props.node.kind === "text") {
    return renderNodeText(props.node)
  }
  if (props.node.rawType === "life_line") {
    return renderLifeLine(props.node, props.viewport)
  }
  if (props.node.rawType === "composite_shape" && props.node.shapeType === "note_shape") {
    return renderNoteShape(props.node)
  }
  return renderUnsupported(props.node)
}
