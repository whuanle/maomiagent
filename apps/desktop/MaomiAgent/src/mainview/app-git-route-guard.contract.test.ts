import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

describe("app git route guard contracts", () => {
  test("App.tsx confirms with GitPage before navigating away from the git route", async () => {
    const appSource = await source("./App.tsx");

    expect(appSource).toContain("const gitPageRef = useRef<GitPageHandle | null>(null);");
    expect(appSource).toContain("const requestRouteChange = useCallback(async (nextRoute: AppRouteKey) => {");
    expect(appSource).toContain('const leavingGitPage = resolveVisibleMainviewRoute(currentRoute) === "git"');
    expect(appSource).toContain("const confirmed = await gitPageRef.current?.confirmLeavePage() ?? true;");
    expect(appSource).toContain("syncWindowHashToRoute(currentRoute);");
    expect(appSource).toContain("ref={handleGitPageRef}");
  });
});
