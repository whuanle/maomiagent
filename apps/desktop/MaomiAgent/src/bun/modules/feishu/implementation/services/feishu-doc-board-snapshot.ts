import type {
  FeishuDocBoardAttachmentSnapshot,
  FeishuDocBoardBlockType,
  FeishuDocBoardNodeSnapshot,
  FeishuDocBoardRoutingSnapshot,
  FeishuDocBoardSnapshot,
  FeishuDocBoardTextSnapshot,
} from "../../../../../shared/desktop-feishu";

const DEFAULT_BOARD_WIDTH = 320;
const DEFAULT_BOARD_HEIGHT = 180;
const BOARD_VIEWPORT_PADDING = 24;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBounds(node: Record<string, unknown>) {
  return {
    x: readNumber(node.x),
    y: readNumber(node.y),
    width: Math.max(0, readNumber(node.width)),
    height: Math.max(0, readNumber(node.height)),
  };
}

function normalizeAttachment(value: unknown): FeishuDocBoardAttachmentSnapshot | undefined {
  const record = isRecord(value) ? value : null;
  if (!record) {
    return undefined;
  }

  const attached = isRecord(record.attached_object) ? record.attached_object : record;
  const position = isRecord(attached.position)
    ? {
        x: readNumber(attached.position.x),
        y: readNumber(attached.position.y),
      }
    : undefined;
  const objectId = readString(attached.id);
  const snapTo = readString(attached.snap_to);
  if (!objectId && !position && !snapTo) {
    return undefined;
  }

  return {
    ...(objectId ? { objectId } : {}),
    ...(position ? { position } : {}),
    ...(snapTo ? { snapTo } : {}),
  };
}

function normalizeRouting(node: Record<string, unknown>): FeishuDocBoardRoutingSnapshot | undefined {
  const connector = isRecord(node.connector) ? node.connector : null;
  if (!connector) {
    return undefined;
  }

  const points = Array.isArray(connector.turning_points)
    ? connector.turning_points
      .filter(isRecord)
      .map((point) => ({
        x: readNumber(point.x),
        y: readNumber(point.y),
      }))
    : [];
  const shape = readString(connector.shape);
  const startArrow = readString(isRecord(connector.start) ? connector.start.arrow_style : undefined);
  const endArrow = readString(isRecord(connector.end) ? connector.end.arrow_style : undefined);
  const startAttachment = normalizeAttachment(connector.start ?? connector.start_object);
  const endAttachment = normalizeAttachment(connector.end ?? connector.end_object);

  return {
    ...(shape ? { shape } : {}),
    points,
    ...(startArrow ? { startArrow } : {}),
    ...(endArrow ? { endArrow } : {}),
    ...(startAttachment ? { startAttachment } : {}),
    ...(endAttachment ? { endAttachment } : {}),
  };
}

function normalizeText(node: Record<string, unknown>): FeishuDocBoardTextSnapshot | undefined {
  const text = isRecord(node.text) ? node.text : null;
  if (!text) {
    return undefined;
  }

  const content = readString(text.text);
  if (!content) {
    return undefined;
  }

  const fontSize = readNumber(text.font_size);
  const fontWeight = readString(text.font_weight);
  const color = readString(text.text_color);
  const horizontalAlign = readString(text.horizontal_align);
  const verticalAlign = readString(text.vertical_align);

  return {
    content,
    ...(fontSize > 0 ? { fontSize } : {}),
    ...(fontWeight ? { fontWeight } : {}),
    ...(color ? { color } : {}),
    ...(horizontalAlign ? { horizontalAlign } : {}),
    ...(verticalAlign ? { verticalAlign } : {}),
  };
}

function normalizeCompositeShapeNode(node: Record<string, unknown>): FeishuDocBoardNodeSnapshot {
  const compositeShape = isRecord(node.composite_shape) ? node.composite_shape : {};
  const shapeType = readString(compositeShape.type);
  const supportedShapeTypes = new Set([
    "round_rect",
    "rect",
    "diamond",
    "ellipse",
    "circle",
  ]);
  const supported = supportedShapeTypes.has(shapeType);

  return {
    id: readString(node.id) || "shape",
    kind: supported ? "shape" : "unsupported",
    rawType: "composite_shape",
    supported,
    bounds: normalizeBounds(node),
    zIndex: readNumber(node.z_index),
    ...(readNumber(node.angle) ? { angle: readNumber(node.angle) } : {}),
    ...(shapeType ? { shapeType } : {}),
    style: isRecord(node.style) ? node.style : {},
    ...(normalizeText(node) ? { text: normalizeText(node) } : {}),
    ...(!supported ? { unsupportedReason: shapeType ? `unsupported shape: ${shapeType}` : "unsupported shape" } : {}),
  };
}

function normalizeConnectorNode(node: Record<string, unknown>): FeishuDocBoardNodeSnapshot {
  return {
    id: readString(node.id) || "connector",
    kind: "connector",
    rawType: "connector",
    supported: true,
    bounds: normalizeBounds(node),
    zIndex: readNumber(node.z_index),
    ...(readNumber(node.angle) ? { angle: readNumber(node.angle) } : {}),
    style: isRecord(node.style) ? node.style : {},
    ...(normalizeRouting(node) ? { routing: normalizeRouting(node) } : {}),
    ...(normalizeText(node) ? { text: normalizeText(node) } : {}),
  };
}

