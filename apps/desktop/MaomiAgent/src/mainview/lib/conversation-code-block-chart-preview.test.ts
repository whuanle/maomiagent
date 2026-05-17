import { describe, expect, test } from "bun:test";

import { parseConversationChartPreviewSource } from "./conversation-code-block-chart-preview";

describe("parseConversationChartPreviewSource", () => {
  test("parses yaml-like axis chart fences used in chat previews", () => {
    const result = parseConversationChartPreviewSource([
      "title: Execution Outcomes",
      "categories: Continue, Stop, Compact",
      "series:",
      "  - name: Decisions",
      "    type: bar",
      "    values: [6, 2, 1]",
    ].join("\n"));

    expect(result.error).toBeUndefined();
    expect(result.format).toBe("text");
    expect(result.model).toEqual({
      kind: "axis",
      parser: "generic",
      title: "Execution Outcomes",
      categories: ["Continue", "Stop", "Compact"],
      series: [{
        name: "Decisions",
        color: "#3158b7",
        values: [6, 2, 1],
        chartType: "bar",
      }],
    });
  });

  test("keeps json chart parsing intact", () => {
    const result = parseConversationChartPreviewSource(JSON.stringify({
      title: "Execution Outcomes",
      categories: ["Continue", "Stop", "Compact"],
      series: [{
        name: "Decisions",
        type: "bar",
        values: [6, 2, 1],
      }],
    }));

    expect(result.error).toBeUndefined();
    expect(result.format).toBe("json");
    expect(result.model?.kind).toBe("axis");
  });
});