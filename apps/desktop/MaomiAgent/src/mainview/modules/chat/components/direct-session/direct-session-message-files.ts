import type { ConversationMessagePartView } from "#maomiagent/kernel/src/host/application";

export type DirectSessionModifiedMessageFileAction = "create" | "delete" | "modify" | "read";

export type DirectSessionModifiedMessageFile = {
  path: string;
  action: DirectSessionModifiedMessageFileAction;
  affectedLines?: number;
  additions?: number;
  deletions?: number;
};

function trimText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function countTextLines(value: string) {
  if (!value) {
    return 0;
  }

  return value.replace(/\r\n/g, "\n").split("\n").length;
}

function combineCount(current: number | undefined, next: number | undefined) {
  if (current === undefined) {
    return next;
  }

  if (next === undefined) {
    return current;
  }

  return current + next;
}

function parsePatchLineStats(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  let additions = 0;
  let deletions = 0;
  for (const line of value.split(/\r?\n/u)) {
    if (!line || line.startsWith("@@") || line.startsWith("+++") || line.startsWith("---") || line.startsWith("\\")) {
      continue;
    }

    if (line.startsWith("+")) {
      additions += 1;
      continue;
    }

    if (line.startsWith("-")) {
      deletions += 1;
    }
  }

  if (additions === 0 && deletions === 0) {
    return undefined;
  }

  return {
    additions,
    deletions,
    affectedLines: additions + deletions,
  };
}

function resolveToolCallRecord(part: Extract<ConversationMessagePartView, { type: "tool_result" }>) {
  return isRecord(part.toolCall) ? part.toolCall : undefined;
}

function resolveModifiedFileAction(part: Extract<ConversationMessagePartView, { type: "tool_result" }>): DirectSessionModifiedMessageFileAction {
  const toolName = trimText(part.toolName).toLowerCase();
  const output = resolveToolCallRecord(part)?.output;
  const outputRecord = isRecord(output) ? output : undefined;
  if (outputRecord?.deleted === true || /(delete|remove|unlink)/u.test(toolName)) {
    return "delete";
  }

  if (outputRecord?.created === true || /(create_file|create-directory|create_directory|mkdir)/u.test(toolName)) {
    return "create";
  }

  if (/(read|view|cat)/u.test(toolName)) {
    return "read";
  }

  return "modify";
}

function resolveModifiedFileStats(
  part: Extract<ConversationMessagePartView, { type: "tool_result" }>,
  action: DirectSessionModifiedMessageFileAction,
) {
  const toolCall = resolveToolCallRecord(part);
  const output = isRecord(toolCall?.output) ? toolCall.output : undefined;
  const input = isRecord(toolCall?.input) ? toolCall.input : isRecord(part.input) ? part.input : undefined;

  const additions = readNumber(output?.additions);
  const deletions = readNumber(output?.deletions);
  if (additions !== undefined || deletions !== undefined) {
    const normalizedAdditions = additions ?? 0;
    const normalizedDeletions = deletions ?? 0;
    return {
      additions: normalizedAdditions,
      deletions: normalizedDeletions,
      affectedLines: normalizedAdditions + normalizedDeletions,
    };
  }

  const patchStats = parsePatchLineStats(output?.patch) ?? parsePatchLineStats(input?.patch);
  if (patchStats) {
    return patchStats;
  }

  const content = typeof output?.content === "string"
    ? output.content
    : typeof input?.content === "string"
      ? input.content
      : undefined;
  if (content === undefined) {
    return undefined;
  }

  const lineCount = countTextLines(content);
  if (action === "create") {
    return {
      additions: lineCount,
      deletions: 0,
      affectedLines: lineCount,
    };
  }

  if (action === "delete") {
    return {
      additions: 0,
      deletions: lineCount,
      affectedLines: lineCount,
    };
  }

  return {
    affectedLines: lineCount,
  };
}

function isWriteLikeToolPart(part: Extract<ConversationMessagePartView, { type: "tool_result" }>) {
  const operationKind = trimText(part.toolCall?.operation.kind);
  if (operationKind === "file_write") {
    return true;
  }

  if (operationKind && operationKind !== "tool_execution") {
    return false;
  }

  const toolName = trimText(part.toolName).toLowerCase();
  return /(apply_patch|create_file|write|edit|update|patch|delete|remove)/.test(toolName);
}

function isSuccessfulWriteResultPart(
  part: ConversationMessagePartView,
): part is Extract<ConversationMessagePartView, { type: "tool_result" }> {
  return part.type === "tool_result"
    && part.toolCall?.status === "completed"
    && !part.toolCall?.error
    && isWriteLikeToolPart(part);
}

export function resolveModifiedMessageFiles(
  parts: readonly ConversationMessagePartView[],
): DirectSessionModifiedMessageFile[] {
  const files = new Map<string, DirectSessionModifiedMessageFile>();

  for (const part of parts) {
    if (!isSuccessfulWriteResultPart(part)) {
      continue;
    }

    for (const targetPath of part.toolCall?.operation.targetPaths ?? []) {
      const normalizedPath = trimText(targetPath);
      if (!normalizedPath) {
        continue;
      }

      const action = resolveModifiedFileAction(part);
      const stats = resolveModifiedFileStats(part, action);
      const current = files.get(normalizedPath);

      files.set(normalizedPath, {
        path: normalizedPath,
        action,
        additions: combineCount(current?.additions, stats?.additions),
        deletions: combineCount(current?.deletions, stats?.deletions),
        affectedLines: combineCount(current?.affectedLines, stats?.affectedLines),
      });
    }
  }

  return [...files.values()];
}
