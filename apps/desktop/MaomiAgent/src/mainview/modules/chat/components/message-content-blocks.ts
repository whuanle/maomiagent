import type { ConversationMessageBlock } from "./message-content-types";

export type ConversationMessageBlockParseEntry = {
  block: ConversationMessageBlock;
  startOffset: number;
  endOffset: number;
};

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function buildLineStartOffsets(lines: string[]) {
  const offsets: number[] = [];
  let offset = 0;

  lines.forEach((line, index) => {
    offsets.push(offset);
    offset += line.length;
    if (index < lines.length - 1) {
      offset += 1;
    }
  });

  return offsets;
}

function isBlankLine(line: string) {
  return !line.trim();
}

function resolveMarkdownCodeFenceLanguage(info: string): string | undefined {
  if (!info) {
    return undefined;
  }

  const token = info.match(/^(\{[^}]+\}|[^\s]+)/)?.[1] ?? "";
  if (!token) {
    return undefined;
  }

  const normalizedToken = token
    .replace(/^\{+/, "")
    .replace(/\}+$/, "")
    .trim();
  if (!normalizedToken) {
    return undefined;
  }

  const normalizedLanguage = normalizedToken
    .replace(/^\./, "")
    .replace(/^language-/i, "");

  return normalizedLanguage || undefined;
}

