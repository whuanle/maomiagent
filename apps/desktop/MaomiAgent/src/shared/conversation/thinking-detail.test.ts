import { describe, expect, test } from "bun:test";

import { resolveDesktopConversationThinkingDetailLevel } from "./thinking-detail";

describe("resolveDesktopConversationThinkingDetailLevel", () => {
  test("keeps plan mode at full detail", () => {
    expect(resolveDesktopConversationThinkingDetailLevel({
      composerMode: "plan",
      selectedAgentId: "concise",
      text: "帮我继续推进",
    })).toBe("full");
  });

  test("downgrades concise and lightweight agents for ordinary requests", () => {
    expect(resolveDesktopConversationThinkingDetailLevel({
      composerMode: "agent",
      selectedAgentId: "concise",
      text: "给我一个正则示例",
    })).toBe("minimal");
  });

  test("keeps normal execution tasks compact by default", () => {
    expect(resolveDesktopConversationThinkingDetailLevel({
      composerMode: "agent",
      selectedAgentId: "auto",
      text: "修复这个聊天页面的回归问题",
    })).toBe("compact");
  });

  test("upgrades detailed analysis asks to full detail even on regular agents", () => {
    expect(resolveDesktopConversationThinkingDetailLevel({
      composerMode: "agent",
      selectedAgentId: "auto",
      text: "分析一下为什么这个恢复流程会卡住，并详细说明思路",
    })).toBe("full");
  });
});
