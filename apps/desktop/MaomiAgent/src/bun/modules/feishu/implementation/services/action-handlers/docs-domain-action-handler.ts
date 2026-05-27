import type { DesktopFeishuDocRuntimePort } from "../../../abstraction/ports/desktop-feishu-doc-runtime.ports";
import type {
  FeishuDocTreeQuery,
  FeishuSmartAssistantActionExecuteResultView,
} from "../../../../../../shared/desktop-feishu";
import type { DesktopFeishuDomainActionHandler, DomainHandlerContext } from "./desktop-feishu-smart-assistant-action-handler.types";
import {
  actionRequiresConfirmation,
  createRoutedSummary,
  getDomainTitle,
  normalizeActionId,
} from "./desktop-feishu-smart-assistant-action-handler.utils";
import { GenericDomainActionHandler } from "./generic-domain-action-handler";

type DocsRuntime = Pick<
  DesktopFeishuDocRuntimePort,
  | "getDocsCapabilities"
  | "getDocTree"
  | "getDocContent"
  | "getDocMediaPreviewUrls"
  | "getDocWhiteboardPreviewUrls"
  | "openWorkspaceDoc"
  | "getWorkspaceDocLocalDraft"
  | "saveWorkspaceDocLocalDraft"
  | "pullWorkspaceDoc"
  | "pushWorkspaceDoc"
>;

type SearchableDocNode = {
  docId: string;
  title: string;
};

type SearchableDocMatch = {
  docId: string;
  title: string;
  matchedFields: Array<"title" | "markdown">;
  excerpt: string;
};

function resolvePushHeadline(pushStatus: string): string {
  return pushStatus === "blocked"
    ? "文档未推送"
    : pushStatus === "published_new"
      ? "已发布为新文档"
      : pushStatus === "noop"
        ? "文档无需推送"
        : "文档已推送";
}

function resolvePushRecommendationDetail(recommendation: unknown): string | null {
  return recommendation === "publish_new"
    ? "推荐发布方式：发布新文档"
    : recommendation === "pull_required"
      ? "推荐发布方式：先重新拉取远端基线"
      : recommendation === "update_existing"
        ? "推荐发布方式：覆盖原文"
        : null;
}

function normalizeDocNodes(tree: unknown): SearchableDocNode[] {
  if (!tree || typeof tree !== "object") {
    return [];
  }

  const candidateNodes = ((tree as { nodes?: unknown[]; items?: unknown[] }).nodes
    ?? (tree as { items?: unknown[] }).items
    ?? []);

  return candidateNodes
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const docId = typeof (item as { docId?: unknown }).docId === "string"
        ? (item as { docId: string }).docId.trim()
        : "";
      const title = typeof (item as { title?: unknown }).title === "string"
        ? (item as { title: string }).title.trim()
        : "";
      if (!docId) {
        return null;
      }

      return {
        docId,
        title: title || docId,
      };
    })
    .filter((item): item is SearchableDocNode => item !== null);
}

