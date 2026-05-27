import { describe, expect, test } from "bun:test"

import {
  createFeishuDocPreviewIR,
  extractFeishuMediaTokens,
  extractFeishuWhiteboardTokens,
} from "./feishu-doc-preview-support"

describe("feishu doc preview support", () => {
  test("extracts media and visual preview tokens outside fenced code", () => {
    const markdown = [
      '<image token="img_1" />',
      '<whiteboard token="wb_1" />',
      '<FeishuBoard token="board_1" />',
      '<diagram token="diagram_1" />',
      '<mindnote mindnote-token="mind_1" />',
      "",
      "```md",
      '<image token="ignored_img" />',
      '<whiteboard token="ignored_wb" />',
      '<diagram token="ignored_diagram" />',
      "```",
    ].join("\n")

    expect(extractFeishuMediaTokens(markdown)).toEqual(["img_1"])
    expect(extractFeishuWhiteboardTokens(markdown)).toEqual(["wb_1", "board_1", "diagram_1", "mind_1"])
  })

  test("creates a minimal readonly preview IR", () => {
    expect(createFeishuDocPreviewIR({
      docId: "doc-token",
      title: "飞书原文",
      markdown: "# hello",
    })).toEqual(expect.objectContaining({
      schemaVersion: 1,
      document: expect.objectContaining({
        id: "doc-token",
        title: "飞书原文",
        revisionId: "local-preview",
      }),
      integrity: expect.objectContaining({
        rawHash: "preview:doc-token",
      }),
    }))
  })
})
