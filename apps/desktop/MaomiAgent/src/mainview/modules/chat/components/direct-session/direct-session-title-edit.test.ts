import { describe, expect, test } from "bun:test";

import { resolveSessionTitleRenameInput } from "./direct-session-title-edit";

describe("resolveSessionTitleRenameInput", () => {
  test("returns a trimmed title when the user changes it", () => {
    expect(resolveSessionTitleRenameInput("New conversation", "  排查 MCP 会话标题  ")).toBe("排查 MCP 会话标题");
  });

  test("returns undefined for empty drafts", () => {
    expect(resolveSessionTitleRenameInput("New conversation", "   ")).toBeUndefined();
  });

  test("returns undefined when the trimmed title is unchanged", () => {
    expect(resolveSessionTitleRenameInput("已有标题", "  已有标题 ")).toBeUndefined();
  });
});
