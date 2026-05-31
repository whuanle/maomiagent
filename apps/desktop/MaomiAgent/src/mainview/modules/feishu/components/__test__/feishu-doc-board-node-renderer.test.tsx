import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

import type { FeishuDocBoardNodeSnapshot } from "../../../../../shared/desktop-feishu"
import { buildConnectorPath } from "../feishu-doc-board-rendering"

async function nodeRendererSource(): Promise<string> {
  return readFile(new URL("../feishu-doc-board-node-renderer.tsx", import.meta.url), "utf8")
}

function createShapeNode(input: {
  id: string
  x: number
  y: number
  width: number
  height: number
}): FeishuDocBoardNodeSnapshot {
  return {
    id: input.id,
    kind: "shape",
    rawType: "composite_shape",
    supported: true,
    bounds: {
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
    },
    zIndex: 1,
    shapeType: "round_rect",
    style: {},
  }
}

function createConnectorNode(): FeishuDocBoardNodeSnapshot {
  return {
    id: "connector_1",
    kind: "connector",
    rawType: "connector",
    supported: true,
    bounds: {
      x: 140,
      y: 120,
      width: 180,
      height: 32,
    },
    zIndex: 2,
    style: {
      border_color: "#444444",
    },
    routing: {
      shape: "curve",
      points: [
        { x: 240, y: 120 },
        { x: 280, y: 132 },
      ],
      startAttachment: {
        objectId: "shape_1",
        position: { x: 1, y: 0.5 },
        snapTo: "right",
      },
      endAttachment: {
        objectId: "shape_2",
        position: { x: 0, y: 0.5 },
        snapTo: "left",
      },
    },
  }
}

