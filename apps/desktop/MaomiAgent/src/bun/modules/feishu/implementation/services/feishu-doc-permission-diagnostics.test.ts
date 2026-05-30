import { describe, expect, test } from "bun:test";

import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";
import { DesktopFeishuOpenApiError } from "./desktop-feishu-openapi-client";
import {
  classifyFeishuDocDiagnosticError,
  extractInspectableWhiteboardTokens,
  summarizeWhiteboardRecoveryDiagnostics,
} from "./feishu-doc-permission-diagnostics";

function createWhiteboardIR(): FeishuDocIR {
  return {
    schemaVersion: 1,
    document: {
      id: "doc_1",
      title: "Demo",
      revisionId: "7",
      rootBlockId: "doc_1",
      pulledAt: "2026-05-30T00:00:00.000Z",
      source: { documentIdType: "document_id" },
    },
    blocks: {
      doc_1: {
        id: "doc_1",
        type: "page",
        parentId: null,
        children: ["wb_1", "wb_2", "wb_3", "wb_4"],
        editable: false,
        text: [],
        resource: null,
        attrs: {},
        raw: {},
      },
      wb_1: {
        id: "wb_1",
        type: "whiteboard",
        parentId: "doc_1",
        children: [],
        editable: true,
        text: [],
        resource: { token: "board_1", kind: "whiteboard" },
        attrs: {},
        raw: {},
      },
      wb_2: {
        id: "wb_2",
        type: "diagram",
        parentId: "doc_1",
        children: [],
        editable: true,
        text: [],
        resource: { token: "board_2", kind: "whiteboard" },
        attrs: {},
        raw: {},
      },
      wb_3: {
        id: "wb_3",
        type: "board",
        parentId: "doc_1",
        children: [],
        editable: true,
        text: [],
        resource: { token: "board_3", kind: "whiteboard" },
        attrs: {},
        raw: {},
      },
      wb_4: {
        id: "wb_4",
        type: "whiteboard",
        parentId: "doc_1",
        children: [],
        editable: true,
        text: [],
        resource: { token: "board_1", kind: "whiteboard" },
        attrs: {},
        raw: {},
      },
    },
    assets: {},
    integrity: {
      contentHash: "content",
      rawHash: "raw",
    },
  };
}

describe("feishu-doc-permission-diagnostics", () => {
  test("maps confirmed permission, auth, network, and unknown failures conservatively", () => {
    expect(classifyFeishuDocDiagnosticError(new DesktopFeishuOpenApiError({
      message: "Feishu API HTTP error 403 (code 2890005): forbidden",
      status: 403,
      code: 2890005,
      responseText: JSON.stringify({ code: 2890005, msg: "forbidden" }),
    }))).toEqual(expect.objectContaining({
      category: "permission",
      code: 2890005,
    }));

    expect(classifyFeishuDocDiagnosticError(new DesktopFeishuOpenApiError({
      message: "Feishu API HTTP error 401 (code 20006): access token expired",
      status: 401,
      code: 20006,
    }))).toEqual(expect.objectContaining({
      category: "auth",
      code: 20006,
    }));

    expect(classifyFeishuDocDiagnosticError(new Error("fetch failed"))).toEqual(
      expect.objectContaining({ category: "network" }),
    );

    expect(classifyFeishuDocDiagnosticError(new Error("unexpected payload"))).toEqual(
      expect.objectContaining({ category: "unknown" }),
    );
  });

  test("summarizes recovery fallback counts without inflating permission numbers", () => {
    const summary = summarizeWhiteboardRecoveryDiagnostics({
      recoveredCount: 1,
      entries: [
        {
          token: "board_1",
          stage: "whiteboard_code",
          code: 2890005,
          message: "forbidden",
          category: "permission",
          fallbackApplied: true,
        },
        {
          token: "board_2",
          stage: "whiteboard_code",
          code: undefined,
          message: "fetch failed",
          category: "network",
          fallbackApplied: true,
        },
      ],
    });

    expect(summary).toEqual({
      status: "partial",
      recoveredCount: 1,
      fallbackCount: 2,
      permissionDeniedCount: 1,
      documentPermissionDenied: false,
      entries: expect.any(Array),
    });
  });

  test("extracts at most three distinct inspectable whiteboard tokens from IR", () => {
    expect(extractInspectableWhiteboardTokens(createWhiteboardIR(), 3)).toEqual([
      "board_1",
      "board_2",
      "board_3",
    ]);
  });
});
