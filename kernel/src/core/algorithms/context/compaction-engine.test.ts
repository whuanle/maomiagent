import { describe, expect, test } from "bun:test"

import { buildCompactionPrompt } from "./compaction-engine"

const TEMPLATE = `Provide a durable continuation summary.`

describe("buildCompactionPrompt", () => {
  test("forbids invented user-turn narration during tool-result continuation compaction", () => {
    const prompt = buildCompactionPrompt({
      template: TEMPLATE,
      reason: "budget_exceeded",
      run: {
        id: "run-1" as never,
        sessionId: "session-1" as never,
        status: "awaiting_compaction",
        startedAt: 1,
        updatedAt: 2,
        trigger: {
          kind: "tool_result",
        },
      },
      contextView: {
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
            text: "继续推进页面模板和文件结构。",
          }],
        }],
        checkpoints: [],
        systemBlocks: [],
        contextBlocks: [],
      },
    })

    expect(prompt).toContain("This compaction was triggered during a continuation turn, not by a new user message.")
    expect(prompt).toContain("Do not write that the user said something, said nothing, changed goals, or asked a new question in this turn unless a visible user message explicitly shows it.")
    expect(prompt).toContain("Latest confirmed user message id: message-user-latest.")
    expect(prompt).toContain("Latest confirmed user message preview: 继续推进页面模板和文件结构。")
    expect(prompt).toContain("The previous request exceeded the prompt budget.")
  })

  test("adds the same continuation guard for system-continue context overflow compaction", () => {
    const prompt = buildCompactionPrompt({
      template: TEMPLATE,
      reason: "context_overflow",
      run: {
        id: "run-1" as never,
        sessionId: "session-1" as never,
        status: "awaiting_compaction",
        startedAt: 1,
        updatedAt: 2,
        trigger: {
          kind: "system_continue",
        },
      },
      contextView: {
        visibleMessages: [],
        checkpoints: [],
        systemBlocks: [],
        contextBlocks: [],
      },
    })

    expect(prompt).toContain("This compaction was triggered during a continuation turn, not by a new user message.")
    expect(prompt).toContain("The previous request exceeded the model context window.")
  })

  test("only allows latest-user-intent narration on real user-message compaction turns", () => {
    const prompt = buildCompactionPrompt({
      template: TEMPLATE,
      reason: "context_overflow",
      run: {
        id: "run-1" as never,
        sessionId: "session-1" as never,
        status: "awaiting_compaction",
        startedAt: 1,
        updatedAt: 2,
        trigger: {
          kind: "user_message",
          refId: "message-user-latest",
        },
      },
      contextView: {
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
            text: "帮我把视觉方向整理成一个简短方案。",
          }],
        }],
        checkpoints: [],
        systemBlocks: [],
        contextBlocks: [],
      },
    })

    expect(prompt).toContain("If you describe the latest user intent, base it only on the visible user message content and avoid adding claims that are not explicitly supported.")
    expect(prompt).not.toContain("not by a new user message")
    expect(prompt).not.toContain("Do not write that the user said something, said nothing")
  })
})
