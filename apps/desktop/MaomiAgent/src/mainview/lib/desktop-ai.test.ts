import { afterEach, describe, expect, test } from "bun:test";

import type {
  DesktopAiOneShotRequest,
  DesktopAiOneShotResponse,
} from "../../shared/desktop-ai";
import {
  executeDesktopAiOneShot,
  hasDesktopAiBridge,
} from "./desktop-ai";

const originalWindow = globalThis.window;

type TestWindow = Window & typeof globalThis;

function installTestWindow(windowValue: Partial<TestWindow>) {
  Object.defineProperty(globalThis, "window", {
    value: windowValue,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  if (typeof originalWindow === "undefined") {
    delete (globalThis as { window?: Window }).window;
    return;
  }

  Object.defineProperty(globalThis, "window", {
    value: originalWindow,
    configurable: true,
    writable: true,
  });
});

describe("desktop ai bridge", () => {
  const request: DesktopAiOneShotRequest = {
    workspaceId: "workspace-a",
    selectedChannelId: "channel-a",
    selectedModelId: "model-a",
    messages: [{ role: "user", content: "Generate a title" }],
  };

  const response: DesktopAiOneShotResponse = {
    sessionId: "session-a",
    runId: "run-a",
    turnId: "turn-a",
    content: "Example title",
    reasoning: [],
    target: {
      providerType: "openai",
      channelId: "channel-a",
      modelId: "model-a",
    },
  };

  test("rejects when the desktop ai bridge is unavailable", async () => {
    installTestWindow({});

    expect(hasDesktopAiBridge()).toBe(false);
    expect(() => executeDesktopAiOneShot(request)).toThrow(
      "Desktop AI bridge is unavailable.",
    );
  });

  test("forwards one-shot requests through the desktop ai bridge", async () => {
    const calls: DesktopAiOneShotRequest[] = [];

    installTestWindow({
      maomiDesktopAi: {
        executeDesktopAiOneShot: async (input) => {
          calls.push(input);
          return response;
        },
      },
    });

    expect(hasDesktopAiBridge()).toBe(true);
    await expect(executeDesktopAiOneShot(request)).resolves.toEqual(response);
    expect(calls).toEqual([request]);
  });
});