import { describe, expect, it } from "bun:test"
import type { AiTurnRequest } from "../ai/contracts"
import { asToolCallId } from "../src/core"
import { OneShotExecutionService } from "../src/host/one-shot"

describe("one-shot execution service", () => {
  it("builds a prompt envelope and aggregates streamed text output", async () => {
    const requests: AiTurnRequest[] = []
    const events: string[] = []
    let nextId = 0
    const service = new OneShotExecutionService({
      turnPort: {
        async *stream(input) {
          requests.push(input)
          yield { type: "reasoning.start" } as const
          yield { type: "reasoning.delta", delta: "plan" } as const
          yield { type: "reasoning.end" } as const
          yield { type: "text.start" } as const
          yield { type: "text.delta", delta: "hello" } as const
          yield { type: "text.delta", delta: " world" } as const
          yield {
            type: "usage",
            usage: {
              inputTokens: 3,
              outputTokens: 2,
            },
          } as const
          yield {
            type: "finish",
            reason: "stop",
            metadata: {
              providerResponseId: "resp_1",
            },
          } as const
        },
      },
      clock: {
        now: () => 123,
      },
      idGenerator: {
        next(prefix) {
          nextId += 1
          return `${prefix}_${nextId}`
        },
      },
    })

    const result = await service.execute({
      executionProfile: {
        id: "profile.main" as never,
        modelId: "gpt-4.1",
      },
      systemBlocks: [{
        id: "system-1",
        kind: "system",
        content: "Be concise",
        priority: 1,
      }],
      messages: [{
        role: "user",
        content: "say hello",
      }],
      onEvent(event) {
        events.push(event.type)
      },
    })

    expect(requests).toHaveLength(1)
    expect(requests[0]?.trace).toEqual({
      sessionId: result.sessionId,
      runId: result.runId,
      turnId: result.turnId,
    })
    expect(requests[0]?.prompt.agentId).toBe("assistant.default")
    expect(requests[0]?.prompt.systemBlocks[0]?.content).toBe("Be concise")
    expect(requests[0]?.prompt.messages).toHaveLength(1)
    expect(requests[0]?.settings.toolChoice).toBe("none")
    expect(result).toMatchObject({
      finishReason: "stop",
      content: "hello world",
      reasoning: ["plan"],
      usage: {
        inputTokens: 3,
        outputTokens: 2,
      },
      terminalMetadata: {
        providerResponseId: "resp_1",
      },
    })
    expect(events).toEqual([
      "reasoning.start",
      "reasoning.delta",
      "reasoning.end",
      "text.start",
      "text.delta",
      "text.delta",
      "usage",
      "finish",
    ])
  })

  it("surfaces unsupported tool calls as a terminal one-shot error", async () => {
    const service = new OneShotExecutionService({
      turnPort: {
        async *stream() {
          yield {
            type: "tool.call",
            toolCallId: asToolCallId("tool_call_1"),
            toolName: "search",
            input: { query: "hello" },
          } as const
          yield {
            type: "finish",
            reason: "tool_calls",
          } as const
        },
      },
      clock: {
        now: () => 1,
      },
      idGenerator: {
        next(prefix) {
          return `${prefix}_fixed`
        },
      },
    })

    const result = await service.execute({
      executionProfile: {
        id: "profile.tools" as never,
      },
      messages: [{
        role: "user",
        content: "call a tool",
      }],
    })

    expect(result.finishReason).toBe("tool_calls")
    expect(result.error).toMatchObject({
      code: "one_shot_tool_call_unsupported",
      message: "One-shot execution does not support tool calls",
    })
  })
})