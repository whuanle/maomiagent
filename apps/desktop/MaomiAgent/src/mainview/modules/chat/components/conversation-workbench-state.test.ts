import { describe, expect, test } from "bun:test";

import {
  applyConversationWorkbenchDockAction,
  createConversationWorkbenchViewState,
  resizeConversationWorkbenchTerminalPane,
  selectConversationWorkbenchPanel,
} from "./conversation-workbench-state";

describe("conversation workbench state", () => {
  test("toggles terminal visibility from the dock action", () => {
    const initial = createConversationWorkbenchViewState();
    const opened = applyConversationWorkbenchDockAction(initial, "terminal");
    const closed = applyConversationWorkbenchDockAction(opened, "terminal");

    expect(initial.terminalVisible).toBe(false);
    expect(opened.terminalVisible).toBe(true);
    expect(closed.terminalVisible).toBe(false);
  });

  test("stores the resized terminal pane height", () => {
    const initial = createConversationWorkbenchViewState();
    const resized = resizeConversationWorkbenchTerminalPane(initial, [640, 232]);

    expect(resized.paneSizes.terminal).toBe(232);
  });

  test("opens settings panel from the dock action", () => {
    const initial = createConversationWorkbenchViewState();
    const opened = applyConversationWorkbenchDockAction(initial, "settings");

    expect(opened.mainPanelVisible).toBe(true);
    expect(opened.activePanelKey).toBe("settings");
  });

  test("opens browser panel from the dock action", () => {
    const initial = createConversationWorkbenchViewState();
    const opened = applyConversationWorkbenchDockAction(initial, "browser");

    expect(opened.mainPanelVisible).toBe(true);
    expect(opened.activePanelKey).toBe("browser");
  });

  test("keeps browser as the active builtin panel when selected from tabs", () => {
    const initial = createConversationWorkbenchViewState();
    const selected = selectConversationWorkbenchPanel(initial, "browser");

    expect(selected.mainPanelVisible).toBe(true);
    expect(selected.activePanelKey).toBe("browser");
  });
});
