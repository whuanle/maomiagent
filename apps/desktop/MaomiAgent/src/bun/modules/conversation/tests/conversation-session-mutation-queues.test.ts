import { describe, expect, test } from "bun:test";

import { ConversationSessionMutationQueues } from "../implementation/services/conversation-session-mutation-queues";

describe("ConversationSessionMutationQueues", () => {
  test("serializes work for the same session", async () => {
    const queues = new ConversationSessionMutationQueues();
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queues.run("session-a", async () => {
      order.push("first:start");
      await firstGate;
      order.push("first:end");
    });
    const second = queues.run("session-a", async () => {
      order.push("second");
    });

    await Promise.resolve();
    expect(order).toEqual(["first:start"]);

    releaseFirst?.();
    await Promise.all([first, second]);

    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  test("allows different sessions to run in parallel", async () => {
    const queues = new ConversationSessionMutationQueues();
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let secondStarted = false;

    const first = queues.run("session-a", async () => {
      await firstGate;
    });
    const second = queues.run("session-b", async () => {
      secondStarted = true;
    });

    await Promise.resolve();
    expect(secondStarted).toBe(true);

    releaseFirst?.();
    await Promise.all([first, second]);
  });

  test("cleans up an idle session queue so later work still runs", async () => {
    const queues = new ConversationSessionMutationQueues();
    const runs: string[] = [];

    await queues.run("session-a", async () => {
      runs.push("first");
    });
    await queues.run("session-a", async () => {
      runs.push("second");
    });

    expect(runs).toEqual(["first", "second"]);
  });
});
