import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const workspaceRoot = process.cwd();

async function source(path: string): Promise<string> {
  return readFile(`${workspaceRoot}/${path}`, "utf8");
}

test("keeps chat route mounted while other menu pages stay on-demand", async () => {
  const appSource = await source("src/mainview/App.tsx");

  expect(appSource).toContain("shouldMountMainviewRoute(route.key, visibleRoute)");
  expect(appSource).toContain("const routeMounted = shouldMountMainviewRoute(route.key, visibleRoute);");
  expect(appSource).toContain("children: routeMounted");
  expect(appSource).not.toContain("children: route.key === visibleRoute");
});
