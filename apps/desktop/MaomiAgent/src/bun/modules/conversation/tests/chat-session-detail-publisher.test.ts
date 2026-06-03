import { describe, expect, test } from "bun:test";

import { ChatSessionDetailPublisher } from "../implementation/services/chat-session-detail-publisher";

describe("ChatSessionDetailPublisher", () => {
  test("throttles progress publishes more aggressively as a turn ages", () => {
    let now = 1_000;
    const publisher = new ChatSessionDetailPublisher({
      now: () => now,
    });

    expect(publisher.request({
      kind: "progress",
      sessionId: "session-1",
      turnStartedAt: 0,
      structuralChange: false,
    })).toEqual({
      kind: "publish_now",
    });

    now = 1_100;
    const earlyDelay = publisher.request({
      kind: "progress",
      sessionId: "session-1",
      turnStartedAt: 0,
      structuralChange: false,
    });
    expect(earlyDelay).toEqual({
      kind: "delay",
      delayMs: 150,
      dueAt: 1_250,
    });

    now = 4_200;
    expect(publisher.request({
      kind: "progress",
      sessionId: "session-2",
      turnStartedAt: 0,
      structuralChange: false,
    })).toEqual({
      kind: "publish_now",
    });

    now = 4_500;
    const midDelay = publisher.request({
      kind: "progress",
      sessionId: "session-2",
      turnStartedAt: 0,
      structuralChange: false,
    });
    expect(midDelay).toEqual({
      kind: "delay",
      delayMs: 200,
      dueAt: 4_700,
    });

    now = 17_000;
    expect(publisher.request({
      kind: "progress",
      sessionId: "session-3",
      turnStartedAt: 0,
      structuralChange: false,
    })).toEqual({
      kind: "publish_now",
    });

    now = 17_300;
    const lateDelay = publisher.request({
      kind: "progress",
      sessionId: "session-3",
      turnStartedAt: 0,
      structuralChange: false,
    });
    expect(lateDelay).toEqual({
      kind: "delay",
      delayMs: 700,
      dueAt: 18_000,
    });
  });

  test("bypasses throttling for structural changes and final publishes", () => {
    let now = 10_000;
    const publisher = new ChatSessionDetailPublisher({
      now: () => now,
    });

    expect(publisher.request({
      kind: "progress",
      sessionId: "session-1",
      turnStartedAt: 0,
      structuralChange: false,
    })).toEqual({
      kind: "publish_now",
    });

    now = 10_100;
    expect(publisher.request({
      kind: "progress",
      sessionId: "session-1",
      turnStartedAt: 0,
      structuralChange: true,
    })).toEqual({
      kind: "publish_now",
    });

    now = 10_200;
    expect(publisher.request({
      kind: "final",
      sessionId: "session-1",
      turnStartedAt: 0,
      structuralChange: false,
    })).toEqual({
      kind: "publish_now",
    });
  });
});
