import { describe, expect, test } from "bun:test"

import {
  resolveFeishuDocsPreviewBlockName,
  splitFeishuDocsEmbeddedNativeBlocks,
} from "./feishu-docs-embedded-native-blocks"

describe("splitFeishuDocsEmbeddedNativeBlocks", () => {
  test("splits standalone undefined block lines out of mixed markdown", () => {
    const segments = splitFeishuDocsEmbeddedNativeBlocks([
      "自我反思：能够评估自己的输出质量，并进行迭代修正",
      '<undefined blockId="doxcn0QsFdHNX4SwZvpEu7dnKje" />',
    ].join("\n"))

    expect(segments).toEqual([
      {
        kind: "markdown",
        text: "自我反思：能够评估自己的输出质量，并进行迭代修正",
      },
      {
        kind: "native_block",
        name: "undefined",
        attributes: {
          blockId: "doxcn0QsFdHNX4SwZvpEu7dnKje",
        },
      },
    ])
  })

  test("keeps plain markdown unchanged when no undefined block exists", () => {
    expect(splitFeishuDocsEmbeddedNativeBlocks("普通段落\n继续内容")).toEqual([
      {
        kind: "markdown",
        text: "普通段落\n继续内容",
      },
    ])
  })

  test("treats minimal undefined blocks as divider previews", () => {
    expect(resolveFeishuDocsPreviewBlockName({
      name: "undefined",
      attributes: { blockId: "doxcn0QsFdHNX4SwZvpEu7dnKje" },
      hasChildren: false,
    })).toBe("divider")

    expect(resolveFeishuDocsPreviewBlockName({
      name: "undefined",
      attributes: { blockId: "doxcn0QsFdHNX4SwZvpEu7dnKje", title: "unknown" },
      hasChildren: false,
    })).toBe("undefined")
  })
})