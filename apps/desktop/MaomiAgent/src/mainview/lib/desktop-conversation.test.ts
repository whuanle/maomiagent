import { afterEach, describe, expect, test } from "bun:test";

import type {
  DesktopConversationRenameSessionInput,
  DesktopConversationRenameSessionResponse,
} from "../../shared/desktop-conversation";
import {
  DESKTOP_CONVERSATION_INVALIDATED_EVENT,
  hasDesktopConversationBridge,
  renameDesktopConversationSession,
} from "./desktop-conversation";

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

describe("desktop conversation bridge", () => {
  const request: DesktopConversationRenameSessionInput = {
    sessionId: "session-alpha",
    title: "  Renamed  ",
  };

  const response: DesktopConversationRenameSessionResponse = {
    item: {
      sessionId: "session-alpha",
      workspaceId: "workspace-1",
      title: "Renamed",
      status: "idle",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:01:00.000Z",
    },
  };

  test("rejects when the desktop conversation bridge is unavailable", () => {
    installTestWindow({});

    expect(hasDesktopConversationBridge()).toBe(false);
    expect(() => renameDesktopConversationSession(request)).toThrow(
      "Desktop conversation bridge is unavailable.",
    );
  });

  test("forwards rename requests and emits a session invalidation", async () => {
    const calls: DesktopConversationRenameSessionInput[] = [];
    const dispatched: CustomEvent[] = [];

    installTestWindow({
      maomiDesktopConversation: {
        renameDesktopConversationSession: async (input) => {
          calls.push(input);
          return response;
        },
      } as Window["maomiDesktopConversation"],
      dispatchEvent: ((event: Event) => {
        dispatched.push(event as CustomEvent);
        return true;
      }) as TestWindow["dispatchEvent"],
      CustomEvent: globalThis.CustomEvent,
    });

    expect(hasDesktopConversationBridge()).toBe(true);
    await expect(renameDesktopConversationSession(request)).resolves.toEqual(response);
    expect(calls).toEqual([request]);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.type).toBe(DESKTOP_CONVERSATION_INVALIDATED_EVENT);
    expect(dispatched[0]?.detail).toMatchObject({
      action: "session.updated",
      sessionId: request.sessionId,
    });
  });
});
