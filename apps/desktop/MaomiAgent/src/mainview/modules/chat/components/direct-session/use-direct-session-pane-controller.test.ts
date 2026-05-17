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
      status: "critical",
      thresholdPercent: 30,
      thresholdLabel: "达到 30% 自动压缩",
    }));
  });

  test("reports compaction status for awaiting and completed states", () => {
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

    const completed = resolveContextCompressionStatus({
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

    expect(awaiting).toEqual(expect.objectContaining({
      tone: "warning",
      label: "正在压缩上下文",
    }));
    expect(completed).toEqual(expect.objectContaining({
      tone: "success",
      label: "已自动压缩",
    }));
  });
});