import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("filters dedicated channel workspaces before resolving WeChat execution workspaces", async () => {
  const source = await readFile(join(import.meta.dir, "page.tsx"), "utf8");

  expect(source).toContain('import { filterSelectableDesktopWorkspaces } from "../../lib/desktop-workspace-filter";');
  expect(source).toContain("const selectableWorkspaces = useMemo(");
  expect(source).toContain("filterSelectableDesktopWorkspaces(workspaces)");
  expect(source).toContain("resolveWechatExecutionWorkspaceId(stateRef.current, selectableWorkspaces)");
});