function buildMarkdownExcerpt(markdown: string, query: string): string {
  const normalizedMarkdown = markdown
    .replace(/[#>*_`~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalizedMarkdown) {
    return "";
  }

  const normalizedQuery = query.toLowerCase();
  const startIndex = normalizedMarkdown.toLowerCase().indexOf(normalizedQuery);
  if (startIndex < 0) {
    return normalizedMarkdown.slice(0, 96);
  }

  const sliceStart = Math.max(0, startIndex - 24);
  const sliceEnd = Math.min(
    normalizedMarkdown.length,
    startIndex + query.length + 48,
  );
  const prefix = sliceStart > 0 ? "..." : "";
  const suffix = sliceEnd < normalizedMarkdown.length ? "..." : "";

  return `${prefix}${normalizedMarkdown.slice(sliceStart, sliceEnd).trim()}${suffix}`;
}

async function searchDocs(
  docRuntime: DocsRuntime,
  query: string,
  root: FeishuDocTreeQuery["root"],
  docId?: string,
): Promise<SearchableDocMatch[]> {
  const tree = await docRuntime.getDocTree({
    root,
    ...(docId ? { docId } : {}),
  });
  const nodes = normalizeDocNodes(tree);
  const normalizedQuery = query.toLowerCase();
  const matches: SearchableDocMatch[] = [];

  for (const node of nodes) {
    const content = await docRuntime.getDocContent(node.docId);
    const matchedFields: Array<"title" | "markdown"> = [];
    const resolvedTitle = content.title?.trim() || node.title;
    const markdown = content.markdown ?? "";

    if (resolvedTitle.toLowerCase().includes(normalizedQuery)) {
      matchedFields.push("title");
    }
    if (markdown.toLowerCase().includes(normalizedQuery)) {
      matchedFields.push("markdown");
    }

    if (matchedFields.length === 0) {
      continue;
    }

    matches.push({
      docId: node.docId,
      title: resolvedTitle,
      matchedFields,
      excerpt: buildMarkdownExcerpt(markdown, query),
    });
  }

  return matches.sort((left, right) => {
    const leftTitleBoost = left.matchedFields.includes("title") ? 1 : 0;
    const rightTitleBoost = right.matchedFields.includes("title") ? 1 : 0;
    if (leftTitleBoost !== rightTitleBoost) {
      return rightTitleBoost - leftTitleBoost;
    }
    return left.title.localeCompare(right.title, "zh-CN");
  });
}

function buildInputError(
  context: DomainHandlerContext,
  actionId: string,
  message: string,
): FeishuSmartAssistantActionExecuteResultView {
  return {
    workspaceId: context.input.workspaceId,
    actionId,
    domain: context.domain,
    executionMode: "builtin_runtime",
    executed: false,
    confirmationRequired: false,
    summary: {
      headline: `${getDomainTitle(context.domain)}动作参数不完整`,
      details: [message],
      nextSuggestedActionIds: [],
    },
    result: {
      ok: false,
      stage: "invalid_input",
      domain: context.domain,
      actionId,
      message,
    },
    notes: [],
  };
}

export class DocsDomainActionHandler implements DesktopFeishuDomainActionHandler {
  private readonly genericFallback = new GenericDomainActionHandler("docs");

  constructor(private readonly docRuntime: DocsRuntime) {}

  supports(domain: "docs"): boolean;
  supports(domain: string): boolean;
  supports(domain: string): boolean {
    return domain === "docs";
  }

  async execute(context: DomainHandlerContext): Promise<FeishuSmartAssistantActionExecuteResultView> {
    const actionId = normalizeActionId(context.input.actionId);
    const normalized = actionId.toLowerCase();
    const confirmationRequired = actionRequiresConfirmation(actionId) && !context.input.confirm;

    if (confirmationRequired) {
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: false,
        confirmationRequired: true,
        confirmation: {
          required: true,
          confirmed: false,
          confirmField: "confirm",
          reason: "This docs action may mutate remote resources.",
          preview: `Action ${actionId} targets ${getDomainTitle(context.domain)}.`,
        },
        summary: createRoutedSummary(context.domain, context.availableRuntimeCount, actionId),
        result: {
          ok: false,
          stage: "confirmation_required",
          domain: context.domain,
          actionId,
        },
        notes: ["Provide confirm=true to proceed with this action route."],
      };
    }

    if (normalized.includes("capabilit")) {
      const capabilities = await this.docRuntime.getDocsCapabilities();
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "文档能力已读取",
          details: ["docs capabilities resolved from runtime"],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          capabilities,
        },
        notes: [],
      };
    }

    if (normalized.includes("search")) {
      const query = context.input.query?.trim() ?? "";
      if (!query) {
        return buildInputError(context, actionId, "query is required for docs search.");
      }

      const matches = await searchDocs(
        this.docRuntime,
        query,
        context.input.root ?? "document",
        context.input.docId,
      );
      const previewMatches = matches.slice(0, 10);

      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: matches.length > 0
            ? `搜索到 ${matches.length} 篇匹配文档`
            : "未找到匹配文档",
          details: [
            `query: ${query}`,
            `root: ${context.input.root ?? "document"}`,
          ],
          nextSuggestedActionIds: matches.length > 0 ? ["docs.read"] : [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          query,
          totalMatches: matches.length,
          matches: previewMatches,
        },
        notes: matches.length > previewMatches.length
          ? [`Only the first ${previewMatches.length} matches are returned in the preview payload.`]
          : [],
      };
    }

    if (normalized.includes("tree") || normalized.includes("list")) {
      const query: FeishuDocTreeQuery = {
        root: context.input.root ?? "document",
        docId: context.input.docId,
        pageToken: context.input.pageToken,
        pageSize: context.input.pageSize,
      };
      const tree = await this.docRuntime.getDocTree(query);
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "文档树已读取",
          details: [`root: ${query.root}`],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          tree,
        },
        notes: [],
      };
    }

    if (normalized.includes("whiteboard")) {
      const whiteboardTokens = context.input.fileTokens ?? [];
      const preview = await this.docRuntime.getDocWhiteboardPreviewUrls({ whiteboardTokens });
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "白板预览地址已生成",
          details: [`tokens: ${whiteboardTokens.length}`],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          preview,
        },
        notes: [],
      };
    }

    if (normalized.includes("media")) {
      const fileTokens = context.input.fileTokens ?? [];
      const preview = await this.docRuntime.getDocMediaPreviewUrls({ fileTokens });
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "媒体预览地址已生成",
          details: [`tokens: ${fileTokens.length}`],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          preview,
        },
        notes: [],
      };
    }

    if (normalized.includes("draft") && (normalized.includes("save") || normalized.includes("write") || normalized.includes("update"))) {
      if (!context.input.workspaceId || !context.input.docId) {
        return buildInputError(context, actionId, "workspaceId and docId are required for saving draft.");
      }
      const item = await this.docRuntime.saveWorkspaceDocLocalDraft({
        workspaceId: context.input.workspaceId,
        docId: context.input.docId,
        title: context.input.title ?? context.input.docId,
        markdown: context.input.markdown,
        force: context.input.confirm,
      });
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "本地草稿已保存",
          details: [`docId: ${context.input.docId}`],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          item,
        },
        notes: [],
      };
    }

    if (normalized.includes("draft")) {
      if (!context.input.workspaceId || !context.input.docId) {
        return buildInputError(context, actionId, "workspaceId and docId are required for loading draft.");
      }
      const item = await this.docRuntime.getWorkspaceDocLocalDraft({
        workspaceId: context.input.workspaceId,
        docId: context.input.docId,
      });
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "本地草稿已读取",
          details: [`docId: ${context.input.docId}`],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          item,
        },
        notes: [],
      };
    }

    if (normalized.includes("pull")) {
      if (!context.input.workspaceId || !context.input.docId) {
        return buildInputError(context, actionId, "workspaceId and docId are required for pull.");
      }
      const pullResult = await this.docRuntime.pullWorkspaceDoc({
        workspaceId: context.input.workspaceId,
        docId: context.input.docId,
      });
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "文档已拉取",
          details: [`docId: ${context.input.docId}`],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          pullResult,
        },
        notes: [],
      };
    }

    if (normalized.includes("push")) {
      if (!context.input.workspaceId || !context.input.docId) {
        return buildInputError(context, actionId, "workspaceId and docId are required for push.");
      }
      const pushResult = await this.docRuntime.pushWorkspaceDoc({
        workspaceId: context.input.workspaceId,
        docId: context.input.docId,
        title: context.input.title ?? context.input.docId,
        markdown: context.input.markdown,
        force: context.input.confirm,
      });
      const details = [`docId: ${context.input.docId}`];
      const recommendation = resolvePushRecommendationDetail(pushResult.item.cache?.publishModeRecommendation);
      if (recommendation) {
        details.push(recommendation);
      }
      if (pushResult.item.cache?.hasRevisionConflict) {
        details.push("远端基线已变化，请先重新拉取。");
      }
      if (pushResult.item.cache?.hasBlockedChanges) {
        details.push("当前改动不适合直接覆盖原文。");
      }
      if (pushResult.item.cache?.unknownBlockCount) {
        details.push(`未知块保留：${pushResult.item.cache.unknownBlockCount}`);
      }
      if (pushResult.message?.trim()) {
        details.push(pushResult.message.trim());
      }
      if (pushResult.warnings.length > 0) {
        details.push(`warnings: ${pushResult.warnings.join("；")}`);
      }
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: resolvePushHeadline(pushResult.pushStatus),
          details,
          nextSuggestedActionIds: pushResult.pushStatus === "blocked" && pushResult.item.cache?.publishModeRecommendation === "pull_required"
            ? ["docs.pull"]
            : [],
        },
        result: {
          ok: pushResult.pushStatus !== "blocked",
          stage: pushResult.pushStatus === "blocked" ? "blocked" : "completed",
          domain: context.domain,
          actionId,
          pushResult,
        },
        notes: [],
      };
    }

    if (normalized.includes("open") || normalized.includes("read") || normalized.includes("content") || normalized.includes("get")) {
      if (!context.input.docId) {
        return buildInputError(context, actionId, "docId is required for content actions.");
      }
      const item = context.input.workspaceId
        ? await this.docRuntime.openWorkspaceDoc({
          workspaceId: context.input.workspaceId,
          docId: context.input.docId,
        })
        : await this.docRuntime.getDocContent(context.input.docId);
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "文档内容已读取",
          details: [`docId: ${context.input.docId}`],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          item,
        },
        notes: [],
      };
    }

    return this.genericFallback.execute(context);
  }
}
