import { describe, expect, test } from "bun:test";

import { shouldFocusPrefilledDraft } from "./direct-session-composer-prefill";
import { resolveDirectSessionComposerPopupContainer } from "./direct-session-composer-popup";
import {
  assembleDirectSessionComposerSubmitText,
  removeDirectSessionComposerSlashToken,
} from "./direct-session-composer-submit";
import { resolveDirectSessionComposerSubmitState } from "./direct-session-composer-submit-state";
import {
  applyDirectSessionComposerSlashCommand,
  resolveDirectSessionComposerSlashMatch,
} from "./direct-session-composer-slash";

describe("resolveDirectSessionComposerSubmitState", () => {
  test("uses stopping label and disables submit while a stop is pending", () => {
    expect(resolveDirectSessionComposerSubmitState({
      language: "zh-CN",
      sendLabel: "发送",
      disabled: false,
      sendDisabled: false,
      sending: true,
      stopping: true,
    })).toEqual({
      label: "正在停止",
      disabled: true,
      action: "stop",
    });
  });

  test("keeps stop label while streaming without allowing another send", () => {
    expect(resolveDirectSessionComposerSubmitState({
      language: "en-US",
      sendLabel: "Send",
      disabled: false,
      sendDisabled: true,
      sending: true,
      stopping: false,
    })).toEqual({
      label: "Stop",
      disabled: false,
      action: "stop",
    });
  });

  test("keeps stop label while streaming even when a draft is present", () => {
    expect(resolveDirectSessionComposerSubmitState({
      language: "zh-CN",
      sendLabel: "发送",
      disabled: false,
      sendDisabled: true,
      sending: true,
      stopping: false,
    })).toEqual({
      label: "停止",
      disabled: false,
      action: "stop",
    });
  });
});

describe("shouldFocusPrefilledDraft", () => {
  test("focuses when an external prefilled draft arrives on an empty composer", () => {
    expect(shouldFocusPrefilledDraft(
      "",
      "\n\n---\n注意：\n\n<feishu_doc_context>\ndoc_token: doc_123\n</feishu_doc_context>",
    )).toBe(true);
  });

  test("does not refocus while the user is already editing", () => {
    expect(shouldFocusPrefilledDraft(
      "用户已经输入了问题",
      "用户已经输入了问题，并继续补充",
    )).toBe(false);
  });

  test("does not refocus the composer after the first typed character", () => {
    expect(shouldFocusPrefilledDraft(
      "",
      "你",
      { composerFocused: true },
    )).toBe(false);
  });
});

describe("resolveDirectSessionComposerPopupContainer", () => {
  test("mounts dropdowns to the current document body instead of the clipped composer shell", () => {
    const hostBody = {} as HTMLElement;
    const triggerNode = {
      ownerDocument: {
        body: hostBody,
      },
      parentElement: {} as HTMLElement,
    } as HTMLElement;

    expect(resolveDirectSessionComposerPopupContainer(triggerNode)).toBe(hostBody);
  });
});

describe("resolveDirectSessionComposerSlashMatch", () => {
  const commands = [
    { key: "imagegen", label: "Image Generator", insertText: "imagegen", description: "Generate images" },
    { key: "playwright", label: "Playwright", insertText: "playwright", description: "Browser automation" },
  ];

  test("opens suggestions when the cursor is at a slash token", () => {
    expect(resolveDirectSessionComposerSlashMatch({
      draft: "/pla",
      selectionStart: 4,
      commands,
    })).toEqual({
      query: "pla",
      replaceStart: 0,
      replaceEnd: 4,
      commands: [commands[1]],
    });
  });

  test("falls back to the draft end when the caret position is unavailable", () => {
    expect(resolveDirectSessionComposerSlashMatch({
      draft: "/",
      selectionStart: null,
      commands,
    })).toEqual({
      query: "",
      replaceStart: 0,
      replaceEnd: 1,
      commands,
    });
  });

  test("ignores slashes inside ordinary paths", () => {
    expect(resolveDirectSessionComposerSlashMatch({
      draft: "See src/main.ts",
      selectionStart: "See src/main.ts".length,
      commands,
    })).toBeUndefined();
  });
});

describe("applyDirectSessionComposerSlashCommand", () => {
  test("removes the active slash token and returns the selected command separately", () => {
    expect(applyDirectSessionComposerSlashCommand({
      draft: "Run /pla after this",
      replaceStart: 4,
      replaceEnd: 8,
      command: {
        key: "playwright",
        label: "Playwright",
        insertText: "playwright",
      },
    })).toEqual({
      draft: "Run after this",
      selectionStart: 3,
      selectedCommand: {
        key: "playwright",
        label: "Playwright",
        insertText: "playwright",
      },
    });
  });
});

describe("direct session composer submit helpers", () => {
  test("assembles the selected slash command and draft into the final submit text", () => {
    expect(assembleDirectSessionComposerSubmitText({
      draft: "Inspect localhost:3000",
      selectedSlashCommand: { insertText: "playwright" },
    })).toBe("/playwright\n\nInspect localhost:3000");
  });

  test("removes a slash token without leaving duplicate spaces", () => {
    expect(removeDirectSessionComposerSlashToken({
      draft: "Run /playwright after this",
      replaceStart: 4,
      replaceEnd: 15,
    })).toEqual({
      draft: "Run after this",
      selectionStart: 3,
    });
  });
});
