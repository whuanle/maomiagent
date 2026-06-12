import { describe, expect, test } from "bun:test";

import {
  clearSessionReplying,
  hasSessionFlag,
  markSessionReplying,
  removeSessionFlag,
  resolveSelectedSessionActivity,
  setSessionFlag,
} from "./chat-session-activity-state";

describe("chat session activity state", () => {
  test("tracks sending and stopping by session id", () => {
    const sending = setSessionFlag({}, "session-a");
    const stopping = setSessionFlag({}, "session-b");

    expect(resolveSelectedSessionActivity({
      selectedSessionId: "session-a",
      sendingSessionIds: sending,
      stoppingSessionIds: stopping,
      replyingInteractionIdsBySessionId: {},
    })).toEqual({
      sendingMessage: true,
      stoppingMessage: false,
      replyingInteractionId: null,
    });
  });

  test("clears only the targeted session flag", () => {
    expect(removeSessionFlag({
      "session-a": true,
      "session-b": true,
    }, "session-a")).toEqual({
      "session-b": true,
    });
  });

  test("stores replying interaction ids per session", () => {
    const state = markSessionReplying({}, "session-a", "interaction-a");

    expect(resolveSelectedSessionActivity({
      selectedSessionId: "session-a",
      sendingSessionIds: {},
      stoppingSessionIds: {},
      replyingInteractionIdsBySessionId: state,
    }).replyingInteractionId).toBe("interaction-a");
    expect(clearSessionReplying(state, "session-a")).toEqual({});
  });

  test("treats interaction-triggered continuation as sending for the selected session", () => {
    const sending = setSessionFlag({}, "session-a");
    const replying = markSessionReplying({}, "session-a", "interaction-a");

    expect(resolveSelectedSessionActivity({
      selectedSessionId: "session-a",
      sendingSessionIds: sending,
      stoppingSessionIds: {},
      replyingInteractionIdsBySessionId: replying,
    })).toEqual({
      sendingMessage: true,
      stoppingMessage: false,
      replyingInteractionId: "interaction-a",
    });
  });

  test("ignores activity from other sessions when resolving the selected session", () => {
    const sending = setSessionFlag({}, "session-a");

    expect(hasSessionFlag(sending, "session-a")).toBe(true);
    expect(resolveSelectedSessionActivity({
      selectedSessionId: "session-b",
      sendingSessionIds: sending,
      stoppingSessionIds: {},
      replyingInteractionIdsBySessionId: {},
    })).toEqual({
      sendingMessage: false,
      stoppingMessage: false,
      replyingInteractionId: null,
    });
  });
});
