import { Fragment, type ReactNode } from "react";

import {
  parseConversationMessageInline,
  type ConversationMessageInlineSegment,
} from "./message-content-model";

function renderConversationInlineSegments(
  segments: ConversationMessageInlineSegment[],
  keyPrefix: string,
): ReactNode[] {
  return segments.map((segment, index) => {
    const key = `${keyPrefix}-${index}`;

    if (segment.kind === "code") {
      return (
        <code key={key} className="chat-message-content-inline-code">
          {segment.text}
        </code>
      );
    }

    if (segment.kind === "link") {
      return (
        <a
          key={key}
          className="chat-message-content-link"
          href={segment.href}
          title={segment.title}
          target="_blank"
          rel="noreferrer"
        >
          {renderConversationInlineSegments(segment.children, `${key}-link`)}
        </a>
      );
    }

    if (segment.kind === "strong") {
      return (
        <strong key={key} className="chat-message-content-strong">
          {renderConversationInlineSegments(segment.children, `${key}-strong`)}
        </strong>
      );
    }

    if (segment.kind === "em") {
      return (
        <em key={key} className="chat-message-content-emphasis">
          {renderConversationInlineSegments(segment.children, `${key}-em`)}
        </em>
      );
    }

    if (segment.kind === "delete") {
      return (
        <del key={key} className="chat-message-content-delete">
          {renderConversationInlineSegments(segment.children, `${key}-delete`)}
        </del>
      );
    }

    if (segment.kind === "line-break") {
      return <br key={key} />;
    }

    return <Fragment key={key}>{segment.text}</Fragment>;
  });
}

export function renderConversationInlineText(input: string) {
  return renderConversationInlineSegments(
    parseConversationMessageInline(input),
    "inline",
  );
}

export function renderConversationInlineLines(lines: string[]) {
  return lines.map((line, index) => (
    <Fragment key={`line-${index}`}>
      {renderConversationInlineText(line)}
      {index < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}