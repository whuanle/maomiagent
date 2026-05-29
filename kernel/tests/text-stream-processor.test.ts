import { describe, expect, it } from "bun:test"

import {
  asMessageId,
  asRunId,
  asSessionId,
  asToolCallId,
  asTurnId,
  type MessagePart,
  type MessageRecord,
  type MessageRecordWithParts,
  type ToolCallRecord,
} from "../src/core"
import { TextStreamProcessor } from "../src/core/processor/text-stream-processor"

describe("TextStreamProcessor", () => {
  it("persists the assistant message before saving the first tool call", async () => {
    const calls: string[] = []
    let assistantMessagePersisted = false
    let nextId = 0

    const processor = new TextStreamProcessor({
      messageStore: {
        async append(message: MessageRecord, parts: readonly MessagePart[]) {
          calls.push(`message.append:${parts.length}`)
          expect(message.id).toBe(asMessageId("message_assistant"))
          assistantMessagePersisted = true
        },
        async appendParts(messageId, parts) {
          calls.push(`message.appendParts:${parts.length}`)
          expect(messageId).toBe(asMessageId("message_assistant"))
          expect(assistantMessagePersisted).toBe(true)
        },
        async listBySession(): Promise<readonly MessageRecordWithParts[]> {
          return []
        },
      },
      toolCallStore: {
        async save(call: ToolCallRecord) {
          calls.push("tool.save")
          expect(call.id).toBe(asToolCallId("tool_call_1"))
          expect(assistantMessagePersisted).toBe(true)
        },
        async patch() {
          throw new Error("patch should not be called in this test")
        },
        async listByRun() {
          return []
        },
        async listByTurn() {
          return []
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

    const handle = await processor.start({
      session: {
        id: asSessionId("session_1"),
        createdAt: 1,
        updatedAt: 1,
        status: "running",
      },
      run: {
        id: asRunId("run_1"),
        sessionId: asSessionId("session_1"),
        createdAt: 1,
        updatedAt: 1,
        status: "running",
      },
      turn: {
        id: asTurnId("turn_1"),
        runId: asRunId("run_1"),
        sequence: 1,
        createdAt: 1,
        updatedAt: 1,
        status: "running",
      },
      assistantMessage: {
        id: asMessageId("message_assistant"),
        sessionId: asSessionId("session_1"),
        runId: asRunId("run_1"),
        turnId: asTurnId("turn_1"),
        role: "assistant",
        createdAt: 1,
      },
    })

    await handle.accept({
      type: "tool.call",
      toolCallId: asToolCallId("tool_call_1"),
      toolName: "workspace_read_file",
      input: { path: "." },
    })

    const result = await handle.complete()

    expect(result.boundary.kind).toBe("continue")
    expect(calls).toEqual([
      "message.append:0",
      "tool.save",
      "message.appendParts:1",
    ])
  })

  it("publishes reasoning deltas incrementally while coalescing persisted reasoning text", async () => {
    const persistedBatches: string[] = []
    const publishedReasoningParts: MessagePart[] = []
    let nextId = 0

    const processor = new TextStreamProcessor({
      messageStore: {
        async append(_message: MessageRecord, parts: readonly MessagePart[]) {
          persistedBatches.push(`append:${parts.map((part) => part.type === "reasoning" ? part.text : part.type).join("|")}`)
        },
        async appendParts(_messageId, parts) {
          persistedBatches.push(`appendParts:${parts.map((part) => part.type === "reasoning" ? part.text : part.type).join("|")}`)
        },
        async listBySession(): Promise<readonly MessageRecordWithParts[]> {
          return []
        },
      },
      toolCallStore: {
        async save() {
          throw new Error("save should not be called in this test")
        },
        async patch() {
          throw new Error("patch should not be called in this test")
        },
        async listByRun() {
          return []
        },
        async listByTurn() {
          return []
        },
      },
      clock: {
        now: () => 456,
      },
      idGenerator: {
        next(prefix) {
          nextId += 1
          return `${prefix}_${nextId}`
        },
      },
      eventSink: {
        async publish(events) {
          for (const event of events) {
            if (event.type !== "message.parts.appended") {
              continue
            }

            publishedReasoningParts.push(...event.payload.parts)
          }
        },
      },
    })

    const handle = await processor.start({
      session: {
        id: asSessionId("session_1"),
        createdAt: 1,
        updatedAt: 1,
        status: "running",
      },
      run: {
        id: asRunId("run_1"),
        sessionId: asSessionId("session_1"),
        createdAt: 1,
        updatedAt: 1,
        status: "running",
      },
      turn: {
        id: asTurnId("turn_1"),
        runId: asRunId("run_1"),
        sequence: 1,
        createdAt: 1,
        updatedAt: 1,
        status: "running",
      },
      assistantMessage: {
        id: asMessageId("message_assistant"),
        sessionId: asSessionId("session_1"),
        runId: asRunId("run_1"),
        turnId: asTurnId("turn_1"),
        role: "assistant",
        createdAt: 1,
      },
    })

    await handle.accept({ type: "reasoning.start" })
    await handle.accept({ type: "reasoning.delta", delta: "plan " })
    await handle.accept({ type: "reasoning.delta", delta: "more" })
    await handle.accept({ type: "reasoning.end" })

    const result = await handle.complete()

    expect(result.boundary.kind).toBe("completed")
    expect(persistedBatches).toEqual([
      "append:plan ",
      "appendParts:more",
    ])
    expect(publishedReasoningParts).toEqual([
      {
        id: "part_1" as never,
        type: "reasoning",
        text: "plan ",
      },
      {
        id: "part_3" as never,
        type: "reasoning",
        text: "more",
      },
    ])
  })
})
