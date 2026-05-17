import { describe, expect, test } from "bun:test";

import {
  DESKTOP_LOCAL_CONTROL_HOST,
  DESKTOP_LOCAL_CONTROL_PORT,
  DESKTOP_LOCAL_CONTROL_PROTOCOL,
  mergeDesktopFeishuOAuthScopes,
  normalizeDesktopFeishuRedirectUri,
  resolveDesktopFeishuOAuthCallbackOrigin,
  resolveDesktopFeishuOAuthCallbackUrl,
} from "./desktop-feishu-oauth";

describe("desktop-feishu-oauth shared helpers", () => {
  test("exposes the fixed loopback control plane metadata", () => {
    expect(DESKTOP_LOCAL_CONTROL_HOST).toBe("127.0.0.1");
    expect(DESKTOP_LOCAL_CONTROL_PORT).toBe(35000);
    expect(DESKTOP_LOCAL_CONTROL_PROTOCOL).toBe("maomiagent.desktop.control.v1");
    expect(resolveDesktopFeishuOAuthCallbackUrl()).toBe(
      "http://127.0.0.1:35000/desktop/feishu/oauth/callback",
    );
  });

  test("normalizes legacy loopback callback URLs to the fixed callback address", () => {
    expect(
      normalizeDesktopFeishuRedirectUri("http://127.0.0.1/desktop/feishu/oauth/callback"),
    ).toBe(resolveDesktopFeishuOAuthCallbackUrl());
    expect(
      normalizeDesktopFeishuRedirectUri("http://localhost:39091/desktop/feishu/oauth/callback"),
    ).toBe(resolveDesktopFeishuOAuthCallbackUrl());
    expect(
      resolveDesktopFeishuOAuthCallbackOrigin("http://127.0.0.1/desktop/feishu/oauth/callback"),
    ).toBe("http://127.0.0.1:35000");
  });

  test("deduplicates scopes and always includes offline_access", () => {
    expect(
      mergeDesktopFeishuOAuthScopes([
        "search:message",
        "offline_access",
        "search:message",
        "wiki:node:read",
      ]),
    ).toEqual([
      "search:message",
      "offline_access",
      "wiki:node:read",
    ]);
  });
});