function isCodeFenceOpening(line: string) {
  const match = line.match(/^\s*([`~]{3,})(.*)$/);
  if (!match) {
    return null;
  }

  return {
    marker: match[1] ?? "",
    infoString: resolveMarkdownCodeFenceLanguage((match[2] ?? "").trim()),
  };
}

function isHeadingLine(line: string) {
  return line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*$/);
}

function isBlockquoteLine(line: string) {
  return /^\s*>\s?/.test(line);
}

function isUnorderedListLine(line: string) {
  return /^(\s*)[-*+]\s+/.test(line);
}

function isOrderedListLine(line: string) {
  return /^(\s*)\d+\.\s+/.test(line);
}

function isDividerLine(line: string) {
  return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) {
    return [];
  }

  const source = trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  let escaped = false;

  for (const char of source) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (escaped) {
    current += "\\";
  }

  cells.push(current.trim());
  return cells;
}

function isMarkdownTableSeparatorLine(line: string) {
  const cells = splitMarkdownTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function resolveMarkdownTableAlign(cell: string): "left" | "center" | "right" | undefined {
  const compact = cell.replace(/\s+/g, "");
  if (!compact) {
    return undefined;
  }

  if (compact.startsWith(":") && compact.endsWith(":")) {
    return "center";
  }
  if (compact.endsWith(":")) {
    return "right";
  }
  if (compact.startsWith(":")) {
    return "left";
  }

  return undefined;
}

function isMarkdownTableStart(lines: string[], index: number) {
  const header = lines[index] ?? "";
  const separator = lines[index + 1] ?? "";
  return header.includes("|") && isMarkdownTableSeparatorLine(separator);
}

const PLAIN_CODE_START_RE = /^\s*(package\s+\w+|import\s+\(?|from\s+\S+\s+import\b|export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface)\b|async\s+function\s+\w+\s*\([^)]*\)\s*\{?|function\s+\w+\s*\([^)]*\)\s*\{?|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|type\s+\w+\s*=|interface\s+\w+\s*\{|class\s+\w+|def\s+\w+\s*\([^)]*\)\s*:?|func\s+\w+\s*\([^)]*\)\s*\{?|public\s+(?:class|interface|enum|static)\b|private\s+\w|protected\s+\w|SELECT\b|INSERT\b|UPDATE\b|DELETE\b|CREATE\b|ALTER\b|WITH\b|[A-Za-z_][\w.]*\s*:=\s*.+)$/i;
const PLAIN_CODE_CONTINUATION_RE = /^\s*(?:\/\/|#|\/\*|\*\/?|\* |--|[{[(]|[})\],;]+|return\b|if\b|else\b|for\b|while\b|switch\b|case\b|default\b|break\b|continue\b|try\b|catch\b|finally\b|func\b|def\b|class\b|interface\b|type\b|const\b|let\b|var\b|import\b|from\b|export\b|package\b|public\b|private\b|protected\b|SELECT\b|INSERT\b|UPDATE\b|DELETE\b|CREATE\b|ALTER\b|WITH\b|[A-Za-z_][\w.]*\s*:=|[A-Za-z_][\w.]*\s*=|[A-Za-z_][\w.]*\([^)]*\)\s*\{?|["'`][^"'`]*["'`]?,?|<\/?[A-Za-z][^>]*>)\s*$/i;

function looksLikePlainGoFunctionSignature(line: string) {
  return /^\s*func\s+(?:\([^)]*\)\s*)?\w+\s*\([^)]*\)(?:\s+(?:\([^)]*\)|[^\{]+))?\s*\{?\s*$/.test(line);
}

function looksLikeIndentedPlainCodeStatement(line: string) {
  return /^\s+(?:[A-Za-z_][\w.]*|return\b|if\b|else\b|for\b|while\b|switch\b|case\b|default\b|break\b|continue\b|try\b|catch\b|finally\b|defer\b|go\b|throw\b|await\b|yield\b|new\b|["'`<[{(]|[})\]])/.test(line);
}

function findSharedLeadingWhitespacePrefix(left: string, right: string): string {
  const maxLength = Math.min(left.length, right.length);
  let index = 0;

  while (index < maxLength && left[index] === right[index]) {
    index += 1;
  }

  return left.slice(0, index);
}

function normalizeMarkdownCodeBlock(code: string): string {
  const lines = code.split("\n");

  while (lines.length > 0 && !lines[0]?.trim()) {
    lines.shift();
  }
  while (lines.length > 0 && !lines[lines.length - 1]?.trim()) {
    lines.pop();
  }

  let sharedIndent: string | null = null;

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const indent = line.match(/^[\t ]*/)?.[0] ?? "";
    sharedIndent = sharedIndent === null
      ? indent
      : findSharedLeadingWhitespacePrefix(sharedIndent, indent);
  }

  if (!sharedIndent) {
    return lines.join("\n");
  }

  return lines.map((line) => (
    line.startsWith(sharedIndent) ? line.slice(sharedIndent.length) : line
  )).join("\n");
}

function looksLikePlainCodeStart(line: string) {
  return PLAIN_CODE_START_RE.test(line) || looksLikePlainGoFunctionSignature(line);
}

function looksLikePlainCodeContinuation(line: string, nestingDepth: number) {
  if (!line.trim()) {
    return false;
  }

  if (looksLikePlainGoFunctionSignature(line)) {
    return true;
  }

  if (PLAIN_CODE_START_RE.test(line) || PLAIN_CODE_CONTINUATION_RE.test(line)) {
    return true;
  }

  if (nestingDepth > 0) {
    if (looksLikeIndentedPlainCodeStatement(line)) {
      return true;
    }

    return /^(\s*[A-Za-z_][\w.]*\s*,?\s*$|\s*[})\]]\s*,?\s*$|\s*\w[\w-]*:\s*.+$)/.test(line);
  }

  return false;
}

function updatePlainCodeNestingDepth(currentDepth: number, line: string) {
  let nextDepth = currentDepth;

  for (const char of line) {
    if (char === "{" || char === "(" || char === "[") {
      nextDepth += 1;
      continue;
    }

    if ((char === "}" || char === ")" || char === "]") && nextDepth > 0) {
      nextDepth -= 1;
    }
  }

  return nextDepth;
}

function findNextNonBlankLineIndex(lines: string[], startIndex: number) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (!isBlankLine(lines[index] ?? "")) {
      return index;
    }
  }

  return -1;
}

