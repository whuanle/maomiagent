import { describe, expect, test } from "bun:test";
import { FeishuDocTreeLoader } from "./feishu-doc-tree-loader";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function createLoader(options: { remoteFailure?: boolean; recognizeRoot?: (access: string, token: string) => Promise<any>; listChildren?: (access: string, root: any) => Promise<any> } = {}) {
  const roots = new Map<string, any>();
  const branches = new Map<string, any>();
  const updates: unknown[] = [];
  const { remoteFailure = false } = options;
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
      recognizeRoot: options.recognizeRoot ?? (async (_access: string, token: string) => {
        if (remoteFailure) throw new Error("remote down");
        return { token, kind: "wiki_node", rootNodeId: token, title: "Root", spaceId: "space" };
      }),
      listChildren: options.listChildren ?? (async (_access: string, root: any) => {
        if (remoteFailure) throw new Error("remote down");
        return { nodes: [{ id: `${root.rootNodeId}-child`, token: `${root.rootNodeId}-child`, kind: "document", title: "Child", hasChild: false }], hasMore: false };
      }),
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

  test("returns cache immediately while refreshing cached root in the background", async () => {
    const deferredRoot = createDeferred<any>();
    const { loader, roots, branches } = createLoader({
      recognizeRoot: async () => deferredRoot.promise,
    });
    roots.set("root", { token: "root", kind: "wiki_node", rootNodeId: "root", title: "Root", loadedAt: "2026-05-20T00:00:00.000Z" });
    branches.set("root", { rootToken: "root", parentToken: "root", loadedAt: "2026-05-20T00:00:00.000Z", complete: true, nodes: [{ id: "cached", token: "cached", kind: "document", title: "Cached", hasChild: false }] });

    const result = await loader.loadRoot({ token: "root" });

    expect(result.source).toBe("cache");
    expect(result.refreshing).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.loadedAt).toBe("2026-05-20T00:00:00.000Z");
    expect(result.nodes[0].title).toBe("Cached");

    deferredRoot.resolve({ token: "root", kind: "wiki_node", rootNodeId: "root", title: "Root", spaceId: "space" });
  });

  test("handles background refresh failures after returning cached root", async () => {
    const { loader, roots, branches } = createLoader({ remoteFailure: true });
    roots.set("root", { token: "root", kind: "wiki_node", rootNodeId: "root", title: "Root", loadedAt: "2026-05-20T00:00:00.000Z" });
    branches.set("root", { rootToken: "root", parentToken: "root", loadedAt: "2026-05-20T00:00:00.000Z", complete: true, nodes: [{ id: "cached", token: "cached", kind: "document", title: "Cached", hasChild: false }] });
    const result = await loader.loadRoot({ token: "root" });
    await Promise.resolve();

    expect(result.source).toBe("cache");
    expect(result.refreshing).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.nodes[0].title).toBe("Cached");
  });

  test("force refresh does not return stale cache when remote fails", async () => {
    const { loader, roots, branches } = createLoader({ remoteFailure: true });
    roots.set("root", { token: "root", kind: "wiki_node", rootNodeId: "root", title: "Root", loadedAt: "2026-05-20T00:00:00.000Z" });
    branches.set("root", { rootToken: "root", parentToken: "root", loadedAt: "2026-05-20T00:00:00.000Z", complete: true, nodes: [{ id: "cached", token: "cached", kind: "document", title: "Cached", hasChild: false }] });
    await expect(loader.loadRoot({ token: "root", forceRefresh: true })).rejects.toThrow("remote down");
  });

  test("loads and caches a branch from the remote source", async () => {
    const { loader, branches, updates } = createLoader({
      listChildren: async (_access: string, root: any) => ({
        nodes: [{ id: `${root.rootNodeId}-child`, token: `${root.rootNodeId}-child`, kind: "document", title: "Branch Child", hasChild: false }],
        hasMore: false,
      }),
    });

    const result = await loader.loadBranch({ rootToken: "root", parentToken: "parent" });

    expect(result.source).toBe("remote");
    expect(result.rootToken).toBe("root");
    expect(result.parentToken).toBe("parent");
    expect(result.nodes[0].title).toBe("Branch Child");
    expect(branches.get("parent").nodes[0].title).toBe("Branch Child");
    expect(updates).toContainEqual(expect.objectContaining({ type: "branch-refreshed" }));
  });

  test("returns cached branch immediately while refreshing it in the background", async () => {
    const deferredChildren = createDeferred<any>();
    const { loader, roots, branches } = createLoader({
      listChildren: async () => deferredChildren.promise,
    });
    roots.set("root", { token: "root", kind: "wiki_node", rootNodeId: "root", title: "Root", loadedAt: "2026-05-20T00:00:00.000Z" });
    branches.set("parent", { rootToken: "root", parentToken: "parent", loadedAt: "2026-05-20T00:00:00.000Z", complete: true, nodes: [{ id: "cached", token: "cached", kind: "document", title: "Cached Branch", hasChild: false }] });

    const result = await loader.loadBranch({ rootToken: "root", parentToken: "parent" });

    expect(result.source).toBe("cache");
    expect(result.refreshing).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.loadedAt).toBe("2026-05-20T00:00:00.000Z");
    expect(result.nodes[0].title).toBe("Cached Branch");

    deferredChildren.resolve({ nodes: [], hasMore: false });
  });
});