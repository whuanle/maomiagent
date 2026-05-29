import { describe, expect, test } from "bun:test";

import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import { assessFeishuDocPush } from "./feishu-doc-push-assessor";

function createDocIR(): FeishuDocIR {
  return {
    schemaVersion: 1,
    document: {
      id: "doc_1",
      title: "Demo",
      revisionId: "1",
      rootBlockId: "doc_1",
      pulledAt: "2026-05-27T00:00:00.000Z",
      source: { documentIdType: "document_id" },
    },
    blocks: {
      doc_1: { id: "doc_1", type: "page", parentId: null, children: ["h1", "u1"], editable: false, text: [], resource: null, attrs: {}, raw: {} },
      h1: { id: "h1", type: "heading1", parentId: "doc_1", children: [], editable: true, text: [{ kind: "text", text: "Title", attrs: {}, raw: {} }], resource: null, attrs: {}, raw: {} },
      u1: { id: "u1", type: "undefined", parentId: "doc_1", children: [], editable: false, text: [], resource: null, attrs: {}, raw: {} },
    },
    assets: {},
    integrity: { contentHash: "sha256:content", rawHash: "sha256:raw" },
  };
}

describe("assessFeishuDocPush", () => {
  test("returns ready when raw baseline, base IR, and current IR are aligned", () => {
    const base = createDocIR();
    const current = structuredClone(base);
    current.blocks.h1!.text = [{ kind: "text", text: "New Title", attrs: {}, raw: {} }];

    const assessment = assessFeishuDocPush({
      hasRawSourceBaseline: true,
      base,
      current,
      blockedChanges: [],
      sourceRevisionId: "1",
      baseRevisionId: "1",
    });

    expect(assessment.status).toBe("ready");
    expect(assessment.publishModeRecommendation).toBe("update_existing");
    expect(assessment.unknownBlockCount).toBe(1);
    expect(assessment.plan?.operations).toEqual([{ kind: "update_text", blockId: "h1", text: "New Title" }]);
  });

  test("requires a pull when the source baseline is missing or stale", () => {
    const base = createDocIR();

    expect(assessFeishuDocPush({
      hasRawSourceBaseline: false,
      base,
      current: base,
      blockedChanges: [],
      sourceRevisionId: "1",
      baseRevisionId: "1",
    }).publishModeRecommendation).toBe("pull_required");

    const conflict = assessFeishuDocPush({
      hasRawSourceBaseline: true,
      base,
      current: base,
      blockedChanges: [],
      sourceRevisionId: "2",
      baseRevisionId: "1",
    });

    expect(conflict.status).toBe("pull_required");
    expect(conflict.hasRevisionConflict).toBe(true);
  });

  test("keeps direct push semantics and blocks when compiler changes are unsafe", () => {
    const assessment = assessFeishuDocPush({
      hasRawSourceBaseline: true,
      base: createDocIR(),
      current: createDocIR(),
      blockedChanges: [{ blockId: "u1", reason: "unsupported or unknown block removed from draft" }],
      sourceRevisionId: "1",
      baseRevisionId: "1",
    });

    expect(assessment.status).toBe("blocked");
    expect(assessment.publishModeRecommendation).toBe("update_existing");
    expect(assessment.hasBlockedChanges).toBe(true);
  });

  test("blocks unsupported structural patch operations before remote push", () => {
    const base = createDocIR();
    const current = structuredClone(base);
    current.blocks.h2 = {
      id: "h2",
      type: "heading2",
      parentId: "doc_1",
      children: [],
      editable: true,
      text: [{ kind: "text", text: "Another heading", attrs: {}, raw: {} }],
      resource: null,
      attrs: {},
      raw: {},
    };
    current.blocks.doc_1!.children.push("h2");

    const assessment = assessFeishuDocPush({
      hasRawSourceBaseline: true,
      base,
      current,
      blockedChanges: [],
      sourceRevisionId: "1",
      baseRevisionId: "1",
    });

    expect(assessment.status).toBe("blocked");
    expect(assessment.publishModeRecommendation).toBe("update_existing");
    expect(assessment.blockedChanges).toEqual([{ blockId: "h2", reason: "Unsupported patch operation: insert_block" }]);
  });
});
