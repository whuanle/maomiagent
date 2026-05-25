import { describe, expect, test } from "bun:test"

import { parseFeishuDocsLocalPreview } from "./feishu-docs-local-preview-model"

describe("parseFeishuDocsLocalPreview", () => {
  test("parses image and callout tags as native preview blocks", () => {
    const nodes = parseFeishuDocsLocalPreview([
      "# 标题",
      "",
      '<image token="img_token" width="640" height="360" />',
      "",
      '<callout emoji="bulb" title="提示">',
      "这里是提示内容。",
      "</callout>",
    ].join("\n"))

    expect(nodes).toEqual([
      expect.objectContaining({ kind: "markdown", markdown: "# 标题" }),
      expect.objectContaining({
        kind: "native_block",
        name: "image",
        attributes: expect.objectContaining({ token: "img_token", width: "640", height: "360" }),
      }),
      expect.objectContaining({
        kind: "native_block",
        name: "callout",
        attributes: expect.objectContaining({ emoji: "bulb", title: "提示" }),
        children: [expect.objectContaining({ kind: "markdown", markdown: "这里是提示内容。" })],
      }),
    ])
  })

  test("normalizes codec-style Feishu component tags to native preview blocks", () => {
    const nodes = parseFeishuDocsLocalPreview([
      '<FeishuImage token="img_token" width="640" height="360" />',
      "",
      '<FeishuCallout emoji="bulb" title="提示">',
      "这里是提示内容。",
      "</FeishuCallout>",
      "",
      '<FeishuFile token="file_token" name="说明.pdf" />',
    ].join("\n"))

    expect(nodes).toEqual([
      expect.objectContaining({
        kind: "native_block",
        name: "image",
        attributes: expect.objectContaining({ token: "img_token", width: "640", height: "360" }),
      }),
      expect.objectContaining({
        kind: "native_block",
        name: "callout",
        attributes: expect.objectContaining({ emoji: "bulb", title: "提示" }),
        children: [expect.objectContaining({ kind: "markdown", markdown: "这里是提示内容。" })],
      }),
      expect.objectContaining({
        kind: "native_block",
        name: "file",
        attributes: expect.objectContaining({ token: "file_token", name: "说明.pdf" }),
      }),
    ])
  })
})
