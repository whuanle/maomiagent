import { marked } from "marked";

import type { ConversationMessageInlineSegment } from "./message-content-types";

type MarkedInlineToken = {
  type: string;
  raw?: string;
  text?: string;
  href?: string;
  title?: string | null;
  tokens?: MarkedInlineToken[];
};

function buildInlineTextSegments(text: string): ConversationMessageInlineSegment[] {
  return text
    ? [{
      kind: "text",
      text,
    }]
    : [];
}

function readMarkedInlineTokenText(token: MarkedInlineToken): string {
  const textValue = "text" in token && typeof token.text === "string"
    ? token.text
    : "";
  const rawValue = typeof token.raw === "string" ? token.raw : "";
  return textValue || rawValue;
}

function mapMarkedInlineTokens(tokens: MarkedInlineToken[]): ConversationMessageInlineSegment[] {
  const result: ConversationMessageInlineSegment[] = [];

  const pushText = (value: string) => {
    if (!value) {
      return;
    }

    const previous = result[result.length - 1];
    if (previous?.kind === "text") {
      previous.text += value;
      return;
    }

    result.push({
      kind: "text",
      text: value,
    });
  };

  for (const token of tokens) {
    if (token.type === "text" || token.type === "escape" || token.type === "html") {
      pushText(readMarkedInlineTokenText(token));
      continue;
    }

    if (token.type === "codespan") {
      result.push({
        kind: "code",
        text: typeof token.text === "string" ? token.text : "",
      });
      continue;
    }

    if (token.type === "br") {
      result.push({
        kind: "line-break",
      });
      continue;
    }

    if (token.type === "strong" || token.type === "em" || token.type === "del") {
      const children = Array.isArray(token.tokens)
        ? mapMarkedInlineTokens(token.tokens)
        : buildInlineTextSegments(typeof token.text === "string" ? token.text : "");
      result.push({
        kind:
          token.type === "strong"
            ? "strong"
            : (token.type === "em" ? "em" : "delete"),
        children,
      });
      continue;
    }

    if (token.type === "link") {
      const children = Array.isArray(token.tokens)
        ? mapMarkedInlineTokens(token.tokens)
        : buildInlineTextSegments(typeof token.text === "string" ? token.text : "");
      result.push({
        kind: "link",
        href: typeof token.href === "string" ? token.href : "",
        title: typeof token.title === "string" ? token.title : undefined,
        children,
      });
      continue;
    }

    pushText(readMarkedInlineTokenText(token));
  }

  return result;
}

export function parseConversationMessageInline(
  input: string,
): ConversationMessageInlineSegment[] {
  const text = input || "";
  const result = mapMarkedInlineTokens(new marked.Lexer({
    gfm: true,
  }).inlineTokens(text) as MarkedInlineToken[]);

  return result.length > 0
    ? result
    : [{
      kind: "text",
      text,
    }];
}