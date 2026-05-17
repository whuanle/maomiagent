import { describe, expect, test } from "bun:test"

import { asMessageId, asRunId, asSessionId, asToolCallId, asTurnId, type ToolDescriptor } from "../src/core"
import { LocalToolExecutor, type RegisteredToolHandler } from "../src/adapters"

function createExecutionContext() {
  return {
    session: {
      id: asSessionId("session_local_tool_executor"),
      title: "Local Tool Executor",
      status: "active" as const,
      createdAt: 1,
      updatedAt: 1,
      metadata: {
        workspaceId: "workspace-1",
      },
    },
    run: {
      id: asRunId("run_local_tool_executor"),
      sessionId: asSessionId("session_local_tool_executor"),
      status: "streaming" as const,
      startedAt: 2,
      updatedAt: 2,
      trigger: {
        kind: "user_message" as const,
        refId: asMessageId("message_user_local_tool_executor"),
      },
    },
    turn: {
      id: asTurnId("turn_local_tool_executor"),
      sessionId: asSessionId("session_local_tool_executor"),
      runId: asRunId("run_local_tool_executor"),
      sequence: 1,
      agentId: "desktop.primary",
      executionProfile: {
        id: "desktop.test.profile" as never,
        modelId: "test-model",
      },
      status: "streaming" as const,
      startedAt: 3,
    },
    recentMessages: [],
  }
}

describe("LocalToolExecutor", () => {
  test("normalizes nullable optional fields and numeric strings before handler execution", async () => {
    const descriptor: ToolDescriptor = {
      name: "terminal_read_output",
      description: "Read terminal output",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          limit: { type: "number" },
          workspaceId: { type: "string" },
        },
        required: ["sessionId"],
        additionalProperties: false,
      },
      metadata: {
        toolSourceKind: "test",
      },
    }

    let observedInput: unknown
    const handler: RegisteredToolHandler = {
      descriptor,
      async execute({ call }) {
        observedInput = call.input
        return call.input
      },
    }

    const executor = new LocalToolExecutor({
      handlers: [handler],
    })
    const outcome = await executor.execute({
      id: asToolCallId("tool_call_normalized"),
      sessionId: asSessionId("session_local_tool_executor"),
      runId: asRunId("run_local_tool_executor"),
      turnId: asTurnId("turn_local_tool_executor"),
      messageId: asMessageId("message_assistant_local_tool_executor"),
      toolName: descriptor.name,
      input: {
        sessionId: "term_1",
        limit: "50",
        workspaceId: null,
      },
      status: "executing",
      startedAt: 4,
      updatedAt: 4,
    }, createExecutionContext())

    expect(outcome).toEqual({
      kind: "completed",
      output: {
        sessionId: "term_1",
        limit: 50,
      },
    })
    expect(observedInput).toEqual({
      sessionId: "term_1",
      limit: 50,
    })
  })

  test("keeps required null fields invalid after normalization", async () => {
    const descriptor: ToolDescriptor = {
      name: "terminal_read_output",
      description: "Read terminal output",
      inputSchema: {
        type: "object",
        properties: {
          sessionId: { type: "string" },
          limit: { type: "number" },
        },
        required: ["sessionId"],
        additionalProperties: false,
      },
      metadata: {
        toolSourceKind: "test",
      },
    }

    const handler: RegisteredToolHandler = {
      descriptor,
      async execute() {
        throw new Error("handler should not run")
      },
    }

    const executor = new LocalToolExecutor({
      handlers: [handler],
    })
    const outcome = await executor.execute({
      id: asToolCallId("tool_call_invalid"),
      sessionId: asSessionId("session_local_tool_executor"),
      runId: asRunId("run_local_tool_executor"),
      turnId: asTurnId("turn_local_tool_executor"),
      messageId: asMessageId("message_assistant_local_tool_executor"),
      toolName: descriptor.name,
      input: {
        sessionId: null,
        limit: "50",
      },
      status: "executing",
      startedAt: 4,
      updatedAt: 4,
    }, createExecutionContext())

    expect(outcome.kind).toBe("failed")
    if (outcome.kind !== "failed") {
      throw new Error("Expected failed outcome")
    }

    expect(outcome.error.code).toBe("tool_input_invalid")
    expect(outcome.error.metadata?.errors).toContain("$terminal_read_output.sessionId: must be of type string")
  })
})
