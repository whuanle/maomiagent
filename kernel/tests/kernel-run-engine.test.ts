import { describe, expect, test } from "bun:test"

import {
  KernelRunEngine,
  asMessageId,
  asRunId,
  asSessionId,
  asToolCallId,
  asTurnId,
  type ContextCheckpointRecord,
  type InteractionRecord,
  type MessagePart,
  type MessageRecord,
  type MessageRecordWithParts,
  type ProcessorHandle,
  type ProcessorResult,
  type RunBoundary,
  type RunRecord,
  type SessionRecord,
  type ToolCallRecord,
  type ToolExecutionContext,
  type ToolExecutionOutcome,
  type TurnPlan,
  type TurnRecord,
  type TurnInputContext,
} from "../src/core"

class MemorySessionStore {
  constructor(private session: SessionRecord) {}

  async get() {
    return this.session
  }

  async save(session: SessionRecord) {
    this.session = session
  }
}

class MemoryRunStore {
  constructor(private run: RunRecord) {}

  async get() {
    return this.run
  }

  async save(run: RunRecord) {
    this.run = run
  }

  async listBySession() {
    return [this.run]
  }
}

class MemoryTurnStore {
  private turns: TurnRecord[] = []

  async save(turn: TurnRecord) {
    const index = this.turns.findIndex((item) => item.id === turn.id)
    if (index === -1) {
      this.turns.push(turn)
      return
    }

    this.turns[index] = turn
  }

  async listByRun(runId: TurnRecord["runId"]) {
    return this.turns.filter((item) => item.runId === runId)
  }

  async getLastByRun(runId: TurnRecord["runId"]) {
    return this.turns
      .filter((item) => item.runId === runId)
      .sort((left, right) => right.sequence - left.sequence)[0]
  }
}

class MemoryMessageStore {
  private messages: MessageRecordWithParts[] = []

  async append(message: MessageRecord, parts: readonly MessagePart[]) {
    this.messages.push({
      message,
      parts: [...parts],
    })
  }

  async appendParts() {}

  async listBySession(sessionId: SessionRecord["id"]) {
    return this.messages.filter((item) => item.message.sessionId === sessionId)
  }
}

class MemoryToolCallStore {
  private calls: ToolCallRecord[] = []

  async save(call: ToolCallRecord) {
    this.calls.push(call)
  }

  async patch(call: ToolCallRecord) {
    const index = this.calls.findIndex((item) => item.id === call.id)
    if (index === -1) {
      this.calls.push(call)
      return
    }

    this.calls[index] = call
  }

  async listByRun(runId: RunRecord["id"]) {
    return this.calls.filter((item) => item.runId === runId)
  }

  async listByTurn(turnId: TurnRecord["id"]) {
    return this.calls.filter((item) => item.turnId === turnId)
  }
}

class MemoryCheckpointStore {
  async save(_checkpoint: ContextCheckpointRecord) {}

  async listBySession() {
    return []
  }
}

function createTurnInput(): TurnInputContext {
  return {
    availableAgents: [],
    preferredAgentId: "agent-1",
    candidateExecutionProfiles: [],
    availableTools: [],
    systemBlocks: [],
    contextBlocks: [],
    outputMode: { kind: "text" },
    policies: {
      allowCompaction: false,
      retryOnModelError: false,
    },
  }
}

function createPlan(input: {
  session: SessionRecord
  run: RunRecord
  nextSequence: number
}): TurnPlan {
  return {
    turn: {
      id: asTurnId(`turn_${input.nextSequence}`),
      runId: input.run.id,
      sessionId: input.session.id,
      status: "planned",
      sequence: input.nextSequence,
      agentId: "agent-1",
      executionProfile: {
        id: "profile-test" as never,
        modelId: "test-model",
      },
      startedAt: input.nextSequence * 10,
    },
    agentId: "agent-1",
    executionProfile: {
      id: "profile-test" as never,
      modelId: "test-model",
    },
    tools: [],
    contextView: {
      visibleMessages: [],
      checkpoints: [],
      systemBlocks: [],
      contextBlocks: [],
    },
    envelope: {
      sessionId: input.session.id,
      runId: input.run.id,
      turnId: asTurnId(`turn_${input.nextSequence}`),
      agentId: "agent-1",
      systemBlocks: [],
      contextBlocks: [],
      messages: [],
      tools: [],
      outputMode: { kind: "text" },
    },
    outputMode: { kind: "text" },
    visibleMessages: [],
  }
}

