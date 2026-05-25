import { describe, expect, test } from "bun:test";

import { normalizeFeishuDocBlocksToIR } from "./feishu-doc-ir-normalizer";

describe("normalizeFeishuDocBlocksToIR", () => {
  test("normalizes text heading image and unknown raw blocks", () => {
    const ir = normalizeFeishuDocBlocksToIR({
      documentId: "docx_1",
      title: "Demo",
      revisionId: "7",
      pulledAt: "2026-05-23T00:00:00.000Z",
      documentIdType: "document_id",
      blocks: [
        { block_id: "docx_1", block_type: 1, children: ["h1", "img", "custom"] },
        { block_id: "h1", parent_id: "docx_1", block_type: 3, heading1: { elements: [{ text_run: { content: "Title" } }] } },
        { block_id: "img", parent_id: "docx_1", block_type: 27, image: { token: "img_token", width: 640, height: 360 } },
        { block_id: "custom", parent_id: "docx_1", block_type: 999, custom_payload: { value: true } },
      ],
    });

    expect(ir.document.rootBlockId).toBe("docx_1");
    expect(ir.blocks.h1.type).toBe("heading1");
    expect(ir.blocks.h1.text[0].text).toBe("Title");
    expect(ir.blocks.img.resource).toEqual({ token: "img_token", kind: "image" });
    expect(ir.assets.img_token.kind).toBe("image");
    expect(ir.assets.img_token.width).toBe(640);
    expect(ir.blocks.custom.type).toBe("undefined");
    expect(ir.blocks.custom.raw).toMatchObject({ custom_payload: { value: true } });
  });
});