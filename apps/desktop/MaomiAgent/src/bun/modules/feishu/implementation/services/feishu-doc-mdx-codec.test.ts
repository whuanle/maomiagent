import { describe, expect, test } from "bun:test";

import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import { feishuDocIRToMdx, feishuDocMdxToIRPatch } from "./feishu-doc-mdx-codec";

function ir(): FeishuDocIR {
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
      docx_1: { id: "docx_1", type: "page", parentId: null, children: ["h1", "img"], editable: false, text: [], resource: null, attrs: {}, raw: {} },
      h1: { id: "h1", type: "heading1", parentId: "docx_1", children: [], editable: true, text: [{ kind: "text", text: "Title", attrs: {}, raw: {} }], resource: null, attrs: {}, raw: {} },
      img: { id: "img", type: "image", parentId: "docx_1", children: [], editable: true, text: [], resource: { token: "img_token", kind: "image" }, attrs: { width: 640, height: 360 }, raw: {} },
    },
    assets: {
      img_token: { token: "img_token", kind: "image", mime: "image/png", cacheKey: "sha256:x", status: "missing", localPath: "", checksum: "" },
    },
    integrity: { contentHash: "sha256:content", rawHash: "sha256:raw" },
  };
}

describe("feishu-doc-mdx-codec", () => {
  test("serializes IR to stable MDX", () => {
    expect(feishuDocIRToMdx(ir())).toContain("# Title");
    expect(feishuDocIRToMdx(ir())).toContain('<FeishuImage token="img_token" width="640" height="360" />');
  });

  test("parses simple heading text change as IR patch", () => {
    const patch = feishuDocMdxToIRPatch(ir(), "# New Title\n");
    expect(patch.blockUpdates).toEqual([{ blockId: "h1", text: "New Title" }]);
  });
});