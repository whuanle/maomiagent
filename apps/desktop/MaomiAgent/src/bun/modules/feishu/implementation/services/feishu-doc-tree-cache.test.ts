import { describe, expect, test } from "bun:test";
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
});