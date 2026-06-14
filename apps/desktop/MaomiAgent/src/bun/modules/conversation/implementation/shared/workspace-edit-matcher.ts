export const WORKSPACE_EDIT_MATCH_STRATEGIES = [
  "exact",
  "trim_end",
  "indentation_flexible",
  "context_aware",
  "trim",
  "anchor",
  "whitespace_normalized",
] as const;

export type WorkspaceEditMatchStrategy = (typeof WORKSPACE_EDIT_MATCH_STRATEGIES)[number];
export type WorkspaceEditMatchFailureCode = "not_found" | "ambiguous";

export class WorkspaceEditMatchError extends Error {
  code: WorkspaceEditMatchFailureCode;
  attemptedStrategies: WorkspaceEditMatchStrategy[];
  matchCount?: number;

  constructor(input: {
    code: WorkspaceEditMatchFailureCode;
    message: string;
    attemptedStrategies: WorkspaceEditMatchStrategy[];
    matchCount?: number;
  }) {
    super(input.message);
    this.name = "WorkspaceEditMatchError";
    this.code = input.code;
    this.attemptedStrategies = input.attemptedStrategies;
    this.matchCount = input.matchCount;
  }
}

type WorkspaceEditCandidate = {
  start: number;
  end: number;
  resolvedFragment: string;
  strategy: WorkspaceEditMatchStrategy;
};

type LineWindow = {
  start: number;
  end: number;
  fragment: string;
  lines: string[];
};

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/gu, "\n");
}

function normalizeUnicodePunctuation(value: string): string {
  return value
    .replace(/[\u2018\u2019\u201A\u201B]/gu, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/gu, "\"")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/gu, "-")
    .replace(/\u2026/gu, "...")
    .replace(/\u00A0/gu, " ");
}

function countNewlineCharacters(value: string): number {
  return Array.from(value).filter((character) => character === "\n").length;
}

function buildLineStarts(value: string): number[] {
  const starts = [0];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\n" && index + 1 <= value.length) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function getLineWindows(content: string, lineCount: number): LineWindow[] {
  const normalized = normalizeLineEndings(content);
  const lineStarts = buildLineStarts(normalized);
  const lines = normalized.split("\n");
  const effectiveLineCount = lines.at(-1) === "" ? lines.length - 1 : lines.length;
  const windows: LineWindow[] = [];

  for (let startLine = 0; startLine + lineCount <= effectiveLineCount; startLine += 1) {
    const start = lineStarts[startLine] ?? 0;
    const end = startLine + lineCount < lineStarts.length
      ? (lineStarts[startLine + lineCount] ?? normalized.length)
      : normalized.length;
    const fragment = normalized.slice(start, end).replace(/\n$/u, "");
    windows.push({
      start,
      end: start + fragment.length,
      fragment,
      lines: fragment.split("\n"),
    });
  }

  return windows;
}

function collectExactMatches(content: string, oldText: string): WorkspaceEditCandidate[] {
  const normalizedContent = normalizeLineEndings(content);
  const normalizedOldText = normalizeLineEndings(oldText);
  const matches: WorkspaceEditCandidate[] = [];
  let searchFrom = 0;

  while (searchFrom <= normalizedContent.length) {
    const matchIndex = normalizedContent.indexOf(normalizedOldText, searchFrom);
    if (matchIndex < 0) {
      break;
    }

    matches.push({
      start: matchIndex,
      end: matchIndex + normalizedOldText.length,
      resolvedFragment: normalizedContent.slice(matchIndex, matchIndex + normalizedOldText.length),
      strategy: "exact",
    });
    searchFrom = matchIndex + Math.max(1, normalizedOldText.length);
  }

  return matches;
}

function collectLineBasedMatches(input: {
  content: string;
  oldText: string;
  strategy: WorkspaceEditMatchStrategy;
  compare: (windowLines: string[], searchLines: string[]) => boolean;
}): WorkspaceEditCandidate[] {
  const searchLines = normalizeLineEndings(input.oldText).split("\n");
  const windows = getLineWindows(input.content, searchLines.length);

  return windows
    .filter((window) => input.compare(window.lines, searchLines))
    .map((window) => ({
      start: window.start,
      end: window.end,
      resolvedFragment: window.fragment,
      strategy: input.strategy,
    }));
}

function normalizeWhitespace(value: string): string {
  return normalizeUnicodePunctuation(value).replace(/\s+/gu, " ").trim();
}

function removeSharedIndentation(lines: string[]): string[] {
  const indents = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^\s*/u)?.[0].length ?? 0);
  const sharedIndent = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(sharedIndent));
}

function collectTrimEndMatches(content: string, oldText: string): WorkspaceEditCandidate[] {
  return collectLineBasedMatches({
    content,
    oldText,
    strategy: "trim_end",
    compare: (windowLines, searchLines) => windowLines.every((line, index) => line.trimEnd() === (searchLines[index] ?? "").trimEnd()),
  });
}

function collectTrimMatches(content: string, oldText: string): WorkspaceEditCandidate[] {
  return collectLineBasedMatches({
    content,
    oldText,
    strategy: "trim",
    compare: (windowLines, searchLines) => windowLines.every((line, index) => line.trim() === (searchLines[index] ?? "").trim()),
  });
}

function collectWhitespaceNormalizedMatches(content: string, oldText: string): WorkspaceEditCandidate[] {
  return collectLineBasedMatches({
    content,
    oldText,
    strategy: "whitespace_normalized",
    compare: (windowLines, searchLines) => windowLines.every((line, index) => normalizeWhitespace(line) === normalizeWhitespace(searchLines[index] ?? "")),
  });
}

