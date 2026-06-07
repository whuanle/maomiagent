import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("loads only normal workspaces for the UI Designer workspace selector", async () => {
  const source = await readFile(join(import.meta.dir, "use-ui-designer-shell-state.ts"), "utf8");

  expect(source).toContain('import { getNormalWorkspaces } from "../../../services/workspace-query-service";');
  expect(source).toContain("const nextItems = (await getNormalWorkspaces({ limit: 200, offset: 0 })).sort(compareWorkspaces);");
  expect(source).not.toContain("listDesktopWorkspaces({ limit: 200, offset: 0 })");
});
