import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

test("does not render a create workspace action inside the chat workspace rail", async () => {
  const source = await readFile(join(import.meta.dir, "workspace-rail.tsx"), "utf8");

  expect(source).not.toContain("onCreateWorkspace");
  expect(source).not.toContain("Create workspace");
  expect(source).not.toContain("新建工作区");
});
