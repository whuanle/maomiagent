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

  test("does not fall back to document recognition for wiki auth or network errors", async () => {
    const requests: RequestRecord[] = [];
    const authError = new Error("Feishu API error 99991663: auth failed");
    const source = createSource({
      "/wiki/v2/spaces/get_node": authError,
      "/docx/v1/documents/wiki_root": { document: { document_id: "wiki_root", title: "不应请求" } },
    }, requests);

    let caught: unknown;
    try {
      await source.recognizeRoot("access", "wiki_root");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(authError);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain("/wiki/v2/spaces/get_node");
  });

  test("returns no children for document roots without requesting remote nodes", async () => {
    const requests: RequestRecord[] = [];
    const source = createSource({}, requests);

    const children = await source.listChildren("access", {
      token: "doc_1",
      kind: "document",
      rootNodeId: "doc_1",
      title: "普通文档",
      docId: "doc_1",
    });

    expect(children).toEqual({ nodes: [], hasMore: false });
    expect(requests).toEqual([]);
  });

  test("maps pagination fields and filters child nodes without tokens", async () => {
    const requests: RequestRecord[] = [];
    const source = createSource({
      "/wiki/v2/spaces/space_1/nodes": {
        items: [
          { title: "缺 token 节点", has_child: true },
          { node_token: "child_node", obj_token: "child_doc", obj_type: "docx", title: "测试节点1", has_child: false },
        ],
        has_more: true,
        page_token: "next_cursor",
      },
    }, requests);

    const children = await source.listChildren("access", {
      token: "wiki_root",
      kind: "wiki_node",
      rootNodeId: "wiki_root",
      title: "测试 root",
      spaceId: "space_1",
    }, "cursor_1");

    expect(children.hasMore).toBe(true);
    expect(children.pageToken).toBe("next_cursor");
    expect(children.nodes).toEqual([{ id: "child_node", token: "child_node", kind: "wiki_node", docId: "child_doc", title: "测试节点1", objType: "docx", hasChild: false, parentToken: "wiki_root" }]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain("page_token=cursor_1");
  });

  test("reads document content from document metadata and text blocks", async () => {
    const requests: RequestRecord[] = [];
    const source = createSource({
      "/docx/v1/documents/doc_1/blocks": {
        items: [
          { block_id: "block_1", text: { content: "第一段" } },
          { block_id: "block_2", text: { content: "   " } },
          { block_id: "block_3", text: { content: "第二段" } },
        ],
      },
      "/docx/v1/documents/doc_1": {
        document: { document_id: "doc_1", title: "远端文档" },
      },
    }, requests);

    const content = await source.readDocumentContent("access", "doc_1");

    expect(content).toMatchObject({
      docId: "doc_1",
      title: "远端文档",
      markdown: "第一段\n\n第二段",
      length: "第一段\n\n第二段".length,
      totalLength: "第一段\n\n第二段".length,
      offset: 0,
      analysis: {
        riskyBlocks: [],
        riskySync: false,
        syncMode: null,
        riskyBlockMode: "safe",
      },
    });
    expect(requests.map((item) => item.url)).toEqual(expect.arrayContaining([
      expect.stringContaining("/docx/v1/documents/doc_1"),
      expect.stringContaining("/docx/v1/documents/doc_1/blocks?page_size=500"),
    ]));
  });
});