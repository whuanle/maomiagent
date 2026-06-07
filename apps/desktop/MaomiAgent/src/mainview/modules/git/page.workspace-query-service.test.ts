import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("loads git workspace options through the shared workspace query service", async () => {
  const source = await readFile(join(import.meta.dir, "page.tsx"), "utf8");

  expect(source).toContain('from "../../services/workspace-query-service";');
  expect(source).toContain("getNormalWorkspaces,");
  expect(source).toContain("toWorkspaceOptions,");
  expect(source).toContain("const options = toWorkspaceOptions(await getNormalWorkspaces({ limit: 200, offset: 0 }));");
  expect(source).not.toContain("filterSelectableDesktopWorkspaces(response.items)");
});
