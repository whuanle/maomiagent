import { describe, expect, test } from "bun:test";

import type {
  FeishuDocContentView,
  FeishuDocTreeView,
} from "../../../../../shared/desktop-feishu";
import { DesktopFeishuSmartAssistantActionRegistry } from "./desktop-feishu-smart-assistant-action-registry";

function createDoc(input: {
  docId: string;
  title: string;
  markdown: string;
}): FeishuDocContentView {
  return {
    docId: input.docId,
    title: input.title,
    markdown: input.markdown,
    length: input.markdown.length,
    totalLength: input.markdown.length,
    offset: 0,
    analysis: {
      riskyBlocks: [],
      riskySync: false,
      syncMode: null,
      riskyBlockMode: "safe",
    },
  };
}

function createDocTreeView(): FeishuDocTreeView {
  return {
    root: "document",
    nodes: [
      {
        id: "doc-roadmap",
        docId: "doc-roadmap",
        title: "产品路线图",
        hasChild: false,
      },
      {
        id: "doc-release",
        docId: "doc-release",
        title: "发布计划",
        hasChild: false,
      },
      {
        id: "doc-random",
        docId: "doc-random",
        title: "无关记录",
        hasChild: false,
      },
    ],
    hasMore: false,
  };
}

describe("DesktopFeishuSmartAssistantActionRegistry docs.search", () => {
  test("routes docs.search to the docs domain handler instead of generic fallback", async () => {
    const docs = {
      "doc-roadmap": createDoc({
        docId: "doc-roadmap",
        title: "产品路线图",
        markdown: "# 产品路线图\n\n这里整理飞书智能助手迁移清单。",
      }),
      "doc-release": createDoc({
        docId: "doc-release",
        title: "发布计划",
        markdown: "# 发布计划\n\n路线图里的文档搜索动作已经开始接入。",
      }),
      "doc-random": createDoc({
        docId: "doc-random",
        title: "无关记录",
        markdown: "# 无关记录\n\n这里没有命中关键字。",
      }),
    } as const;

    const registry = new DesktopFeishuSmartAssistantActionRegistry(
      {
        listProviderRuntimes: () => [],
      },
      {
        getDocsCapabilities: async () => ({
          mode: "developer",
          accessKind: "developer_oauth",
          accessLabel: "开发者文档 MCP",
          managedMcpId: "mcp-feishu-docs",
          endpoint: "desktop://feishu/docs",
          availableTools: ["list-docs", "fetch-doc"],
          toolDetails: [
            { name: "list-docs" },
            { name: "fetch-doc" },
          ],
          canSearchDocs: true,
          canListDocs: true,
          canFetchDocs: true,
          canUpdateDocs: false,
          canBrowseTree: true,
          canReadDocs: true,
          canWriteDocs: false,
        }),
        getDocTree: async () => createDocTreeView(),
        getDocContent: async (docId: string) => docs[docId as keyof typeof docs],
        getDocMediaPreviewUrls: async () => ({ items: [], errors: [] }),
        getDocWhiteboardPreviewUrls: async () => ({ items: [], errors: [] }),
        openWorkspaceDoc: async () => {
          throw new Error("not used in registry docs.search test");
        },
        getWorkspaceDocLocalDraft: async () => {
          throw new Error("not used in registry docs.search test");
        },
        saveWorkspaceDocLocalDraft: async () => {
          throw new Error("not used in registry docs.search test");
        },
        pullWorkspaceDoc: async () => {
          throw new Error("not used in registry docs.search test");
        },
        pushWorkspaceDoc: async () => {
          throw new Error("not used in registry docs.search test");
        },
      },
    );

    const result = await registry.execute({
      actionId: "docs.search",
      query: "路线图",
    });

    expect(result.executed).toBe(true);
    expect(result.summary.headline).toBe("搜索到 2 篇匹配文档");
    expect(result.result).toEqual(
      expect.objectContaining({
        stage: "completed",
        totalMatches: 2,
        matches: expect.arrayContaining([
          expect.objectContaining({ docId: "doc-roadmap" }),
          expect.objectContaining({ docId: "doc-release" }),
        ]),
      }),
    );
  });
});
