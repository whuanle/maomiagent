import { describe, expect, test } from "bun:test";

import { DesktopFeishuOpenApiClient } from "./desktop-feishu-openapi-client";
import { FeishuDocRemotePatchApi } from "./feishu-doc-remote-patch-api";

describe("FeishuDocRemotePatchApi", () => {
  test("patches block text with revision-aware update_text_elements payload", async () => {
    const client = new DesktopFeishuOpenApiClient({
      fetch: (async (url, init) => {
        expect(init?.method).toBe("PATCH");
        expect(String(init?.headers && (init.headers as Record<string, string>).authorization)).toBe("Bearer access");

        const target = new URL(String(url));
        expect(target.pathname).toBe("/open-apis/docx/v1/documents/doc_1/blocks/p1");
        expect(target.searchParams.get("document_revision_id")).toBe("7");
        expect(target.searchParams.get("client_token")).toBeTruthy();
        expect(JSON.parse(String(init?.body))).toEqual({
          update_text_elements: {
            elements: [{
              text_run: {
                content: "New paragraph",
              },
            }],
          },
        });

        return new Response(JSON.stringify({
          code: 0,
          data: {},
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    const api = new FeishuDocRemotePatchApi({
      client,
      baseUrl: "https://open.feishu.cn/open-apis",
      accessToken: async () => "access",
    });

    await expect(api.updateText({
      documentId: "doc_1",
      revisionId: "7",
      blockId: "p1",
      text: "New paragraph",
    })).resolves.toBeUndefined();
  });

  test("refreshes the access token once when the first patch call expires", async () => {
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
          data: {},
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    const api = new FeishuDocRemotePatchApi({
      client,
      baseUrl: "https://open.feishu.cn/open-apis",
      accessToken: async (input) => {
        forceRefreshFlags.push(Boolean(input?.forceRefresh));
        return input?.forceRefresh ? "access_refreshed" : "access";
      },
    });

    await expect(api.updateText({
      documentId: "doc_1",
      revisionId: "7",
      blockId: "p1",
      text: "New paragraph",
    })).resolves.toBeUndefined();

    expect(forceRefreshFlags).toEqual([false, true]);
    expect(calls).toBe(2);
  });
});
