import { describe, expect, test } from "bun:test";

import {
  DESKTOP_LOCAL_CONTROL_HOST,
  DESKTOP_LOCAL_CONTROL_PORT,
  DESKTOP_LOCAL_CONTROL_PROTOCOL,
  mergeDesktopFeishuOAuthScopes,
  normalizeDesktopFeishuRedirectUri,
  resolveDesktopFeishuDocMediaPreviewUrl,
  resolveDesktopFeishuDocWhiteboardPreviewUrl,
  resolveDesktopLocalControlBaseUrl,
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
    expect(resolveDesktopFeishuDocMediaPreviewUrl("img_token")).toBe(
      "http://127.0.0.1:35000/desktop/feishu/docs/media?token=img_token",
    );
    expect(resolveDesktopFeishuDocWhiteboardPreviewUrl("board_token")).toBe(
      "http://127.0.0.1:35000/desktop/feishu/docs/whiteboard?token=board_token",
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

  test("honors the runtime loopback port override when present", () => {
    const previousPort = process.env.MAOMI_DESKTOP_LOCAL_CONTROL_PORT;
    process.env.MAOMI_DESKTOP_LOCAL_CONTROL_PORT = "35142";

    try {
      expect(resolveDesktopLocalControlBaseUrl()).toBe("http://127.0.0.1:35142");
      expect(resolveDesktopFeishuOAuthCallbackUrl()).toBe(
        "http://127.0.0.1:35142/desktop/feishu/oauth/callback",
      );
      expect(
        normalizeDesktopFeishuRedirectUri("http://localhost:39091/desktop/feishu/oauth/callback"),
      ).toBe("http://127.0.0.1:35142/desktop/feishu/oauth/callback");
      expect(
        resolveDesktopFeishuOAuthCallbackOrigin("http://127.0.0.1/desktop/feishu/oauth/callback"),
      ).toBe("http://127.0.0.1:35142");
    } finally {
      if (previousPort === undefined) {
        delete process.env.MAOMI_DESKTOP_LOCAL_CONTROL_PORT;
      } else {
        process.env.MAOMI_DESKTOP_LOCAL_CONTROL_PORT = previousPort;
      }
    }
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
