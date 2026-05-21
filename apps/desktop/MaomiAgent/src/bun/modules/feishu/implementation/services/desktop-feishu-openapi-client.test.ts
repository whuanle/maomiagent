import { describe, expect, test } from "bun:test";

import { DesktopFeishuOpenApiClient } from "./desktop-feishu-openapi-client";

describe("DesktopFeishuOpenApiClient", () => {
  test("exchanges an OAuth code and persists access and refresh tokens", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const client = new DesktopFeishuOpenApiClient({
      fetch: async (url, init) => {
        requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify({
          code: 0,
          data: {
            access_token: "u-access",
            refresh_token: "u-refresh",
            expires_in: 7200,
            refresh_expires_in: 2592000,
          },
        }), { status: 200 });
      },
      now: () => new Date("2026-05-21T00:00:00.000Z"),
    });

    const result = await client.exchangeOAuthCode({
      appId: "cli_app",
      appSecret: "secret",
      code: "code_1",
      redirectUri: "http://127.0.0.1:35000/desktop/feishu/oauth/callback",
    });

    expect(requests[0].url).toBe("https://open.feishu.cn/open-apis/authen/v2/oauth/token");
    expect(requests[0].body).toEqual({
      grant_type: "authorization_code",
      client_id: "cli_app",
      client_secret: "secret",
      code: "code_1",
      redirect_uri: "http://127.0.0.1:35000/desktop/feishu/oauth/callback",
    });
    expect(result.accessToken).toBe("u-access");
    expect(result.refreshToken).toBe("u-refresh");
    expect(result.accessTokenExpiresAt).toBe("2026-05-21T02:00:00.000Z");
    expect(result.refreshTokenExpiresAt).toBe("2026-06-20T00:00:00.000Z");
  });

  test("throws a readable error for Feishu error responses", async () => {
    const client = new DesktopFeishuOpenApiClient({
      fetch: async () => new Response(JSON.stringify({ code: 99991663, msg: "invalid code" }), { status: 200 }),
      now: () => new Date("2026-05-21T00:00:00.000Z"),
    });

    await expect(client.exchangeOAuthCode({
      appId: "cli_app",
      appSecret: "secret",
      code: "bad_code",
      redirectUri: "http://127.0.0.1:35000/desktop/feishu/oauth/callback",
    })).rejects.toThrow("Feishu API error 99991663: invalid code");
  });
});