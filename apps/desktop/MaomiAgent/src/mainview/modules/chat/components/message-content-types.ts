export type ConversationMessageTableAlign = "left" | "center" | "right" | undefined;

export type ConversationMessageBlock =
  | {
    kind: "heading";
    level: 1 | 2 | 3 | 4 | 5 | 6;
    text: string;
  }
  | {
    kind: "paragraph";
    lines: string[];
  }
  | {
    kind: "blockquote";
    lines: string[];
  }
  | {
    kind: "unordered-list";
    items: string[];
  }
  | {
    kind: "ordered-list";
    start: number;
    items: string[];
  }
  | {
    kind: "divider";
  }
  | {
    kind: "table";
    headers: string[];
    aligns: ConversationMessageTableAlign[];
    rows: string[][];
  }
  | {
    kind: "code";
    code: string;
    infoString?: string;
  };

export type ConversationMessageInlineSegment =
  | {
    kind: "text";
    text: string;
  }
  | {
    kind: "code";
    text: string;
  }
  | {
    kind: "strong";
    children: ConversationMessageInlineSegment[];
  }
  | {
    kind: "em";
    children: ConversationMessageInlineSegment[];
  }
  | {
    kind: "delete";
    children: ConversationMessageInlineSegment[];
  }
  | {
    kind: "link";
    href: string;
    title?: string;
    children: ConversationMessageInlineSegment[];
  }
  | {
    kind: "line-break";
  };