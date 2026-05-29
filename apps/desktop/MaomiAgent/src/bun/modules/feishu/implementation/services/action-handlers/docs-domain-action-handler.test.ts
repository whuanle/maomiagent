import { describe, expect, test } from "bun:test";

import type {
  FeishuDocContentView,
  FeishuDocTreeView,
} from "../../../../../../shared/desktop-feishu";
import { DocsDomainActionHandler } from "./docs-domain-action-handler";

function createDocContentView(input: {
  docId: string;
  title: string;
  markdown: string;
  cache?: FeishuDocContentView["cache"];
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
    ...(input.cache ? { cache: input.cache } : {}),
  };
}

function createDocTreeView(): FeishuDocTreeView {
  return {
    root: "document",
    nodes: [
      {
        id: "doc-roadmap",
        token: "doc-roadmap",
        kind: "document",
        docId: "doc-roadmap",
        title: "产品路线图",
        hasChild: false,
      },
      {
        id: "doc-sync",
        token: "doc-sync",
        kind: "document",
        docId: "doc-sync",
        title: "团队周报",
        hasChild: false,
      },
      {
        id: "doc-empty",
        token: "doc-empty",
        kind: "document",
        docId: "doc-empty",
        title: "未命中记录",
        hasChild: false,
      },
    ],
    hasMore: false,
  };
}

function createHandler(options: {
  pushWorkspaceDoc?: () => Promise<{
    item: FeishuDocContentView;
    pushStatus: "succeeded" | "accepted" | "noop" | "blocked" | "published_new";
    message?: string;
    warnings: string[];
  }>;
} = {}) {
  const docs = {
    "doc-roadmap": createDocContentView({
      docId: "doc-roadmap",
      title: "产品路线图",
      markdown: "# 产品路线图\n\n这里记录飞书智能助手的迁移计划。",
    }),
    "doc-sync": createDocContentView({
      docId: "doc-sync",
      title: "团队周报",
      markdown: "# 团队周报\n\n本周继续推进路线图里的飞书搜索动作。",
    }),
    "doc-empty": createDocContentView({
      docId: "doc-empty",
      title: "未命中记录",
      markdown: "# 未命中记录\n\n没有相关关键字。",
    }),
  } as const;

  return new DocsDomainActionHandler({
    getDocsCapabilities: async () => {
      throw new Error("not used in docs search test");
    },
    getDocTree: async () => createDocTreeView(),
    getDocContent: async (docId: string) => docs[docId as keyof typeof docs],
    getDocMediaPreviewUrls: async () => {
      throw new Error("not used in docs search test");
    },
    getDocWhiteboardPreviewUrls: async () => {
      throw new Error("not used in docs search test");
    },
    openWorkspaceDoc: async () => {
      throw new Error("not used in docs search test");
    },
    getWorkspaceDocLocalDraft: async () => {
      throw new Error("not used in docs search test");
    },
    saveWorkspaceDocLocalDraft: async () => {
      throw new Error("not used in docs search test");
    },
    pullWorkspaceDoc: async () => {
      throw new Error("not used in docs search test");
    },
    pushWorkspaceDoc: options.pushWorkspaceDoc ?? (async () => {
      throw new Error("not used in docs search test");
    }),
  });
}

describe("DocsDomainActionHandler docs.search", () => {
  test("returns matched docs from title and markdown instead of generic fallback", async () => {
    const handler = createHandler();

    const result = await handler.execute({
      input: {
        actionId: "docs.search",
        query: "路线图",
      },
      domain: "docs",
      availableRuntimeCount: 1,
    });

    expect(result.executed).toBe(true);
    expect(result.confirmationRequired).toBe(false);
    expect(result.summary.headline).toBe("搜索到 2 篇匹配文档");
    expect(result.summary.nextSuggestedActionIds).toContain("docs.read");
    expect(result.result).toEqual(
      expect.objectContaining({
        stage: "completed",
        query: "路线图",
        totalMatches: 2,
        matches: expect.arrayContaining([
          expect.objectContaining({
            docId: "doc-roadmap",
            matchedFields: expect.arrayContaining(["title", "markdown"]),
          }),
          expect.objectContaining({
            docId: "doc-sync",
            matchedFields: expect.arrayContaining(["markdown"]),
          }),
        ]),
      }),
    );
  });

  test("rejects docs.search when query is missing", async () => {
    const handler = createHandler();

    const result = await handler.execute({
      input: {
        actionId: "docs.search",
      },
      domain: "docs",
      availableRuntimeCount: 1,
    });

    expect(result.executed).toBe(false);
    expect(result.summary.headline).toBe("云文档动作参数不完整");
    expect(result.result).toEqual(
      expect.objectContaining({
        stage: "invalid_input",
        message: "query is required for docs search.",
      }),
    );
  });

  test("summarizes blocked push results with recommendation diagnostics", async () => {
    const handler = createHandler({
      pushWorkspaceDoc: async () => ({
        item: createDocContentView({
          docId: "doc-roadmap",
          title: "产品路线图",
          markdown: "# 产品路线图",
          cache: {
            workspaceId: "ws_1",
            publishModeRecommendation: "pull_required",
            hasRevisionConflict: true,
            hasBlockedChanges: false,
            unknownBlockCount: 1,
            hasBaseline: true,
            hasLocalChanges: true,
            localChecksum: "sha256:local",
            status: "cached",
          },
        }),
        pushStatus: "blocked",
        message: "请先重新拉取远端文档基线。",
        warnings: [],
      }),
    })

    const result = await handler.execute({
      input: {
        actionId: "docs.push",
        workspaceId: "ws_1",
        docId: "doc-roadmap",
        confirm: true,
      },
      domain: "docs",
      availableRuntimeCount: 1,
    })

    expect(result.summary.headline).toBe("文档未推送")
    expect(result.summary.details).toContain("推荐发布方式：先重新拉取远端基线")
    expect(result.summary.details).toContain("远端基线已变化，请先重新拉取。")
    expect(result.summary.nextSuggestedActionIds).toContain("docs.pull")
    expect(result.result).toEqual(expect.objectContaining({ ok: false, stage: "blocked" }))
  })

  test("summarizes blocked unsupported push results without recommending a new document", async () => {
    const handler = createHandler({
      pushWorkspaceDoc: async () => ({
        item: createDocContentView({
          docId: "doc-roadmap",
          title: "产品路线图",
          markdown: "# 产品路线图",
          cache: {
            workspaceId: "ws_1",
            publishModeRecommendation: "update_existing",
            hasBlockedChanges: true,
            hasBaseline: true,
            hasLocalChanges: true,
            localChecksum: "sha256:local",
            status: "cached",
          },
        }),
        pushStatus: "blocked",
        message: "当前改动暂不支持直接推送：Unsupported patch operation: insert_block",
        warnings: ["unsupported or unknown block removed from draft"],
      }),
    })

    const result = await handler.execute({
      input: {
        actionId: "docs.push",
        workspaceId: "ws_1",
        docId: "doc-roadmap",
        confirm: true,
      },
      domain: "docs",
      availableRuntimeCount: 1,
    })

    expect(result.summary.headline).toBe("文档未推送")
    expect(result.summary.details).toContain("推荐发布方式：覆盖原文")
    expect(result.summary.details).toContain("当前改动包含暂不支持的结构变更。")
    expect(result.summary.details).not.toContain("推荐发布方式：发布新文档")
    expect(result.summary.details).toContain("当前改动暂不支持直接推送：Unsupported patch operation: insert_block")
    expect(result.summary.details).toContain("warnings: unsupported or unknown block removed from draft")
  })
});
