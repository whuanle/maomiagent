import assert from "node:assert/strict";
import { FeishuDocTreeLoader } from "../src/bun/modules/feishu/implementation/services/feishu-doc-tree-loader";

const roots = new Map<string, any>();
const branches = new Map<string, any>();

const loader = new FeishuDocTreeLoader({
  scopeId: () => "smoke-scope",
  accessToken: async () => "smoke-access",
  now: () => "2026-05-21T00:00:00.000Z",
  cache: {
    readRoot: async (_scopeId, token) => roots.get(token) ?? null,
    saveRoot: async (_scopeId, entry) => {
      roots.set(entry.token, entry);
    },
    readBranch: async (_scopeId, _rootToken, parentToken) => branches.get(parentToken) ?? null,
    saveBranch: async (_scopeId, entry) => {
      branches.set(entry.parentToken, entry);
    },
  },
  remote: {
    recognizeRoot: async (_accessToken, token) => ({
      token,
      kind: "wiki_node",
      rootNodeId: token,
      title: "测试根节点",
      spaceId: "smoke-space",
    }),
    listChildren: async (_accessToken, root) => ({
      nodes: [
        {
          id: `${root.rootNodeId}-node-1`,
          token: `${root.rootNodeId}-node-1`,
          kind: "document",
          title: "测试节点1",
          hasChild: false,
        },
      ],
      hasMore: false,
    }),
  },
  emit: () => undefined,
});

const feishu = {
  loadDocTreeRoot: loader.loadRoot.bind(loader),
  loadDocTreeBranch: loader.loadBranch.bind(loader),
};

const root = await feishu.loadDocTreeRoot({ token: "root" });
assert(root.nodes.length > 0);
assert(root.nodes[0].title === "测试节点1");

const branch = await feishu.loadDocTreeBranch({ rootToken: "root", parentToken: root.nodes[0].token });
assert(Array.isArray(branch.nodes));

await loader.waitForIdleForTest();