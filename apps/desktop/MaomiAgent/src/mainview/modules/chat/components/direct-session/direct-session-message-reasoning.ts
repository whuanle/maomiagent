import type { LanguageCode } from "../../../../config/titlebar";

function trimText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

function normalizeReasoningLines(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => trimText(line))
    .filter(Boolean);
}

export function splitReasoningHeading(text: string, language: LanguageCode) {
  const trimmed = text.trimStart();
  const headingMatch = trimmed.match(/^(#{1,6})\s+(.+?)(?:\r?\n+|$)/);

  if (!headingMatch) {
    return {
      title: language === "en-US" ? "Reasoning" : "思考",
      body: text,
    };
  }

  const title = trimText(headingMatch[2]) || (language === "en-US" ? "Reasoning" : "思考");
  const body = trimmed.slice(headingMatch[0].length).trimStart();
  return {
    title,
    body,
  };
}

export function buildReasoningPreviewText(value: string) {
  const lines = normalizeReasoningLines(value);
  if (lines.length === 0) {
    return undefined;
  }

  return truncateText(lines.slice(0, 2).join(" · "), 140);
}

export function shouldInlineReasoningBody(input: {
  body: string;
  live: boolean;
}) {
  const normalized = trimText(input.body);
  if (!normalized) {
    return false;
  }

  if (input.live) {
    return true;
  }

  const lines = normalizeReasoningLines(normalized);
  return normalized.length <= 220 || lines.length <= 2;
}