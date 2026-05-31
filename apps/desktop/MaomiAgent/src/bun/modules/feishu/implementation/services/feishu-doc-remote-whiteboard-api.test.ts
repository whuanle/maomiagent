import { describe, expect, test } from "bun:test";

import { DesktopFeishuOpenApiClient } from "./desktop-feishu-openapi-client";
import { FeishuDocRemoteWhiteboardApi } from "./feishu-doc-remote-whiteboard-api";

describe("FeishuDocRemoteWhiteboardApi", () => {
  test("queries whiteboard code through the board nodes endpoint", async () => {
    const client = new DesktopFeishuOpenApiClient({
      fetch: (async (url, init) => {
        expect(init?.method).toBe("GET");
        expect(String(init?.headers && (init.headers as Record<string, string>).authorization)).toBe("Bearer access");

        const target = new URL(String(url));
        expect(target.pathname).toBe("/open-apis/board/v1/whiteboards/wb_1/nodes");
        expect(target.searchParams.get("output_as")).toBe("code");

        return new Response(JSON.stringify({
          code: 0,
          data: {
            format: "mermaid",
            source: "flowchart TD\nA-->B",
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    const api = new FeishuDocRemoteWhiteboardApi({
      client,
      baseUrl: "https://open.feishu.cn/open-apis",
      accessToken: async () => "access",
    });

    await expect(api.queryWhiteboardCode({ whiteboardToken: "wb_1" })).resolves.toEqual({
      format: "mermaid",
      source: "flowchart TD\nA-->B",
    });
  });

  test("queries whiteboard raw nodes through the board nodes endpoint", async () => {
    const client = new DesktopFeishuOpenApiClient({
      fetch: (async (url, init) => {
        expect(init?.method).toBe("GET");
        expect(String(init?.headers && (init.headers as Record<string, string>).authorization)).toBe("Bearer access");

        const target = new URL(String(url));
        expect(target.pathname).toBe("/open-apis/board/v1/whiteboards/wb_1/nodes");
        expect(target.searchParams.get("output_as")).toBe("raw");

        return new Response(JSON.stringify({
          code: 0,
          data: {
            nodes: [
              { id: "o1", type: "composite_shape" },
              { id: "c1", type: "connector" },
            ],
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    const api = new FeishuDocRemoteWhiteboardApi({
      client,
      baseUrl: "https://open.feishu.cn/open-apis",
      accessToken: async () => "access",
    });

    await expect(api.queryWhiteboardRawNodes({ whiteboardToken: "wb_1" })).resolves.toEqual([
      { id: "o1", type: "composite_shape" },
      { id: "c1", type: "connector" },
    ]);
  });

  test("updates whiteboard Mermaid source with overwrite semantics", async () => {
    const client = new DesktopFeishuOpenApiClient({
      fetch: (async (url, init) => {
        expect(init?.method).toBe("POST");
        expect(String(init?.headers && (init.headers as Record<string, string>).authorization)).toBe("Bearer access");

        const target = new URL(String(url));
        expect(target.pathname).toBe("/open-apis/board/v1/whiteboards/wb_1/nodes");
        expect(target.searchParams.get("idempotent_token")).toBeTruthy();
        expect(JSON.parse(String(init?.body))).toEqual({
          input_format: "mermaid",
          source: "flowchart TD\nA-->C",
          overwrite: true,
        });

        return new Response(JSON.stringify({
          code: 0,
          data: {
            result: "success",
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    const api = new FeishuDocRemoteWhiteboardApi({
      client,
      baseUrl: "https://open.feishu.cn/open-apis",
      accessToken: async () => "access",
    });

    await expect(api.updateWhiteboard({
      whiteboardToken: "wb_1",
      inputFormat: "mermaid",
      source: "flowchart TD\nA-->C",
      overwrite: true,
    })).resolves.toEqual({ result: "success" });
  });
});
