import { describe, expect, test } from "bun:test";
import { FeishuDocTreeRemoteSource } from "./feishu-doc-tree-remote-source";

type RequestRecord = { url: string; token: string };

function createSource(responses: Record<string, unknown>, requests: RequestRecord[] = []) {
  return new FeishuDocTreeRemoteSource({
    getJson: async (url: string, accessToken: string) => {
      requests.push({ url, token: accessToken });
      const match = Object.entries(responses).find(([key]) => url.includes(key));
      if (!match) {
        throw new Error(`No mock for ${url}`);
      }
      const value = match[1];
      if (value instanceof Error) {
        throw value;
      }
      return value;
    },
  });
}

describe("FeishuDocTreeRemoteSource", () => {
  test("recognizes a wiki node token and lists wiki child nodes", async () => {
    const requests: RequestRecord[] = [];
    const source = createSource({
      "/wiki/v2/spaces/get_node": {
        node: {
          token: "wiki_root",
          obj_token: "doc_root",
          obj_type: "docx",
          title: "测试 root",
          has_child: true,
          space_id: "space_1",
        },
      },
      "/wiki/v2/spaces/space_1/nodes": {
        items: [{ node_token: "child_node", obj_token: "child_doc", obj_type: "docx", title: "测试节点1", has_child: false }],
        has_more: false,
      },
    }, requests);

    const root = await source.recognizeRoot("access", "wiki_root");
    const children = await source.listChildren("access", root, undefined);

    expect(root).toEqual({ token: "wiki_root", kind: "wiki_node", rootNodeId: "wiki_root", title: "测试 root", spaceId: "space_1", docId: "doc_root" });
    expect(children.nodes).toEqual([{ id: "child_node", token: "child_node", kind: "wiki_node", docId: "child_doc", title: "测试节点1", objType: "docx", hasChild: false, parentToken: "wiki_root" }]);
    expect(children.hasMore).toBe(false);
    expect(requests.every((item) => item.token === "access")).toBe(true);
  });

  test("falls back to document recognition when wiki lookup fails", async () => {
    const source = createSource({
      "/wiki/v2/spaces/get_node": new Error("Feishu API error 230027: not found"),
      "/docx/v1/documents/doc_1": { document: { document_id: "doc_1", title: "普通文档", revision_id: 3 } },
    });

    await expect(source.recognizeRoot("access", "doc_1")).resolves.toEqual({ token: "doc_1", kind: "document", rootNodeId: "doc_1", title: "普通文档", docId: "doc_1" });
  });
});