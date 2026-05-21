import { describe, expect, test } from "bun:test";
import type { FeishuDocContentView } from "../../../../../shared/desktop-feishu";
import type { DesktopFeishuStoreSnapshot } from "../../abstraction/ports/desktop-feishu-store.ports";
import { FeishuDocTreeCache } from "./feishu-doc-tree-cache";

function createSnapshot(): DesktopFeishuStoreSnapshot {
  return {
    state: {} as DesktopFeishuStoreSnapshot["state"],
    bot: {} as DesktopFeishuStoreSnapshot["bot"],
    docs: {},
    developerCredential: { appSecret: "" },
    developerToken: { accessToken: "", refreshToken: "", accessTokenExpiresAt: "", refreshTokenExpiresAt: "" },
    docTreeCache: { roots: {}, branches: {}, contents: {} },
  };
}

function createCache(snapshot: DesktopFeishuStoreSnapshot) {
  return new FeishuDocTreeCache({
    read: async () => snapshot,
    write: async (next) => {
      snapshot.developerCredential = next.developerCredential;
      snapshot.developerToken = next.developerToken;
      snapshot.docTreeCache = next.docTreeCache;
      snapshot.docs = next.docs;
      snapshot.state = next.state;
      snapshot.bot = next.bot;
    },
  });
}

function createContentView(docId: string, title: string): FeishuDocContentView {
  return {
    docId,
    title,
    markdown: `# ${title}`,
    length: title.length,
    totalLength: title.length,
    offset: 0,
    analysis: {
      sourceUrl: "https://example.test/doc",
      importedAssetCount: 0,
      missingAssetCount: 0,
      riskyBlockCount: 0,
      riskyBlockMode: "safe",
    },
  };
}

describe("FeishuDocTreeCache", () => {
  test("stores and reads root recognition by auth scope and token", async () => {
    const snapshot = createSnapshot();
    const cache = createCache(snapshot);

    await cache.saveRoot("scope_1", {
      token: "GkfewPcB0ibJMMkXGZucdgR8nhh",
      kind: "wiki_node",
      rootNodeId: "node_root",
      title: "测试 root",
      loadedAt: "2026-05-21T00:00:00.000Z",
    });

    expect(await cache.readRoot("scope_1", "GkfewPcB0ibJMMkXGZucdgR8nhh")).toEqual({
      token: "GkfewPcB0ibJMMkXGZucdgR8nhh",
      kind: "wiki_node",
      rootNodeId: "node_root",
      title: "测试 root",
      loadedAt: "2026-05-21T00:00:00.000Z",
    });
    expect(await cache.readRoot("scope_2", "GkfewPcB0ibJMMkXGZucdgR8nhh")).toBeNull();
  });

  test("stores and reads branch nodes without sharing scopes", async () => {
    const snapshot = createSnapshot();
    const cache = createCache(snapshot);

    await cache.saveBranch("scope_1", {
      rootToken: "root",
      parentToken: "parent",
      loadedAt: "2026-05-21T00:00:00.000Z",
      complete: true,
      nodes: [{ id: "child", token: "child", kind: "document", title: "Child", hasChild: false }],
    });

    expect((await cache.readBranch("scope_1", "root", "parent"))?.nodes[0].title).toBe("Child");
    expect(await cache.readBranch("scope_2", "root", "parent")).toBeNull();
  });

  test("stores and reads document content without sharing scopes", async () => {
    const snapshot = createSnapshot();
    const cache = createCache(snapshot);
    const item = createContentView("doc_1", "Cached Doc");

    await cache.saveContent("scope_1", "doc_1", item, "2026-05-21T00:00:00.000Z");

    expect(await cache.readContent("scope_1", "doc_1")).toEqual({
      docId: "doc_1",
      item,
      loadedAt: "2026-05-21T00:00:00.000Z",
    });
    expect(await cache.readContent("scope_2", "doc_1")).toBeNull();
  });

  test("serializes concurrent saves across root branch and content caches", async () => {
    const snapshot = createSnapshot();
    const cache = createCache(snapshot);
    const item = createContentView("doc_1", "Concurrent Doc");

    await Promise.all([
      cache.saveRoot("scope_1", {
        token: "root",
        kind: "document",
        rootNodeId: "node_root",
        title: "Root",
        loadedAt: "2026-05-21T00:00:00.000Z",
      }),
      cache.saveBranch("scope_1", {
        rootToken: "root",
        parentToken: "parent",
        loadedAt: "2026-05-21T00:00:01.000Z",
        complete: true,
        nodes: [{ id: "child", token: "child", kind: "document", title: "Child", hasChild: false }],
      }),
      cache.saveContent("scope_1", "doc_1", item, "2026-05-21T00:00:02.000Z"),
    ]);

    expect((await cache.readRoot("scope_1", "root"))?.title).toBe("Root");
    expect((await cache.readBranch("scope_1", "root", "parent"))?.nodes[0].title).toBe("Child");
    expect((await cache.readContent("scope_1", "doc_1"))?.item.title).toBe("Concurrent Doc");
  });

  test("serializes concurrent branch saves without dropping either branch", async () => {
    const snapshot = createSnapshot();
    const cache = createCache(snapshot);

    await Promise.all([
      cache.saveBranch("scope_1", {
        rootToken: "root",
        parentToken: "parent_a",
        loadedAt: "2026-05-21T00:00:00.000Z",
        complete: true,
        nodes: [{ id: "child_a", token: "child_a", kind: "document", title: "Child A", hasChild: false }],
      }),
      cache.saveBranch("scope_1", {
        rootToken: "root",
        parentToken: "parent_b",
        loadedAt: "2026-05-21T00:00:01.000Z",
        complete: true,
        nodes: [{ id: "child_b", token: "child_b", kind: "document", title: "Child B", hasChild: false }],
      }),
    ]);

    expect((await cache.readBranch("scope_1", "root", "parent_a"))?.nodes[0].title).toBe("Child A");
    expect((await cache.readBranch("scope_1", "root", "parent_b"))?.nodes[0].title).toBe("Child B");
  });
});