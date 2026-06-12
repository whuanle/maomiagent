import type { ChatSlashCommandOption } from "../../types";

export function assembleDirectSessionComposerSubmitText(input: {
  draft: string;
  selectedSlashCommand?: Pick<ChatSlashCommandOption, "insertText">;
}) {
  const draft = input.draft.trim();
  const command = input.selectedSlashCommand?.insertText?.trim();

  if (!command) {
    return draft;
  }

  return draft ? `/${command}\n\n${draft}` : `/${command}`;
}

export function removeDirectSessionComposerSlashToken(input: {
  draft: string;
  replaceStart: number;
  replaceEnd: number;
}) {
  const rawPrefix = input.draft.slice(0, input.replaceStart);
  const rawSuffix = input.draft.slice(input.replaceEnd);
  const prefix = rawPrefix.replace(/\s+$/u, "");
  const suffix = rawSuffix.replace(/^\s+/u, "");
  const joiner = prefix && suffix ? " " : "";

  return {
    draft: `${prefix}${joiner}${suffix}`,
    selectionStart: prefix.length,
  };
}
