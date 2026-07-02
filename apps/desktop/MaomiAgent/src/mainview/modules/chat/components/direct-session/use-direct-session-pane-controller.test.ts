import { describe, expect, test } from "bun:test";

import type { ChatSelectedSessionView } from "../../types";
import {
  resolveComposerTokenBudgetUsage,
  resolveContextCompressionStatus,
} from "./direct-session-context-budget";

function createDetail(overrides: Partial<NonNullable<ChatSelectedSessionView["detail"]>> = {}) {
  return {
    sessionId: "session-1",
    workspaceId: "workspace-1",
    title: "Session",
    status: "active",
    createdAt: "2026-05-08T00:00:00.000Z",
    updatedAt: "2026-05-08T00:00:00.000Z",
    runs: [],
    messages: [],
    toolCalls: [],
    interactions: [],
    pendingInteractions: [],
    checkpoints: [],
    timeline: [],
    ...overrides,
  } as NonNullable<ChatSelectedSessionView["detail"]>;
}

describe("direct session pane controller helpers", () => {
  test("prefers current context budget over latest run token usage", () => {
    const detail = createDetail({
      currentContextBudget: {
        runId: "run-1",
        modelId: "moonshot-v1-8k",
        channelId: "kimi",
        estimatedPromptTokens: 40960,
        tokenSource: "actual_usage",
        contextWindowTokens: 128000,
        compressionThresholdPercent: 30,
        compressionThresholdTokens: 38400,
        promptUsagePercent: 32,
        thresholdUsagePercent: 107,
        shouldAutoCompress: true,
        breakdown: {
          systemTokens: 100,
          contextTokens: 200,
          messageTokens: 40660,
          toolTokens: 0,
          outputSchemaTokens: 0,
        },
      },
      latestTokenUsage: {
        runId: "run-0",
        totalTokens: 1200,
        inputTokens: 1000,
        outputTokens: 200,
        turnCount: 1,
      },
    });

    const usage = resolveComposerTokenBudgetUsage({
      detail,
      selectedModel: {
        value: "kimi/moonshot-v1-8k",
        label: "Moonshot",
        channelId: "kimi",
        modelId: "moonshot-v1-8k",
        providerType: "openai",
        contextWindow: 128000,
        searchText: "Moonshot moonshot-v1-8k",
      },
      language: "zh-CN",
    });

    expect(usage).toEqual(expect.objectContaining({
      usedTokens: 40960,
      limitTokens: 128000,
      percent: 32,
      thresholdUsagePercent: 100,
      status: "critical",
      thresholdPercent: 30,
      thresholdLabel: "达到 30% 自动压缩",
      detailLabel: "上下文使用：40,960 / 128,000 tokens（32%）\n达到 30% 自动压缩\n阈值使用：100%\n基于模型实际输入 token 统计\n统计范围：当前轮 provider 请求内容",
    }));
  });

  test("uses the current context budget even before the selected model is ready", () => {
    const detail = createDetail({
      currentContextBudget: {
        runId: "run-1",
        modelId: "moonshot-v1-8k",
        channelId: "kimi",
        estimatedPromptTokens: 40960,
        tokenSource: "actual_usage",
        contextWindowTokens: 128000,
        compressionThresholdPercent: 30,
        compressionThresholdTokens: 38400,
        promptUsagePercent: 32,
        thresholdUsagePercent: 107,
        shouldAutoCompress: true,
        breakdown: {
          systemTokens: 100,
          contextTokens: 200,
          messageTokens: 40660,
          toolTokens: 0,
          outputSchemaTokens: 0,
        },
      },
      latestTokenUsage: {
        runId: "run-0",
        totalTokens: 1200,
        inputTokens: 1000,
        outputTokens: 200,
        turnCount: 1,
      },
    });

    const usage = resolveComposerTokenBudgetUsage({
      detail,
      selectedModel: undefined,
      language: "zh-CN",
    });

    expect(usage).toEqual(expect.objectContaining({
      usedTokens: 40960,
      limitTokens: 128000,
      percent: 32,
      thresholdUsagePercent: 100,
      status: "critical",
    }));
  });

  test("keeps token usage after switching to a different selected model", () => {
    const detail = createDetail({
      currentContextBudget: {
        runId: "run-1",
        modelId: "moonshot-v1-8k",
        channelId: "kimi",
        estimatedPromptTokens: 40960,
        tokenSource: "actual_usage",
        contextWindowTokens: 128000,
        compressionThresholdPercent: 30,
        compressionThresholdTokens: 38400,
        promptUsagePercent: 32,
        thresholdUsagePercent: 107,
        shouldAutoCompress: true,
        breakdown: {
          systemTokens: 100,
          contextTokens: 200,
          messageTokens: 40660,
          toolTokens: 0,
          outputSchemaTokens: 0,
        },
      },
      latestTokenUsage: {
        runId: "run-0",
        modelId: "moonshot-v1-8k",
        channelId: "kimi",
        totalTokens: 1200,
        inputTokens: 1000,
        outputTokens: 200,
        turnCount: 1,
      },
    });

    const usage = resolveComposerTokenBudgetUsage({
      detail,
      selectedModel: {
        value: "openai/gpt-5-mini",
        label: "GPT-5 mini",
        channelId: "openai",
        modelId: "gpt-5-mini",
        providerType: "openai",
        contextWindow: 200000,
        searchText: "GPT-5 mini gpt-5-mini",
      },
      language: "zh-CN",
    });

    expect(usage).toEqual(expect.objectContaining({
      usedTokens: 40960,
      limitTokens: 200000,
      percent: 20,
      status: "critical",
      detailLabel: "上下文使用：40,960 / 200,000 tokens（20%）\n达到 30% 自动压缩\n阈值使用：100%\n基于模型实际输入 token 统计\n统计范围：当前轮 provider 请求内容",
    }));
  });

  test("caps usage and threshold percentages at 100 when token counts overflow", () => {
    const usage = resolveComposerTokenBudgetUsage({
      detail: createDetail({
        currentContextBudget: {
          runId: "run-over-budget",
          modelId: "gpt-5-mini",
          channelId: "openai",
          estimatedPromptTokens: 4_590_681,
          tokenSource: "actual_usage",
          contextWindowTokens: 200_000,
          compressionThresholdPercent: 80,
          compressionThresholdTokens: 160_000,
          promptUsagePercent: 100,
          thresholdUsagePercent: 100,
          shouldAutoCompress: true,
          breakdown: {
            systemTokens: 200,
            contextTokens: 3_000,
            messageTokens: 4_587_481,
            toolTokens: 0,
            outputSchemaTokens: 0,
          },
        },
      }),
      selectedModel: {
        value: "openai/gpt-5-mini",
        label: "GPT-5 mini",
        channelId: "openai",
        modelId: "gpt-5-mini",
        providerType: "openai",
        contextWindow: 200000,
        searchText: "GPT-5 mini gpt-5-mini",
      },
      language: "zh-CN",
    });

    expect(usage).toEqual(expect.objectContaining({
      usedTokens: 4_590_681,
      limitTokens: 200_000,
      percent: 100,
      thresholdUsagePercent: 100,
      status: "critical",
      detailLabel: "上下文使用：4,590,681 / 200,000 tokens（100%）\n达到 80% 自动压缩\n阈值使用：100%\n已超出 4,390,681 tokens（窗口 22.95x）\n基于模型实际输入 token 统计\n统计范围：当前轮 provider 请求内容",
    }));
  });

  test("adds reasoning-excluded note when budget metadata opts in", () => {
    const usage = resolveComposerTokenBudgetUsage({
      detail: createDetail({
        currentContextBudget: {
          runId: "run-reasoning-excluded",
          estimatedPromptTokens: 1500,
          tokenSource: "estimated_envelope",
          reasoningExcluded: true,
          contextWindowTokens: 8000,
          shouldAutoCompress: false,
          breakdown: {
            systemTokens: 100,
            contextTokens: 200,
            messageTokens: 1200,
            toolTokens: 0,
            outputSchemaTokens: 0,
          },
        },
      }),
      selectedModel: {
        value: "openai/gpt-5-mini",
        label: "GPT-5 mini",
        channelId: "openai",
        modelId: "gpt-5-mini",
        providerType: "openai",
        contextWindow: 8000,
        searchText: "GPT-5 mini gpt-5-mini",
      },
      language: "zh-CN",
    });

    expect(usage?.detailLabel).toContain("统计已排除思维/系统注入/工具轨迹");
  });

  test("uses context budget estimate for usage display instead of selective user-only estimate", () => {
    const usage = resolveComposerTokenBudgetUsage({
      detail: createDetail({
        messages: [
          {
            messageId: "msg-user",
            sessionId: "session-1",
            role: "user",
            createdAt: 1,
            parts: [{ type: "text", partId: "part-user", text: "hello world" }],
          } as never,
          {
            messageId: "msg-assistant",
            sessionId: "session-1",
            role: "assistant",
            createdAt: 2,
            parts: [{ type: "text", partId: "part-assistant", text: "ok" }],
          } as never,
        ],
        currentContextBudget: {
          runId: "run-core-text",
          estimatedPromptTokens: 5000,
          tokenSource: "estimated_envelope",
          reasoningExcluded: true,
          contextWindowTokens: 100,
          shouldAutoCompress: false,
          breakdown: {
            systemTokens: 800,
            contextTokens: 1200,
            messageTokens: 2500,
            toolTokens: 500,
            outputSchemaTokens: 0,
          },
        },
      }),
      selectedModel: {
        value: "openai/gpt-5-mini",
        label: "GPT-5 mini",
        channelId: "openai",
        modelId: "gpt-5-mini",
        providerType: "openai",
        contextWindow: 100,
        searchText: "GPT-5 mini gpt-5-mini",
      },
      language: "zh-CN",
    });

    expect(usage).toEqual(expect.objectContaining({
      usedTokens: 5000,
      limitTokens: 100,
      percent: 100,
      status: "critical",
      detailLabel: "上下文使用：5,000 / 100 tokens（100%）\n已超出 4,900 tokens（窗口 50.00x）\n基于本地 prompt 估算\n统计范围：当前轮 provider 请求内容\n统计已排除思维/系统注入/工具轨迹",
    }));
  });

  test("reports context compression states across waiting, running, completed, and failed turns", () => {
    const awaiting = resolveContextCompressionStatus({
      detail: createDetail({
        runs: [{
          id: "run-1",
          sessionId: "session-1",
          status: "awaiting_compaction",
          startedAt: 1,
          updatedAt: 2,
          trigger: { kind: "user_message" },
          boundary: { kind: "awaiting_compaction", reason: "budget_exceeded" },
        } as never],
      }),
      language: "zh-CN",
    });

    const thresholdReached = resolveContextCompressionStatus({
      detail: createDetail({
        currentContextBudget: {
          runId: "run-threshold",
          estimatedPromptTokens: 40960,
          contextWindowTokens: 128000,
          compressionThresholdPercent: 30,
          compressionThresholdTokens: 38400,
          promptUsagePercent: 32,
          thresholdUsagePercent: 107,
          shouldAutoCompress: true,
          breakdown: {
            systemTokens: 20,
            contextTokens: 10,
            messageTokens: 40930,
            toolTokens: 0,
            outputSchemaTokens: 0,
          },
        },
      }),
      language: "zh-CN",
    });

    const running = resolveContextCompressionStatus({
      detail: createDetail({
        currentContextBudget: {
          runId: "run-2",
          estimatedPromptTokens: 2048,
          contextWindowTokens: 128000,
          shouldAutoCompress: false,
          breakdown: {
            systemTokens: 20,
            contextTokens: 10,
            messageTokens: 2018,
            toolTokens: 0,
            outputSchemaTokens: 0,
          },
          compaction: {
            status: "running",
            attempt: 1,
            reason: "budget_exceeded",
            startedAt: "2026-05-08T00:00:00.000Z",
          },
        },
      }),
      language: "zh-CN",
    });

    const completed = resolveContextCompressionStatus({
      detail: createDetail({
        currentContextBudget: {
          runId: "run-3",
          estimatedPromptTokens: 2048,
          contextWindowTokens: 128000,
          shouldAutoCompress: false,
          breakdown: {
            systemTokens: 20,
            contextTokens: 10,
            messageTokens: 2018,
            toolTokens: 0,
            outputSchemaTokens: 0,
          },
          compaction: {
            status: "completed",
            attempt: 1,
            reason: "budget_exceeded",
            startedAt: "2026-05-08T00:00:00.000Z",
            completedAt: "2026-05-08T00:00:05.000Z",
          },
        },
      }),
      language: "zh-CN",
    });

    const failed = resolveContextCompressionStatus({
      detail: createDetail({
        currentContextBudget: {
          runId: "run-4",
          estimatedPromptTokens: 2048,
          contextWindowTokens: 128000,
          shouldAutoCompress: false,
          breakdown: {
            systemTokens: 20,
            contextTokens: 10,
            messageTokens: 2018,
            toolTokens: 0,
            outputSchemaTokens: 0,
          },
          compaction: {
            status: "failed",
            attempt: 1,
            reason: "budget_exceeded",
            startedAt: "2026-05-08T00:00:00.000Z",
            failedAt: "2026-05-08T00:00:05.000Z",
            errorMessage: "compaction failed",
          },
        },
      }),
      language: "zh-CN",
    });

    expect(awaiting).toEqual(expect.objectContaining({
      tone: "warning",
      label: "正在压缩上下文",
    }));
    expect(thresholdReached).toEqual(expect.objectContaining({
      tone: "warning",
      label: "已达到阈值，等待压缩",
    }));
    expect(running).toEqual(expect.objectContaining({
      tone: "warning",
      label: "正在压缩上下文",
    }));
    expect(completed).toEqual(expect.objectContaining({
      tone: "success",
      label: "已完成上下文压缩",
    }));
    expect(failed).toEqual(expect.objectContaining({
      tone: "error",
      label: "上下文压缩失败",
    }));
  });
});
