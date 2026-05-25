import { describe, expect, test } from "bun:test";

import {
  applyConversationFunctionCallPreferenceToTurnRequest,
  applyConversationThinkingPreferenceToServiceConfig,
  mergeConversationExecutionProfile,
  shouldRestrictDesktopConversationBuiltinToolsForLatestUserTurn,
} from "../implementation/services/desktop-ai-conversation-runtime";
import type { AiTurnRequest } from "../kernel-bridge";

describe("applyConversationThinkingPreferenceToServiceConfig", () => {
  test("drops reasoning service config when thinking is disabled", () => {
    expect(applyConversationThinkingPreferenceToServiceConfig({
      executionProfile: {
        id: "profile-1" as never,
        modelId: "gpt-5" as never,
        metadata: {
          thinkingEnabled: false,
        },
      },
      serviceConfig: {
        apiKey: "test-key",
        reasoning: {
          effort: "medium",
        },
      },
    })).toEqual({
      apiKey: "test-key",
    });
  });
});

function createTurnRequestWithTools(): AiTurnRequest {
  return {
    executionProfile: {
      id: "profile-1" as AiTurnRequest["executionProfile"]["id"],
      modelId: "mimo-v2.5-pro",
      metadata: {
        supportsFunctionCall: false,
      },
    },
    prompt: {
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      runId: "run-1" as AiTurnRequest["prompt"]["runId"],
      turnId: "turn-1" as AiTurnRequest["prompt"]["turnId"],
      agentId: "assistant.default",
      systemBlocks: [],
      contextBlocks: [],
      messages: [],
      tools: [{
        name: "wechat_send_media_file",
        description: "Send a media file to WeChat.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      }],
      outputMode: {
        kind: "text",
      },
    },
    settings: {
      toolChoice: "auto",
    },
  };
}

describe("applyConversationFunctionCallPreferenceToTurnRequest", () => {
  test("drops tools and disables tool choice when function call is unsupported", () => {
    const request = createTurnRequestWithTools();

    expect(applyConversationFunctionCallPreferenceToTurnRequest({
      executionProfile: request.executionProfile,
      request,
    })).toMatchObject({
      prompt: {
        tools: [],
      },
      settings: {
        toolChoice: "none",
      },
    });
  });

  test("keeps turn request unchanged when function call support is available", () => {
    const request = createTurnRequestWithTools();
    request.executionProfile.metadata = {};

    expect(applyConversationFunctionCallPreferenceToTurnRequest({
      executionProfile: request.executionProfile,
      request,
    })).toBe(request);
  });

  test("drops historical tool call traces when function call is unsupported", () => {
    const request = createTurnRequestWithTools();
    request.prompt.messages = [{
      message: {
        id: "message-assistant-1" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
        sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
        role: "assistant",
        createdAt: 1,
      },
      parts: [{
        id: "message-assistant-1-tool-call" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
        type: "tool_call_ref",
        toolCallId: "tool-call-1" as never,
        toolName: "wechat_send_media_file",
        input: {
          path: "C:\\Users\\ASUS\\Desktop\\screenshot.png",
        },
      }],
    }, {
      message: {
        id: "message-tool-1" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
        sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
        role: "tool",
        createdAt: 2,
      },
      parts: [{
        id: "message-tool-1-result" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
        type: "tool_result_ref",
        toolCallId: "tool-call-1" as never,
        toolName: "wechat_send_media_file",
        output: {
          status: "sent",
        },
      }],
    }, {
      message: {
        id: "message-user-1" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
        sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
        role: "user",
        createdAt: 3,
      },
      parts: [{
        id: "message-user-1-text" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
        type: "text",
        text: "1+1=",
      }],
    }];

    expect(applyConversationFunctionCallPreferenceToTurnRequest({
      executionProfile: request.executionProfile,
      request,
    }).prompt.messages).toEqual([{
      message: {
        id: "message-user-1",
        sessionId: "session-1",
        role: "user",
        createdAt: 3,
      },
      parts: [{
        id: "message-user-1-text",
        type: "text",
        text: "1+1=",
      }],
    }]);
  });
});

describe("mergeConversationExecutionProfile", () => {
  test("hydrates capability metadata from the materialized execution profile", () => {
    expect(mergeConversationExecutionProfile({
      requestedExecutionProfile: {
        id: "profile-requested" as AiTurnRequest["executionProfile"]["id"],
        modelId: "mimo-v2.5-pro",
        metadata: {
          channelId: "xiaomi",
          thinkingEnabled: true,
        },
      },
      materializedExecutionProfile: {
        id: "profile-materialized" as AiTurnRequest["executionProfile"]["id"],
        modelId: "mimo-v2.5-pro",
        metadata: {
          channelId: "xiaomi",
          supportsFunctionCall: false,
          contextWindow: 65536,
        },
      },
    })).toEqual({
      id: "profile-materialized",
      modelId: "mimo-v2.5-pro",
      metadata: {
        channelId: "xiaomi",
        thinkingEnabled: true,
        supportsFunctionCall: false,
        contextWindow: 65536,
      },
    });
  });
});

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
