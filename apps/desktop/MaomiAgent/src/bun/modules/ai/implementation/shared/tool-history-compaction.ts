type ToolHistoryCompactionInput = {
  toolName: string;
};

type ToolCallHistoryCompactionInput = ToolHistoryCompactionInput & {
  input: unknown;
};

type ToolResultHistoryCompactionInput = ToolHistoryCompactionInput & {
  text: string;
};

const HEAVY_TOOL_NAMES = new Set([
  "workspace_apply_patch",
  "workspace_write_file",
  "workspace_edit_file",
  "workspace_read_file",
  "terminal_execute",
  "terminal_read_output",
]);

const PREVIEW_MAX_LENGTH = 160;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeTextPreview(value: string, maxLength = PREVIEW_MAX_LENGTH): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}...`;
}

function countLines(value: string): number {
  if (!value) {
    return 0;
  }

  return value.split(/\r\n?|\n/g).length;
}

function readJsonRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function summarizeTextBlob(label: string, value: string): string {
  return `${label}; ${value.length} chars; ${countLines(value)} lines; preview: ${normalizeTextPreview(value)}`;
}

function buildHistoricalContentPlaceholder(value: string): string {
  return [
    `[Historical file body omitted from prompt history.]`,
    summarizeTextBlob("Prepared file content", value),
    `When writing again, follow the current tool schema and send the full markdown body in the \`content\` field.`,
  ].join(" ");
}

function buildHistoricalEditPlaceholder(label: string, value: string): string {
  return [
    `[Historical edit fragment omitted from prompt history.]`,
    summarizeTextBlob(label, value),
  ].join(" ");
}

function buildFileOutputSummary(toolName: string, record: Record<string, unknown>, fallbackText: string): string {
  const path = typeof record.path === "string" ? record.path : undefined;
  const mimeType = typeof record.mimeType === "string" ? record.mimeType : undefined;
  const truncated = typeof record.truncated === "boolean" ? record.truncated : undefined;
  const content = typeof record.content === "string" ? record.content : "";
  const summary = toolName === "workspace_write_file"
    ? "Wrote workspace file"
    : "Read workspace file";

  return JSON.stringify({
    summary,
    path,
    mimeType,
    truncated,
    contentChars: content.length,
    contentLines: countLines(content),
    preview: content ? normalizeTextPreview(content) : normalizeTextPreview(fallbackText),
  });
}

function buildTerminalOutputSummary(toolName: string, record: Record<string, unknown> | undefined, fallbackText: string): string {
  const source = record ?? {};
  const stdout = typeof source.stdout === "string" ? source.stdout : "";
  const stderr = typeof source.stderr === "string" ? source.stderr : "";
  const command = typeof source.command === "string" ? source.command : undefined;
  const cwd = typeof source.cwd === "string" ? source.cwd : undefined;
  const exitCode = typeof source.exitCode === "number" ? source.exitCode : undefined;
  const status = typeof source.status === "string" ? source.status : undefined;
  const previewSource = stderr || stdout || fallbackText;
  const summary = toolName === "terminal_execute"
    ? "Started terminal command"
    : "Read terminal output";

  return JSON.stringify({
    summary,
    commandPreview: command ? normalizeTextPreview(command) : undefined,
    cwd,
    status,
    exitCode,
    stdoutChars: stdout.length,
    stderrChars: stderr.length,
    preview: normalizeTextPreview(previewSource),
  });
}

export function compactToolCallHistory(input: ToolCallHistoryCompactionInput): unknown {
  if (!HEAVY_TOOL_NAMES.has(input.toolName) || !isRecord(input.input)) {
    return input.input;
  }

  if (input.toolName === "workspace_write_file") {
    const content = typeof input.input.content === "string" ? input.input.content : "";
    return {
      workspaceId: input.input.workspaceId,
      path: input.input.path,
      content: buildHistoricalContentPlaceholder(content),
    };
  }

  if (input.toolName === "workspace_apply_patch") {
    const patchText = typeof input.input.patchText === "string" ? input.input.patchText : "";
    return {
      workspaceId: input.input.workspaceId,
      patchText: buildHistoricalEditPlaceholder("Historical patch text", patchText),
    };
  }

  if (input.toolName === "workspace_edit_file") {
    const oldText = typeof input.input.oldText === "string" ? input.input.oldText : "";
    const newText = typeof input.input.newText === "string" ? input.input.newText : "";
    return {
      workspaceId: input.input.workspaceId,
      path: input.input.path,
      oldText: buildHistoricalEditPlaceholder("Matched source fragment", oldText),
      newText: buildHistoricalEditPlaceholder("Replacement fragment", newText),
      ...(input.input.replaceAll === true ? { replaceAll: true } : {}),
    };
  }

  if (input.toolName === "workspace_read_file") {
    return {
      workspaceId: input.input.workspaceId,
      path: input.input.path,
    };
  }

  if (input.toolName === "terminal_execute") {
    const command = typeof input.input.command === "string" ? input.input.command : "";
    return {
      workspaceId: input.input.workspaceId,
      cwd: input.input.cwd,
      commandPreview: normalizeTextPreview(command),
      commandChars: command.length,
      commandLines: countLines(command),
    };
  }

  return {
    workspaceId: input.input.workspaceId,
    sessionId: input.input.sessionId,
    readFrom: input.input.readFrom,
  };
}

export function compactToolResultHistory(input: ToolResultHistoryCompactionInput): string {
  if (!HEAVY_TOOL_NAMES.has(input.toolName)) {
    return input.text;
  }

  if (
    input.toolName === "workspace_write_file"
    || input.toolName === "workspace_apply_patch"
    || input.toolName === "workspace_edit_file"
    || input.toolName === "workspace_read_file"
  ) {
    return input.text;
  }

  const parsed = readJsonRecord(input.text);

  return buildTerminalOutputSummary(input.toolName, parsed, input.text);
}
