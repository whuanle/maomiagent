import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("ui designer restores workspace and session from the shared workspace experience state", async () => {
  const hookSource = await readFile(join(import.meta.dir, "../hooks/use-ui-designer-shell-state.ts"), "utf8");

  expect(hookSource).toContain("readWorkspaceExperienceState");
  expect(hookSource).toContain("updateWorkspaceExperienceState");
  expect(hookSource).toContain("function readUiDesignerScene()");
  expect(hookSource).toContain("function updateUiDesignerScene(input: {");
  expect(hookSource).toContain("const initialSceneRef = useRef(readUiDesignerScene());");
  expect(hookSource).toContain("() => initialSceneRef.current.workspaceId");
  expect(hookSource).toContain("() => initialSceneRef.current.selectedSessionId");
  expect(hookSource).toContain("const persistedScene = readUiDesignerScene();");
  expect(hookSource).toContain("setWorkspaceId((current) => resolveNextWorkspaceId(nextItems, current ?? persistedScene.workspaceId));");
  expect(hookSource).toContain("resolveActiveSessionId(nextItems, preferredSessionId ?? current ?? persistedScene.selectedSessionId)");
  expect(hookSource).toContain("selectedSessionId: persistedUiDesignerSessionId ?? selectedSessionId,");
});

test("ui designer restores and persists the active stage through the shared workspace experience state", async () => {
  const shellSource = await readFile(join(import.meta.dir, "workspace-shell.tsx"), "utf8");

  expect(shellSource).toContain("readWorkspaceExperienceState().uiDesigner.activeStageKey");
  expect(shellSource).toContain("updateWorkspaceExperienceState((current) => ({");
  expect(shellSource).toContain("uiDesigner: {");
  expect(shellSource).toContain("activeStageKey,");
  expect(shellSource).toContain("resolvePreferredActiveStageKey");
  expect(shellSource).toContain("const STAGE_KEY_ALIASES = {");
  expect(shellSource).toContain('stack: "theme"');
  expect(shellSource).toContain('layouts: "pages"');
  expect(shellSource).toContain("setActiveStageKey(preferredStageKey);");
});
