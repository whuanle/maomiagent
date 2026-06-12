import { describe, expect, test } from "bun:test";

import {
  assembleDirectSessionComposerSubmitText,
  removeDirectSessionComposerSlashToken,
} from "./direct-session-composer-submit";

describe("assembleDirectSessionComposerSubmitText", () => {
  test("returns the command only when the draft is empty", () => {
    expect(assembleDirectSessionComposerSubmitText({
      draft: "",
      selectedSlashCommand: {
        insertText: "playwright",
      },
    })).toBe("/playwright");
  });

  test("prefixes the command and separates draft text with a blank line", () => {
    expect(assembleDirectSessionComposerSubmitText({
      draft: "Open localhost:3000 and inspect the page.",
      selectedSlashCommand: {
        insertText: "playwright",
      },
    })).toBe("/playwright\n\nOpen localhost:3000 and inspect the page.");
  });

  test("falls back to the trimmed draft when no command is selected", () => {
    expect(assembleDirectSessionComposerSubmitText({
      draft: "  summarize this session  ",
    })).toBe("summarize this session");
  });
});

describe("removeDirectSessionComposerSlashToken", () => {
  test("removes the active slash token and keeps the caret at the cleaned prefix", () => {
    expect(removeDirectSessionComposerSlashToken({
      draft: "Run /pla after this",
      replaceStart: 4,
      replaceEnd: 8,
    })).toEqual({
      draft: "Run after this",
      selectionStart: 3,
    });
  });
});
