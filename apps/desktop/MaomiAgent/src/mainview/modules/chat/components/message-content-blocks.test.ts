import { describe, expect, test } from "bun:test";
import { marked } from "marked";

import {
  hasConversationMessageUnfencedCodeBlock,
  parseConversationMessageBlocks,
  shouldFallbackToConversationBlockRenderer,
} from "./message-content-model";

describe("parseConversationMessageBlocks", () => {
  test("parses fenced multi-line code blocks after assistant prose", () => {
    const blocks = parseConversationMessageBlocks([
      "Captured the rollout note and completed the desktop chat browser smoke.",
      "",
      "```ts",
      "const deploymentTarget = \"staging\";",
      "const rolloutNote = \"Smoke note captured from browser validation.\";",
      "```",
    ].join("\n"));

    expect(blocks).toEqual([
      {
        kind: "paragraph",
        lines: ["Captured the rollout note and completed the desktop chat browser smoke."],
      },
      {
        kind: "code",
        infoString: "ts",
        code: [
          'const deploymentTarget = "staging";',
          'const rolloutNote = "Smoke note captured from browser validation.";',
        ].join("\n"),
      },
    ]);
  });

  test("parses unfenced go source into a styled code block", () => {
    const blocks = parseConversationMessageBlocks([
      "我来为你写一个 Go 语言的哈希算法代码示例。",
      "",
      "package main",
      "",
      "import (",
      "    \"crypto/sha256\"",
      "    \"fmt\"",
      ")",
      "",
      "func main() {",
      "    hash := sha256.Sum256([]byte(\"hello\"))",
      "    fmt.Printf(\"%x\\n\", hash)",
      "}",
      "",
      "运行结果",
    ].join("\n"));

    expect(blocks).toEqual([
      {
        kind: "paragraph",
        lines: ["我来为你写一个 Go 语言的哈希算法代码示例。"],
      },
      {
        kind: "code",
        infoString: "go",
        code: [
          "package main",
          "",
          "import (",
          "    \"crypto/sha256\"",
          "    \"fmt\"",
          ")",
          "",
          "func main() {",
          "    hash := sha256.Sum256([]byte(\"hello\"))",
          "    fmt.Printf(\"%x\\n\", hash)",
          "}",
        ].join("\n"),
      },
      {
        kind: "paragraph",
        lines: ["运行结果"],
      },
    ]);
  });
});
  test("falls back to block renderer when markdown html misses unfenced code blocks", () => {
    expect(shouldFallbackToConversationBlockRenderer({
      content: [
        "package main",
        "",
        "import (",
        "    \"fmt\"",
        ")",
        "",
        "func main() {",
        "    fmt.Println(\"hi\")",
        "}",
      ].join("\n"),
      htmlString: [
        "<p>package main</p>",
        "<p>import (<br>    &quot;fmt&quot;<br>)</p>",
        "<p>func main() {<br>    fmt.Println(&quot;hi&quot;)<br>}</p>",
      ].join(""),
    })).toBe(true);
  });

test("parses unfenced go source with return types into one highlighted code block", () => {
  const blocks = parseConversationMessageBlocks([
    "以下是几个常用的 Go 哈希算法示例：",
    "",
    "1. MD5（快速，但已不推荐用于安全场景）",
    "",
    "package main",
    "",
    "import (",
    "    \"crypto/md5\"",
    "    \"encoding/hex\"",
    "    \"fmt\"",
    ")",
    "",
    "func md5Hash(data string) string {",
    "    h := md5.New()",
    "    h.Write([]byte(data))",
    "    return hex.EncodeToString(h.Sum(nil))",
    "}",
    "",
    "func main() {",
    "    s := \"hello world\"",
    "    fmt.Println(\"MD5:\", md5Hash(s))",
    "}",
  ].join("\n"));

  expect(blocks).toEqual([
    {
      kind: "paragraph",
      lines: ["以下是几个常用的 Go 哈希算法示例："],
    },
    {
      kind: "ordered-list",
      items: ["MD5（快速，但已不推荐用于安全场景）"],
      start: 1,
    },
    {
      kind: "code",
      infoString: "go",
      code: [
        "package main",
        "",
        "import (",
        "    \"crypto/md5\"",
        "    \"encoding/hex\"",
        "    \"fmt\"",
        ")",
        "",
        "func md5Hash(data string) string {",
        "    h := md5.New()",
        "    h.Write([]byte(data))",
        "    return hex.EncodeToString(h.Sum(nil))",
        "}",
        "",
        "func main() {",
        "    s := \"hello world\"",
        "    fmt.Println(\"MD5:\", md5Hash(s))",
        "}",
      ].join("\n"),
    },
  ]);
});

test("falls back to the block renderer for assistant reply html that misses unfenced go code", () => {
  const content = [
    "package main",
    "",
    "import (",
    "    \"crypto/md5\"",
    "    \"crypto/sha1\"",
    "    \"crypto/sha256\"",
    "    \"fmt\"",
    ")",
    "",
    "func main() {",
    "    data := []byte(\"Hello, World!\")",
    "",
    "    // MD5",
    "    md5Hash := md5.Sum(data)",
    "    fmt.Printf(\"MD5:    %x\\n\", md5Hash)",
    "",
    "    // SHA-1",
    "    sha1Hash := sha1.Sum(data)",
    "    fmt.Printf(\"SHA-1:  %x\\n\", sha1Hash)",
    "}",
    "",
    "输出:",
    "",
    "MD5:    65a8e27d8879283831b664bd8b7f0ad4",
  ].join("\n");

  const htmlString = marked.parse(content, {
    async: false,
    breaks: true,
    gfm: true,
  });

  expect(htmlString.includes("<pre")).toBe(true);
  expect(shouldFallbackToConversationBlockRenderer({
    content,
    htmlString,
  })).toBe(true);
});

test("detects unfenced code blocks for mdx markdown fallback", () => {
  const content = [
    "package main",
    "",
    "import (",
    "    \"fmt\"",
    ")",
    "",
    "func main() {",
    "    fmt.Println(\"hi\")",
    "}",
  ].join("\n");

  expect(hasConversationMessageUnfencedCodeBlock(content)).toBe(true);
});

test("does not flag fenced code blocks for mdx markdown fallback", () => {
  const content = [
    "下面是示例：",
    "",
    "```go",
    "package main",
    "",
    "func main() {",
    "    println(\"hi\")",
    "}",
    "```",
  ].join("\n");

  expect(hasConversationMessageUnfencedCodeBlock(content)).toBe(false);
});
