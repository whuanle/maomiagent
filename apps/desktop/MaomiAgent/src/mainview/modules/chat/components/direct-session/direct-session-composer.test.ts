import { describe, expect, test } from "bun:test";

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