import type { ChatSlashCommandOption } from "../../types";
import { removeDirectSessionComposerSlashToken } from "./direct-session-composer-submit";

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
  command: Pick<ChatSlashCommandOption, "key" | "label" | "insertText" | "description">;
};

function isWhitespace(value: string | undefined) {
  return value ? /\s/u.test(value) : true;
}

export function resolveDirectSessionComposerSlashMatch(input: {
  draft: string;
  selectionStart: number | null | undefined;
  commands?: readonly ChatSlashCommandOption[];
}): DirectSessionComposerSlashMatch | undefined {
  const commands = input.commands ?? [];
  if (commands.length === 0) {
    return undefined;
  }

  const requestedSelectionStart = typeof input.selectionStart === "number" && Number.isFinite(input.selectionStart)
    ? input.selectionStart
    : input.draft.length;
  const selectionStart = Math.max(0, Math.min(requestedSelectionStart, input.draft.length));
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
  const nextState = removeDirectSessionComposerSlashToken({
    draft: input.draft,
    replaceStart: input.replaceStart,
    replaceEnd: input.replaceEnd,
  });

  return {
    ...nextState,
    selectedCommand: input.command,
  };
}
