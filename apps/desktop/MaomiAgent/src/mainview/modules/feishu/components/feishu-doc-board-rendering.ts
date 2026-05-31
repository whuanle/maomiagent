import type {
  FeishuDocBoardAttachmentSnapshot,
  FeishuDocBoardNodeSnapshot,
} from "../../../../shared/desktop-feishu"

const MAX_CONNECTOR_CURVE_RADIUS = 24

type BoardPoint = {
  x: number
  y: number
}

function resolveAttachmentPoint(
  attachment: FeishuDocBoardAttachmentSnapshot | undefined,
  nodesById: Map<string, FeishuDocBoardNodeSnapshot>,
): BoardPoint | null {
  const position = attachment?.position
  if (position && (!attachment.objectId || position.x < -0.01 || position.x > 1.01 || position.y < -0.01 || position.y > 1.01)) {
    return {
      x: position.x,
      y: position.y,
    }
  }

  if (!attachment?.objectId) {
    return position ? {
      x: position.x,
      y: position.y,
    } : null
  }
  const target = nodesById.get(attachment.objectId)
  if (!target) {
    return null
  }
  const ratioX = position?.x ?? 0.5
  const ratioY = position?.y ?? 0.5
  return {
    x: target.bounds.x + target.bounds.width * ratioX,
    y: target.bounds.y + target.bounds.height * ratioY,
  }
}

function normalizeConnectorPoints(points: BoardPoint[]) {
  return points.filter((point, index) => (
    index === 0
    || Math.abs(point.x - points[index - 1]!.x) > 0.01
    || Math.abs(point.y - points[index - 1]!.y) > 0.01
  ))
}

function measureDistance(start: BoardPoint, end: BoardPoint) {
  return Math.hypot(end.x - start.x, end.y - start.y)
}

function scoreConnectorPoints(
  points: BoardPoint[],
  startPoint: BoardPoint | null,
  endPoint: BoardPoint | null,
) {
  const chain = normalizeConnectorPoints([
    ...(startPoint ? [startPoint] : []),
    ...points,
    ...(endPoint ? [endPoint] : []),
  ])
  if (chain.length <= 1) {
    return Number.POSITIVE_INFINITY
  }

  let maxSegmentLength = 0
  let totalLength = 0
  for (let index = 1; index < chain.length; index += 1) {
    const segmentLength = measureDistance(chain[index - 1]!, chain[index]!)
    maxSegmentLength = Math.max(maxSegmentLength, segmentLength)
    totalLength += segmentLength
  }

  return maxSegmentLength * 10 + totalLength
}

function resolveRoutingPoints(
  node: FeishuDocBoardNodeSnapshot,
  startPoint: BoardPoint | null,
  endPoint: BoardPoint | null,
) {
  const points = node.routing?.points ?? []
  if (points.length === 0) {
    return points
  }

  const fitsConnectorBounds = points.every((point) => (
    point.x >= -0.01
    && point.y >= -0.01
    && point.x <= node.bounds.width + 0.01
    && point.y <= node.bounds.height + 0.01
  ))

  if (!fitsConnectorBounds) {
    const offsetPoints = points.map((point) => ({
      x: node.bounds.x + point.x,
      y: node.bounds.y + point.y,
    }))

    if (node.bounds.width <= 1 && node.bounds.height <= 1) {
      const rawScore = scoreConnectorPoints(points, startPoint, endPoint)
      const offsetScore = scoreConnectorPoints(offsetPoints, startPoint, endPoint)
      return offsetScore + 0.01 < rawScore ? offsetPoints : points
    }

    return points
  }

  return points.map((point) => ({
    x: node.bounds.x + point.x,
    y: node.bounds.y + point.y,
  }))
}

function buildRoundedConnectorPath(points: BoardPoint[]) {
  if (points.length === 0) {
    return ""
  }
  if (points.length === 1) {
    return `M ${points[0]!.x} ${points[0]!.y}`
  }
  if (points.length === 2) {
    return points.reduce((path, point, index) => (
      `${path}${index === 0 ? "M" : " L"} ${point.x} ${point.y}`
    ), "")
  }

  let path = `M ${points[0]!.x} ${points[0]!.y}`
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!
    const current = points[index]!
    const next = points[index + 1]!
    const incomingLength = measureDistance(previous, current)
    const outgoingLength = measureDistance(current, next)

    if (incomingLength <= 0.01 || outgoingLength <= 0.01) {
      path += ` L ${current.x} ${current.y}`
      continue
    }

    const incomingRadius = Math.min(MAX_CONNECTOR_CURVE_RADIUS, incomingLength / 2)
    const outgoingRadius = Math.min(MAX_CONNECTOR_CURVE_RADIUS, outgoingLength / 2)
    const entryPoint = {
      x: current.x - ((current.x - previous.x) / incomingLength) * incomingRadius,
      y: current.y - ((current.y - previous.y) / incomingLength) * incomingRadius,
    }
    const exitPoint = {
      x: current.x + ((next.x - current.x) / outgoingLength) * outgoingRadius,
      y: current.y + ((next.y - current.y) / outgoingLength) * outgoingRadius,
    }
    const crossProduct = (current.x - previous.x) * (next.y - current.y)
      - (current.y - previous.y) * (next.x - current.x)

    if (Math.abs(crossProduct) <= 0.01) {
      path += ` L ${current.x} ${current.y}`
      continue
    }

    path += ` L ${entryPoint.x} ${entryPoint.y}`
    path += ` Q ${current.x} ${current.y} ${exitPoint.x} ${exitPoint.y}`
  }

  const last = points[points.length - 1]!
  path += ` L ${last.x} ${last.y}`
  return path
}

export function buildConnectorPath(
  node: FeishuDocBoardNodeSnapshot,
  nodesById: Map<string, FeishuDocBoardNodeSnapshot>,
) {
  const startPoint = resolveAttachmentPoint(node.routing?.startAttachment, nodesById)
  const endPoint = resolveAttachmentPoint(node.routing?.endAttachment, nodesById)
  const middlePoints = resolveRoutingPoints(node, startPoint, endPoint)
  const points = normalizeConnectorPoints([
    ...(startPoint ? [startPoint] : []),
    ...middlePoints,
    ...(endPoint ? [endPoint] : []),
  ])
  if (points.length === 0) {
    return ""
  }

  if (node.routing?.shape === "curve") {
    return buildRoundedConnectorPath(points)
  }

  return points.reduce((path, point, index) => (
    `${path}${index === 0 ? "M" : " L"} ${point.x} ${point.y}`
  ), "")
}