function inferPlainCodeInfoString(lines: string[]) {
  const nonBlankLines = lines.filter((line) => line.trim());

  if (nonBlankLines.some((line) => /^\s*(package\s+\w+|func\s+\w+\s*\(|[A-Za-z_][\w.]*\s*:=)/.test(line))) {
    return "go";
  }

  if (nonBlankLines.some((line) => /^\s*(def\s+\w+\s*\(|from\s+\S+\s+import\b|if __name__ ==)/.test(line))) {
    return "python";
  }

  if (nonBlankLines.some((line) => /^\s*(const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|function\s+\w+\s*\(|export\s+(?:default\s+)?(?:function|class|const|type|interface)\b|import\s+[{*])/i.test(line))) {
    return "typescript";
  }

  if (nonBlankLines.some((line) => /^\s*(public\s+(?:class|interface|enum|static)\b|private\s+\w|protected\s+\w)/.test(line))) {
    return "java";
  }

  if (nonBlankLines.some((line) => /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|WITH)\b/i.test(line))) {
    return "sql";
  }

  if (nonBlankLines.some((line) => /^\s*(#!\/|echo\b|cd\b|mkdir\b|rm\b|ls\b|cat\b|export\b)/.test(line))) {
    return "bash";
  }

  return undefined;
}

function parsePlainCodeBlock(lines: string[], startIndex: number) {
  const firstLine = lines[startIndex] ?? "";
  if (!looksLikePlainCodeStart(firstLine)) {
    return null;
  }

  const body: string[] = [];
  let index = startIndex;
  let nestingDepth = 0;
  let codeLikeLineCount = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (isBlankLine(line)) {
      const nextNonBlankLineIndex = findNextNonBlankLineIndex(lines, index + 1);
      if (nextNonBlankLineIndex === -1) {
        body.push("");
        index += 1;
        break;
      }

      const nextNonBlankLine = lines[nextNonBlankLineIndex] ?? "";
      if (nestingDepth > 0 || looksLikePlainCodeContinuation(nextNonBlankLine, nestingDepth)) {
        body.push("");
        index += 1;
        continue;
      }

      break;
    }

    if (index !== startIndex && !looksLikePlainCodeContinuation(line, nestingDepth)) {
      break;
    }

    body.push(line);
    codeLikeLineCount += 1;
    nestingDepth = updatePlainCodeNestingDepth(nestingDepth, line);
    index += 1;
  }

  const nonBlankLineCount = body.filter((line) => line.trim()).length;
  if (codeLikeLineCount < 3 || nonBlankLineCount < 3) {
    return null;
  }

  return {
    block: {
      kind: "code" as const,
      code: normalizeMarkdownCodeBlock(body.join("\n")),
      infoString: inferPlainCodeInfoString(body),
    },
    nextIndex: index,
  };
}

function parseMarkdownListMarker(line: string) {
  const unorderedMatch = /^(\s*)[-+*]\s+(.*)$/.exec(line);
  if (unorderedMatch) {
    return {
      ordered: false,
      indent: unorderedMatch[1]?.length ?? 0,
      start: 1,
      content: unorderedMatch[2] ?? "",
    };
  }

  const orderedMatch = /^(\s*)(\d+)\.\s+(.*)$/.exec(line);
  if (orderedMatch) {
    return {
      ordered: true,
      indent: orderedMatch[1]?.length ?? 0,
      start: Number(orderedMatch[2] ?? "1") || 1,
      content: orderedMatch[3] ?? "",
    };
  }

  return null;
}

function parseMarkdownListBlock(lines: string[], startIndex: number): {
  block: Extract<ConversationMessageBlock, { kind: "unordered-list" | "ordered-list" }>;
  nextIndex: number;
} {
  const firstMarker = parseMarkdownListMarker(lines[startIndex] ?? "");
  if (!firstMarker) {
    return {
      block: {
        kind: "unordered-list",
        items: [],
      },
      nextIndex: startIndex + 1,
    };
  }

  const items: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const marker = parseMarkdownListMarker(lines[index] ?? "");
    if (!marker || marker.ordered !== firstMarker.ordered || marker.indent !== firstMarker.indent) {
      break;
    }

    const itemLines = [marker.content];
    index += 1;

    while (index < lines.length) {
      const currentLine = lines[index] ?? "";
      const nextMarker = parseMarkdownListMarker(currentLine);

      if (nextMarker && nextMarker.ordered === firstMarker.ordered && nextMarker.indent === firstMarker.indent) {
        break;
      }

      if (isBlankLine(currentLine)) {
        const followingMarker = parseMarkdownListMarker(lines[index + 1] ?? "");
        if (followingMarker && followingMarker.ordered === firstMarker.ordered && followingMarker.indent === firstMarker.indent) {
          index += 1;
          break;
        }

        itemLines.push("");
        index += 1;
        continue;
      }

      if ((currentLine.match(/^\s*/)?.[0].length ?? 0) > firstMarker.indent) {
        itemLines.push(currentLine.trimStart());
        index += 1;
        continue;
      }

      break;
    }

    while (itemLines.length > 0 && !itemLines[itemLines.length - 1]?.trim()) {
      itemLines.pop();
    }

    items.push(itemLines.join("\n").trim());
  }

  return {
    block: firstMarker.ordered
      ? {
        kind: "ordered-list",
        items,
        start: firstMarker.start,
      }
      : {
        kind: "unordered-list",
        items,
      },
    nextIndex: index,
  };
}

function isParagraphBoundary(lines: string[], index: number) {
  const line = lines[index] ?? "";
  return isBlankLine(line)
    || Boolean(isCodeFenceOpening(line))
    || Boolean(isHeadingLine(line))
    || isDividerLine(line)
    || isBlockquoteLine(line)
    || isUnorderedListLine(line)
    || isOrderedListLine(line)
    || isMarkdownTableStart(lines, index);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseConversationMessageBlocksDetailed(input: string): ConversationMessageBlockParseEntry[] {
  const normalizedInput = normalizeText(input);
  const lines = normalizedInput.split("\n");
  const lineStartOffsets = buildLineStartOffsets(lines);
  const blocks: ConversationMessageBlockParseEntry[] = [];
  let index = 0;

  const pushBlock = (block: ConversationMessageBlock, startLineIndex: number, endLineIndex: number) => {
    blocks.push({
      block,
      startOffset: lineStartOffsets[startLineIndex] ?? normalizedInput.length,
      endOffset: endLineIndex < lineStartOffsets.length
        ? (lineStartOffsets[endLineIndex] ?? normalizedInput.length)
        : normalizedInput.length,
    });
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (isBlankLine(line)) {
      index += 1;
      continue;
    }

    const codeFence = isCodeFenceOpening(line);
    if (codeFence) {
      const startLineIndex = index;
      const closingPattern = new RegExp(`^[\\t ]*${escapeRegExp(codeFence.marker)}\\s*$`);
      const body: string[] = [];
      index += 1;

      while (index < lines.length) {
        const nextLine = lines[index] ?? "";
        if (closingPattern.test(nextLine.trim())) {
          index += 1;
          break;
        }
        body.push(nextLine);
        index += 1;
      }

      pushBlock({
        kind: "code",
        code: normalizeMarkdownCodeBlock(body.join("\n")),
        infoString: codeFence.infoString,
      }, startLineIndex, index);
      continue;
    }

    const heading = isHeadingLine(line);
    if (heading) {
      pushBlock({
        kind: "heading",
        level: Math.min(6, heading[1]?.length ?? 1) as 1 | 2 | 3 | 4 | 5 | 6,
        text: heading[2]?.trim() || "",
      }, index, index + 1);
      index += 1;
      continue;
    }

    if (isDividerLine(line)) {
      pushBlock({
        kind: "divider",
      }, index, index + 1);
      index += 1;
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      const startLineIndex = index;
      const headers = splitMarkdownTableRow(lines[index] ?? "");
      const aligns = splitMarkdownTableRow(lines[index + 1] ?? "").map(resolveMarkdownTableAlign);
      const rows: string[][] = [];
      index += 2;

      while (index < lines.length) {
        const rowLine = lines[index] ?? "";
        if (isBlankLine(rowLine) || !rowLine.includes("|")) {
          break;
        }

        const cells = splitMarkdownTableRow(rowLine);
        rows.push(headers.map((_, cellIndex) => cells[cellIndex] ?? ""));
        index += 1;
      }

      pushBlock({
        kind: "table",
        headers,
        aligns,
        rows,
      }, startLineIndex, index);
      continue;
    }

    if (isBlockquoteLine(line)) {
      const startLineIndex = index;
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const currentLine = lines[index] ?? "";

        if (isBlankLine(currentLine)) {
          quoteLines.push("");
          index += 1;
          continue;
        }

        if (!isBlockquoteLine(currentLine)) {
          break;
        }

        quoteLines.push(currentLine.replace(/^\s*>\s?/, ""));
        index += 1;
      }

      while (quoteLines.length > 0 && !quoteLines[quoteLines.length - 1]?.trim()) {
        quoteLines.pop();
      }

      pushBlock({
        kind: "blockquote",
        lines: quoteLines,
      }, startLineIndex, index);
      continue;
    }

    if (isUnorderedListLine(line) || isOrderedListLine(line)) {
      const startLineIndex = index;
      const parsed = parseMarkdownListBlock(lines, index);
      pushBlock(parsed.block, startLineIndex, parsed.nextIndex);
      index = parsed.nextIndex;
      continue;
    }

    const plainCode = parsePlainCodeBlock(lines, index);
    if (plainCode) {
      pushBlock(plainCode.block, index, plainCode.nextIndex);
      index = plainCode.nextIndex;
      continue;
    }

    const startLineIndex = index;
    const paragraphLines: string[] = [];
    while (index < lines.length && !isParagraphBoundary(lines, index)) {
      paragraphLines.push(lines[index] ?? "");
      index += 1;
    }
    pushBlock({
      kind: "paragraph",
      lines: paragraphLines,
    }, startLineIndex, index);
  }

  return blocks;
}

export function parseConversationMessageBlocks(input: string): ConversationMessageBlock[] {
  return parseConversationMessageBlocksDetailed(input).map((entry) => entry.block);
}