import { describe, expect, test } from "bun:test";

import type { DesktopFeishuBotPendingActionSnapshot } from "../../abstraction/ports/desktop-feishu-store.ports";
import { DesktopFeishuBotSemanticClassifier } from "./desktop-feishu-bot-semantic-classifier";

function createPendingAction(): DesktopFeishuBotPendingActionSnapshot {
  return {
    pendingId: "pending_1",
    scopeKey: "tenant-1:oc_1:root",
    chatId: "oc_1",
    messageId: "om_1",
    domain: "calendar",
    actionId: "calendar.create_event",
    workspaceId: "workspace-a",
    summary: "准备创建会议",
    details: ["今天 9:00-10:00", "主题 AI 落地讨论"],
    executeInput: {
      actionId: "calendar.create_event",
      workspaceId: "workspace-a",
      title: "AI 落地讨论",
      startAt: "2026-05-25T09:00:00+08:00",
      endAt: "2026-05-25T10:00:00+08:00",
    },
    createdAt: "2026-05-25T09:00:00.000Z",
    updatedAt: "2026-05-25T09:00:00.000Z",
    expiresAt: "2026-05-25T09:30:00.000Z",
  };
}

describe("DesktopFeishuBotSemanticClassifier", () => {
  test("returns the model decision when the model emits a valid label", async () => {
    const classifier = new DesktopFeishuBotSemanticClassifier({
      execute: async () => ({
        sessionId: "session-1" as any,
        runId: "run-1" as any,
        turnId: "turn-1" as any,
        content: "confirm",
        reasoning: [],
        target: {
          providerType: "test",
          channelId: "kimicode",
          modelId: "kimi-k2.6",
        },
      }),
    } as any);

    const result = await classifier.classify({
      workspaceId: "workspace-a",
      selectedChannelId: "kimicode",
      selectedModelId: "kimi-k2.6",
      pendingAction: createPendingAction(),
      replyText: "好的，没问题",
    });

    expect(result).toBe("confirm");
  });

  test("falls back to modify when the model output is noisy but the reply changes the request", async () => {
    const classifier = new DesktopFeishuBotSemanticClassifier({
      execute: async () => ({
        sessionId: "session-1" as any,
        runId: "run-1" as any,
        turnId: "turn-1" as any,
        content: "this sounds like modify",
        reasoning: [],
        target: {
          providerType: "test",
          channelId: "kimicode",
          modelId: "kimi-k2.6",
        },
      }),
    } as any);

    const result = await classifier.classify({
      workspaceId: "workspace-a",
      selectedChannelId: "kimicode",
      selectedModelId: "kimi-k2.6",
      pendingAction: createPendingAction(),
      replyText: "改成下午三点到四点",
    });

    expect(result).toBe("modify");
  });

  test("returns unclear when neither the model nor fallback can classify the reply", async () => {
    const classifier = new DesktopFeishuBotSemanticClassifier({
      execute: async () => {
        throw new Error("temporary failure");
      },
    } as any);

    const result = await classifier.classify({
      workspaceId: "workspace-a",
      selectedChannelId: "kimicode",
      selectedModelId: "kimi-k2.6",
      pendingAction: createPendingAction(),
      replyText: "嗯……",
    });

    expect(result).toBe("unclear");
  });
});
