import { describe, expect, test } from "bun:test";

import {
  applyStopRequested,
  applyStopRpcResolved,
  applyStopTimedOut,
  clearExecutionOverlay,
  recordRuntimeEventActivity,
  resolveSessionExecutionView,
  shouldWaitForStopConfirmation,
} from "./session-execution-overlay";

describe("session execution overlay", () => {
  test("marks stop requested immediately and keeps execution visible while confirmation is pending", () => {
    const requested = applyStopRequested({}, "session-1", "2026-06-08T12:00:00.000Z");
    expect(resolveSessionExecutionView({
      detailStatus: "active",
      overlay: requested["session-1"],
    })).toEqual({
      isExecuting: true,
      isStopping: true,
      phase: "stop_requested",
    });

    const waiting = applyStopRpcResolved(requested, "session-1", {
      stopped: false,
      detailStatus: "active",
      at: "2026-06-08T12:00:02.000Z",
    });

    expect(waiting["session-1"]?.phase).toBe("waiting_stop_confirm");
    expect(shouldWaitForStopConfirmation(waiting["session-1"])).toBe(true);
  });

  test("records runtime activity while stop confirmation is pending", () => {
    const requested = applyStopRequested({}, "session-1", "2026-06-08T12:00:00.000Z");
    const updated = recordRuntimeEventActivity(requested, "session-1", "2026-06-08T12:00:03.000Z");

    expect(updated["session-1"]?.lastRuntimeEventAt).toBe("2026-06-08T12:00:03.000Z");
  });

  test("times out conservatively and keeps retry available until a non-active detail clears the overlay", () => {
    const requested = applyStopRequested({}, "session-1", "2026-06-08T12:00:00.000Z");
    const waiting = applyStopRpcResolved(requested, "session-1", {
      stopped: false,
      detailStatus: "active",
      at: "2026-06-08T12:00:02.000Z",
    });
    const timedOut = applyStopTimedOut(waiting, "session-1", "stop confirmation timed out");

    expect(resolveSessionExecutionView({
      detailStatus: "active",
      overlay: timedOut["session-1"],
    })).toEqual({
      isExecuting: true,
      isStopping: false,
      phase: "stop_timeout",
    });

    const cleared = clearExecutionOverlay(timedOut, "session-1");
    expect(cleared["session-1"]).toBeUndefined();
  });
});
