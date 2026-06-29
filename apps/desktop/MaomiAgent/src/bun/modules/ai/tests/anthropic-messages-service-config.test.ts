import { describe, expect, test } from "bun:test";

import { buildAnthropicMessagesEndpoint } from "../implementation/anthropic";

describe("anthropic messages service config", () => {
  test("keeps versioned anthropic base urls on the messages endpoint", () => {
    expect(buildAnthropicMessagesEndpoint("https://api.anthropic.com/v1")).toBe(
      "https://api.anthropic.com/v1/messages",
    );
  });

  test("normalizes bigmodel claude-compatible base urls onto v1 messages", () => {
    expect(buildAnthropicMessagesEndpoint("https://open.bigmodel.cn/api/anthropic")).toBe(
      "https://open.bigmodel.cn/api/anthropic/v1/messages",
    );
  });
});
