import { describe, expect, test } from "bun:test";

import {
  resolveWorkspaceAbsolutePath,
  resolveWorkspaceFileContainingDirectory,
} from "./workspace-file-location";

describe("resolveWorkspaceAbsolutePath", () => {
  test("joins a workspace root with a relative path", () => {
    expect(resolveWorkspaceAbsolutePath({
      path: "src/main.ts",
      rootPath: "E:\\workspace\\MaomiAgent",
    })).toBe("E:\\workspace\\MaomiAgent\\src\\main.ts");
  });

  test("keeps absolute paths unchanged", () => {
    expect(resolveWorkspaceAbsolutePath({
      path: "E:\\workspace\\MaomiAgent\\src\\main.ts",
      rootPath: "E:\\workspace\\MaomiAgent",
    })).toBe("E:\\workspace\\MaomiAgent\\src\\main.ts");
  });

  test("resolves dot to the workspace root", () => {
    expect(resolveWorkspaceAbsolutePath({
      path: ".",
      rootPath: "E:\\workspace\\MaomiAgent\\",
    })).toBe("E:\\workspace\\MaomiAgent");
  });
});

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
