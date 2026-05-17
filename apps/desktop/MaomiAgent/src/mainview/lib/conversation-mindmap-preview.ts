import type { MindMapData } from "@xiangfa/mindmap/viewer";

export type ConversationMindmapPreviewResult =
  | {
      ok: true;
      data: MindMapData;
    }
  | {
      ok: false;
      error: string;
    };

const MERMAID_COMMENT_PATTERN = /^%%/;
const MERMAID_INIT_PATTERN = /^%%\{.*\}%%$/;
const HTML_BREAK_PATTERN = /<br\s*\/?>/giu;
const HTML_TAG_PATTERN = /<[^>]+>/gu;
const TRAILING_CLASS_PATTERN = /\s+:::[\w-]+/gu;
const TRAILING_ICON_PATTERN = /::icon\([^)]*\)/giu;
const LEADING_NODE_ID_PATTERN = "(?:[^\\s\\[\\(\\{]+\\s*)?";
const MERMAID_SHAPE_PATTERNS = [
  new RegExp(`^${LEADING_NODE_ID_PATTERN}\\(\\(([\\s\\S]+)\\)\\)$`, "u"),
  new RegExp(`^${LEADING_NODE_ID_PATTERN}\\(\\[([\\s\\S]+)\\]\\)$`, "u"),
  new RegExp(`^${LEADING_NODE_ID_PATTERN}\\[\\(([\\s\\S]+)\\)\\]$`, "u"),
  new RegExp(`^${LEADING_NODE_ID_PATTERN}\\[\\[([\\s\\S]+)\\]\\]$`, "u"),
  new RegExp(`^${LEADING_NODE_ID_PATTERN}\\[([\\s\\S]+)\\]$`, "u"),
  new RegExp(`^${LEADING_NODE_ID_PATTERN}\\{\\{([\\s\\S]+)\\}\\}$`, "u"),
  new RegExp(`^${LEADING_NODE_ID_PATTERN}\\{([\\s\\S]+)\\}$`, "u"),
  new RegExp(`^${LEADING_NODE_ID_PATTERN}\\(([\\s\\S]+)\\)$`, "u"),
];

function normalizeMindmapSource(sourceText: string) {
  return sourceText.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
}

function stripWrappingQuotes(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\""))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function countMindmapIndentWidth(rawLine: string) {
  let width = 0;
  for (const character of rawLine) {
    if (character === " ") {
      width += 1;
      continue;
    }

    if (character === "\t") {
      width += 2;
      continue;
    }

    break;
  }

  return width;
}

function findMermaidMindmapDeclarationLine(lines: readonly string[]) {
  let index = 0;

  while (index < lines.length) {
    const trimmed = lines[index]?.trim() ?? "";

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed === "---") {
      index += 1;
      while (index < lines.length && (lines[index]?.trim() ?? "") !== "---") {
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }
      continue;
    }

    if (MERMAID_INIT_PATTERN.test(trimmed) || MERMAID_COMMENT_PATTERN.test(trimmed)) {
      index += 1;
      continue;
    }

    return /^mindmap\b/iu.test(trimmed) ? index : -1;
  }

  return -1;
}

function stripMindmapNodeDecorators(value: string) {
  return value
    .replace(TRAILING_ICON_PATTERN, "")
    .replace(TRAILING_CLASS_PATTERN, "")
    .trim();
}

function extractMindmapNodeLabel(rawValue: string) {
  const normalized = stripMindmapNodeDecorators(rawValue);

  for (const pattern of MERMAID_SHAPE_PATTERNS) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      return stripWrappingQuotes(match[1]);
    }
  }

  return stripWrappingQuotes(normalized);
}

function createMindmapNode(rawValue: string, index: number): MindMapData | null {
  const label = extractMindmapNodeLabel(rawValue)
    .replace(HTML_BREAK_PATTERN, "\n")
    .replace(HTML_TAG_PATTERN, "")
    .trim();

  if (!label) {
    return null;
  }

  const lines = label
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  return {
    id: `conversation-mindmap-node-${index}`,
    text: lines[0] ?? "",
    ...(lines.length > 1 ? { multiLineContent: lines.slice(1) } : {}),
  };
}

export function looksLikeMermaidMindmapSource(sourceText: string) {
  const lines = normalizeMindmapSource(sourceText).split("\n");
  return findMermaidMindmapDeclarationLine(lines) >= 0;
}

export function buildConversationMindmapPreviewData(sourceText: string): ConversationMindmapPreviewResult {
  const lines = normalizeMindmapSource(sourceText).split("\n");
  const startLineIndex = findMermaidMindmapDeclarationLine(lines);

  if (startLineIndex < 0) {
    return {
      ok: false,
      error: "Mindmap source must start with a Mermaid mindmap declaration.",
    };
  }

  let rootNode: MindMapData | null = null;
  const stack: Array<{ indent: number; node: MindMapData }> = [];
  let nodeIndex = 0;

  for (const rawLine of lines.slice(startLineIndex + 1)) {
    const trimmed = rawLine.trim();
    if (!trimmed || MERMAID_COMMENT_PATTERN.test(trimmed)) {
      continue;
    }

    const node = createMindmapNode(trimmed, nodeIndex + 1);
    if (!node) {
      continue;
    }
    nodeIndex += 1;

    const indent = countMindmapIndentWidth(rawLine);
    if (!rootNode) {
      rootNode = node;
      stack.push({ indent, node });
      continue;
    }

    while (stack.length > 0 && indent <= stack[stack.length - 1]!.indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1]?.node ?? rootNode;
    parent.children = [...(parent.children ?? []), node];
    stack.push({ indent, node });
  }

  if (!rootNode) {
    return {
      ok: false,
      error: "Mindmap root node was not found.",
    };
  }

  return {
    ok: true,
    data: rootNode,
  };
}