function collectIndentationFlexibleMatches(content: string, oldText: string): WorkspaceEditCandidate[] {
  const searchLines = normalizeLineEndings(oldText).split("\n");
  if (searchLines.length < 2) {
    return [];
  }

  return collectLineBasedMatches({
    content,
    oldText,
    strategy: "indentation_flexible",
    compare: (windowLines, candidateLines) => {
      const normalizedWindowLines = removeSharedIndentation(windowLines);
      const normalizedCandidateLines = removeSharedIndentation(candidateLines);
      const equalWhenTrimmed = normalizedWindowLines.every((line, index) => line.trim() === (normalizedCandidateLines[index] ?? "").trim());
      if (!equalWhenTrimmed) {
        return false;
      }

      return normalizedWindowLines.some((line, index) => {
        const candidateLine = normalizedCandidateLines[index] ?? "";
        return line !== candidateLine && line.trim() === candidateLine.trim();
      });
    },
  });
}

function collectAnchorMatches(content: string, oldText: string): WorkspaceEditCandidate[] {
  const searchLines = normalizeLineEndings(oldText).split("\n");
  if (searchLines.length < 2) {
    return [];
  }

  const firstLine = searchLines[0]!.trim();
  const lastLine = searchLines.at(-1)!.trim();
  return collectLineBasedMatches({
    content,
    oldText,
    strategy: "anchor",
    compare: (windowLines) => windowLines[0]?.trim() === firstLine && windowLines.at(-1)?.trim() === lastLine,
  });
}

function collectContextAwareMatches(content: string, oldText: string): WorkspaceEditCandidate[] {
  const searchLines = normalizeLineEndings(oldText).split("\n");
  if (searchLines.length < 3) {
    return [];
  }

  const firstLine = searchLines[0]!.trim();
  const lastLine = searchLines.at(-1)!.trim();
  const expectedLineCount = searchLines.length;
  return collectLineBasedMatches({
    content,
    oldText,
    strategy: "context_aware",
    compare: (windowLines, candidateLines) => {
      if (windowLines.length !== expectedLineCount) {
        return false;
      }

      if (windowLines[0]?.trim() !== firstLine || windowLines.at(-1)?.trim() !== lastLine) {
        return false;
      }

      const middleWindow = windowLines.slice(1, -1);
      const middleCandidate = candidateLines.slice(1, -1);
      const sameMiddleLineCount = middleWindow.length === middleCandidate.length;
      if (!sameMiddleLineCount) {
        return false;
      }

      const overlapCount = middleWindow.filter((line, index) => line.trim() === (middleCandidate[index] ?? "").trim()).length;
      return overlapCount < middleWindow.length;
    },
  });
}

export function resolveWorkspaceEditMatch(input: {
  content: string;
  oldText: string;
}): {
  resolvedFragment: string;
  strategy: WorkspaceEditMatchStrategy;
  matchCount: number;
} {
  const normalizedContent = normalizeLineEndings(input.content);
  const normalizedOldText = normalizeLineEndings(input.oldText);
  const attemptedStrategies = [...WORKSPACE_EDIT_MATCH_STRATEGIES];
  const lineCount = Math.max(1, countNewlineCharacters(normalizedOldText) + 1);

  const strategyCollectors: Array<[WorkspaceEditMatchStrategy, () => WorkspaceEditCandidate[]]> = [
    ["exact", () => collectExactMatches(normalizedContent, normalizedOldText)],
    ["trim_end", () => lineCount >= 1 ? collectTrimEndMatches(normalizedContent, normalizedOldText) : []],
    ["indentation_flexible", () => lineCount >= 2 ? collectIndentationFlexibleMatches(normalizedContent, normalizedOldText) : []],
    ["context_aware", () => lineCount >= 3 ? collectContextAwareMatches(normalizedContent, normalizedOldText) : []],
    ["trim", () => lineCount >= 1 ? collectTrimMatches(normalizedContent, normalizedOldText) : []],
    ["anchor", () => lineCount >= 2 ? collectAnchorMatches(normalizedContent, normalizedOldText) : []],
    ["whitespace_normalized", () => lineCount >= 1 ? collectWhitespaceNormalizedMatches(normalizedContent, normalizedOldText) : []],
  ];

  const matchesByLocation = new Map<string, WorkspaceEditCandidate>();
  for (const [strategy, collect] of strategyCollectors) {
    const matches = collect();
    for (const match of matches) {
      const key = `${match.start}:${match.end}`;
      if (!matchesByLocation.has(key)) {
        matchesByLocation.set(key, { ...match, strategy });
      }
    }

    if (matchesByLocation.size === 1) {
      const onlyMatch = Array.from(matchesByLocation.values())[0]!;
      return {
        resolvedFragment: onlyMatch.resolvedFragment,
        strategy: onlyMatch.strategy,
        matchCount: 1,
      };
    }

    if (matchesByLocation.size > 1) {
      throw new WorkspaceEditMatchError({
        code: "ambiguous",
        message: "Found multiple matches for oldText. Provide more surrounding context.",
        attemptedStrategies,
        matchCount: matchesByLocation.size,
      });
    }
  }

  throw new WorkspaceEditMatchError({
    code: "not_found",
    message: "Could not find oldText in content.",
    attemptedStrategies,
  });
}
