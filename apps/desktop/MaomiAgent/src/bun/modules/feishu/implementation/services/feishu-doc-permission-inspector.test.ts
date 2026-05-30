import { describe, expect, test } from "bun:test";

import { DesktopFeishuOpenApiError } from "./desktop-feishu-openapi-client";
import { inspectFeishuDocPermissions } from "./feishu-doc-permission-inspector";

describe("inspectFeishuDocPermissions", () => {
  test("probes wiki, docx, and up to three whiteboards with classified results", async () => {
    const calls: string[] = [];
    const result = await inspectFeishuDocPermissions({
      client: {
        getJson: async (url: string) => {
          calls.push(url);
          if (url.includes("/wiki/v2/spaces/get_node")) {
            throw new DesktopFeishuOpenApiError({
              message: "Feishu API HTTP error 400 (code 131006): permission denied",
              status: 400,
              code: 131006,
            });
          }
          if (url.includes("/docx/v1/documents/doc_1")) {
            return { document: { document_id: "doc_1", title: "Doc" } };
          }
          if (url.includes("board_ok")) {
            return { data: { format: "mermaid", source: "flowchart TD\nA-->B" } };
          }
          throw new DesktopFeishuOpenApiError({
            message: "Feishu API HTTP error 403 (code 2890005): forbidden",
            status: 403,
            code: 2890005,
          });
        },
      } as any,
      accessToken: "access-token",
      docId: "doc_1",
      whiteboardTokens: ["board_ok", "board_forbidden", "board_forbidden_2", "board_forbidden_3"],
    });

    expect(result.document.wiki).toEqual(expect.objectContaining({
      ok: false,
      category: "permission",
      code: 131006,
    }));
    expect(result.document.docx).toEqual(expect.objectContaining({
      ok: true,
      category: "unknown",
    }));
    expect(result.whiteboards).toHaveLength(3);
    expect(result.whiteboards[0]).toEqual(expect.objectContaining({
      token: "board_ok",
      probeResult: expect.objectContaining({ ok: true }),
    }));
    expect(result.whiteboards[1]?.probeResult).toEqual(expect.objectContaining({
      ok: false,
      category: "permission",
      code: 2890005,
    }));
    expect(calls.filter((url) => url.includes("/board/v1/whiteboards/"))).toHaveLength(3);
  });
});
