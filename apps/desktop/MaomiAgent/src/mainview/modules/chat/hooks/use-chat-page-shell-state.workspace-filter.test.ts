import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("filters dedicated channel workspaces before hydrating chat workspace state", async () => {
  const source = await readFile(join(import.meta.dir, "use-chat-page-shell-state.ts"), "utf8");

  expect(source).toContain('import { getNormalWorkspaces } from "../../../services/workspace-query-service";');
  expect(source).toContain("const nextItems = (await getNormalWorkspaces({ limit: 100, offset: 0 })).sort(compareWorkspaces);");
});
