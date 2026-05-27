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

  test("normalizes divider raw blocks", () => {
    const ir = normalizeFeishuDocBlocksToIR({
      documentId: "docx_1",
      title: "Demo",
      revisionId: "7",
      pulledAt: "2026-05-23T00:00:00.000Z",
      documentIdType: "document_id",
      blocks: [
        { block_id: "docx_1", block_type: 1, children: ["divider_by_number", "divider_by_payload"] },
        { block_id: "divider_by_number", parent_id: "docx_1", block_type: 16 },
        { block_id: "divider_by_payload", parent_id: "docx_1", divider: {} },
      ],
    });

    expect(ir.blocks.divider_by_number.type).toBe("divider");
    expect(ir.blocks.divider_by_payload.type).toBe("divider");
  });

  test("preserves embedded block tokens and preview attributes", () => {
    const ir = normalizeFeishuDocBlocksToIR({
      documentId: "docx_1",
      title: "Demo",
      revisionId: "8",
      pulledAt: "2026-05-27T00:00:00.000Z",
      documentIdType: "document_id",
      blocks: [
        { block_id: "docx_1", block_type: 1, children: ["board", "iframe", "sheet", "bitable", "link"] },
        {
          block_id: "board",
          parent_id: "docx_1",
          block_type: 43,
          token: "board_token",
          board: { title: "Architecture Board", theme: "classic" },
        },
        {
          block_id: "iframe",
          parent_id: "docx_1",
          iframe: {
            title: "Prototype Chart",
            component: {
              type: "0",
              url: "https%3A%2F%2Fexample.com%2Fchart",
            },
          },
        },
        {
          block_id: "sheet",
          parent_id: "docx_1",
          block_type: 35,
          sheet: {
            spreadsheet_token: "sheet_token",
            sheet_id: "sheet_1",
            title: "KPI Sheet",
          },
        },
        {
          block_id: "bitable",
          parent_id: "docx_1",
          block_type: 34,
          bitable: {
            token: "bitable_token",
            view_type: "chart",
            title: "Revenue Dashboard",
            url: "https://example.com/base",
          },
        },
        {
          block_id: "link",
          parent_id: "docx_1",
          link_preview: {
            url: "https://example.com/report",
            title: "Weekly Report",
            description: "Dashboard snapshot",
          },
        },
      ],
    });

    expect(ir.blocks.board.type).toBe("board");
    expect(ir.blocks.board.resource).toEqual({ token: "board_token", kind: "whiteboard" });
    expect(ir.assets.board_token.kind).toBe("whiteboard");
    expect(ir.blocks.board.attrs).toMatchObject({
      token: "board_token",
      title: "Architecture Board",
      theme: "classic",
    });

    expect(ir.blocks.iframe.attrs).toMatchObject({
      title: "Prototype Chart",
      "component-type": "0",
      "component-url": "https%3A%2F%2Fexample.com%2Fchart",
    });

    expect(ir.blocks.sheet.attrs).toMatchObject({
      "spreadsheet-token": "sheet_token",
      "sheet-id": "sheet_1",
      title: "KPI Sheet",
    });

    expect(ir.blocks.bitable.attrs).toMatchObject({
      token: "bitable_token",
      "view-type": "chart",
      title: "Revenue Dashboard",
      url: "https://example.com/base",
    });

    expect(ir.blocks.link.attrs).toMatchObject({
      url: "https://example.com/report",
      title: "Weekly Report",
      description: "Dashboard snapshot",
    });
  });

  test("aliases table property metadata for preview layout", () => {
    const ir = normalizeFeishuDocBlocksToIR({
      documentId: "docx_1",
      title: "Demo",
      revisionId: "9",
      pulledAt: "2026-05-27T00:00:00.000Z",
      documentIdType: "document_id",
      blocks: [
        { block_id: "docx_1", block_type: 1, children: ["table"] },
        {
          block_id: "table",
          parent_id: "docx_1",
          block_type: 31,
          children: ["cell_1"],
          table: {
            cells: ["cell_1"],
            property: {
              row_size: 4,
              column_size: 3,
              header_row_size: 1,
            },
          },
        },
        {
          block_id: "cell_1",
          parent_id: "table",
          block_type: 32,
          table_cell: {
            property: {
              row_index: 1,
              column_index: 2,
              row_span: 1,
              column_span: 2,
              header: true,
            },
          },
        },
      ],
    });

    expect(ir.blocks.table.attrs).toMatchObject({
      "property-row-size": 4,
      "property-column-size": 3,
      "property-header-row-size": 1,
      "row-size": 4,
      "column-size": 3,
      "header-row-size": 1,
    });

    expect(ir.blocks.cell_1.attrs).toMatchObject({
      "property-row-index": 1,
      "property-column-index": 2,
      "property-row-span": 1,
      "property-column-span": 2,
      "property-header": true,
      "row-index": 1,
      "column-index": 2,
      "row-span": 1,
      "column-span": 2,
      header: true,
    });
  });
});
