import { describe, expect, test } from "bun:test";

import {
  renderConversationCodeHighlight,
  resolveConversationCodeHighlightLanguage,
} from "./conversation-code-highlight";

describe("conversation code highlight", () => {
  test("maps go aliases to the registered highlight language", () => {
    expect(resolveConversationCodeHighlightLanguage("go")).toBe("go");
    expect(resolveConversationCodeHighlightLanguage("golang")).toBe("go");
    expect(resolveConversationCodeHighlightLanguage("text")).toBeUndefined();
  });

  test("renders highlight markup for go source", () => {
    const html = renderConversationCodeHighlight({
      code: [
        "package main",
        "",
        "func main() {}",
      ].join("\n"),
      language: "go",
    });

    expect(html).toContain("hljs-keyword");
    expect(html).toContain("hljs-title");
  });
});