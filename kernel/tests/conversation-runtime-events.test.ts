import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";

import type { KernelEvent, MessagePart, MessageRecordWithParts } from "../src/core";
import { SqliteMessageStoreAdapter } from "../src/adapters/persistence/sqlite/sqlite-message-store-adapter";
import { SqliteSessionStoreAdapter } from "../src/adapters/persistence/sqlite/sqlite-session-store-adapter";
import { TextStreamProcessor } from "../src/core/processor/text-stream-processor";
import { projectKernelEventToConversationRuntimeEvent } from "../src/host/application/conversation-message-protocol";

describe("conversation runtime events", () => {
  it("emits message.parts.appended for each assistant text delta before text.end", async () => {
    const published: KernelEvent[] = [];
    const messages = new Map<string, MessageRecordWithParts>();
    const idCounters = new Map<string, number>();

    const processor = new TextStreamProcessor({
      messageStore: {
        async append(message, parts) {
          messages.set(message.id, { message, parts: [...parts] });
        },
        async appendParts(messageId, parts) {
          const current = messages.get(messageId);
          if (!current) {
            throw new Error(`message not found: ${messageId}`);
          }

          messages.set(messageId, {
            ...current,
            parts: [...current.parts, ...parts],
          });
        },
        async listBySession() {
          return [];
        },
      },
      toolCallStore: {
        async save() {},
        async patch() {},
        async listByRun() {
          return [];
        },
        async listByTurn() {
          return [];
        },
      },
      clock: {
        now: () => Date.parse("2026-05-04T00:00:00.000Z"),
      },
      idGenerator: {
        next(prefix) {
          const nextValue = (idCounters.get(prefix) ?? 0) + 1;
          idCounters.set(prefix, nextValue);
          return `${prefix}_${nextValue}`;
        },
      },
      eventSink: {
        async publish(events) {
          published.push(...events);
        },
      },
    });

    const assistantMessage = {
      id: "message-1" as never,
      sessionId: "session-1" as never,
      runId: "run-1" as never,
      turnId: "turn-1" as never,
      role: "assistant" as const,
      createdAt: Date.parse("2026-05-04T00:00:00.000Z"),
    };
    messages.set(assistantMessage.id, {
      message: assistantMessage,
      parts: [],
    });

    const handle = await processor.start({
      session: {
        id: "session-1" as never,
        title: "Streaming session",
        status: "active",
        createdAt: Date.parse("2026-05-04T00:00:00.000Z"),
        updatedAt: Date.parse("2026-05-04T00:00:00.000Z"),
      },
      run: {
        id: "run-1" as never,
        sessionId: "session-1" as never,
        status: "streaming",
        startedAt: Date.parse("2026-05-04T00:00:00.000Z"),
        updatedAt: Date.parse("2026-05-04T00:00:00.000Z"),
        trigger: { kind: "user_message" },
      },
      turn: {
        id: "turn-1" as never,
        runId: "run-1" as never,
        sequence: 1,
        status: "running",
        startedAt: Date.parse("2026-05-04T00:00:00.000Z"),
      },
      assistantMessage,
    });

    await handle.accept({ type: "text.start" });

    await handle.accept({ type: "text.delta", delta: "hello " });
    const firstBatch = published.filter((item) => item.type === "message.parts.appended") as KernelEvent<"message.parts.appended">[];
    expect(firstBatch).toHaveLength(1);
    expect(firstBatch[0]?.payload.parts).toEqual([{
      id: "part_1" as never,
      type: "text",
      text: "hello ",
    } satisfies MessagePart]);

    await handle.accept({ type: "text.delta", delta: "stream" });
    const secondBatch = published.filter((item) => item.type === "message.parts.appended") as KernelEvent<"message.parts.appended">[];
    expect(secondBatch).toHaveLength(2);
    expect(secondBatch[1]?.payload.parts).toEqual([{
      id: "part_2" as never,
      type: "text",
      text: "stream",
    } satisfies MessagePart]);

    await handle.accept({ type: "text.end" });

    const textEvents = published.filter((item) => item.type === "message.parts.appended") as KernelEvent<"message.parts.appended">[];
    expect(textEvents).toHaveLength(2);
    expect(textEvents[0]?.payload.message.id).toBe("message-1");
    expect(messages.get(assistantMessage.id)?.parts).toEqual([
      {
        id: "part_1" as never,
        type: "text",
        text: "hello ",
      },
      {
        id: "part_2" as never,
        type: "text",
        text: "stream",
      },
    ]);
  });

  it("projects message.parts.appended into a runtime message delta", () => {
    const kernelEvent: KernelEvent<"message.parts.appended"> = {
      id: "event-1" as never,
      type: "message.parts.appended",
      occurredAt: Date.parse("2026-05-04T00:00:00.010Z"),
      payload: {
        message: {
          id: "message-1" as never,
          sessionId: "session-1" as never,
          runId: "run-1" as never,
          turnId: "turn-1" as never,
          role: "assistant",
          createdAt: Date.parse("2026-05-04T00:00:00.000Z"),
        },
        parts: [{
          id: "part-1" as never,
          type: "text",
          text: "hello stream",
        }],
      },
    };

    const runtimeEvent = projectKernelEventToConversationRuntimeEvent(kernelEvent);
    expect(runtimeEvent).toMatchObject({
      type: "message.parts.appended",
      sessionId: "session-1",
      runId: "run-1",
      message: {
        messageId: "message-1",
        parts: [{
          type: "text",
          partId: "part-1",
          text: "hello stream",
        }],
      },
    });
  });

  it("does not persist an empty assistant shell before the first streamed part", async () => {
    const idCounters = new Map<string, number>();
    const db = new Database(":memory:");
    const messageStore = new SqliteMessageStoreAdapter(db);
    const sessionStore = new SqliteSessionStoreAdapter(db);

    await sessionStore.save({
      id: "session-1" as never,
      title: "Streaming session",
      status: "active",
      createdAt: Date.parse("2026-05-04T00:00:00.000Z"),
      updatedAt: Date.parse("2026-05-04T00:00:00.000Z"),
    });

    const processor = new TextStreamProcessor({
      messageStore,
      toolCallStore: {
        async save() {},
        async patch() {},
        async listByRun() {
          return [];
        },
        async listByTurn() {
          return [];
        },
      },
      clock: {
        now: () => Date.parse("2026-05-04T00:00:00.000Z"),
      },
      idGenerator: {
        next(prefix) {
          const nextValue = (idCounters.get(prefix) ?? 0) + 1;
          idCounters.set(prefix, nextValue);
          return `${prefix}_${nextValue}`;
        },
      },
      eventSink: {
        async publish() {},
      },
    });

    const handle = await processor.start({
      session: {
        id: "session-1" as never,
        title: "Streaming session",
        status: "active",
        createdAt: Date.parse("2026-05-04T00:00:00.000Z"),
        updatedAt: Date.parse("2026-05-04T00:00:00.000Z"),
      },
      run: {
        id: "run-1" as never,
        sessionId: "session-1" as never,
        status: "streaming",
        startedAt: Date.parse("2026-05-04T00:00:00.000Z"),
        updatedAt: Date.parse("2026-05-04T00:00:00.000Z"),
        trigger: { kind: "user_message" },
      },
      turn: {
        id: "turn-1" as never,
        runId: "run-1" as never,
        sequence: 1,
        status: "running",
        startedAt: Date.parse("2026-05-04T00:00:00.000Z"),
      },
      assistantMessage: {
        id: "message-1" as never,
        sessionId: "session-1" as never,
        role: "assistant",
        createdAt: Date.parse("2026-05-04T00:00:00.000Z"),
      },
    });

    await handle.accept({ type: "text.start" });
    expect(await messageStore.listBySession("session-1" as never)).toEqual([]);

    await handle.accept({ type: "text.delta", delta: "hello" });

    expect(await messageStore.listBySession("session-1" as never)).toEqual([
      {
        message: {
          id: "message-1" as never,
          sessionId: "session-1" as never,
          role: "assistant",
          createdAt: Date.parse("2026-05-04T00:00:00.000Z"),
        },
        parts: [{
          id: "part_1" as never,
          type: "text",
          text: "hello",
        } satisfies MessagePart],
      },
    ]);
  });

  it("keeps text delta events granular while coalescing persisted assistant text parts", async () => {
    const published: KernelEvent[] = [];
    const idCounters = new Map<string, number>();
    const db = new Database(":memory:");
    const messageStore = new SqliteMessageStoreAdapter(db);
    const sessionStore = new SqliteSessionStoreAdapter(db);

    await sessionStore.save({
      id: "session-1" as never,
      title: "Streaming session",
      status: "active",
      createdAt: Date.parse("2026-05-04T00:00:00.000Z"),
      updatedAt: Date.parse("2026-05-04T00:00:00.000Z"),
    });

    const assistantMessage = {
      id: "message-1" as never,
      sessionId: "session-1" as never,
      role: "assistant" as const,
      createdAt: Date.parse("2026-05-04T00:00:00.000Z"),
    };

    const processor = new TextStreamProcessor({
      messageStore,
      toolCallStore: {
        async save() {},
        async patch() {},
        async listByRun() {
          return [];
        },
        async listByTurn() {
          return [];
        },
      },
      clock: {
        now: () => Date.parse("2026-05-04T00:00:00.000Z"),
      },
      idGenerator: {
        next(prefix) {
          const nextValue = (idCounters.get(prefix) ?? 0) + 1;
          idCounters.set(prefix, nextValue);
          return `${prefix}_${nextValue}`;
        },
      },
      eventSink: {
        async publish(events) {
          published.push(...events);
        },
      },
    });

    const handle = await processor.start({
      session: {
        id: "session-1" as never,
        title: "Streaming session",
        status: "active",
        createdAt: Date.parse("2026-05-04T00:00:00.000Z"),
        updatedAt: Date.parse("2026-05-04T00:00:00.000Z"),
      },
      run: {
        id: "run-1" as never,
        sessionId: "session-1" as never,
        status: "streaming",
        startedAt: Date.parse("2026-05-04T00:00:00.000Z"),
        updatedAt: Date.parse("2026-05-04T00:00:00.000Z"),
        trigger: { kind: "user_message" },
      },
      turn: {
        id: "turn-1" as never,
        runId: "run-1" as never,
        sequence: 1,
        status: "running",
        startedAt: Date.parse("2026-05-04T00:00:00.000Z"),
      },
      assistantMessage,
    });

    await handle.accept({ type: "text.start" });
    await handle.accept({ type: "text.delta", delta: "hello " });
    await handle.accept({ type: "text.delta", delta: "stream" });
    await handle.accept({ type: "text.end" });

    const textEvents = published.filter((item) => item.type === "message.parts.appended") as KernelEvent<"message.parts.appended">[];
    expect(textEvents).toHaveLength(2);
    expect(textEvents[0]?.payload.parts).toEqual([{
      id: "part_1" as never,
      type: "text",
      text: "hello ",
    } satisfies MessagePart]);
    expect(textEvents[1]?.payload.parts).toEqual([{
      id: "part_2" as never,
      type: "text",
      text: "stream",
    } satisfies MessagePart]);

    const stored = await messageStore.listBySession("session-1" as never);
    expect(stored[0]?.parts).toEqual([{
      id: "part_1" as never,
      type: "text",
      text: "hello stream",
    } satisfies MessagePart]);
  });

  it("coalesces initial persisted text parts during append", async () => {
    const db = new Database(":memory:");
    const sessionStore = new SqliteSessionStoreAdapter(db);
    const messageStore = new SqliteMessageStoreAdapter(db);

    await sessionStore.save({
      id: "session-1" as never,
      title: "Append session",
      status: "active",
      createdAt: Date.parse("2026-05-04T00:00:00.000Z"),
      updatedAt: Date.parse("2026-05-04T00:00:00.000Z"),
    });

    await messageStore.append({
      id: "message-1" as never,
      sessionId: "session-1" as never,
      role: "assistant",
      createdAt: Date.parse("2026-05-04T00:00:00.000Z"),
    }, [
      {
        id: "part-1" as never,
        type: "text",
        text: "hello ",
      },
      {
        id: "part-2" as never,
        type: "text",
        text: "",
      },
      {
        id: "part-3" as never,
        type: "text",
        text: "append",
      },
    ]);

    const stored = await messageStore.listBySession("session-1" as never);
    expect(stored[0]?.parts).toEqual([{
      id: "part-1" as never,
      type: "text",
      text: "hello append",
    } satisfies MessagePart]);
  });

  it("reuses the same tool-call part for persistence and streaming updates", async () => {
    const published: KernelEvent[] = [];
    const messages = new Map<string, MessageRecordWithParts>();
    const idCounters = new Map<string, number>();

    const processor = new TextStreamProcessor({
      messageStore: {
        async append(message, parts) {
          messages.set(message.id, { message, parts: [...parts] });
        },
        async appendParts(messageId, parts) {
          const current = messages.get(messageId);
          if (!current) {
            throw new Error(`message not found: ${messageId}`);
          }

          messages.set(messageId, {
            ...current,
            parts: [...current.parts, ...parts],
          });
        },
        async listBySession() {
          return [];
        },
      },
      toolCallStore: {
        async save() {},
        async patch() {},
        async listByRun() {
          return [];
        },
        async listByTurn() {
          return [];
        },
      },
      clock: {
        now: () => Date.parse("2026-05-04T00:00:00.000Z"),
      },
      idGenerator: {
        next(prefix) {
          const nextValue = (idCounters.get(prefix) ?? 0) + 1;
          idCounters.set(prefix, nextValue);
          return `${prefix}_${nextValue}`;
        },
      },
      eventSink: {
        async publish(events) {
          published.push(...events);
        },
      },
    });

    const assistantMessage = {
      id: "message-1" as never,
      sessionId: "session-1" as never,
      runId: "run-1" as never,
      turnId: "turn-1" as never,
      role: "assistant" as const,
      createdAt: Date.parse("2026-05-04T00:00:00.000Z"),
    };
    messages.set(assistantMessage.id, {
      message: assistantMessage,
      parts: [],
    });

    const handle = await processor.start({
      session: {
        id: "session-1" as never,
        title: "Streaming session",
        status: "active",
        createdAt: Date.parse("2026-05-04T00:00:00.000Z"),
        updatedAt: Date.parse("2026-05-04T00:00:00.000Z"),
      },
      run: {
        id: "run-1" as never,
        sessionId: "session-1" as never,
        status: "streaming",
        startedAt: Date.parse("2026-05-04T00:00:00.000Z"),
        updatedAt: Date.parse("2026-05-04T00:00:00.000Z"),
        trigger: { kind: "user_message" },
      },
      turn: {
        id: "turn-1" as never,
        runId: "run-1" as never,
        sequence: 1,
        status: "running",
        startedAt: Date.parse("2026-05-04T00:00:00.000Z"),
      },
      assistantMessage,
    });

    await handle.accept({
      type: "tool.call",
      toolCallId: "call-1",
      toolName: "search",
      input: { query: "stream" },
    });

    const appendedEvent = published.find((item) => item.type === "message.parts.appended") as KernelEvent<"message.parts.appended"> | undefined;
    const storedPart = messages.get(assistantMessage.id)?.parts[0];

    expect(appendedEvent?.payload.parts[0]?.id).toBe(storedPart?.id);
    expect(appendedEvent?.payload.parts[0]).toEqual(storedPart);
  });
});