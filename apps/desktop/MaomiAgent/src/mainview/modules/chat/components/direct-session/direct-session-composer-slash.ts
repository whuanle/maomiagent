import type { ChatSlashCommandOption } from "../../types";

export type DirectSessionComposerSlashMatch = {
  query: string;
  replaceStart: number;
  replaceEnd: number;
  commands: ChatSlashCommandOption[];
};

export type ApplyDirectSessionComposerSlashCommandInput = {
  draft: string;
  replaceStart: number;
  replaceEnd: number;
  command: Pick<ChatSlashCommandOption, "insertText">;
};

function isWhitespace(value: string | undefined) {
  return value ? /\s/u.test(value) : true;
}

export function resolveDirectSessionComposerSlashMatch(input: {
  draft: string;
  selectionStart: number;
  commands?: readonly ChatSlashCommandOption[];
}): DirectSessionComposerSlashMatch | undefined {
  const commands = input.commands ?? [];
  if (commands.length === 0) {
    return undefined;
  }

  const selectionStart = Math.max(0, Math.min(input.selectionStart, input.draft.length));
  let replaceStart = selectionStart;
  while (replaceStart > 0 && !isWhitespace(input.draft[replaceStart - 1])) {
    replaceStart -= 1;
  }

  let replaceEnd = selectionStart;
  while (replaceEnd < input.draft.length && !isWhitespace(input.draft[replaceEnd])) {
    replaceEnd += 1;
  }

  const token = input.draft.slice(replaceStart, selectionStart);
  if (!token.startsWith("/") || token.slice(1).includes("/")) {
    return undefined;
  }

  if (replaceStart > 0 && !isWhitespace(input.draft[replaceStart - 1])) {
    return undefined;
  }

  const query = token.slice(1).trim().toLowerCase();
  const filteredCommands = commands.filter((command) => {
    if (!query) {
      return true;
    }

    const haystack = [
      command.label,
      command.insertText,
      command.description ?? "",
    ].join(" ").toLowerCase();

    return haystack.includes(query);
  });

  if (filteredCommands.length === 0) {
    return undefined;
  }

  return {
    query,
    replaceStart,
    replaceEnd,
    commands: filteredCommands,
  };
}

export function applyDirectSessionComposerSlashCommand(
  input: ApplyDirectSessionComposerSlashCommandInput,
) {
  const prefix = input.draft.slice(0, input.replaceStart);
  const suffix = input.draft.slice(input.replaceEnd);
  const separator = suffix.startsWith(" ") || suffix.startsWith("\n") || !suffix ? "" : " ";
  const nextDraft = `${prefix}/${input.command.insertText}${separator}${suffix}`;
  const nextSelectionStart = `${prefix}/${input.command.insertText}`.length + separator.length;

  return {
    draft: nextDraft,
    selectionStart: nextSelectionStart,
  };
}