describe("buildConnectorPath", () => {
  test("offsets cached native board turning points when they are stored relative to connector bounds", () => {
    const shape1 = createShapeNode({
      id: "o2:2",
      x: 50.5,
      y: 96.13600158691406,
      width: 126.576171875,
      height: 72.54399871826172,
    })
    const shape2 = createShapeNode({
      id: "o2:5",
      x: 459.65234375,
      y: 124.27200317382812,
      width: 112.576171875,
      height: 72.54399871826172,
    })
    const nodesById = new Map([
      [shape1.id, shape1],
      [shape2.id, shape2],
    ])
    const connector: FeishuDocBoardNodeSnapshot = {
      id: "c2:3",
      kind: "connector",
      rawType: "connector",
      supported: true,
      bounds: {
        x: 163.28599548339844,
        y: 56.13600158691406,
        width: 319.0220031738281,
        height: 68.86199951171875,
      },
      zIndex: 3,
      style: {},
      routing: {
        shape: "curve",
        points: [
          { x: 63.37300109863281, y: 6.763999938964844 },
          { x: 155.0780029296875, y: 0 },
          { x: 248.26100158691406, y: 11.47700023651123 },
          { x: 308.1629943847656, y: 57.3849983215332 },
        ],
        startAttachment: {
          objectId: "o2:2",
          position: { x: 0.8910523653030396, y: 0.008064071647822857 },
          snapTo: "auto",
        },
        endAttachment: {
          objectId: "o2:5",
          position: { x: 0.20124734938144684, y: 0.01000771950930357 },
          snapTo: "auto",
        },
      },
    }

    expect(buildConnectorPath(connector, nodesById)).toContain("226.65899658203125 62.900001525878906")
    expect(buildConnectorPath(connector, nodesById)).toContain("471.44898986816406 113.52099990844727")
    expect(buildConnectorPath(connector, nodesById)).not.toContain("63.37300109863281 6.763999938964844")
  })

  test("renders curved connectors as rounded polylines instead of reflected bezier chains", () => {
    const shape1 = createShapeNode({
      id: "shape_1",
      x: 100,
      y: 80,
      width: 140,
      height: 72,
    })
    const shape2 = createShapeNode({
      id: "shape_2",
      x: 320,
      y: 108,
      width: 120,
      height: 64,
    })
    const nodesById = new Map([
      [shape1.id, shape1],
      [shape2.id, shape2],
    ])

    expect(buildConnectorPath(createConnectorNode(), nodesById)).toBe(
      "M 240 116 L 240 118 Q 240 120 260 126 L 260 126 Q 280 132 300 136 L 320 140",
    )
  })

  test("falls back to a straight polyline when curve turning points are collinear", () => {
    const start = createShapeNode({
      id: "start",
      x: 40,
      y: 40,
      width: 80,
      height: 40,
    })
    const end = createShapeNode({
      id: "end",
      x: 220,
      y: 40,
      width: 80,
      height: 40,
    })
    const nodesById = new Map([
      [start.id, start],
      [end.id, end],
    ])
    const connector: FeishuDocBoardNodeSnapshot = {
      id: "connector_straight",
      kind: "connector",
      rawType: "connector",
      supported: true,
      bounds: {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      },
      zIndex: 2,
      style: {},
      routing: {
        shape: "curve",
        points: [
          { x: 140, y: 60 },
          { x: 180, y: 60 },
        ],
        startAttachment: {
          objectId: "start",
          position: { x: 1, y: 0.5 },
        },
        endAttachment: {
          objectId: "end",
          position: { x: 0, y: 0.5 },
        },
      },
    }

    expect(buildConnectorPath(connector, nodesById)).toBe(
      "M 120 60 L 140 60 L 180 60 L 220 60",
    )
  })

  test("uses absolute attachment coordinates when native board connectors do not reference object ids", () => {
    const connector: FeishuDocBoardNodeSnapshot = {
      id: "connector_absolute_attachment",
      kind: "connector",
      rawType: "connector",
      supported: true,
      bounds: {
        x: 60,
        y: 175.33599853515625,
        width: 356.3984375,
        height: 0,
      },
      zIndex: 2,
      style: {},
      routing: {
        shape: "straight",
        points: [],
        startAttachment: {
          position: { x: 60, y: 175.33599853515625 },
        },
        endAttachment: {
          position: { x: 416.3984375, y: 175.33599853515625 },
        },
      },
    }

    expect(buildConnectorPath(connector, new Map())).toBe(
      "M 60 175.33599853515625 L 416.3984375 175.33599853515625",
    )
  })

  test("offsets self-loop turning points when connector bounds collapse to a zero-sized origin", () => {
    const connector: FeishuDocBoardNodeSnapshot = {
      id: "connector_self_loop",
      kind: "connector",
      rawType: "connector",
      supported: true,
      bounds: {
        x: 416.3984375,
        y: 566.0960083007812,
        width: 0,
        height: 0,
      },
      zIndex: 2,
      style: {},
      routing: {
        shape: "polyline",
        points: [
          { x: 60, y: -20 },
          { x: 60, y: 40 },
        ],
        startAttachment: {
          position: { x: 416.3984375, y: 546.0960083007812 },
        },
        endAttachment: {
          position: { x: 416.3984375, y: 606.0960083007812 },
        },
      },
    }

    expect(buildConnectorPath(connector, new Map())).toBe(
      "M 416.3984375 546.0960083007812 L 476.3984375 546.0960083007812 L 476.3984375 606.0960083007812 L 416.3984375 606.0960083007812",
    )
  })

  test("supports folded note shapes and life lines for feishu sequence boards", async () => {
    const source = await nodeRendererSource()

    expect(source).toContain('function renderNoteShape(')
    expect(source).toContain('className="feishu-doc-board-node feishu-doc-board-node-note"')
    expect(source).toContain('className="feishu-doc-board-note-fold"')
    expect(source).toContain('props.node.rawType === "composite_shape" && props.node.shapeType === "note_shape"')
    expect(source).toContain('function renderLifeLine(')
    expect(source).toContain('className="feishu-doc-board-node feishu-doc-board-node-lifeline"')
    expect(source).toContain('className="feishu-doc-board-lifeline-spine"')
    expect(source).toContain('props.node.rawType === "life_line"')
  })
})
