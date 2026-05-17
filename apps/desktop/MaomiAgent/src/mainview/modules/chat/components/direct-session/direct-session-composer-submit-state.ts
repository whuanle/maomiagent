import type { DirectSessionComposerViewModel } from "./types";

type ComposerLanguage = DirectSessionComposerViewModel["language"];

export function resolveDirectSessionComposerSubmitState(input: {
  language: ComposerLanguage;
  sendLabel: string;
  disabled: boolean;
  sendDisabled: boolean;
  sending: boolean;
  stopping: boolean;
}) {
  const isEn = input.language === "en-US";

  return {
    label: input.stopping
      ? (isEn ? "Stopping" : "正在停止")
      : input.sending
        ? (isEn ? "Stop" : "停止")
        : input.sendLabel,
    disabled: input.stopping
      ? true
      : input.sending
        ? input.disabled
        : input.sendDisabled,
  };
}