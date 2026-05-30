import { describe, expect, test } from "bun:test";
import { FeishuDocTreeRemoteSource } from "./feishu-doc-tree-remote-source";

type RequestRecord = { url: string; token: string };

function createSource(
  responses: Record<string, unknown>,
  optionsOrRequests: { whiteboard?: Record<string, { format: string; source: string } | null | Error> } | RequestRecord[] = [],
  requests: RequestRecord[] = [],
) {
  const options = Array.isArray(optionsOrRequests) ? {} : optionsOrRequests;
  const requestLog = Array.isArray(optionsOrRequests) ? optionsOrRequests : requests;

  return new FeishuDocTreeRemoteSource(
    {
      getJson: async (url: string, accessToken: string) => {
        requestLog.push({ url, token: accessToken });
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
    },
    {
      queryWhiteboardCode: async ({ whiteboardToken }) => {
        const value = options.whiteboard?.[whiteboardToken];
        if (value instanceof Error) {
          throw value;
        }
        return value ?? null;
      },
    },
  );
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

  test("reads document content from docx rich text elements", async () => {
    const source = createSource({
      "/docx/v1/documents/doc_1/blocks": {
        items: [
          {
            block_id: "heading_1",
            heading1: {
              elements: [
                { text_run: { content: "项目标题" } },
              ],
            },
          },
          {
            block_id: "text_1",
            text: {
              elements: [
                { text_run: { content: "第一段" } },
                { text_run: { content: "正文" } },
              ],
            },
          },
          {
            block_id: "bullet_1",
            bullet: {
              elements: [
                { text_run: { content: "列表项" } },
              ],
            },
          },
        ],
      },
      "/docx/v1/documents/doc_1": {
        document: { document_id: "doc_1", title: "远端文档" },
      },
    });

    const content = await source.readDocumentContent("access", "doc_1");

    expect(content.markdown).toBe("# 项目标题\n\n第一段正文\n\n- 列表项");
    expect(content.length).toBe(content.markdown.length);
    expect(content.totalLength).toBe(content.markdown.length);
  });

  test("serializes structured native docx blocks into source markdown", async () => {
    const source = createSource({
      "/docx/v1/documents/doc_1/blocks": {
        items: [
          { block_id: "doc_1", block_type: 1, children: ["heading_1", "callout_1", "image_1"] },
          {
            block_id: "heading_1",
            parent_id: "doc_1",
            block_type: 3,
            heading1: { elements: [{ text_run: { content: "项目标题" } }] },
          },
          {
            block_id: "callout_1",
            parent_id: "doc_1",
            block_type: 19,
            children: ["callout_text_1"],
            callout: { emoji_id: "bulb", background_color: "yellow", border_color: "orange" },
          },
          {
            block_id: "callout_text_1",
            parent_id: "callout_1",
            block_type: 2,
            text: { elements: [{ text_run: { content: "Callout body" } }] },
          },
          {
            block_id: "image_1",
            parent_id: "doc_1",
            block_type: 27,
            image: { token: "img_token", width: 640, height: 360, name: "封面" },
          },
        ],
      },
      "/docx/v1/documents/doc_1": {
        document: { document_id: "doc_1", title: "远端文档", revision_id: 7 },
      },
    });

    const content = await source.readDocumentContent("access", "doc_1");

    expect(content.markdown).toContain("# 项目标题");
    expect(content.markdown).toContain('<callout blockId="callout_1" emoji-id="bulb" background-color="yellow" border-color="orange">');
    expect(content.markdown).toContain("Callout body");
    expect(content.markdown).toContain('<image token="img_token" width="640" height="360" name="封面" />');
    expect(content.length).toBe(content.markdown.length);
  });

  test("readDocumentBundle keeps a raw source snapshot separate from normalized content blocks", async () => {
    const source = createSource({
      "/docx/v1/documents/doc_1/blocks": {
        items: [
          {
            block_id: "p1",
            parent_id: "doc_1",
            block_type: 2,
            text: { elements: [{ text_run: { content: "Hello" } }] },
          },
        ],
      },
      "/docx/v1/documents/doc_1": {
        document: { document_id: "doc_1", title: "Raw Demo", revision_id: 7 },
      },
    });

    const bundle = await source.readDocumentBundle("access", "doc_1");

    expect(bundle.source.sourceKind).toBe("docx_remote_raw");
    expect(bundle.source.resolvedDocId).toBe("doc_1");
    expect(bundle.source.blocks).toEqual([
      {
        block_id: "p1",
        parent_id: "doc_1",
        block_type: 2,
        text: { elements: [{ text_run: { content: "Hello" } }] },
      },
    ]);
    expect(bundle.content.blocks[0]?.block_id).toBe("doc_1");
  });

  test("falls back to reading docx content by wiki node token when document id lookup fails", async () => {
    const requests: RequestRecord[] = [];
    const source = createSource({
      "/docx/v1/documents/wiki_node_1?document_id_type=wiki_node_token": {
        document: { document_id: "doc_1", title: "Wiki 文档" },
      },
      "/docx/v1/documents/wiki_node_1/blocks?page_size=500&document_id_type=wiki_node_token": {
        items: [{ block_id: "block_1", text: { content: "wiki 正文" } }],
      },
      "/docx/v1/documents/wiki_node_1": new Error("Feishu API HTTP error 400: Bad Request"),
    }, requests);

    const content = await source.readDocumentContent("access", "wiki_node_1");

    expect(content).toMatchObject({
      docId: "doc_1",
      title: "Wiki 文档",
      markdown: "wiki 正文",
    });
    expect(requests.map((item) => item.url)).toEqual([
      expect.stringContaining("/docx/v1/documents/wiki_node_1"),
      expect.stringContaining("/docx/v1/documents/wiki_node_1/blocks?page_size=500"),
      expect.stringContaining("/docx/v1/documents/wiki_node_1?document_id_type=wiki_node_token"),
      expect.stringContaining("/docx/v1/documents/wiki_node_1/blocks?page_size=500&document_id_type=wiki_node_token"),
    ]);
  });

  test("readDocumentBundle recovers Mermaid whiteboards into source markdown", async () => {
    const source = createSource({
      "/docx/v1/documents/doc_1/blocks": {
        items: [
          { block_id: "doc_1", block_type: 1, children: ["wb_1"] },
          { block_id: "wb_1", parent_id: "doc_1", block_type: 37, whiteboard: { token: "whiteboard_token_1" } },
        ],
      },
      "/docx/v1/documents/doc_1": {
        document: { document_id: "doc_1", title: "Mermaid Doc", revision_id: 7 },
      },
    }, {
      whiteboard: {
        whiteboard_token_1: {
          format: "mermaid",
          source: "flowchart TD\nA-->B",
        },
      },
    });

    const bundle = await source.readDocumentBundle("access", "doc_1");

    expect(bundle.content.markdown).toContain("```mermaid\nflowchart TD\nA-->B\n```");
    expect(bundle.ir.assets.whiteboard_token_1?.reversible).toEqual(expect.objectContaining({
      format: "mermaid",
      origin: "whiteboard_code_export",
      ordinal: 0,
    }));
  });

  test("readDocumentBundle keeps board blocks as native board source placeholders", async () => {
    const source = createSource({
      "/docx/v1/documents/doc_1/blocks": {
        items: [
          { block_id: "doc_1", block_type: 1, children: ["board_1"] },
          { block_id: "board_1", parent_id: "doc_1", block_type: 43, board: { token: "whiteboard_token_1" } },
        ],
      },
      "/docx/v1/documents/doc_1": {
        document: { document_id: "doc_1", title: "Board Doc", revision_id: 7 },
      },
    });

    const bundle = await source.readDocumentBundle("access", "doc_1");

    expect(bundle.content.markdown).toContain('<board blockId="board_1" token="whiteboard_token_1" />');
    expect(bundle.ir.assets.whiteboard_token_1).toEqual(expect.objectContaining({
      token: "whiteboard_token_1",
      kind: "whiteboard",
    }));
  });

  test("readDocumentBundle keeps token blocks when whiteboard recovery is unsupported", async () => {
    const source = createSource({
      "/docx/v1/documents/doc_1/blocks": {
        items: [
          { block_id: "doc_1", block_type: 1, children: ["wb_1"] },
          { block_id: "wb_1", parent_id: "doc_1", block_type: 37, whiteboard: { token: "whiteboard_token_1" } },
        ],
      },
      "/docx/v1/documents/doc_1": {
        document: { document_id: "doc_1", title: "PlantUML Doc", revision_id: 7 },
      },
    }, {
      whiteboard: {
        whiteboard_token_1: {
          format: "plantuml",
          source: "@startuml\nAlice -> Bob\n@enduml",
        },
      },
    });

    const bundle = await source.readDocumentBundle("access", "doc_1");

    expect(bundle.content.markdown).toContain('<whiteboard blockId="wb_1" token="whiteboard_token_1" />');
    expect(bundle.content.markdown).not.toContain("```mermaid");
    expect(bundle.ir.assets.whiteboard_token_1?.reversible).toBeUndefined();
  });

  test("readDocumentBundle retries rate-limited whiteboard code export and recovers boards serially", async () => {
    const retryDelays: number[] = [];
    const attemptsByToken = new Map<string, number>();
    const observedOrder: string[] = [];
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const source = new FeishuDocTreeRemoteSource(
      {
        getJson: async (url: string) => {
          if (url.includes("/docx/v1/documents/doc_1/blocks")) {
            return {
              items: [
                { block_id: "doc_1", block_type: 1, children: ["wb_1", "wb_2", "wb_3"] },
                { block_id: "wb_1", parent_id: "doc_1", block_type: 37, whiteboard: { token: "whiteboard_token_1" } },
                { block_id: "wb_2", parent_id: "doc_1", block_type: 37, whiteboard: { token: "whiteboard_token_2" } },
                { block_id: "wb_3", parent_id: "doc_1", block_type: 37, whiteboard: { token: "whiteboard_token_3" } },
              ],
            };
          }
          if (url.includes("/docx/v1/documents/doc_1")) {
            return {
              document: { document_id: "doc_1", title: "Retry Board Doc", revision_id: 7 },
            };
          }
          throw new Error(`No mock for ${url}`);
        },
      },
      {
        queryWhiteboardCode: async ({ whiteboardToken }) => {
          const currentAttempt = (attemptsByToken.get(whiteboardToken) ?? 0) + 1;
          attemptsByToken.set(whiteboardToken, currentAttempt);
          activeRequests += 1;
          maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
          observedOrder.push(`start:${whiteboardToken}:${currentAttempt}`);
          try {
            await Bun.sleep(1);
            if (whiteboardToken === "whiteboard_token_1" && currentAttempt < 3) {
              throw new Error("Feishu API HTTP error 400 (code 99991400): request trigger frequency limit");
            }
            return {
              format: "mermaid",
              source: `flowchart TD\n${whiteboardToken}-->B`,
            };
          } finally {
            observedOrder.push(`end:${whiteboardToken}:${currentAttempt}`);
            activeRequests -= 1;
          }
        },
      },
      {
        sleep: async (ms) => {
          retryDelays.push(ms);
        },
        whiteboardRecoveryConcurrency: 1,
        whiteboardCodeRetryDelaysMs: [10, 20],
      },
    );

    const bundle = await source.readDocumentBundle("access", "doc_1");

    expect(bundle.content.markdown).toContain("```mermaid\nflowchart TD\nwhiteboard_token_1-->B\n```");
    expect(bundle.content.markdown).toContain("```mermaid\nflowchart TD\nwhiteboard_token_2-->B\n```");
    expect(bundle.content.markdown).toContain("```mermaid\nflowchart TD\nwhiteboard_token_3-->B\n```");
    expect(bundle.content.diagnostics).toBeUndefined();
    expect(attemptsByToken.get("whiteboard_token_1")).toBe(3);
    expect(attemptsByToken.get("whiteboard_token_2")).toBe(1);
    expect(attemptsByToken.get("whiteboard_token_3")).toBe(1);
    expect(retryDelays).toEqual([10, 20]);
    expect(maxActiveRequests).toBe(1);
    expect(observedOrder).toEqual([
      "start:whiteboard_token_1:1",
      "end:whiteboard_token_1:1",
      "start:whiteboard_token_1:2",
      "end:whiteboard_token_1:2",
      "start:whiteboard_token_1:3",
      "end:whiteboard_token_1:3",
      "start:whiteboard_token_2:1",
      "end:whiteboard_token_2:1",
      "start:whiteboard_token_3:1",
      "end:whiteboard_token_3:1",
    ]);
  });

  test("readDocumentBundle keeps diagnostics when whiteboard code export remains rate limited after retries", async () => {
    const retryDelays: number[] = [];
    let attempts = 0;
    const source = new FeishuDocTreeRemoteSource(
      {
        getJson: async (url: string) => {
          if (url.includes("/docx/v1/documents/doc_1/blocks")) {
            return {
              items: [
                { block_id: "doc_1", block_type: 1, children: ["wb_1"] },
                { block_id: "wb_1", parent_id: "doc_1", block_type: 37, whiteboard: { token: "whiteboard_token_1" } },
              ],
            };
          }
          if (url.includes("/docx/v1/documents/doc_1")) {
            return {
              document: { document_id: "doc_1", title: "Rate Limited Board Doc", revision_id: 7 },
            };
          }
          throw new Error(`No mock for ${url}`);
        },
      },
      {
        queryWhiteboardCode: async () => {
          attempts += 1;
          throw new Error("Feishu API HTTP error 400 (code 99991400): request trigger frequency limit");
        },
      },
      {
        sleep: async (ms) => {
          retryDelays.push(ms);
        },
        whiteboardRecoveryConcurrency: 1,
        whiteboardCodeRetryDelaysMs: [10, 20],
      },
    );

    const bundle = await source.readDocumentBundle("access", "doc_1");

    expect(bundle.content.markdown).toContain('<whiteboard blockId="wb_1" token="whiteboard_token_1" />');
    expect(bundle.content.diagnostics?.latestPull?.whiteboardRecovery).toEqual(expect.objectContaining({
      status: "blocked",
      recoveredCount: 0,
      fallbackCount: 1,
      permissionDeniedCount: 0,
    }));
    expect(bundle.content.diagnostics?.latestPull?.whiteboardRecovery?.entries).toEqual([
      expect.objectContaining({
        token: "whiteboard_token_1",
        stage: "whiteboard_code",
        code: 99991400,
        category: "unknown",
        fallbackApplied: true,
      }),
    ]);
    expect(attempts).toBe(3);
    expect(retryDelays).toEqual([10, 20]);
  });

  test("readDocumentBundle records diagnostics when whiteboard code export is forbidden", async () => {
    const source = createSource({
      "/docx/v1/documents/doc_1/blocks": {
        items: [
          { block_id: "doc_1", block_type: 1, children: ["wb_1"] },
          { block_id: "wb_1", parent_id: "doc_1", block_type: 37, whiteboard: { token: "whiteboard_token_1" } },
        ],
      },
      "/docx/v1/documents/doc_1": {
        document: { document_id: "doc_1", title: "Forbidden Board Doc", revision_id: 7 },
      },
    }, {
      whiteboard: {
        whiteboard_token_1: new Error("Feishu API HTTP error 403 (code 2890005): forbidden"),
      },
    });

    const bundle = await source.readDocumentBundle("access", "doc_1");

    expect(bundle.content.markdown).toContain('<whiteboard blockId="wb_1" token="whiteboard_token_1" />');
    expect(bundle.content.diagnostics?.latestPull?.whiteboardRecovery).toEqual(expect.objectContaining({
      status: "blocked",
      recoveredCount: 0,
      fallbackCount: 1,
      permissionDeniedCount: 1,
    }));
    expect(bundle.content.diagnostics?.latestPull?.whiteboardRecovery?.entries).toEqual([
      expect.objectContaining({
        token: "whiteboard_token_1",
        stage: "whiteboard_code",
        code: 2890005,
        category: "permission",
        fallbackApplied: true,
      }),
    ]);
  });
});
