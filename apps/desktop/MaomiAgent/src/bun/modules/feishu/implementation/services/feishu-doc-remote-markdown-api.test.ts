import { describe, expect, test } from "bun:test";

import { DesktopFeishuOpenApiClient } from "./desktop-feishu-openapi-client";
import { FeishuDocRemoteMarkdownApi } from "./feishu-doc-remote-markdown-api";

describe("FeishuDocRemoteMarkdownApi", () => {
  test("converts markdown into descendant-ready blocks", async () => {
    const client = new DesktopFeishuOpenApiClient({
      fetch: (async (url, init) => {
        expect(init?.method).toBe("POST");
        expect(String(init?.headers && (init.headers as Record<string, string>).authorization)).toBe("Bearer access");
        expect(String(url)).toBe("https://open.feishu.cn/open-apis/docx/v1/documents/blocks/convert");
        expect(JSON.parse(String(init?.body))).toEqual({
          content_type: "markdown",
          content: "# Demo",
        });

        return new Response(JSON.stringify({
          code: 0,
          data: {
            first_level_block_ids: ["tmp_h1"],
            blocks: [{
              block_id: "tmp_h1",
              block_type: 3,
              heading1: {
                elements: [{
                  text_run: {
                    content: "Demo",
                  },
                }],
              },
            }],
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    const api = new FeishuDocRemoteMarkdownApi({
      client,
      baseUrl: "https://open.feishu.cn/open-apis",
      accessToken: async () => "access",
    });

    await expect(api.convertMarkdown({ markdown: "# Demo" })).resolves.toEqual({
      firstLevelBlockIds: ["tmp_h1"],
      blocks: [{
        block_id: "tmp_h1",
        block_type: 3,
        heading1: {
          elements: [{
            text_run: {
              content: "Demo",
            },
          }],
        },
      }],
    });
  });

  test("deletes root children with the official batch_delete endpoint", async () => {
    const client = new DesktopFeishuOpenApiClient({
      fetch: (async (url, init) => {
        expect(init?.method).toBe("DELETE");
        expect(String(init?.headers && (init.headers as Record<string, string>).authorization)).toBe("Bearer access");

        const target = new URL(String(url));
        expect(target.pathname).toBe("/open-apis/docx/v1/documents/doc_1/blocks/doc_1/children/batch_delete");
        expect(target.searchParams.get("document_revision_id")).toBe("7");
        expect(target.searchParams.get("client_token")).toBeTruthy();
        expect(JSON.parse(String(init?.body))).toEqual({
          start_index: 0,
          end_index: 2,
        });

        return new Response(JSON.stringify({
          code: 0,
          data: {
            document_revision_id: 8,
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    const api = new FeishuDocRemoteMarkdownApi({
      client,
      baseUrl: "https://open.feishu.cn/open-apis",
      accessToken: async () => "access",
    });

    await expect(api.deleteChildren({
      documentId: "doc_1",
      blockId: "doc_1",
      revisionId: "7",
      startIndex: 0,
      endIndex: 2,
    })).resolves.toEqual({ revisionId: "8" });
  });

  test("refreshes the access token once when descendant creation expires", async () => {
    const forceRefreshFlags: boolean[] = [];
    let calls = 0;
    const client = new DesktopFeishuOpenApiClient({
      fetch: (async (_url, _init) => {
        calls += 1;
        if (calls === 1) {
          return new Response(JSON.stringify({
            code: 20006,
            msg: "access token expired",
          }), { status: 401, headers: { "content-type": "application/json" } });
        }

        return new Response(JSON.stringify({
          code: 0,
          data: {
            document_revision_id: 9,
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    const api = new FeishuDocRemoteMarkdownApi({
      client,
      baseUrl: "https://open.feishu.cn/open-apis",
      accessToken: async (input) => {
        forceRefreshFlags.push(Boolean(input?.forceRefresh));
        return input?.forceRefresh ? "access_refreshed" : "access";
      },
    });

    await expect(api.createDescendants({
      documentId: "doc_1",
      blockId: "doc_1",
      revisionId: "8",
      childrenId: ["tmp_h1"],
      descendants: [{
        block_id: "tmp_h1",
        block_type: 3,
        heading1: {
          elements: [{
            text_run: {
              content: "Demo",
            },
          }],
        },
      }],
    })).resolves.toEqual({ revisionId: "9" });

    expect(forceRefreshFlags).toEqual([false, true]);
    expect(calls).toBe(2);
  });

  test("overwrites a docs v2 document through docs_ai update", async () => {
    const client = new DesktopFeishuOpenApiClient({
      fetch: (async (url, init) => {
        expect(init?.method).toBe("PUT");
        expect(String(init?.headers && (init.headers as Record<string, string>).authorization)).toBe("Bearer access");
        expect(String(url)).toBe("https://open.feishu.cn/open-apis/docs_ai/v1/documents/wiki_node_1");
        expect(JSON.parse(String(init?.body))).toEqual({
          command: "overwrite",
          content: '<whiteboard type="mermaid">\nflowchart TD\nA-->B\n</whiteboard>',
          format: "markdown",
          revision_id: -1,
        });

        return new Response(JSON.stringify({
          code: 0,
          data: {
            document: {
              revision_id: 12,
              new_blocks: [{
                block_id: "blk_1",
                block_type: "whiteboard",
                block_token: "wb_1",
              }],
            },
            result: "success",
            warnings: [],
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    const api = new FeishuDocRemoteMarkdownApi({
      client,
      baseUrl: "https://open.feishu.cn/open-apis",
      accessToken: async () => "access",
    });

    await expect(api.overwriteDocumentV2({
      documentToken: "wiki_node_1",
      content: '<whiteboard type="mermaid">\nflowchart TD\nA-->B\n</whiteboard>',
      format: "markdown",
      revisionId: -1,
    })).resolves.toEqual({
      revisionId: "12",
      result: "success",
      warnings: [],
      newBlocks: [{
        blockId: "blk_1",
        blockType: "whiteboard",
        blockToken: "wb_1",
      }],
    });
  });
});
