import { describe, expect, test } from "bun:test";

import {
  shouldRestrictDesktopConversationBuiltinToolsForLatestUserTurn,
} from "../implementation/services/desktop-ai-conversation-runtime";

describe("shouldRestrictDesktopConversationBuiltinToolsForLatestUserTurn", () => {
  test("restricts standalone code example requests", () => {
    expect(shouldRestrictDesktopConversationBuiltinToolsForLatestUserTurn({
      latestUserText: "使用 go 写一个哈希算法代码示例",
    })).toBe(true);
  });

  test("allows explicit project scaffolding requests", () => {
    expect(shouldRestrictDesktopConversationBuiltinToolsForLatestUserTurn({
      latestUserText: "帮我创建一个 Go 项目骨架，并把哈希算法跑起来",
    })).toBe(false);
  });

  test("allows explicit workspace modification requests", () => {
    expect(shouldRestrictDesktopConversationBuiltinToolsForLatestUserTurn({
      latestUserText: "在当前工作区创建一个 go 文件并写入哈希算法实现",
    })).toBe(false);
  });

  test("allows explicit operation requests when attachments are present", () => {
    expect(shouldRestrictDesktopConversationBuiltinToolsForLatestUserTurn({
      latestUserText: "解释一下这个报错",
      hasAttachments: true,
    })).toBe(false);
  });
});