describe("KernelRunEngine", () => {
  test("allows duplicate tool calls within the same turn to execute instead of failing the batch", async () => {
    const session: SessionRecord = {
      id: asSessionId("session_run_engine"),
      title: "Kernel Run Engine",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    }
    const run: RunRecord = {
      id: asRunId("run_run_engine"),
      sessionId: session.id,
      status: "planning",
      startedAt: 2,
      updatedAt: 2,
      trigger: {
        kind: "user_message",
        refId: "message_user_1",
      },
    }
    const toolCalls: ToolCallRecord[] = [
      {
        id: asToolCallId("tool_duplicate_1"),
        sessionId: session.id,
        runId: run.id,
        turnId: asTurnId("turn_1"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "workspace_read_file",
        input: {
          path: "src/App.tsx",
        },
        status: "pending",
        startedAt: 10,
        updatedAt: 10,
      },
      {
        id: asToolCallId("tool_duplicate_2"),
        sessionId: session.id,
        runId: run.id,
        turnId: asTurnId("turn_1"),
        messageId: asMessageId("message_assistant_1"),
        toolName: "workspace_read_file",
        input: {
          path: "src/App.tsx",
        },
        status: "pending",
        startedAt: 11,
        updatedAt: 11,
      },
    ]
    const processorResults: ProcessorResult[] = [
      {
        boundary: { kind: "continue" },
        finishReason: "tool_calls",
        toolCalls,
      },
      {
        boundary: { kind: "completed" },
        finishReason: "stop",
        toolCalls: [],
      },
    ]
    const executedToolCallIds: string[] = []
    const toolCallStore = new MemoryToolCallStore()
    const processorHandle: ProcessorHandle = {
      async accept() {},
      async complete() {
        const next = processorResults.shift()
        if (!next) {
          throw new Error("No processor result queued")
        }

        return next
      },
      async fail(error: unknown) {
        throw error instanceof Error ? error : new Error(String(error))
      },
    }
    const engine = new KernelRunEngine({
      sessionStore: new MemorySessionStore(session),
      runStore: new MemoryRunStore(run),
      turnStore: new MemoryTurnStore(),
      messageStore: new MemoryMessageStore(),
      toolCallStore,
      contextCheckpointStore: new MemoryCheckpointStore(),
      turnInputAssembler: {
        async load() {
          return createTurnInput()
        },
      },
      turnPlanner: {
        async plan(input) {
          return createPlan(input)
        },
      },
      turnPort: {
        async *stream() {},
      },
      streamProcessor: {
        async start() {
          return processorHandle
        },
      },
      toolExecutor: {
        async execute(call: ToolCallRecord, _context: ToolExecutionContext): Promise<ToolExecutionOutcome> {
          executedToolCallIds.push(call.id)
          return {
            kind: "completed",
            output: {
              ok: true,
              path: (call.input as { path: string }).path,
            },
          }
        },
      },
      interactionCoordinator: {
        async block(_input: {
          interaction: InteractionRecord
          runId: RunRecord["id"]
          sessionId: SessionRecord["id"]
        }): Promise<RunBoundary> {
          throw new Error("not used")
        },
        async resume() {},
        async reject() {},
      },
      unitOfWork: {
        async transaction<T>(work: () => Promise<T>) {
          return work()
        },
      },
      clock: {
        now() {
          return Date.now()
        },
      },
      idGenerator: {
        next(prefix: string) {
          return `${prefix}_${Math.random().toString(16).slice(2)}`
        },
      },
    })

    const boundary = await engine.executeUntilBoundary({
      sessionId: session.id,
      runId: run.id,
    })

    expect(boundary).toEqual({
      kind: "completed",
    })
    expect(executedToolCallIds).toEqual(["tool_duplicate_1", "tool_duplicate_2"])

    const storedCalls = await toolCallStore.listByRun(run.id)
    expect(storedCalls.map((item) => item.status)).toEqual(["completed", "completed"])
  })
})
