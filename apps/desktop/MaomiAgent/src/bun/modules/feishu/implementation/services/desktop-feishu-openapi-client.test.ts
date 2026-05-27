import { describe, expect, test } from "bun:test";

import {
  DesktopFeishuOpenApiClient,
  DesktopFeishuOpenApiError,
  isDesktopFeishuAccessTokenExpiredError,
  isDesktopFeishuRefreshTokenExpiredError,
} from "./desktop-feishu-openapi-client";

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

  test("accepts OAuth token fields returned at the top level", async () => {
    const client = new DesktopFeishuOpenApiClient({
      fetch: async () => new Response(JSON.stringify({
        code: 0,
        access_token: "u-access",
        refresh_token: "u-refresh",
        expires_in: 7200,
        refresh_expires_in: 2592000,
      }), { status: 200 }),
      now: () => new Date("2026-05-21T00:00:00.000Z"),
    });

    const result = await client.exchangeOAuthCode({
      appId: "cli_app",
      appSecret: "secret",
      code: "code_1",
      redirectUri: "http://127.0.0.1:35000/desktop/feishu/oauth/callback",
    });

    expect(result.accessToken).toBe("u-access");
    expect(result.refreshToken).toBe("u-refresh");
    expect(result.accessTokenExpiresAt).toBe("2026-05-21T02:00:00.000Z");
    expect(result.refreshTokenExpiresAt).toBe("2026-06-20T00:00:00.000Z");
  });

  test("accepts initial OAuth token responses without a refresh token", async () => {
    const client = new DesktopFeishuOpenApiClient({
      fetch: async () => new Response(JSON.stringify({
        code: 0,
        access_token: "u-access",
        expires_in: 7200,
      }), { status: 200 }),
      now: () => new Date("2026-05-21T00:00:00.000Z"),
    });

    const result = await client.exchangeOAuthCode({
      appId: "cli_app",
      appSecret: "secret",
      code: "code_1",
      redirectUri: "http://127.0.0.1:35000/desktop/feishu/oauth/callback",
    });

    expect(result.accessToken).toBe("u-access");
    expect(result.refreshToken).toBe("");
    expect(result.accessTokenExpiresAt).toBe("2026-05-21T02:00:00.000Z");
    expect(result.refreshTokenExpiresAt).toBe("");
  });

  test("requires a refresh token when refreshing OAuth tokens", async () => {
    const client = new DesktopFeishuOpenApiClient({
      fetch: async () => new Response(JSON.stringify({
        code: 0,
        access_token: "new-access",
        expires_in: 3600,
      }), { status: 200 }),
      now: () => new Date("2026-05-21T00:00:00.000Z"),
    });

    await expect(client.refreshUserAccessToken({
      appId: "cli_app",
      appSecret: "secret",
      refreshToken: "old-refresh",
    })).rejects.toThrow("Feishu API response missing token data: refresh_token, refresh_expires_in");
  });

  test("accepts refreshed token fields returned at the top level", async () => {
    const client = new DesktopFeishuOpenApiClient({
      fetch: async () => new Response(JSON.stringify({
        code: 0,
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
        refresh_expires_in: 2592000,
      }), { status: 200 }),
      now: () => new Date("2026-05-21T00:00:00.000Z"),
    });

    const result = await client.refreshUserAccessToken({
      appId: "cli_app",
      appSecret: "secret",
      refreshToken: "old-refresh",
    });

    expect(result.accessToken).toBe("new-access");
    expect(result.refreshToken).toBe("new-refresh");
    expect(result.accessTokenExpiresAt).toBe("2026-05-21T01:00:00.000Z");
    expect(result.refreshTokenExpiresAt).toBe("2026-06-20T00:00:00.000Z");
  });

  test("fetches a self-built tenant access token", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const client = new DesktopFeishuOpenApiClient({
      fetch: async (url, init) => {
        requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify({
          code: 0,
          tenant_access_token: "tenant_access_token_1",
          expire: 7200,
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      now: () => new Date("2026-05-26T10:00:00.000Z"),
    });

    const result = await client.getTenantAccessToken({
      appId: "cli_bot_app",
      appSecret: "bot_secret",
    });

    expect(requests[0]).toEqual({
      url: "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      body: {
        app_id: "cli_bot_app",
        app_secret: "bot_secret",
      },
    });
    expect(result).toEqual({
      tenantAccessToken: "tenant_access_token_1",
      expiresAt: "2026-05-26T12:00:00.000Z",
    });
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

  test("preserves HTTP status and envelope code on non-200 Feishu responses", async () => {
    const client = new DesktopFeishuOpenApiClient({
      fetch: async () => new Response(JSON.stringify({ code: 20006, msg: "access token expired" }), { status: 400 }),
    });

    let caught: unknown;
    try {
      await client.getJson("https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node", "expired-access");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DesktopFeishuOpenApiError);
    expect((caught as DesktopFeishuOpenApiError).status).toBe(400);
    expect((caught as DesktopFeishuOpenApiError).code).toBe(20006);
    expect(isDesktopFeishuAccessTokenExpiredError(caught)).toBe(true);
  });

  test("detects revoked refresh token errors that require reauthorization", () => {
    const error = new DesktopFeishuOpenApiError({
      message: "Feishu API HTTP error 400 (code 20064): The refresh token has been revoked. Please note that a refresh token can only be used once.",
      status: 400,
      code: 20064,
    });

    expect(isDesktopFeishuRefreshTokenExpiredError(error)).toBe(true);
  });
});
