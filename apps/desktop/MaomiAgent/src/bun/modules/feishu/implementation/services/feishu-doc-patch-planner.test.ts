import { describe, expect, test } from "bun:test";

import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import { planFeishuDocPatch } from "./feishu-doc-patch-planner";

function baseIR(): FeishuDocIR {
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
      docx_1: { id: "docx_1", type: "page", parentId: null, children: ["p1"], editable: false, text: [], resource: null, attrs: {}, raw: {} },
      p1: { id: "p1", type: "text", parentId: "docx_1", children: [], editable: true, text: [{ kind: "text", text: "Old", attrs: {}, raw: {} }], resource: null, attrs: {}, raw: {} },
    },
    assets: {},
    integrity: { contentHash: "sha256:old", rawHash: "sha256:raw" },
  };
}

describe("planFeishuDocPatch", () => {
  test("plans editable text updates", () => {
    const current = baseIR();
    current.blocks.p1.text = [{ kind: "text", text: "New", attrs: {}, raw: {} }];

    expect(planFeishuDocPatch(baseIR(), current).operations).toEqual([{ kind: "update_text", blockId: "p1", text: "New" }]);
  });

  test("blocks unsupported raw changes", () => {
    const base = baseIR();
    base.blocks.x = { id: "x", type: "bitable", parentId: "docx_1", children: [], editable: false, text: [], resource: null, attrs: {}, raw: { token: "a" } };
    const current = structuredClone(base);
    current.blocks.x.raw = { token: "b" };

    expect(planFeishuDocPatch(base, current).operations[0]).toMatchObject({ kind: "blocked_change", blockId: "x" });
  });

  test("blocks rich text style changes that cannot be expressed as plain text", () => {
    const base = baseIR();
    const current = baseIR();
    current.blocks.p1.text = [{ kind: "text", text: "Old", attrs: { bold: true }, raw: {} }];

    expect(planFeishuDocPatch(base, current).operations).toEqual([
      { kind: "blocked_change", blockId: "p1", reason: "rich text run attributes changed" },
    ]);
  });

  test("plans asset token updates", () => {
    const base = baseIR();
    base.blocks.img = { id: "img", type: "image", parentId: "docx_1", children: [], editable: true, text: [], resource: { token: "old", kind: "image" }, attrs: {}, raw: {} };
    base.blocks.docx_1.children.push("img");
    const current = structuredClone(base);
    current.blocks.img.resource = { token: "new", kind: "image" };

    expect(planFeishuDocPatch(base, current).operations).toEqual([
      { kind: "update_asset_block", blockId: "img", token: "new" },
    ]);
  });
});