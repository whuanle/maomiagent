import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("ui designer page keeps the single-session shell contract", () => {
  const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const shellSource = readFileSync(new URL("./components/workspace-shell.tsx", import.meta.url), "utf8");
  const railSource = readFileSync(new URL("./components/conversation-rail.tsx", import.meta.url), "utf8");
  const flowSource = readFileSync(new URL("./components/designer-flow-panel.tsx", import.meta.url), "utf8");
  const hookSource = readFileSync(new URL("./hooks/use-ui-designer-shell-state.ts", import.meta.url), "utf8");

  expect(pageSource).toContain("UiDesignerWorkspaceShell");
  expect(shellSource).toContain('data-testid="ui-designer-page"');
  expect(shellSource).toContain("<Splitter");
  expect(shellSource).toContain("<ConversationRail");
  expect(shellSource).toContain("<DesignerFlowPanel");
  expect(shellSource).toContain("<DesignerPreviewPanel");
  expect(railSource).toContain("重置对话");
  expect(railSource).not.toContain("ui-designer-session-list");
  expect(flowSource).toContain("设计包路径");
  expect(flowSource).toContain("重新设计");
  expect(flowSource).not.toContain("TextArea");
  expect(flowSource).not.toContain("保存");
  expect(hookSource).toContain("managedExecutionEnabled: false");
  expect(hookSource).toContain("thinkingEnabled: false");
});
