import { describe, expect, test } from "bun:test";

import { readDesktopFeishuAccessTokenScopes } from "./desktop-feishu-access-token-claims";

function createJwt(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${encoded}.signature`;
}

describe("readDesktopFeishuAccessTokenScopes", () => {
  test("reads the space-delimited scope claim from the JWT payload", () => {
    const token = createJwt({
      scope: "board:whiteboard:node:read docx:document:readonly wiki:node:read",
    });

    expect(readDesktopFeishuAccessTokenScopes(token)).toEqual([
      "board:whiteboard:node:read",
      "docx:document:readonly",
      "wiki:node:read",
    ]);
  });

  test("returns an empty array for malformed tokens", () => {
    expect(readDesktopFeishuAccessTokenScopes("broken")).toEqual([]);
  });
});
