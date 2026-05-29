import { describe, expect, test } from "bun:test";

import {
  looksLikeFeishuDocsMermaidSource,
  shouldRenderFeishuDocsMermaidBlock,
} from "./feishu-docs-mermaid";

describe("feishu docs mermaid helpers", () => {
  test("recognizes bare mermaid flowchart sources", () => {
    expect(looksLikeFeishuDocsMermaidSource("flowchart TD\nA-->B")).toBe(true);
    expect(looksLikeFeishuDocsMermaidSource("graph LR\nA-->B")).toBe(true);
    expect(looksLikeFeishuDocsMermaidSource("# Heading\n\ncontent")).toBe(false);
  });

  test("treats unlabeled diagram code blocks as mermaid when the source matches", () => {
    expect(shouldRenderFeishuDocsMermaidBlock({
      source: "flowchart TD\nA-->B",
    })).toBe(true);
    expect(shouldRenderFeishuDocsMermaidBlock({
      language: "mermaid",
      source: "A-->B",
    })).toBe(true);
    expect(shouldRenderFeishuDocsMermaidBlock({
      language: "text",
      source: "plain code",
    })).toBe(false);
  });
});
