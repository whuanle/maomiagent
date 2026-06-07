import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("filters dedicated channel workspaces before building bot workspace options", async () => {
  const source = await readFile(join(import.meta.dir, "bot-config-panel.tsx"), "utf8");

  expect(source).toContain('import { toWorkspaceOptions } from "../../../services/workspace-query-service"');
  expect(source).toContain("toWorkspaceOptions(props.workspaces)");
  expect(source).toContain('label: item.label.replace(/ \\((.+)\\)$/, " · $1"),');
});
