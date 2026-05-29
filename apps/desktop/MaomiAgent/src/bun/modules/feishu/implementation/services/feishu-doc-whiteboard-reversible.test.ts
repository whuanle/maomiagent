import { describe, expect, test } from "bun:test";

import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import { feishuDocIRToSourceMarkdown } from "./feishu-doc-source-markdown-codec";
import {
  REVERSIBLE_MERMAID_BLOCK_MESSAGES,
  applyRecoveredMermaidWhiteboards,
  buildReversibleMermaidPushPlan,
  parseMermaidFences,
} from "./feishu-doc-whiteboard-reversible";

function createWhiteboardIR(): FeishuDocIR {
  return {
    schemaVersion: 1,
    document: {
      id: "doc_1",
      title: "Whiteboard Doc",
      revisionId: "1",
      rootBlockId: "doc_1",
      pulledAt: "2026-05-29T00:00:00.000Z",
      source: { documentIdType: "document_id" },
    },
    blocks: {
      doc_1: {
        id: "doc_1",
        type: "page",
        parentId: null,
        children: ["title", "wb_1_block", "paragraph", "diagram_block"],
        editable: false,
        text: [],
        resource: null,
        attrs: {},
        raw: {},
      },
      title: {
        id: "title",
        type: "heading1",
        parentId: "doc_1",
        children: [],
        editable: true,
        text: [{ kind: "text", text: "Architecture", attrs: {}, raw: {} }],
        resource: null,
        attrs: {},
        raw: {},
      },
      wb_1_block: {
        id: "wb_1_block",
        type: "whiteboard",
        parentId: "doc_1",
        children: [],
        editable: false,
        text: [],
        resource: { token: "wb_1", kind: "whiteboard" },
        attrs: {},
        raw: {},
      },
      paragraph: {
        id: "paragraph",
        type: "text",
        parentId: "doc_1",
        children: [],
        editable: true,
        text: [{ kind: "text", text: "After board", attrs: {}, raw: {} }],
        resource: null,
        attrs: {},
        raw: {},
      },
      diagram_block: {
        id: "diagram_block",
        type: "diagram",
        parentId: "doc_1",
        children: [],
        editable: false,
        text: [],
        resource: { token: "wb_2", kind: "diagram" },
        attrs: {},
        raw: {},
      },
    },
    assets: {
      wb_1: {
        token: "wb_1",
        kind: "whiteboard",
        mime: "",
        cacheKey: "",
        status: "missing",
        localPath: "",
        checksum: "",
      },
      wb_2: {
        token: "wb_2",
        kind: "diagram",
        mime: "",
        cacheKey: "",
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

describe("feishu-doc-whiteboard-reversible", () => {
  test("applies recovered Mermaid metadata by document order and emits Mermaid fences", () => {
    const recovered = applyRecoveredMermaidWhiteboards({
      ir: createWhiteboardIR(),
      recovered: [
        {
          whiteboardToken: "wb_2",
          format: "mermaid",
          source: "sequenceDiagram\nA->>B: hi",
          origin: "whiteboard_code_export",
          resolvedAt: "2026-05-29T00:00:00.000Z",
        },
        {
          whiteboardToken: "wb_1",
          format: "mermaid",
          source: "flowchart TD\nA-->B",
          origin: "docs_ai_markdown",
          resolvedAt: "2026-05-29T00:00:01.000Z",
        },
      ],
    });

    expect(recovered.assets.wb_1?.reversible).toEqual(expect.objectContaining({
      format: "mermaid",
      ordinal: 0,
      origin: "docs_ai_markdown",
      state: "mermaid",
    }));
    expect(recovered.assets.wb_2?.reversible).toEqual(expect.objectContaining({
      format: "mermaid",
      ordinal: 1,
      origin: "whiteboard_code_export",
      state: "mermaid",
    }));

    expect(feishuDocIRToSourceMarkdown(recovered)).toBe([
      "# Architecture",
      "",
      "```mermaid",
      "flowchart TD",
      "A-->B",
      "```",
      "",
      "After board",
      "",
      "```mermaid",
      "sequenceDiagram",
      "A->>B: hi",
      "```",
      "",
    ].join("\n"));
  });

  test("parses Mermaid fences and builds a stable push update plan", () => {
    const recovered = applyRecoveredMermaidWhiteboards({
      ir: createWhiteboardIR(),
      recovered: [
        {
          whiteboardToken: "wb_1",
          format: "mermaid",
          source: "flowchart TD\nA-->B",
          origin: "whiteboard_code_export",
          resolvedAt: "2026-05-29T00:00:00.000Z",
        },
        {
          whiteboardToken: "wb_2",
          format: "mermaid",
          source: "sequenceDiagram\nA->>B: hi",
          origin: "whiteboard_code_export",
          resolvedAt: "2026-05-29T00:00:00.000Z",
        },
      ],
    });

    const draftMarkdown = [
      "# Architecture",
      "",
      "```mermaid",
      "flowchart TD",
      "A-->C",
      "```",
      "",
      "After board",
      "",
      "```mermaid",
      "sequenceDiagram",
      "A->>B: hi",
      "```",
      "",
    ].join("\n");

    expect(parseMermaidFences(draftMarkdown)).toEqual([
      expect.objectContaining({ source: "flowchart TD\nA-->C" }),
      expect.objectContaining({ source: "sequenceDiagram\nA->>B: hi" }),
    ]);

    const plan = buildReversibleMermaidPushPlan({
      draftMarkdown,
      baseIr: recovered,
    });

    expect(plan.kind).toBe("update");
    if (plan.kind !== "update") {
      throw new Error("expected update plan");
    }

    expect(plan.documentMarkdown).toBe([
      "# Architecture",
      "",
      '<whiteboard token="wb_1" />',
      "",
      "After board",
      "",
      '<whiteboard token="wb_2" />',
      "",
    ].join("\n"));
    expect(plan.changedWhiteboards).toEqual([
      expect.objectContaining({
        whiteboardToken: "wb_1",
        source: "flowchart TD\nA-->C",
        ordinal: 0,
      }),
    ]);
  });

  test("blocks reversible push when Mermaid fence count changes", () => {
    const recovered = applyRecoveredMermaidWhiteboards({
      ir: createWhiteboardIR(),
      recovered: [
        {
          whiteboardToken: "wb_1",
          format: "mermaid",
          source: "flowchart TD\nA-->B",
          origin: "whiteboard_code_export",
          resolvedAt: "2026-05-29T00:00:00.000Z",
        },
        {
          whiteboardToken: "wb_2",
          format: "mermaid",
          source: "sequenceDiagram\nA->>B: hi",
          origin: "whiteboard_code_export",
          resolvedAt: "2026-05-29T00:00:00.000Z",
        },
      ],
    });

    expect(buildReversibleMermaidPushPlan({
      draftMarkdown: "```mermaid\nflowchart TD\nA-->B\n```\n",
      baseIr: recovered,
    })).toEqual({
      kind: "blocked",
      message: REVERSIBLE_MERMAID_BLOCK_MESSAGES.countChanged,
    });
  });

  test("blocks reversible push when stored ordinals no longer match fence order", () => {
    const recovered = applyRecoveredMermaidWhiteboards({
      ir: createWhiteboardIR(),
      recovered: [
        {
          whiteboardToken: "wb_1",
          format: "mermaid",
          source: "flowchart TD\nA-->B",
          origin: "whiteboard_code_export",
          resolvedAt: "2026-05-29T00:00:00.000Z",
        },
        {
          whiteboardToken: "wb_2",
          format: "mermaid",
          source: "sequenceDiagram\nA->>B: hi",
          origin: "whiteboard_code_export",
          resolvedAt: "2026-05-29T00:00:00.000Z",
        },
      ],
    });

    if (!recovered.assets.wb_1?.reversible || !recovered.assets.wb_2?.reversible) {
      throw new Error("expected reversible metadata");
    }

    recovered.assets.wb_1.reversible.ordinal = 1;
    recovered.assets.wb_2.reversible.ordinal = 2;

    expect(buildReversibleMermaidPushPlan({
      draftMarkdown: [
        "```mermaid",
        "flowchart TD",
        "A-->B",
        "```",
        "",
        "```mermaid",
        "sequenceDiagram",
        "A->>B: hi",
        "```",
        "",
      ].join("\n"),
      baseIr: recovered,
    })).toEqual({
      kind: "blocked",
      message: REVERSIBLE_MERMAID_BLOCK_MESSAGES.orderChanged,
    });
  });
});
