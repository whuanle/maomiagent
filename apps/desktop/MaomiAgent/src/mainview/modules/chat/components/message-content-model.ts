import { parseConversationMessageBlocksDetailed } from "./message-content-blocks";

export type {
  ConversationMessageBlock,
  ConversationMessageInlineSegment,
} from "./message-content-types";
export {
  parseConversationMessageInline,
} from "./message-content-inline";
export {
  parseConversationMessageBlocks,
  parseConversationMessageBlocksDetailed,
} from "./message-content-blocks";
export {
  resolveConversationMessageCodeBlockLabel,
} from "./message-content-code-label";

function resolveConversationMessageCodeBlocks(content: string) {
  return parseConversationMessageBlocksDetailed(content)
    .flatMap((entry) => entry.block.kind === "code" ? [entry.block] : []);
}

function decodeConversationMarkdownHtmlText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\r\n?/g, "\n");
}

function extractConversationMarkdownPreTextSegments(htmlString: string) {
  return [...htmlString.matchAll(/<pre\b[\s\S]*?<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi)]
    .map((match) => decodeConversationMarkdownHtmlText(match[1] ?? ""));
}

function resolveConversationCodeBlockBoundaryLines(code: string) {
  const normalizedLines = code
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());

  return {
    firstLine: normalizedLines[0],
    lastLine: normalizedLines.at(-1),
  };
}

function doesConversationMarkdownHtmlCoverCodeBlock(code: string, preTextSegments: readonly string[]) {
  const { firstLine, lastLine } = resolveConversationCodeBlockBoundaryLines(code);
  if (!firstLine) {
    return false;
  }

  return preTextSegments.some((segment) => segment.includes(firstLine) && (!lastLine || segment.includes(lastLine)));
}

export function hasConversationMessageCodeBlock(content: string) {
  return resolveConversationMessageCodeBlocks(content).length > 0;
}

function startsWithConversationMarkdownFence(value: string) {
  return /^[\t ]*(`{3,}|~{3,})/.test(value);
}

export function hasConversationMessageUnfencedCodeBlock(content: string) {
  const normalizedContent = content.replace(/\r\n?/g, "\n");
  if (!normalizedContent.trim() || !normalizedContent.includes("\n")) {
    return false;
  }

  return parseConversationMessageBlocksDetailed(normalizedContent).some((entry) => {
    if (entry.block.kind !== "code") {
      return false;
    }

    const sourceSlice = normalizedContent.slice(entry.startOffset, entry.endOffset);
    return !startsWithConversationMarkdownFence(sourceSlice);
  });
}

export function shouldFallbackToConversationBlockRenderer(input: {
  content: string;
  htmlString: string;
}) {
  const normalizedContent = input.content.trim();
  if (!normalizedContent || !normalizedContent.includes("\n")) {
    return false;
  }

  const codeBlocks = resolveConversationMessageCodeBlocks(normalizedContent);
  if (codeBlocks.length === 0) {
    return false;
  }

  const preTextSegments = extractConversationMarkdownPreTextSegments(input.htmlString);
  if (preTextSegments.length === 0) {
    return true;
  }

  return codeBlocks.some((block) => !doesConversationMarkdownHtmlCoverCodeBlock(block.code, preTextSegments));
}