import { describe, expect, test } from "bun:test";

import {
  CONCISE_AGENT_ID,
  FEISHU_DOC_WRITER_AGENT_ID,
  FULLY_MANAGED_AGENT_ID,
  resolveDesktopConversationExecutionStrategy,
  shouldAutoPromoteDesktopConversationToManagedExecution,
} from "./managed-execution";

describe("managed execution strategy", () => {
  test("keeps standalone go example asks in the regular interactive path", () => {
    for (const text of [
      "使用 Go 写一个哈希算法",
      "使用 go 写一个哈希算法代码示例",
      "使用 go 写一个 http 服务器支持静态文件",
    ]) {
      expect(shouldAutoPromoteDesktopConversationToManagedExecution({
        text,
      })).toBe(false);

      expect(resolveDesktopConversationExecutionStrategy({
        text,
        selectedAgentId: "auto",
      })).toEqual({
        autoPromoted: false,
        executionMode: "interactive",
        runMode: "normal",
        selectedAgentId: "auto",
        sessionMetadata: {
          thinkingDetailLevel: "minimal",
        },
        runMetadata: {
          thinkingDetailLevel: "minimal",
        },
        taskMetadata: {
          thinkingDetailLevel: "minimal",
        },
      });
    }
  });

  test("auto-promotes an explicit project scaffolding request", () => {
    const strategy = resolveDesktopConversationExecutionStrategy({
      text: "帮我创建一个 Go 项目骨架，并把哈希算法跑起来",
      selectedAgentId: "auto",
    });

    expect(strategy.autoPromoted).toBe(true);
    expect(strategy.executionMode).toBe("background");
    expect(strategy.runMode).toBe("hosted_autopilot");
    expect(strategy.selectedAgentId).toBe(FULLY_MANAGED_AGENT_ID);
    expect(strategy.taskMetadata).toMatchObject({
      managedExecution: true,
      rootTask: true,
      runMode: "hosted_autopilot",
      executionMode: "background",
      executionAgentId: FULLY_MANAGED_AGENT_ID,
      preferredExecutionAgentId: "auto",
      thinkingDetailLevel: "compact",
    });
  });

  test("keeps the concise agent in direct interactive mode", () => {
    expect(shouldAutoPromoteDesktopConversationToManagedExecution({
      text: "帮我创建一个 Go 项目骨架，并把哈希算法跑起来",
      selectedAgentId: CONCISE_AGENT_ID,
    })).toBe(false);

    expect(resolveDesktopConversationExecutionStrategy({
      text: "帮我创建一个 Go 项目骨架，并把哈希算法跑起来",
      selectedAgentId: CONCISE_AGENT_ID,
      metadata: {
        conversationSettings: {
          managedExecutionEnabled: true,
        },
      },
    })).toEqual({
      autoPromoted: false,
      executionMode: "interactive",
      runMode: "normal",
      selectedAgentId: CONCISE_AGENT_ID,
      sessionMetadata: {
        thinkingDetailLevel: "minimal",
      },
      runMetadata: {
        thinkingDetailLevel: "minimal",
      },
      taskMetadata: {
        thinkingDetailLevel: "minimal",
      },
    });
  });

  test("keeps the feishu doc writer agent in direct interactive mode for document drafting", () => {
    expect(shouldAutoPromoteDesktopConversationToManagedExecution({
      text: "帮我创建一篇 AI 自动化运维文档，并整理成清晰章节",
      selectedAgentId: FEISHU_DOC_WRITER_AGENT_ID,
    })).toBe(false);

    expect(resolveDesktopConversationExecutionStrategy({
      text: "帮我创建一篇 AI 自动化运维文档，并整理成清晰章节",
      selectedAgentId: FEISHU_DOC_WRITER_AGENT_ID,
      metadata: {
        conversationSettings: {
          managedExecutionEnabled: true,
        },
      },
    })).toEqual({
      autoPromoted: false,
      executionMode: "interactive",
      runMode: "normal",
      selectedAgentId: FEISHU_DOC_WRITER_AGENT_ID,
      sessionMetadata: {
        thinkingDetailLevel: "minimal",
      },
      runMetadata: {
        thinkingDetailLevel: "minimal",
      },
      taskMetadata: {
        thinkingDetailLevel: "minimal",
      },
    });
  });

  test("forces plan mode to stay interactive without managed promotion", () => {
    expect(resolveDesktopConversationExecutionStrategy({
      text: "帮我创建一个 Go 项目骨架，并把哈希算法跑起来",
      selectedAgentId: "auto",
      composerMode: "plan",
      metadata: {
        conversationSettings: {
          managedExecutionEnabled: true,
        },
      },
    })).toEqual({
      autoPromoted: false,
      executionMode: "interactive",
      runMode: "normal",
      selectedAgentId: "auto",
      sessionMetadata: {
        thinkingDetailLevel: "full",
      },
      runMetadata: {
        thinkingDetailLevel: "full",
      },
      taskMetadata: {
        thinkingDetailLevel: "full",
      },
    });
  });

  test("preserves explicit workspace managed-execution defaults", () => {
    const strategy = resolveDesktopConversationExecutionStrategy({
      text: "使用 Go 写一个哈希算法",
      metadata: {
        conversationSettings: {
          managedExecutionEnabled: true,
        },
      },
    });

    expect(strategy).toMatchObject({
      autoPromoted: true,
      executionMode: "background",
      runMode: "hosted_autopilot",
      selectedAgentId: FULLY_MANAGED_AGENT_ID,
      sessionMetadata: {
        thinkingDetailLevel: "minimal",
      },
      runMetadata: {
        thinkingDetailLevel: "minimal",
      },
      taskMetadata: {
        thinkingDetailLevel: "minimal",
      },
    });
  });

  test("preserves explicit managed agent selection", () => {
    expect(shouldAutoPromoteDesktopConversationToManagedExecution({
      text: "使用 Go 写一个哈希算法",
      selectedAgentId: FULLY_MANAGED_AGENT_ID,
    })).toBe(true);
  });

  test("auto-promotes an explicit autonomous completion request", () => {
    expect(shouldAutoPromoteDesktopConversationToManagedExecution({
      text: "直接继续推进并自动收尾这个任务",
    })).toBe(true);
  });

  test("stamps compact thinking detail onto regular interactive execution", () => {
    expect(resolveDesktopConversationExecutionStrategy({
      text: "修复这个聊天页面的回归问题",
      selectedAgentId: "auto",
    })).toMatchObject({
      selectedAgentId: "auto",
      runMode: "normal",
      executionMode: "interactive",
      sessionMetadata: { thinkingDetailLevel: "compact" },
      runMetadata: { thinkingDetailLevel: "compact" },
      taskMetadata: { thinkingDetailLevel: "compact" },
    });
  });
});
