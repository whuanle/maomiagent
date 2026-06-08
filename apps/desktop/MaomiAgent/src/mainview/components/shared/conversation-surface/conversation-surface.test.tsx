import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("shared conversation surface keeps the direct session shell structure", () => {
  const source = readFileSync(new URL("./conversation-surface.tsx", import.meta.url), "utf8");

  expect(source).toContain("chat-direct-pane is-programming");
  expect(source).toContain("DirectSessionHeader");
  expect(source).toContain("DirectSessionMessageList");
  expect(source).toContain("ConversationSessionInteractionDock");
  expect(source).toContain("DirectSessionComposer");
  expect(source).toContain("chat-direct-thread-scroll");
  expect(source).toContain("chat-direct-composer-shell");
  expect(source).toContain("interactionDockRef");
  expect(source).toContain("interactionSignature");
  expect(source).toContain("requestAnimationFrame(() => {");
  expect(source).toContain("dockNode.scrollIntoView({");
  expect(source).toContain('behavior: "smooth"');
});
