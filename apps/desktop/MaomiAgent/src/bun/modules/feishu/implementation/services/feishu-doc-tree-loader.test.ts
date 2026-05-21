import { describe, expect, test } from "bun:test";
import { FeishuDocTreeLoader } from "./feishu-doc-tree-loader";

function createLoader(remoteFailure = false) {
  const roots = new Map<string, any>();
  const branches = new Map<string, any>();
  const updates: unknown[] = [];
  const loader = new FeishuDocTreeLoader({
    scopeId: () => "scope",
    accessToken: async () => "access",
    now: () => "2026-05-21T00:00:00.000Z",
    cache: {
      readRoot: async (_scope: string, token: string) => roots.get(token) ?? null,
      saveRoot: async (_scope: string, entry: any) => roots.set(entry.token, entry),
      readBranch: async (_scope: string, _root: string, parent: string) => branches.get(parent) ?? null,
      saveBranch: async (_scope: string, entry: any) => branches.set(entry.parentToken, entry),
    },
    remote: {
      recognizeRoot: async (_access: string, token: string) => {
        if (remoteFailure) throw new Error("remote down");
        return { token, kind: "wiki_node", rootNodeId: token, title: "Root", spaceId: "space" };
      },
      listChildren: async (_access: string, root: any) => {
        if (remoteFailure) throw new Error("remote down");
        return { nodes: [{ id: `${root.rootNodeId}-child`, token: `${root.rootNodeId}-child`, kind: "document", title: "Child", hasChild: false }], hasMore: false };
      },
    },
    emit: (event) => updates.push(event),
  });
  return { loader, roots, branches, updates };
}

describe("FeishuDocTreeLoader", () => {
  test("returns remote first layer and caches it on first load", async () => {
    const { loader, branches } = createLoader();
    const result = await loader.loadRoot({ token: "root" });
    expect(result.source).toBe("remote");
    expect(result.refreshing).toBe(false);
    expect(result.nodes[0].title).toBe("Child");
    expect(branches.get("root").nodes[0].title).toBe("Child");
  });

  test("returns cache when remote fails during automatic reopen", async () => {
    const { loader, roots, branches } = createLoader(true);
    roots.set("root", { token: "root", kind: "wiki_node", rootNodeId: "root", title: "Root", loadedAt: "2026-05-20T00:00:00.000Z" });
    branches.set("root", { rootToken: "root", parentToken: "root", loadedAt: "2026-05-20T00:00:00.000Z", complete: true, nodes: [{ id: "cached", token: "cached", kind: "document", title: "Cached", hasChild: false }] });
    const result = await loader.loadRoot({ token: "root" });
    expect(result.source).toBe("cache");
    expect(result.stale).toBe(true);
    expect(result.nodes[0].title).toBe("Cached");
    expect(result.error).toBe("remote down");
  });

  test("force refresh does not return stale cache when remote fails", async () => {
    const { loader, roots, branches } = createLoader(true);
    roots.set("root", { token: "root", kind: "wiki_node", rootNodeId: "root", title: "Root", loadedAt: "2026-05-20T00:00:00.000Z" });
    branches.set("root", { rootToken: "root", parentToken: "root", loadedAt: "2026-05-20T00:00:00.000Z", complete: true, nodes: [{ id: "cached", token: "cached", kind: "document", title: "Cached", hasChild: false }] });
    await expect(loader.loadRoot({ token: "root", forceRefresh: true })).rejects.toThrow("remote down");
  });
});