import type {
  DesktopGitChangeStatus,
  DesktopGitReviewItem,
} from "../../../../shared/desktop-git";
import type { GitPageCopy } from "../i18n";

export type ReviewDiffStyle = "unified" | "split";
export type UnifiedLineTone = "meta" | "hunk" | "added" | "deleted" | "context";
export type SplitLineTone = "context" | "added" | "deleted" | "empty";

export type WorkspaceReviewSplitCell = {
  lineNumber?: number;
  marker: " " | "+" | "-" | "";
  text: string;
  tone: SplitLineTone;
};

export type WorkspaceReviewSplitRow =
  | {
      kind: "hunk";
      key: string;
      header: string;
    }
  | {
      kind: "meta";
      key: string;
      text: string;
    }
  | {
      kind: "line";
      key: string;
      before: WorkspaceReviewSplitCell;
      after: WorkspaceReviewSplitCell;
    };

const REVIEW_HUNK_HEADER_PATTERN = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)?$/;

export function resolveWorkspaceReviewStatusClass(status: DesktopGitChangeStatus) {
  if (status === "added" || status === "untracked") {
    return "is-added";
  }
  if (status === "deleted") {
    return "is-deleted";
  }
  if (status === "renamed") {
    return "is-renamed";
  }
  if (status === "conflict") {
    return "is-conflict";
  }
  return "is-modified";
}

export function splitWorkspaceReviewDirectory(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index < 0) {
    return {
      directory: "",
      filename: normalized,
    };
  }
  return {
    directory: normalized.slice(0, index),
    filename: normalized.slice(index + 1),
  };
}

export function resolveWorkspaceReviewUnifiedPatch(
  copy: GitPageCopy,
  item: DesktopGitReviewItem,
) {
  const patch = item.patch.trim();
  if (patch) {
    return patch;
  }
  return [
    `--- ${item.previousPath ?? item.path}`,
    `+++ ${item.path}`,
    item.after || item.before || copy.reviewNoDiffPlaceholder,
  ].join("\n");
}

export function splitWorkspaceReviewLines(value: string) {
  return value.replace(/\r\n/g, "\n").split("\n");
}

function isWorkspaceReviewPatchNoteLine(line: string) {
  return line.startsWith("\\ ");
}

export function classifyWorkspaceReviewUnifiedLine(line: string): UnifiedLineTone {
  if (line.startsWith("@@")) {
    return "hunk";
  }
  if (line.startsWith("+++ ") || line.startsWith("--- ")) {
    return "meta";
  }
  if (line.startsWith("+")) {
    return "added";
  }
  if (line.startsWith("-")) {
    return "deleted";
  }
  return "context";
}

export function buildWorkspaceReviewUnifiedLines(patch: string) {
  return splitWorkspaceReviewLines(patch)
    .filter((line) => !isWorkspaceReviewPatchNoteLine(line))
    .map((line, index) => ({
      key: `${index}:${classifyWorkspaceReviewUnifiedLine(line)}:${line}`,
      line,
      tone: classifyWorkspaceReviewUnifiedLine(line),
    }));
}

function createWorkspaceReviewSplitCell(input?: Partial<WorkspaceReviewSplitCell>): WorkspaceReviewSplitCell {
  return {
    lineNumber: input?.lineNumber,
    marker: input?.marker ?? "",
    text: input?.text ?? "",
    tone: input?.tone ?? "empty",
  };
}

function parseWorkspaceReviewHunkHeader(line: string) {
  const match = REVIEW_HUNK_HEADER_PATTERN.exec(line);
  if (!match) {
    return null;
  }

  return {
    beforeStart: Number(match[1]),
    afterStart: Number(match[3]),
  };
}

function isWorkspaceReviewRemovedLine(line: string) {
  return line.startsWith("-") && !line.startsWith("---");
}

function isWorkspaceReviewAddedLine(line: string) {
  return line.startsWith("+") && !line.startsWith("+++");
}

function buildWorkspaceReviewSplitFallbackRows(input: {
  before: string;
  after: string;
}): WorkspaceReviewSplitRow[] {
  const beforeLines = splitWorkspaceReviewLines(input.before);
  const afterLines = splitWorkspaceReviewLines(input.after);
  const rowCount = Math.max(beforeLines.length, afterLines.length);

  return Array.from({ length: rowCount }, (_, index) => ({
    kind: "line" as const,
    key: `fallback:${index}`,
    before: beforeLines[index] !== undefined
      ? createWorkspaceReviewSplitCell({
          lineNumber: index + 1,
          marker: " ",
          text: beforeLines[index] ?? "",
          tone: "context",
        })
      : createWorkspaceReviewSplitCell(),
    after: afterLines[index] !== undefined
      ? createWorkspaceReviewSplitCell({
          lineNumber: index + 1,
          marker: " ",
          text: afterLines[index] ?? "",
          tone: "context",
        })
      : createWorkspaceReviewSplitCell(),
  }));
}

