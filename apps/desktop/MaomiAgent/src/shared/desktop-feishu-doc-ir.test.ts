import { describe, expect, test } from "bun:test";
import { isFeishuDocIR } from "./desktop-feishu-doc-ir";

describe("FeishuDocIR shared contract", () => {
  test("accepts a minimal valid document IR", () => {
    expect(isFeishuDocIR({
      schemaVersion: 1,
      document: {
        id: "docx_1",
        title: "Demo",
        revisionId: "3",
        rootBlockId: "docx_1",
        pulledAt: "2026-05-23T00:00:00.000Z",
        source: { documentIdType: "document_id" },
      },
      blocks: {
        docx_1: {
          id: "docx_1",
          type: "page",
          parentId: null,
          children: [],
          editable: false,
          text: [],
          resource: null,
          attrs: {},
          raw: {},
        },
      },
      assets: {},
      integrity: {
        contentHash: "sha256:content",
        rawHash: "sha256:raw",
      },
    })).toBe(true);
  });

  test("rejects missing blocks", () => {
    expect(isFeishuDocIR({ schemaVersion: 1, document: {}, assets: {} })).toBe(false);
  });
});