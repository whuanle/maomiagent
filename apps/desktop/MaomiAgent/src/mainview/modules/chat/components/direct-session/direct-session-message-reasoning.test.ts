import { describe, expect, test } from "bun:test";

import {
  buildReasoningPreviewText,
  resolveReasoningPresentation,
  shouldInlineReasoningBody,
  splitReasoningHeading,
} from "./direct-session-message-reasoning";

describe("splitReasoningHeading", () => {
  test("promotes a leading markdown heading into the reasoning title", () => {
    expect(splitReasoningHeading(
      "## Inspect codebase\nCheck kernel projector and runtime merge.",
      "en-US",
    )).toEqual({
      title: "Inspect codebase",
      body: "Check kernel projector and runtime merge.",
    });
  });

  test("falls back to the localized default title when no heading exists", () => {
    expect(splitReasoningHeading("检查运行时事件时序", "zh-CN")).toEqual({
      title: "思考",
      body: "检查运行时事件时序",
    });
  });

  test("builds a two-line reasoning preview instead of only the first line", () => {
    expect(buildReasoningPreviewText("Inspect current state\nCheck whether approval is required\nQueue the next action")).toBe(
      "Inspect current state · Check whether approval is required",
    );
  });

  test("inlines short or live reasoning bodies", () => {
    expect(shouldInlineReasoningBody({
      body: "Check current edits before patching files.",
      live: false,
    })).toBe(true);
    expect(shouldInlineReasoningBody({
      body: "Collect logs\nCompare outputs\nPrepare patch",
      live: true,
    })).toBe(true);
  });

  test("keeps long historical reasoning collapsible", () => {
    expect(shouldInlineReasoningBody({
      body: [
        "Inspect the workspace state and enumerate pending files.",
        "Check the terminal history to confirm whether previous commands already installed dependencies.",
        "Review the diff to determine whether a patch can be applied safely without conflicting with user changes.",
      ].join("\n"),
      live: false,
    })).toBe(false);
  });

  test("keeps full-detail live reasoning expanded", () => {
    expect(resolveReasoningPresentation({
      thinkingDetailLevel: "full",
      body: "Collect runtime evidence",
      live: true,
    })).toEqual({
      renderBody: true,
      collapsible: false,
      showLiveBadge: true,
      hideDuringStreaming: false,
    });
  });

  test("hides compact reasoning body while streaming", () => {
    expect(resolveReasoningPresentation({
      thinkingDetailLevel: "compact",
      body: "Collect runtime evidence\nCheck tool calls",
      live: true,
    })).toEqual({
      renderBody: false,
      collapsible: false,
      showLiveBadge: false,
      hideDuringStreaming: true,
    });
  });

  test("keeps minimal reasoning hidden while streaming and collapsible after completion", () => {
    expect(resolveReasoningPresentation({
      thinkingDetailLevel: "minimal",
      body: "Short final reasoning summary",
      live: false,
    })).toEqual({
      renderBody: false,
      collapsible: true,
      showLiveBadge: false,
      hideDuringStreaming: false,
    });
  });
});
