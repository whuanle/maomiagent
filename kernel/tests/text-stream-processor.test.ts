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

  it("recovers pseudo tool-call markup as a real tool call for ui-designer sessions", async () => {
    const persistedBatches: string[] = []
    const savedCalls: ToolCallRecord[] = []
    let nextId = 0

    const processor = new TextStreamProcessor({
      messageStore: {
        async append(_message: MessageRecord, parts: readonly MessagePart[]) {
          persistedBatches.push(`append:${parts.map((part) => part.type === "text" ? part.text : part.type).join("|")}`)
        },
        async appendParts(_messageId, parts) {
          persistedBatches.push(`appendParts:${parts.map((part) => part.type === "text" ? part.text : part.type).join("|")}`)
        },
        async listBySession(): Promise<readonly MessageRecordWithParts[]> {
          return []
        },
      },
      toolCallStore: {
        async save(call: ToolCallRecord) {
          savedCalls.push(call)
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
        now: () => 321,
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
        id: asSessionId("session_ui_designer"),
        createdAt: 1,
        updatedAt: 1,
        status: "running",
        metadata: {
          surface: "ui-designer",
        },
      },
      run: {
        id: asRunId("run_1"),
        sessionId: asSessionId("session_ui_designer"),
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
        sessionId: asSessionId("session_ui_designer"),
        runId: asRunId("run_1"),
        turnId: asTurnId("turn_1"),
        role: "assistant",
        createdAt: 1,
      },
    })

    await handle.accept({
      type: "text.delta",
      delta: "先检查当前目录。\n<tool_",
    })
    await handle.accept({
      type: "text.delta",
      delta: "call>\n<function=terminal_execute>\n<parameter=session_id>blog-setup</parameter>\n<parameter=command>pwd</parameter>\n</function>\n</tool_call>",
    })
    await handle.accept({
      type: "finish",
      reason: "stop",
    })

    const result = await handle.complete()

    expect(result.boundary.kind).toBe("continue")
    expect(savedCalls).toHaveLength(1)
    expect(savedCalls[0]?.toolName).toBe("terminal_execute")
    expect(savedCalls[0]?.input).toEqual({
      sessionId: "blog-setup",
      command: "pwd",
    })
    expect(persistedBatches).toEqual([
      "append:先检查当前目录。\n",
      "appendParts:tool_call_ref",
    ])
  })

  it("recovers pseudo tool-call markup as real tool calls for regular agent sessions", async () => {
    const persistedBatches: string[] = []
    const savedCalls: ToolCallRecord[] = []
    let nextId = 0

    const processor = new TextStreamProcessor({
      messageStore: {
        async append(_message: MessageRecord, parts: readonly MessagePart[]) {
          persistedBatches.push(`append:${parts.map((part) => part.type === "text" ? part.text : part.type).join("|")}`)
        },
        async appendParts(_messageId, parts) {
          persistedBatches.push(`appendParts:${parts.map((part) => part.type === "text" ? part.text : part.type).join("|")}`)
        },
        async listBySession(): Promise<readonly MessageRecordWithParts[]> {
          return []
        },
      },
      toolCallStore: {
        async save(call: ToolCallRecord) {
          savedCalls.push(call)
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
        now: () => 654,
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
        id: asSessionId("session_regular"),
        createdAt: 1,
        updatedAt: 1,
        status: "running",
      },
      run: {
        id: asRunId("run_1"),
        sessionId: asSessionId("session_regular"),
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
        sessionId: asSessionId("session_regular"),
        runId: asRunId("run_1"),
        turnId: asTurnId("turn_1"),
        role: "assistant",
        createdAt: 1,
      },
    })

    await handle.accept({
      type: "text.delta",
      delta: [
        "<tool_call>",
        "<function=workspace.read_file>",
        "<parameter=path>./package.json</parameter>",
        "</function>",
        "</tool_call><tool_call>",
        "<function=git_status>",
        "</function>",
        "</tool_call>",
      ].join("\n"),
    })

    const result = await handle.complete()

    expect(result.boundary.kind).toBe("continue")
    expect(savedCalls).toHaveLength(2)
    expect(savedCalls[0]?.toolName).toBe("workspace_read_file")
    expect(savedCalls[0]?.input).toEqual({
      path: "./package.json",
    })
    expect(savedCalls[1]?.toolName).toBe("git_list_changes")
    expect(savedCalls[1]?.input).toEqual({})
    expect(persistedBatches).toEqual([
      "append:",
      "appendParts:tool_call_ref",
      "appendParts:tool_call_ref",
    ])
  })

  it("maps terminal_create_session label markup to schema-safe input", async () => {
    const savedCalls: ToolCallRecord[] = []
    let nextId = 0

    const processor = new TextStreamProcessor({
      messageStore: {
        async append() {},
        async appendParts() {},
        async listBySession(): Promise<readonly MessageRecordWithParts[]> {
          return []
        },
      },
      toolCallStore: {
        async save(call: ToolCallRecord) {
          savedCalls.push(call)
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
        now: () => 777,
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
        id: asSessionId("session_ui_designer"),
        createdAt: 1,
        updatedAt: 1,
        status: "running",
        metadata: {
          surface: "ui-designer",
        },
      },
      run: {
        id: asRunId("run_1"),
        sessionId: asSessionId("session_ui_designer"),
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
        sessionId: asSessionId("session_ui_designer"),
        runId: asRunId("run_1"),
        turnId: asTurnId("turn_1"),
        role: "assistant",
        createdAt: 1,
      },
    })

    await handle.accept({
      type: "text.delta",
      delta: "<tool_call>\n<function=terminal_create_session>\n<parameter=label>blog-setup</parameter>\n<parameter=shell_kind>powershell</parameter>\n<parameter=unexpected>drop-me</parameter>\n</function>\n</tool_call>",
    })

    const result = await handle.complete()

    expect(result.boundary.kind).toBe("continue")
    expect(savedCalls).toHaveLength(1)
    expect(savedCalls[0]?.toolName).toBe("terminal_create_session")
    expect(savedCalls[0]?.input).toEqual({
      title: "blog-setup",
      shellKind: "powershell",
    })
  })

  it("recovers terminal_execute command text from common command-like pseudo parameters", async () => {
    const savedCalls: ToolCallRecord[] = []
    let nextId = 0

    const processor = new TextStreamProcessor({
      messageStore: {
        async append() {},
        async appendParts() {},
        async listBySession(): Promise<readonly MessageRecordWithParts[]> {
          return []
        },
      },
      toolCallStore: {
        async save(call: ToolCallRecord) {
          savedCalls.push(call)
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
        now: () => 888,
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
        id: asSessionId("session_regular"),
        createdAt: 1,
        updatedAt: 1,
        status: "running",
      },
      run: {
        id: asRunId("run_1"),
        sessionId: asSessionId("session_regular"),
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
        sessionId: asSessionId("session_regular"),
        runId: asRunId("run_1"),
        turnId: asTurnId("turn_1"),
        role: "assistant",
        createdAt: 1,
      },
    })

    await handle.accept({
      type: "text.delta",
      delta: [
        "<tool_call>",
        "<function=terminal_execute>",
        "<parameter=session_id>blog-setup</parameter>",
        "<parameter=commandPreview>Get-Location</parameter>",
        "</function>",
        "</tool_call>",
      ].join("\n"),
    })

    const result = await handle.complete()

    expect(result.boundary.kind).toBe("continue")
    expect(savedCalls).toHaveLength(1)
    expect(savedCalls[0]?.toolName).toBe("terminal_execute")
    expect(savedCalls[0]?.input).toEqual({
      sessionId: "blog-setup",
      command: "Get-Location",
    })
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
