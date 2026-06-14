export type WorkspacePatchUpdateChunk = {
  oldLines: string[];
  newLines: string[];
  changeContext?: string;
  isEndOfFile?: boolean;
};

type WorkspacePatchReplacement = {
  start: number;
  deleteCount: number;
  inserted: string[];
};

type WorkspacePatchApplyInput = {
  source: string;
  filePath: string;
  chunks: WorkspacePatchUpdateChunk[];
};

type WorkspacePatchApplyResult = {
  content: string;
};

type LineComparer = (left: string, right: string) => boolean;

function normalizeUnicodePunctuation(value: string): string {
  return value
    .replace(/[\u2018\u2019\u201A\u201B]/gu, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/gu, "\"")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/gu, "-")
    .replace(/\u2026/gu, "...")
    .replace(/\u00A0/gu, " ");
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/gu, "\n");
}

function splitLines(value: string): string[] {
  const normalized = normalizeLineEndings(value).split("\n");
  if (normalized.at(-1) === "") {
    normalized.pop();
  }
  return normalized;
}

function tryMatchAt(
  sourceLines: string[],
  pattern: string[],
  startIndex: number,
  compare: LineComparer,
): number {
  const maxStart = sourceLines.length - pattern.length;
  for (let index = startIndex; index <= maxStart; index += 1) {
    const matched = pattern.every((line, offset) => compare(sourceLines[index + offset] ?? "", line));
    if (matched) {
      return index;
    }
  }

  return -1;
}

function seekSequence(
  sourceLines: string[],
  pattern: string[],
  startIndex: number,
  isEndOfFile = false,
): number {
  if (pattern.length === 0) {
    return startIndex;
  }

  const comparers: LineComparer[] = [
    (left, right) => left === right,
    (left, right) => left.trimEnd() === right.trimEnd(),
    (left, right) => left.trim() === right.trim(),
    (left, right) => normalizeUnicodePunctuation(left.trim()) === normalizeUnicodePunctuation(right.trim()),
  ];

  if (isEndOfFile) {
    const eofStart = sourceLines.length - pattern.length;
    if (eofStart >= startIndex) {
      for (const compare of comparers) {
        const matched = pattern.every((line, offset) => compare(sourceLines[eofStart + offset] ?? "", line));
        if (matched) {
          return eofStart;
        }
      }
    }
  }

  for (const compare of comparers) {
    const index = tryMatchAt(sourceLines, pattern, startIndex, compare);
    if (index >= 0) {
      return index;
    }
  }

  return -1;
}

function trimOptionalTerminalBlankLine(lines: string[]): string[] {
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

export function applyWorkspacePatchUpdateChunks(input: WorkspacePatchApplyInput): WorkspacePatchApplyResult {
  const originalLines = splitLines(input.source);
  const replacements: WorkspacePatchReplacement[] = [];
  let lineIndex = 0;

  for (const chunk of input.chunks) {
    if (chunk.changeContext) {
      const contextIndex = seekSequence(originalLines, [chunk.changeContext], lineIndex);
      if (contextIndex < 0) {
        throw new Error(`Failed to find context '${chunk.changeContext}' in ${input.filePath}`);
      }
      lineIndex = contextIndex + 1;
    }

    if (chunk.oldLines.length === 0) {
      replacements.push({
        start: lineIndex,
        deleteCount: 0,
        inserted: trimOptionalTerminalBlankLine(chunk.newLines),
      });
      continue;
    }

    let oldLines = trimOptionalTerminalBlankLine(chunk.oldLines);
    let newLines = trimOptionalTerminalBlankLine(chunk.newLines);
    let found = seekSequence(originalLines, oldLines, lineIndex, chunk.isEndOfFile === true);

    if (found < 0 && oldLines.length !== chunk.oldLines.length) {
      found = seekSequence(originalLines, chunk.oldLines, lineIndex, chunk.isEndOfFile === true);
      if (found >= 0) {
        oldLines = [...chunk.oldLines];
        newLines = [...chunk.newLines];
      }
    }

    if (found < 0) {
      throw new Error(`Failed to find expected lines in ${input.filePath}:\n${chunk.oldLines.join("\n")}`);
    }

    replacements.push({
      start: found,
      deleteCount: oldLines.length,
      inserted: newLines,
    });
    lineIndex = found + oldLines.length;
  }

  const nextLines = [...originalLines];
  for (let index = replacements.length - 1; index >= 0; index -= 1) {
    const replacement = replacements[index]!;
    nextLines.splice(replacement.start, replacement.deleteCount, ...replacement.inserted);
  }

  nextLines.push("");
  return {
    content: nextLines.join("\n"),
  };
}
