import { describe, expect, test } from "bun:test";

import type { FeishuDocIR } from "../../../../shared/desktop-feishu-doc-ir";
import { feishuDocIRToMdx } from "../../../../bun/modules/feishu/implementation/services/feishu-doc-mdx-codec";
import { parseFeishuDocsLocalPreview } from "./feishu-docs-local-preview-model";

function sampleIR(): FeishuDocIR {
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
      docx_1: {
        id: "docx_1",
        type: "page",
        parentId: null,
        children: ["h1", "img", "callout", "file"],
        editable: false,
        text: [],
        resource: null,
        attrs: {},
        raw: {},
      },
      h1: {
        id: "h1",
        type: "heading1",
        parentId: "docx_1",
        children: [],
        editable: true,
        text: [{ kind: "text", text: "Title", attrs: {}, raw: {} }],
        resource: null,
        attrs: {},
        raw: {},
      },
      img: {
        id: "img",
        type: "image",
        parentId: "docx_1",
        children: [],
        editable: true,
        text: [],
        resource: { token: "img_token", kind: "image" },
        attrs: { width: 640, height: 360 },
        raw: {},
      },
      callout: {
        id: "callout",
        type: "callout",
        parentId: "docx_1",
        children: ["callout_text"],
        editable: true,
        text: [],
        resource: null,
        attrs: {},
        raw: {},
      },
      callout_text: {
        id: "callout_text",
        type: "text",
        parentId: "callout",
        children: [],
        editable: true,
        text: [{ kind: "text", text: "Callout body", attrs: {}, raw: {} }],
        resource: null,
        attrs: {},
        raw: {},
      },
      file: {
        id: "file",
        type: "file",
        parentId: "docx_1",
        children: [],
        editable: true,
        text: [],
        resource: { token: "file_token", kind: "file" },
        attrs: { name: "spec.pdf" },
        raw: {},
      },
    },
    assets: {
      img_token: {
        token: "img_token",
        kind: "image",
        mime: "image/png",
        cacheKey: "sha256:image",
        status: "missing",
        localPath: "",
        checksum: "",
      },
      file_token: {
        token: "file_token",
        kind: "file",
        mime: "application/pdf",
        cacheKey: "sha256:file",
        status: "missing",
        localPath: "",
        checksum: "",
      },
    },
    integrity: {
      contentHash: "sha256:content",
      rawHash: "sha256:raw",
    },
  };
}

describe("Feishu local document rendering pipeline", () => {
  test("parses codec-generated Feishu tags into native preview blocks", () => {
    const markdown = feishuDocIRToMdx(sampleIR());
    const nodes = parseFeishuDocsLocalPreview(markdown);

    expect(markdown).toContain("<FeishuImage");
    expect(markdown).toContain("<FeishuCallout");
    expect(markdown).toContain("<FeishuFile");
    expect(nodes).toEqual([
      expect.objectContaining({ kind: "markdown", markdown: "# Title" }),
      expect.objectContaining({ kind: "native_block", name: "image" }),
      expect.objectContaining({ kind: "native_block", name: "callout" }),
      expect.objectContaining({ kind: "native_block", name: "file" }),
    ]);
  });
});
