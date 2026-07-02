import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("filters dedicated channel workspaces before hydrating chat workspace state", async () => {
  const source = await readFile(join(import.meta.dir, "use-chat-page-shell-state.ts"), "utf8");

  expect(source).toContain("listDesktopWorkspaces,");
  expect(source).toContain('import { filterSelectableDesktopWorkspaces } from "../../../lib/desktop-workspace-filter";');
  expect(source).toContain("const response = await listDesktopWorkspaces({");
  expect(source).toContain("const selectable = filterSelectableDesktopWorkspaces(response.items);");
});