function normalizeTextNode(node: Record<string, unknown>): FeishuDocBoardNodeSnapshot {
  const text = normalizeText(node);
  return {
    id: readString(node.id) || "text",
    kind: text ? "text" : "unsupported",
    rawType: "text",
    supported: Boolean(text),
    bounds: normalizeBounds(node),
    zIndex: readNumber(node.z_index),
    ...(readNumber(node.angle) ? { angle: readNumber(node.angle) } : {}),
    style: isRecord(node.style) ? node.style : {},
    ...(text ? { text } : {}),
    ...(!text ? { unsupportedReason: "empty text node" } : {}),
  };
}

function normalizeUnsupportedNode(node: Record<string, unknown>, rawType: string): FeishuDocBoardNodeSnapshot {
  return {
    id: readString(node.id) || rawType || "unsupported",
    kind: "unsupported",
    rawType: rawType || "unknown",
    supported: false,
    bounds: normalizeBounds(node),
    zIndex: readNumber(node.z_index),
    ...(readNumber(node.angle) ? { angle: readNumber(node.angle) } : {}),
    style: isRecord(node.style) ? node.style : {},
    ...(normalizeText(node) ? { text: normalizeText(node) } : {}),
    unsupportedReason: rawType ? `unsupported node: ${rawType}` : "unsupported node",
  };
}

export function normalizeFeishuDocBoardNode(node: unknown): FeishuDocBoardNodeSnapshot {
  const record = isRecord(node) ? node : {};
  const rawType = readString(record.type);

  if (rawType === "composite_shape") {
    return normalizeCompositeShapeNode(record);
  }
  if (rawType === "connector") {
    return normalizeConnectorNode(record);
  }
  if (rawType === "text") {
    return normalizeTextNode(record);
  }

  return normalizeUnsupportedNode(record, rawType);
}

function pushViewportPoint(points: Array<{ x: number; y: number }>, x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }
  points.push({ x, y });
}

function collectNodeViewportPoints(node: FeishuDocBoardNodeSnapshot): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  pushViewportPoint(points, node.bounds.x, node.bounds.y);
  pushViewportPoint(points, node.bounds.x + node.bounds.width, node.bounds.y + node.bounds.height);

  for (const point of node.routing?.points ?? []) {
    pushViewportPoint(points, point.x, point.y);
  }

  return points;
}

function computeViewport(nodes: FeishuDocBoardNodeSnapshot[]) {
  const points = nodes.flatMap(collectNodeViewportPoints);
  if (points.length === 0) {
    return {
      width: DEFAULT_BOARD_WIDTH,
      height: DEFAULT_BOARD_HEIGHT,
      minX: 0,
      minY: 0,
    };
  }

  const minX = Math.min(...points.map((point) => point.x)) - BOARD_VIEWPORT_PADDING;
  const minY = Math.min(...points.map((point) => point.y)) - BOARD_VIEWPORT_PADDING;
  const maxX = Math.max(...points.map((point) => point.x)) + BOARD_VIEWPORT_PADDING;
  const maxY = Math.max(...points.map((point) => point.y)) + BOARD_VIEWPORT_PADDING;

  return {
    minX,
    minY,
    width: Math.max(DEFAULT_BOARD_WIDTH, maxX - minX),
    height: Math.max(DEFAULT_BOARD_HEIGHT, maxY - minY),
  };
}

export function normalizeFeishuDocBoardBlockType(value: string): FeishuDocBoardBlockType {
  return value === "board" || value === "diagram" || value === "mindnote" ? value : "whiteboard";
}

export function normalizeFeishuDocBoardSnapshot(input: {
  whiteboardToken: string;
  blockType: FeishuDocBoardBlockType;
  rawNodes: unknown[];
  pulledAt: string;
  loadError?: string;
}): FeishuDocBoardSnapshot {
  const nodes = input.rawNodes.map(normalizeFeishuDocBoardNode);
  const supportedNodeCount = nodes.filter((node) => node.supported).length;
  const unsupportedNodeCount = nodes.length - supportedNodeCount;

  return {
    token: input.whiteboardToken,
    blockType: input.blockType,
    nodes,
    viewport: computeViewport(nodes),
    supportedNodeCount,
    unsupportedNodeCount,
    pulledAt: input.pulledAt,
    ...(readString(input.loadError) ? { loadError: readString(input.loadError) } : {}),
  };
}

export function createFeishuDocBoardErrorSnapshot(input: {
  whiteboardToken: string;
  blockType: FeishuDocBoardBlockType;
  pulledAt: string;
  loadError: string;
}): FeishuDocBoardSnapshot {
  return normalizeFeishuDocBoardSnapshot({
    whiteboardToken: input.whiteboardToken,
    blockType: input.blockType,
    pulledAt: input.pulledAt,
    loadError: input.loadError,
    rawNodes: [{
      id: `unsupported:${input.whiteboardToken}`,
      type: "unavailable",
      x: 0,
      y: 0,
      width: DEFAULT_BOARD_WIDTH,
      height: DEFAULT_BOARD_HEIGHT,
      text: {
        text: input.loadError,
        horizontal_align: "center",
        vertical_align: "mid",
      },
      style: {},
    }],
  });
}