export function buildWorkspaceReviewSplitRows(input: {
  patch: string;
  before: string;
  after: string;
}): WorkspaceReviewSplitRow[] {
  const lines = splitWorkspaceReviewLines(input.patch);
  const rows: WorkspaceReviewSplitRow[] = [];
  let beforeLineNumber = 0;
  let afterLineNumber = 0;
  let insideHunk = false;

  const pushChangeBlock = (removedLines: string[], addedLines: string[]) => {
    const rowCount = Math.max(removedLines.length, addedLines.length);
    for (let index = 0; index < rowCount; index += 1) {
      const removed = removedLines[index];
      const added = addedLines[index];
      const before =
        removed !== undefined
          ? createWorkspaceReviewSplitCell({
              lineNumber: beforeLineNumber > 0 ? beforeLineNumber : undefined,
              marker: "-",
              text: removed,
              tone: "deleted",
            })
          : createWorkspaceReviewSplitCell();
      const after =
        added !== undefined
          ? createWorkspaceReviewSplitCell({
              lineNumber: afterLineNumber > 0 ? afterLineNumber : undefined,
              marker: "+",
              text: added,
              tone: "added",
            })
          : createWorkspaceReviewSplitCell();

      if (removed !== undefined) {
        beforeLineNumber += 1;
      }
      if (added !== undefined) {
        afterLineNumber += 1;
      }

      rows.push({
        kind: "line",
        key: `change:${rows.length}:${before.lineNumber ?? "x"}:${after.lineNumber ?? "x"}`,
        before,
        after,
      });
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const hunkHeader = parseWorkspaceReviewHunkHeader(line);
    if (hunkHeader) {
      insideHunk = true;
      beforeLineNumber = hunkHeader.beforeStart;
      afterLineNumber = hunkHeader.afterStart;
      rows.push({
        kind: "hunk",
        key: `hunk:${index}`,
        header: line,
      });
      continue;
    }

    if (!insideHunk || isWorkspaceReviewPatchNoteLine(line)) {
      continue;
    }

    if (line.startsWith(" ")) {
      rows.push({
        kind: "line",
        key: `context:${rows.length}:${beforeLineNumber}:${afterLineNumber}`,
        before: createWorkspaceReviewSplitCell({
          lineNumber: beforeLineNumber > 0 ? beforeLineNumber : undefined,
          marker: " ",
          text: line.slice(1),
          tone: "context",
        }),
        after: createWorkspaceReviewSplitCell({
          lineNumber: afterLineNumber > 0 ? afterLineNumber : undefined,
          marker: " ",
          text: line.slice(1),
          tone: "context",
        }),
      });
      beforeLineNumber += 1;
      afterLineNumber += 1;
      continue;
    }

    if (isWorkspaceReviewRemovedLine(line)) {
      const removedLines: string[] = [];
      while (index < lines.length && isWorkspaceReviewRemovedLine(lines[index] ?? "")) {
        removedLines.push((lines[index] ?? "").slice(1));
        index += 1;
      }

      const addedLines: string[] = [];
      while (index < lines.length && isWorkspaceReviewAddedLine(lines[index] ?? "")) {
        addedLines.push((lines[index] ?? "").slice(1));
        index += 1;
      }

      index -= 1;
      pushChangeBlock(removedLines, addedLines);
      continue;
    }

    if (isWorkspaceReviewAddedLine(line)) {
      const addedLines: string[] = [];
      while (index < lines.length && isWorkspaceReviewAddedLine(lines[index] ?? "")) {
        addedLines.push((lines[index] ?? "").slice(1));
        index += 1;
      }

      index -= 1;
      pushChangeBlock([], addedLines);
      continue;
    }

    rows.push({
      kind: "meta",
      key: `meta:${index}`,
      text: line,
    });
  }

  if (rows.length > 0) {
    return rows;
  }

  return buildWorkspaceReviewSplitFallbackRows({
    before: input.before,
    after: input.after,
  });
}