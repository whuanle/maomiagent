import { describe, expect, test } from "bun:test";

import { shouldFocusPrefilledDraft } from "./direct-session-composer-prefill";
import { resolveDirectSessionComposerPopupContainer } from "./direct-session-composer-popup";
import { resolveDirectSessionComposerSubmitState } from "./direct-session-composer-submit-state";

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
    });
  });

  test("keeps stop label when still streaming without a stop request", () => {
    expect(resolveDirectSessionComposerSubmitState({
      language: "en-US",
      sendLabel: "Send",
      disabled: false,
      sendDisabled: false,
      sending: true,
      stopping: false,
    })).toEqual({
      label: "Stop",
      disabled: false,
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
