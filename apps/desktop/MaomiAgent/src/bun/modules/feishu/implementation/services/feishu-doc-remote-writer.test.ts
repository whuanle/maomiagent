import { describe, expect, test } from "bun:test";

import { DesktopFeishuOpenApiClient } from "./desktop-feishu-openapi-client";
import { FeishuDocRemoteWriter } from "./feishu-doc-remote-writer";

describe("FeishuDocRemoteWriter", () => {
  test("creates a remote doc and returns the new document id", async () => {
    const client = new DesktopFeishuOpenApiClient({
      fetch: async (_url, init) => {
        expect(init?.method).toBe("POST");
        expect(String(init?.headers && (init.headers as Record<string, string>).authorization)).toBe("Bearer access");
        return new Response(JSON.stringify({
          code: 0,
          data: {
            document: {
              document_id: "doc_new_1",
              title: "Generated",
            },
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    const writer = new FeishuDocRemoteWriter({ client, baseUrl: "https://open.feishu.cn/open-apis" });

    await expect(writer.createDocument({ accessToken: "access", title: "Generated" })).resolves.toEqual({
      documentId: "doc_new_1",
      title: "Generated",
    });
  });
});