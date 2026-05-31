import { describe, expect, test } from "bun:test";

import {
  createFeishuDocBoardErrorSnapshot,
  normalizeFeishuDocBoardSnapshot,
} from "./feishu-doc-board-snapshot";

describe("feishu-doc-board-snapshot", () => {
  test("normalizes composite shapes and connectors into renderer-safe snapshots", () => {
    const snapshot = normalizeFeishuDocBoardSnapshot({
      whiteboardToken: "wb_1",
      blockType: "board",
      pulledAt: "2026-05-30T00:00:00.000Z",
      rawNodes: [
        {
          id: "shape_1",
          type: "composite_shape",
          x: 100,
          y: 80,
          width: 140,
          height: 72,
          z_index: 3,
          composite_shape: {
            type: "round_rect",
          },
          style: {
            fill_color: "#ffffff",
            border_color: "#111111",
          },
          text: {
            text: "Hello\nBoard",
            font_size: 14,
            horizontal_align: "center",
            vertical_align: "mid",
          },
        },
        {
          id: "connector_1",
          type: "connector",
          x: 140,
          y: 120,
          width: 180,
          height: 32,
          z_index: 4,
          connector: {
            shape: "curve",
            start: {
              arrow_style: "triangle_arrow",
              attached_object: {
                id: "shape_1",
                position: { x: 1, y: 0.5 },
                snap_to: "right",
              },
            },
            end: {
              arrow_style: "triangle_arrow",
              attached_object: {
                id: "shape_2",
                position: { x: 0, y: 0.5 },
                snap_to: "left",
              },
            },
            turning_points: [
              { x: 240, y: 120 },
              { x: 280, y: 132 },
            ],
          },
          style: {
            border_color: "#444444",
          },
        },
        {
          id: "shape_2",
          type: "composite_shape",
          x: 320,
          y: 108,
          width: 120,
          height: 64,
          z_index: 5,
          composite_shape: {
            type: "diamond",
          },
          style: {},
          text: {
            text: "Decision",
          },
        },
      ],
    });

    expect(snapshot.supportedNodeCount).toBe(3);
    expect(snapshot.unsupportedNodeCount).toBe(0);
    expect(snapshot.viewport.width).toBeGreaterThan(320);
    expect(snapshot.nodes).toEqual([
      expect.objectContaining({
        id: "shape_1",
        kind: "shape",
        rawType: "composite_shape",
        supported: true,
        shapeType: "round_rect",
        text: expect.objectContaining({
          content: "Hello\nBoard",
        }),
      }),
      expect.objectContaining({
        id: "connector_1",
        kind: "connector",
        routing: expect.objectContaining({
          shape: "curve",
          startArrow: "triangle_arrow",
          endArrow: "triangle_arrow",
          points: [
            { x: 240, y: 120 },
            { x: 280, y: 132 },
          ],
        }),
      }),
      expect.objectContaining({
        id: "shape_2",
        kind: "shape",
        shapeType: "diamond",
      }),
    ]);
  });

  test("keeps unsupported nodes as local placeholders instead of dropping them", () => {
    const snapshot = normalizeFeishuDocBoardSnapshot({
      whiteboardToken: "wb_2",
      blockType: "whiteboard",
      pulledAt: "2026-05-30T00:00:00.000Z",
      rawNodes: [{
        id: "sticker_1",
        type: "sticker",
        x: 12,
        y: 18,
        width: 180,
        height: 96,
      }],
    });

    expect(snapshot.supportedNodeCount).toBe(0);
    expect(snapshot.unsupportedNodeCount).toBe(1);
    expect(snapshot.nodes[0]).toEqual(expect.objectContaining({
      id: "sticker_1",
      kind: "unsupported",
      supported: false,
      rawType: "sticker",
      unsupportedReason: "unsupported node: sticker",
    }));
  });

  test("creates a local error snapshot when raw board fetch fails", () => {
    const snapshot = createFeishuDocBoardErrorSnapshot({
      whiteboardToken: "wb_3",
      blockType: "diagram",
      pulledAt: "2026-05-30T00:00:00.000Z",
      loadError: "board raw nodes unavailable",
    });

    expect(snapshot.loadError).toBe("board raw nodes unavailable");
    expect(snapshot.nodes[0]).toEqual(expect.objectContaining({
      kind: "unsupported",
      rawType: "unavailable",
      supported: false,
    }));
    expect(snapshot.viewport.width).toBeGreaterThan(0);
    expect(snapshot.viewport.height).toBeGreaterThan(0);
  });
});
