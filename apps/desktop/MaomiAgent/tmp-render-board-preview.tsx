import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FeishuDocBoardPreview } from "./src/mainview/modules/feishu/components/feishu-doc-board-preview.tsx";

const snapshot = {
  token: "Q9sXwOj0ZhWSbmbwQ0dchGHZnId",
  blockType: "board",
  pulledAt: "2026-05-31T02:00:47.943Z",
  supportedNodeCount: 1,
  unsupportedNodeCount: 0,
  viewport: { minX: -24, minY: -24, width: 662.728515625, height: 389.2239990234375 },
  nodes: [{
    id: "o2:1",
    kind: "shape",
    rawType: "composite_shape",
    supported: true,
    bounds: { x: 8, y: 8, width: 606.728515625, height: 333.2239990234375 },
    zIndex: 0,
    shapeType: "round_rect",
    style: { border_color: "#4a6fa5", fill_color: "#f0f4ff" },
    text: { content: "AI Agent 系统", fontSize: 16, color: "#1f2329", horizontalAlign: "center", verticalAlign: "top" },
  }],
};

console.log(renderToStaticMarkup(React.createElement(FeishuDocBoardPreview, { title: 'AI Agent', snapshot })));
