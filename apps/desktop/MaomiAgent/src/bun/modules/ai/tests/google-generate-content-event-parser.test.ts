import { describe, expect, test } from "bun:test";

import { readGoogleGenerateContentStreamEvents } from "../implementation/google";

describe("google generate-content event parser", () => {
  test("normalizes AI SDK text, reasoning, tool calls, usage, and finish events", () => {
    expect(readGoogleGenerateContentStreamEvents([
      { type: "reasoning-start", id: "reasoning_1" },
      { type: "reasoning-delta", id: "reasoning_1", text: "Thought" },
      { type: "reasoning-end", id: "reasoning_1" },
      { type: "text-start", id: "text_1" },
      { type: "text-delta", id: "text_1", text: "Final answer" },
      { type: "text-end", id: "text_1" },
      {
        type: "tool-call",
        toolCallId: "call_1",
        toolName: "search_docs",
        input: {
          q: "maomi",
        },
      },
      {
        type: "finish-step",
        finishReason: "tool-calls",
        rawFinishReason: "STOP",
        usage: {
          inputTokens: 11,
          inputTokenDetails: {
            noCacheTokens: 11,
            cacheReadTokens: 0,
            cacheWriteTokens: undefined,
          },
          outputTokens: 7,
          outputTokenDetails: {
            textTokens: 4,
            reasoningTokens: 3,
          },
          totalTokens: 18,
          reasoningTokens: 3,
          cachedInputTokens: 0,
        },
        providerMetadata: undefined,
        response: {
          id: "candidate_0",
          timestamp: new Date("2026-06-01T00:00:00.000Z"),
          modelId: "gemini-2.5-flash",
        },
      },
      {
        type: "finish",
        finishReason: "tool-calls",
        rawFinishReason: "STOP",
        totalUsage: {
          inputTokens: 11,
          inputTokenDetails: {
            noCacheTokens: 11,
            cacheReadTokens: 0,
            cacheWriteTokens: undefined,
          },
          outputTokens: 7,
          outputTokenDetails: {
            textTokens: 4,
            reasoningTokens: 3,
          },
          totalTokens: 18,
          reasoningTokens: 3,
          cachedInputTokens: 0,
        },
      },
    ])).toEqual([
      { type: "reasoning.start" },
      { type: "reasoning.delta", delta: "Thought" },
      { type: "reasoning.end" },
      { type: "text.start" },
      { type: "text.delta", delta: "Final answer" },
      { type: "text.end" },
      {
        type: "tool.call",
        toolName: "search_docs",
        input: {
          q: "maomi",
        },
        toolCallId: "call_1" as never,
      },
      {
        type: "usage",
        usage: {
          inputTokens: 11,
          outputTokens: 7,
          reasoningTokens: 3,
          cachedInputTokens: 0,
        },
      },
      {
        type: "finish",
        reason: "tool_calls",
        metadata: {
          providerReason: "STOP",
          providerResponseId: "candidate_0",
        },
      },
    ]);
  });
});
