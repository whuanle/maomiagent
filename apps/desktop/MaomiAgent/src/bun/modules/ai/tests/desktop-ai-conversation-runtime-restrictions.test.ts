import { describe, expect, test } from "bun:test";

import {
  applyConversationFunctionCallPreferenceToTurnRequest,
  applyConversationHistoryPruningToTurnRequest,
  applyConversationReasoningHistoryNormalization,
  applyConversationToolHistoryConsistencyRepairToTurnRequest,
  applySessionHistoryCompactionToTurnRequest,
  normalizeProviderFacingTurnRequest,
} from "../implementation/shared/turn-request-normalizers";
import {
  applyConversationTimeoutToServiceConfig,
  applyConversationThinkingPreferenceToServiceConfig,
  buildDesktopConversationContinuationPolicyBlock,
  buildConversationProviderRetryPolicy,
  mergeConversationExecutionProfile,
  promptContainsFeishuDocContext,
  resolveConversationTurnAgentId,
  resolveConversationTurnNoActivityTimeoutMs,
  shouldRestrictDesktopConversationBuiltinToolsForLatestUserTurn,
} from "../implementation/services/desktop-ai-conversation-runtime";
import type { AiTurnRequest } from "../kernel-bridge";
import { FEISHU_DOC_WRITER_AGENT_ID } from "../../../../shared/conversation/managed-execution";

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

  test("drops reasoning service config for chat completions runtimes even when thinking stays enabled", () => {
    expect(applyConversationThinkingPreferenceToServiceConfig({
      executionProfile: {
        id: "profile-chat-completions" as never,
        modelId: "kimi-k2.5" as never,
        metadata: {
          thinkingEnabled: true,
          apiStyle: "chat-completions",
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

function createTurnRequestWithHeavyToolHistory(input: {
  supportsFunctionCall: boolean;
  interleaved?: boolean | {
    field?: string;
  };
}): AiTurnRequest {
  const request = createTurnRequestWithTools();
  request.executionProfile.metadata = {
    supportsFunctionCall: input.supportsFunctionCall,
    ...(input.interleaved !== undefined ? { interleaved: input.interleaved } : {}),
  };
  request.prompt.messages = [{
    message: {
      id: "message-user-older" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      role: "user",
      createdAt: 1,
    },
    parts: [{
      id: "message-user-older-text" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "text",
      text: "Draft a plan for the rewrite.",
    }],
  }, {
    message: {
      id: "message-assistant-older-tool-call" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      role: "assistant",
      createdAt: 2,
    },
    parts: [{
      id: "message-assistant-older-tool-call-part" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "tool_call_ref",
      toolCallId: "tool-call-older" as never,
      toolName: "workspace_write_file",
      input: {
        path: "drafts/old-plan.md",
      },
    }],
  }, {
    message: {
      id: "message-tool-older" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      role: "tool",
      createdAt: 3,
    },
    parts: [{
      id: "message-tool-older-result" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "tool_result_ref",
      toolCallId: "tool-call-older" as never,
      toolName: "workspace_write_file",
      output: {
        path: "drafts/old-plan.md",
      },
    }, {
      id: "message-tool-older-text" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "text",
      text: "A".repeat(24_000),
    }],
  }, {
    message: {
      id: "message-user-recent-1" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      role: "user",
      createdAt: 4,
    },
    parts: [{
      id: "message-user-recent-1-text" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "text",
      text: "Keep the tone sharper.",
    }],
  }, {
    message: {
      id: "message-assistant-recent-tool-call" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      role: "assistant",
      createdAt: 5,
    },
    parts: [{
      id: "message-assistant-recent-tool-call-part" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "tool_call_ref",
      toolCallId: "tool-call-recent" as never,
      toolName: "workspace_write_file",
      input: {
        path: "drafts/current-plan.md",
      },
    }],
  }, {
    message: {
      id: "message-tool-recent" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      role: "tool",
      createdAt: 6,
    },
    parts: [{
      id: "message-tool-recent-result" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "tool_result_ref",
      toolCallId: "tool-call-recent" as never,
      toolName: "workspace_write_file",
      output: {
        path: "drafts/current-plan.md",
      },
    }, {
      id: "message-tool-recent-text" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "text",
      text: "B".repeat(4_000),
    }],
  }, {
    message: {
      id: "message-user-latest" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      role: "user",
      createdAt: 7,
    },
    parts: [{
      id: "message-user-latest-text" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "text",
      text: "Now answer directly.",
    }],
  }];

  return request;
}

function createTurnRequestWithSessionCompactionHistory(): AiTurnRequest {
  const request = createTurnRequestWithTools();
  request.executionProfile.metadata = {
    supportsFunctionCall: true,
    interleaved: {
      field: "reasoning_content",
    },
  };
  request.prompt.messages = [{
    message: {
      id: "message-user-initial" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      role: "user",
      createdAt: 1,
    },
    parts: [{
      id: "message-user-initial-text" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "text",
      text: "请生成业务财务一体化文档",
    }],
  }, {
    message: {
      id: "message-assistant-initial" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      role: "assistant",
      createdAt: 2,
    },
    parts: [{
      id: "message-assistant-initial-reasoning" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "reasoning",
      text: "r".repeat(10_000),
    }, {
      id: "message-assistant-initial-tool-call" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "tool_call_ref",
      toolCallId: "tool-call-initial" as never,
      toolName: "workspace_write_file",
      input: {
        path: "drafts/session-summary.md",
        content: "x".repeat(20_000),
      },
    }],
  }, {
    message: {
      id: "message-tool-initial" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      role: "tool",
      createdAt: 3,
    },
    parts: [{
      id: "message-tool-initial-result" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "tool_result_ref",
      toolCallId: "tool-call-initial" as never,
      toolName: "workspace_write_file",
      output: {
        path: "drafts/session-summary.md",
      },
    }, {
      id: "message-tool-initial-text" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "text",
      text: "已写入 1429 行 Markdown",
    }],
  }, {
    message: {
      id: "message-user-recent" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      role: "user",
      createdAt: 4,
    },
    parts: [{
      id: "message-user-recent-text" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "text",
      text: "改成飞书格式",
    }],
  }, {
    message: {
      id: "message-assistant-recent" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      role: "assistant",
      createdAt: 5,
    },
    parts: [{
      id: "message-assistant-recent-text" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "text",
      text: "我会重新整理标题和列表格式。",
    }],
  }, {
    message: {
      id: "message-user-latest" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      role: "user",
      createdAt: 6,
    },
    parts: [{
      id: "message-user-latest-text" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "text",
      text: "保留所有飞书原生块",
    }],
  }];
  return request;
}

function createTurnRequestWithDanglingToolHistory(): AiTurnRequest {
  const request = createTurnRequestWithTools();
  request.executionProfile.metadata = {
    supportsFunctionCall: true,
    interleaved: {
      field: "reasoning_content",
    },
  };
  request.prompt.messages = [{
    message: {
      id: "message-user-dangling" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      role: "user",
      createdAt: 1,
    },
    parts: [{
      id: "message-user-dangling-text" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "text",
      text: "继续写好",
    }],
  }, {
    message: {
      id: "message-assistant-dangling" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      role: "assistant",
      createdAt: 2,
    },
    parts: [{
      id: "message-assistant-dangling-reasoning" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "reasoning",
      text: "",
    }, {
      id: "message-assistant-dangling-tool-call" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "tool_call_ref",
      toolCallId: "workspace_write_file:11" as never,
      toolName: "workspace_write_file",
      input: {
        path: "drafts/bad.md",
      },
    }],
  }, {
    message: {
      id: "message-user-latest-dangling" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      role: "user",
      createdAt: 3,
    },
    parts: [{
      id: "message-user-latest-dangling-text" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
      type: "text",
      text: "把结论直接给我",
    }],
  }];
  return request;
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

describe("applyConversationHistoryPruningToTurnRequest", () => {
  test("replaces older heavy tool outputs while keeping the recent two user turns intact", () => {
    const request = createTurnRequestWithHeavyToolHistory({
      supportsFunctionCall: true,
    });

    const pruned = applyConversationHistoryPruningToTurnRequest({
      request,
    });

    expect(pruned).not.toBe(request);
    expect(pruned.prompt.messages[2]?.parts).toEqual([{
      id: "message-tool-older-result",
      type: "tool_result_ref",
      toolCallId: "tool-call-older",
      toolName: "workspace_write_file",
      output: {
        path: "drafts/old-plan.md",
      },
    }, {
      id: "message-tool-older-text",
      type: "text",
      text: "[Earlier tool result omitted to keep the next reply responsive.]",
    }]);
    expect(pruned.prompt.messages[5]?.parts).toEqual(request.prompt.messages[5]?.parts);
  });
});

describe("normalizeProviderFacingTurnRequest", () => {
  test("adds empty reasoning parts before assistant tool call history when missing", () => {
    const request = createTurnRequestWithHeavyToolHistory({
      supportsFunctionCall: true,
      interleaved: {
        field: "reasoning_content",
      },
    });

    const normalized = applyConversationReasoningHistoryNormalization({
      executionProfile: request.executionProfile,
      request,
    });

    expect(normalized.prompt.messages[1]?.parts[0]).toEqual({
      id: "message-assistant-older-tool-call:synthetic-reasoning",
      type: "reasoning",
      text: "",
    });
    expect(normalized.prompt.messages[4]?.parts[0]).toEqual({
      id: "message-assistant-recent-tool-call:synthetic-reasoning",
      type: "reasoning",
      text: "",
    });
  });

  test("strips unsupported tool history before sending provider-facing requests", () => {
    const request = createTurnRequestWithHeavyToolHistory({
      supportsFunctionCall: false,
      interleaved: {
        field: "reasoning_content",
      },
    });

    const normalized = normalizeProviderFacingTurnRequest({
      executionProfile: request.executionProfile,
      request,
    });

    expect(normalized.settings.toolChoice).toBe("none");
    expect(normalized.prompt.tools).toEqual([]);
    expect(normalized.prompt.messages.some((message) => message.message.role === "tool")).toBe(false);
    expect(normalized.prompt.messages.some((message) =>
      message.parts.some((part) => part.type === "tool_call_ref" || part.type === "tool_result_ref")
    )).toBe(false);
  });

  test("keeps pruning enabled for providers that still support function calling", () => {
    const request = createTurnRequestWithHeavyToolHistory({
      supportsFunctionCall: true,
      interleaved: {
        field: "reasoning_content",
      },
    });

    const normalized = normalizeProviderFacingTurnRequest({
      executionProfile: request.executionProfile,
      request,
    });

    expect(normalized.prompt.contextBlocks.some((block) => block.id === "session-history-summary")).toBe(true);
    expect(normalized.prompt.messages[2]?.parts[0]).toEqual({
      id: "message-tool-recent-result",
      type: "tool_result_ref",
      toolCallId: "tool-call-recent",
      toolName: "workspace_write_file",
      output: {
        path: "drafts/current-plan.md",
      },
    });
    expect(normalized.prompt.messages[1]?.parts[0]).toEqual({
      id: "message-assistant-recent-tool-call:synthetic-reasoning",
      type: "reasoning",
      text: "",
    });
  });

  test("skips synthetic reasoning history for non-interleaved providers", () => {
    const request = createTurnRequestWithHeavyToolHistory({
      supportsFunctionCall: true,
    });

    const normalized = normalizeProviderFacingTurnRequest({
      executionProfile: request.executionProfile,
      request,
    });

    expect(normalized.prompt.messages[1]?.parts[0]).toEqual({
      id: "message-assistant-recent-tool-call-part",
      type: "tool_call_ref",
      toolCallId: "tool-call-recent",
      toolName: "workspace_write_file",
      input: {
        path: "drafts/current-plan.md",
      },
    });
  });

  test("adds synthetic reasoning history for anthropic messages thinking turns even without interleaved metadata", () => {
    const request = createTurnRequestWithHeavyToolHistory({
      supportsFunctionCall: true,
    });
    request.executionProfile = {
      ...request.executionProfile,
      metadata: {
        ...(request.executionProfile.metadata ?? {}),
        protocolFamily: "anthropic",
        apiStyle: "messages",
        supportsReasoning: true,
        thinkingEnabled: true,
      },
    };

    const normalized = normalizeProviderFacingTurnRequest({
      executionProfile: request.executionProfile,
      request,
    });

    expect(normalized.prompt.messages[1]?.parts[0]).toEqual({
      id: "message-assistant-recent-tool-call:synthetic-reasoning",
      type: "reasoning",
      text: "",
    });
  });

  test("injects session summary into context blocks when heavy history exceeds the threshold", () => {
    const request = createTurnRequestWithSessionCompactionHistory();

    const normalized = applySessionHistoryCompactionToTurnRequest({
      request,
    });

    const summaryBlock = normalized.prompt.contextBlocks.find((block) => block.id === "session-history-summary");

    expect(summaryBlock?.content).toContain("Session Summary");
    expect(summaryBlock?.content).toContain("Tail preserved: last 2 user turns.");
    expect(summaryBlock?.content).toContain("Older raw messages omitted from the provider-facing prompt: 3.");
    expect(normalized.prompt.messages.map((message) => message.message.id)).toEqual([
      "message-user-recent",
      "message-assistant-recent",
      "message-user-latest",
    ]);
  });

  test("keeps existing raw history when the conversation is still small", () => {
    const request = createTurnRequestWithTools();

    const normalized = applySessionHistoryCompactionToTurnRequest({
      request,
    });

    expect(normalized.prompt.contextBlocks).toEqual(request.prompt.contextBlocks);
    expect(normalized.prompt.messages).toEqual(request.prompt.messages);
  });

  test("drops dangling assistant tool history without matching tool result messages", () => {
    const request = createTurnRequestWithDanglingToolHistory();

    const repaired = applyConversationToolHistoryConsistencyRepairToTurnRequest({
      request,
    });

    expect(repaired.prompt.messages.map((message) => message.message.id)).toEqual([
      "message-user-dangling",
      "message-user-latest-dangling",
    ]);
  });

  test("normalization removes dangling tool history before provider-facing encoding", () => {
    const request = createTurnRequestWithDanglingToolHistory();

    const normalized = normalizeProviderFacingTurnRequest({
      executionProfile: request.executionProfile,
      request,
    });

    expect(normalized.prompt.messages.some((message) =>
      message.parts.some((part) => part.type === "tool_call_ref" && part.toolCallId === "workspace_write_file:11")
    )).toBe(false);
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
          supportsReasoning: true,
          supportsFunctionCall: false,
          interleaved: {
            field: "reasoning_content",
          },
          contextWindow: 65536,
        },
      },
    })).toEqual({
      id: "profile-materialized",
      modelId: "mimo-v2.5-pro",
      metadata: {
        channelId: "xiaomi",
        thinkingEnabled: true,
        supportsReasoning: true,
        supportsFunctionCall: false,
        interleaved: {
          field: "reasoning_content",
        },
        contextWindow: 65536,
      },
    });
  });
});

describe("resolveConversationTurnNoActivityTimeoutMs", () => {
  test("raises the timeout for the feishu doc writer agent even on a small prompt", () => {
    expect(resolveConversationTurnNoActivityTimeoutMs({
      baseTimeoutMs: 180_000,
      estimatedPromptTokens: 1_000,
      agentId: FEISHU_DOC_WRITER_AGENT_ID,
    })).toBe(420_000);
  });

  test("raises the timeout for feishu doc context even when the agent id stays generic", () => {
    expect(resolveConversationTurnNoActivityTimeoutMs({
      baseTimeoutMs: 180_000,
      estimatedPromptTokens: 1_000,
      agentId: "concise",
      hasFeishuDocContext: true,
    })).toBe(420_000);
  });

  test("keeps the base timeout for small prompts", () => {
    expect(resolveConversationTurnNoActivityTimeoutMs({
      baseTimeoutMs: 180_000,
      estimatedPromptTokens: 1_000,
    })).toBe(180_000);
  });

  test("raises the timeout for medium prompts", () => {
    expect(resolveConversationTurnNoActivityTimeoutMs({
      baseTimeoutMs: 180_000,
      estimatedPromptTokens: 7_000,
    })).toBe(180_000);
  });

  test("raises the timeout for large prompts", () => {
    expect(resolveConversationTurnNoActivityTimeoutMs({
      baseTimeoutMs: 180_000,
      estimatedPromptTokens: 15_000,
    })).toBe(240_000);
  });

  test("raises the timeout for extra large prompts", () => {
    expect(resolveConversationTurnNoActivityTimeoutMs({
      baseTimeoutMs: 180_000,
      estimatedPromptTokens: 25_000,
    })).toBe(300_000);
  });

  test("preserves a custom base timeout when it already exceeds the selected bucket", () => {
    expect(resolveConversationTurnNoActivityTimeoutMs({
      baseTimeoutMs: 360_000,
      estimatedPromptTokens: 25_000,
    })).toBe(360_000);
  });
});

describe("resolveConversationTurnAgentId", () => {
  test("prefers the desktop agent system block over the prompt agent id", () => {
    expect(resolveConversationTurnAgentId({
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      runId: "run-1" as AiTurnRequest["prompt"]["runId"],
      turnId: "turn-1" as AiTurnRequest["prompt"]["turnId"],
      agentId: "desktop.primary",
      systemBlocks: [{
        id: "desktop-agent-prompt:feishu" as never,
        kind: "instruction",
        content: "feishu prompt",
        priority: 100,
        metadata: {
          source: "desktop.agent",
          agentId: FEISHU_DOC_WRITER_AGENT_ID,
        },
      }],
      contextBlocks: [],
      messages: [],
      tools: [],
      outputMode: {
        kind: "text",
      },
    })).toBe(FEISHU_DOC_WRITER_AGENT_ID);
  });

  test("falls back to the prompt agent id when no desktop agent block exists", () => {
    expect(resolveConversationTurnAgentId({
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      runId: "run-1" as AiTurnRequest["prompt"]["runId"],
      turnId: "turn-1" as AiTurnRequest["prompt"]["turnId"],
      agentId: FEISHU_DOC_WRITER_AGENT_ID,
      systemBlocks: [],
      contextBlocks: [],
      messages: [],
      tools: [],
      outputMode: {
        kind: "text",
      },
    })).toBe(FEISHU_DOC_WRITER_AGENT_ID);
  });
});

describe("promptContainsFeishuDocContext", () => {
  test("detects the injected feishu doc context block", () => {
    expect(promptContainsFeishuDocContext({
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      runId: "run-1" as AiTurnRequest["prompt"]["runId"],
      turnId: "turn-1" as AiTurnRequest["prompt"]["turnId"],
      agentId: "concise",
      systemBlocks: [{
        id: "feishu-doc-contract" as never,
        kind: "instruction",
        content: "<feishu_doc_context>\noriginal_markdown_path: .maomi/feishu-docs/original.md",
        priority: 100,
      }],
      contextBlocks: [],
      messages: [],
      tools: [],
      outputMode: {
        kind: "text",
      },
    })).toBe(true);
  });

  test("detects feishu doc paths in message history", () => {
    expect(promptContainsFeishuDocContext({
      sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
      runId: "run-1" as AiTurnRequest["prompt"]["runId"],
      turnId: "turn-1" as AiTurnRequest["prompt"]["turnId"],
      agentId: "concise",
      systemBlocks: [],
      contextBlocks: [],
      messages: [{
        message: {
          id: "message-1" as AiTurnRequest["prompt"]["messages"][number]["message"]["id"],
          sessionId: "session-1" as AiTurnRequest["prompt"]["sessionId"],
          role: "tool",
          createdAt: 1,
        },
        parts: [{
          id: "message-1-text" as AiTurnRequest["prompt"]["messages"][number]["parts"][number]["id"],
          type: "text",
          text: "{\"path\": \".maomi/feishu-docs/drafts/doc.draft.md\"}",
        }],
      }],
      tools: [],
      outputMode: {
        kind: "text",
      },
    })).toBe(true);
  });
});

describe("buildConversationProviderRetryPolicy", () => {
  test("returns the transport retry policy used for provider adapters", () => {
    expect(buildConversationProviderRetryPolicy()).toEqual({
      maxAttempts: 5,
      baseDelayMs: 1_000,
      maxDelayMs: 15_000,
      jitterRatio: 0.2,
    });
  });
});

describe("applyConversationTimeoutToServiceConfig", () => {
  test("injects the selected turn timeout when the provider config has none", () => {
    expect(applyConversationTimeoutToServiceConfig({
      serviceConfig: {
        apiKey: "test-key",
      },
      timeoutMs: 240_000,
    })).toEqual({
      apiKey: "test-key",
      timeoutMs: 240_000,
    });
  });

  test("keeps the larger provider timeout override", () => {
    expect(applyConversationTimeoutToServiceConfig({
      serviceConfig: {
        apiKey: "test-key",
        timeoutMs: 300_000,
      },
      timeoutMs: 240_000,
    })).toEqual({
      apiKey: "test-key",
      timeoutMs: 300_000,
    });
  });

  test("raises a smaller provider timeout to match the turn timeout", () => {
    expect(applyConversationTimeoutToServiceConfig({
      serviceConfig: {
        apiKey: "test-key",
        timeoutMs: 45_000,
      },
      timeoutMs: 240_000,
    })).toEqual({
      apiKey: "test-key",
      timeoutMs: 240_000,
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

describe("buildDesktopConversationContinuationPolicyBlock", () => {
  test("adds a hard fact block for tool-result continuation turns", () => {
    expect(buildDesktopConversationContinuationPolicyBlock({
      run: {
        trigger: {
          kind: "tool_result",
        },
      },
      visibleMessages: [{
        message: {
          id: "message-user-latest" as never,
          sessionId: "session-1" as never,
          role: "user",
          createdAt: 1,
        },
        parts: [{
          id: "message-user-latest-text" as never,
          type: "text",
          text: "继续完善 design-spec.md，并补上页面结构。",
        }],
      }],
    })).toContain("There is no new user message attached to this run.");
  });

  test("grounds continuation turns in the latest confirmed user message", () => {
    const block = buildDesktopConversationContinuationPolicyBlock({
      run: {
        trigger: {
          kind: "system_continue",
        },
      },
      visibleMessages: [{
        message: {
          id: "message-user-latest" as never,
          sessionId: "session-1" as never,
          role: "user",
          createdAt: 1,
        },
        parts: [{
          id: "message-user-latest-text" as never,
          type: "text",
          text: "继续完善 design-spec.md，并补上页面结构。",
        }],
      }],
    });

    expect(block).toContain("Latest confirmed user message id: message-user-latest.");
    expect(block).toContain("Latest confirmed user message preview: 继续完善 design-spec.md，并补上页面结构。");
    expect(block).toContain("Do not claim that the user said something, said nothing, changed goals, or asked a new question in this turn unless a visible user message explicitly shows it.");
  });

  test("skips the continuation fact block for fresh user-message turns", () => {
    expect(buildDesktopConversationContinuationPolicyBlock({
      run: {
        trigger: {
          kind: "user_message",
          refId: "message-user-latest",
        },
      },
      visibleMessages: [],
    })).toBeUndefined();
  });
});
