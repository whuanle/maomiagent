import { describe, expect, test } from "bun:test";

import { resolveWorkspaceFileContainingDirectory } from "./workspace-file-location";

describe("resolveWorkspaceFileContainingDirectory", () => {
  test("resolves the parent directory for a regular Windows file path", () => {
    expect(resolveWorkspaceFileContainingDirectory({
      absolutePath: "E:\\workspace\\MaomiAgent\\docs\\plan.md",
    })).toBe("E:\\workspace\\MaomiAgent\\docs");
  });

  test("falls back to the workspace root when the absolute path is empty", () => {
    expect(resolveWorkspaceFileContainingDirectory({
      absolutePath: "",
      fallbackPath: "E:\\workspace\\MaomiAgent",
    })).toBe("E:\\workspace\\MaomiAgent");
  });

  test("preserves drive roots", () => {
    expect(resolveWorkspaceFileContainingDirectory({
      absolutePath: "E:\\file.txt",
    })).toBe("E:\\");
  });
});
