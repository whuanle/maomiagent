import { describe, expect, test } from "bun:test";

import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import { buildFeishuDocCurrentIR } from "./feishu-doc-working-copy-compiler";

function sampleIRWithImageAndUnknown(): FeishuDocIR {
  return {
    schemaVersion: 1,
    document: {
      id: "docx_1",
      title: "Demo",
      revisionId: "1",
      rootBlockId: "docx_1",
      pulledAt: "2026-05-23T00:00:00.000Z",
      source: { documentIdType: "document_id" },
    },
    blocks: {
      docx_1: { id: "docx_1", type: "page", parentId: null, children: ["h1", "p1", "img1", "u1"], editable: false, text: [], resource: null, attrs: {}, raw: {} },
      h1: { id: "h1", type: "heading1", parentId: "docx_1", children: [], editable: true, text: [{ kind: "text", text: "Title", attrs: {}, raw: {} }], resource: null, attrs: {}, raw: {} },
      p1: { id: "p1", type: "text", parentId: "docx_1", children: [], editable: true, text: [{ kind: "text", text: "Paragraph body", attrs: {}, raw: {} }], resource: null, attrs: {}, raw: {} },
      img1: { id: "img1", type: "image", parentId: "docx_1", children: [], editable: true, text: [], resource: { token: "img_token", kind: "image" }, attrs: { width: 640 }, raw: {} },
      u1: { id: "u1", type: "undefined", parentId: "docx_1", children: [], editable: false, text: [], resource: null, attrs: {}, raw: { block_id: "u1" } },
    },
    assets: {
      img_token: { token: "img_token", kind: "image", mime: "image/png", cacheKey: "sha256:x", status: "missing", localPath: "", checksum: "" },
    },
    integrity: { contentHash: "sha256:content", rawHash: "sha256:raw" },
  };
}

describe("buildFeishuDocCurrentIR", () => {
  test("applies anchored text edits while preserving unsupported blocks", () => {
    const result = buildFeishuDocCurrentIR({
      base: sampleIRWithImageAndUnknown(),
      draft: [
        "<!--feishu:block:h1-->",
        "# New Title",
        "<!--/feishu:block:h1-->",
        "",
        "<!--feishu:block:p1-->",
        "New paragraph",
        "<!--/feishu:block:p1-->",
        "",
        '<FeishuImage token="img_token" width="640" />',
        '<FeishuUndefined blockId="u1" />',
      ].join("\n"),
    });

    expect(result.current.blocks.h1?.text[0]?.text).toBe("New Title");
    expect(result.current.blocks.p1?.text[0]?.text).toBe("New paragraph");
    expect(result.current.blocks.u1?.type).toBe("undefined");
    expect(result.blockedChanges).toEqual([]);
    expect(result.preservedUnknownBlocks).toEqual(["u1"]);
  });

  test("blocks a draft that drops an anchored unknown block", () => {
    const result = buildFeishuDocCurrentIR({
      base: sampleIRWithImageAndUnknown(),
      draft: [
        "<!--feishu:block:h1-->",
        "# New Title",
        "<!--/feishu:block:h1-->",
        "",
        "<!--feishu:block:p1-->",
        "New paragraph",
        "<!--/feishu:block:p1-->",
      ].join("\n"),
    });

    expect(result.blockedChanges).toEqual([
      { blockId: "u1", reason: "unsupported or unknown block removed from draft" },
    ]);
  });
});