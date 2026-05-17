import { describe, expect, test } from "bun:test";

import { shouldRenderStreamingMarkdown } from "./assistant-streaming";

describe("shouldRenderStreamingMarkdown", () => {
  test("returns true for unfenced multi-line go source", () => {
    expect(shouldRenderStreamingMarkdown([
      "package main",
      "",
      "import (",
      "    \"fmt\"",
      ")",
      "",
      "func main() {",
      "    fmt.Println(\"hi\")",
      "}",
    ].join("\n"))).toBe(true);
  });
});