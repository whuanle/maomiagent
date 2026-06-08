import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const workspaceRoot = process.cwd();

async function source(path: string) {
  return readFile(`${workspaceRoot}/${path}`, "utf8");
}

describe("chat page workspace tab persistence regression", () => {
  test("syncs workspace tab refs after state commit instead of during render", async () => {
    const page = await source("src/mainview/modules/chat/page.tsx");

    expect(page).toContain("function syncWorkspaceTabRefs(input: {");
    expect(page).toContain("useEffect(() => {");
    expect(page).toContain("syncWorkspaceTabRefs({");
    expect(page).toContain("fallbackWorkspaceId: shellState.workspaceId,");
    expect(page).not.toContain("activeWorkspaceIdRef.current = workspaceTabsState.activeWorkspaceId ?? shellState.workspaceId ?? \"\";");
    expect(page).not.toContain("openWorkspaceIdsRef.current = workspaceTabsState.openWorkspaceIds;");
  });

  test("only non-active opened workspaces are closable", async () => {
    const page = await source("src/mainview/modules/chat/page.tsx");

    expect(page).toContain("closable: workspaceTabsState.openWorkspaceIds.length > 1");
    expect(page).toContain("&& workspaceId !== (workspaceTabsState.activeWorkspaceId ?? shellState.workspaceId),");
  });
});
