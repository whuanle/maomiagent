import { hasConversationMessageCodeBlock } from "./message-content-model";

function looksLikeMarkdownTable(text: string) {
  const lines = text.split("\n");

  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = lines[index]?.trim() ?? "";
    const separator = lines[index + 1]?.trim() ?? "";
    if (!header.includes("|")) {
      continue;
    }

    const cells = separator
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);

    if (cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")))) {
      return true;
    }
  }

  return false;
}

export function shouldRenderStreamingMarkdown(content: string) {
  const text = content.trim();
  if (!text) {
    return false;
  }
  if (/```/.test(text)) {
    return true;
  }
  if (/(^|\n)(#{1,6}\s|[-*+]\s|\d+\.\s|>\s)/.test(text)) {
    return true;
  }
  if (/(^|\n)\s{0,3}([-*_])(?:\s*\2){2,}\s*($|\n)/.test(text)) {
    return true;
  }
  if (looksLikeMarkdownTable(text)) {
    return true;
  }
  if (/\n\s*\n/.test(text)) {
    return true;
  }
  if (/\*\*[^*]+\*\*|_[^_]+_|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)/.test(text)) {
    return true;
  }
  if (text.includes("\n") && hasConversationMessageCodeBlock(text)) {
    return true;
  }
  return text.length >= 160 && text.includes("\n");
}

export type StreamingMarkdownNormalizationResult = {
  content: string;
  appendedSyntheticCodeFence: boolean;
};

export function normalizeStreamingMarkdownForRender(
  content: string,
): StreamingMarkdownNormalizationResult {
  const text = content.replace(/\u0000/g, "").trimEnd();
  if (!text) {
    return {
      content: "",
      appendedSyntheticCodeFence: false,
    };
  }

  const fenceCount = (text.match(/```/g) ?? []).length;
  if (fenceCount % 2 === 1) {
    return {
      content: `${text}\n\`\`\``,
      appendedSyntheticCodeFence: true,
    };
  }

  return {
    content: text,
    appendedSyntheticCodeFence: false,
  };
}
