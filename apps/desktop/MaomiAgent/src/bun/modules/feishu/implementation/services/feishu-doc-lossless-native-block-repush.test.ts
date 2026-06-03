import { describe, expect, test } from "bun:test";

import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import {
  buildLosslessNativeBlockRepushPlan,
  shouldUseLosslessNativeBlockRepush,
} from "./feishu-doc-lossless-native-block-repush";
import type { FeishuDocSourceSnapshot } from "./feishu-doc-source-workspace-cache";

function createBaseIr(): FeishuDocIR {
  return {
    schemaVersion: 1,
    document: {
      id: "doc_1",
      title: "Remote Doc",
      revisionId: "7",
      rootBlockId: "doc_1",
      pulledAt: "2026-06-03T00:00:00.000Z",
      source: { documentIdType: "document_id" },
    },
    blocks: {
      doc_1: {
        id: "doc_1",
        type: "page",
        parentId: null,
        children: ["heading_1", "table_1"],
        editable: false,
        text: [],
        resource: null,
        attrs: {},
        raw: {},
      },
      heading_1: {
        id: "heading_1",
        type: "heading1",
        parentId: "doc_1",
        children: [],
        editable: true,
        text: [{ kind: "text", text: "Remote Doc", attrs: {}, raw: {} }],
        resource: null,
        attrs: {},
        raw: {},
      },
      table_1: {
        id: "table_1",
        type: "table",
        parentId: "doc_1",
        children: [],
        editable: false,
        text: [],
        resource: null,
        attrs: { blockId: "table_1" },
        raw: {},
      },
    },
    assets: {},
    integrity: {
      contentHash: "sha256:content",
      rawHash: "sha256:raw",
    },
  };
}

function createSource(): FeishuDocSourceSnapshot {
  return {
    requestedDocId: "doc_1",
    resolvedDocId: "doc_1",
    documentIdType: "document_id",
    fetchedAt: "2026-06-03T00:00:00.000Z",
    sourceKind: "docx_remote_raw",
    document: {
      document_id: "doc_1",
      title: "Remote Doc",
      revision_id: "7",
    },
    blocks: [
      { block_id: "doc_1", block_type: 1, children: ["heading_1", "table_1"] },
      {
        block_id: "heading_1",
        parent_id: "doc_1",
        block_type: 3,
        heading1: {
          elements: [{
            text_run: {
              content: "Remote Doc",
            },
          }],
        },
      },
      {
        block_id: "table_1",
        parent_id: "doc_1",
        block_type: 31,
        table: {
          property: {
            column_size: 3,
          },
        },
      },
    ],
  };
}

describe("shouldUseLosslessNativeBlockRepush", () => {
  test("detects native-block placeholders from draft markdown", () => {
    expect(shouldUseLosslessNativeBlockRepush({
      draftMarkdown: '# Remote Doc\n\n<table blockId="table_1"></table>\n',
      baseIr: null,
    })).toBe(true);
  });
});

describe("buildLosslessNativeBlockRepushPlan", () => {
  test("preserves unchanged native blocks while preparing a real repeated push", () => {
    const plan = buildLosslessNativeBlockRepushPlan({
      docId: "doc_1",
      title: "Remote Doc",
      draftMarkdown: '# Remote Doc\n\n<table blockId="table_1"></table>\n',
      baseIr: createBaseIr(),
      source: createSource(),
    });

    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") {
      throw new Error("expected ready plan");
    }

    expect(plan.source.blocks[2]).toEqual(createSource().blocks[2]);
    expect(plan.markdown).toContain('<table blockId="table_1"');
  });

  test("updates editable heading text without mutating the native table payload", () => {
    const plan = buildLosslessNativeBlockRepushPlan({
      docId: "doc_1",
      title: "Edited Remote Doc",
      draftMarkdown: '# Edited Remote Doc\n\n<table blockId="table_1"></table>\n',
      baseIr: createBaseIr(),
      source: createSource(),
    });

    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") {
      throw new Error("expected ready plan");
    }

    expect((plan.source.blocks[1] as {
      heading1: { elements: Array<{ text_run: { content: string } }> };
    }).heading1.elements[0]?.text_run.content).toBe("Edited Remote Doc");
    expect(plan.source.blocks[2]).toEqual(createSource().blocks[2]);
  });

  test("blocks when the raw source snapshot is missing", () => {
    const plan = buildLosslessNativeBlockRepushPlan({
      docId: "doc_1",
      title: "Remote Doc",
      draftMarkdown: "# Remote Doc\n",
      baseIr: createBaseIr(),
      source: null,
    });

    expect(plan).toEqual({
      status: "blocked",
      message: "请先重新拉取远端文档基线。",
    });
  });

  test("blocks when the draft removes the native table placeholder", () => {
    const plan = buildLosslessNativeBlockRepushPlan({
      docId: "doc_1",
      title: "Edited Remote Doc",
      draftMarkdown: '<!--feishu:block:heading_1-->\n# Edited Remote Doc\n<!--/feishu:block:heading_1-->\n',
      baseIr: createBaseIr(),
      source: createSource(),
    });

    expect(plan.status).toBe("blocked");
    if (plan.status !== "blocked") {
      throw new Error("expected blocked plan");
    }

    expect(plan.message).toContain("无损重推范围");
  });
});
