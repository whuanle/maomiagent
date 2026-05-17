import type { FeishuSmartAssistantActionExecuteResultView } from "../../../../../../shared/desktop-feishu";
import type {
  DesktopFeishuDomainActionHandler,
  DomainHandlerContext,
} from "./desktop-feishu-smart-assistant-action-handler.types";
import {
  actionRequiresConfirmation,
  createRoutedSummary,
  getDomainTitle,
  normalizeActionId,
} from "./desktop-feishu-smart-assistant-action-handler.utils";
import { GenericDomainActionHandler } from "./generic-domain-action-handler";

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

export class WikiDomainActionHandler implements DesktopFeishuDomainActionHandler {
  private readonly genericFallback = new GenericDomainActionHandler("wiki");

  supports(domain: "wiki"): boolean;
  supports(domain: string): boolean;
  supports(domain: string): boolean {
    return domain === "wiki";
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
          reason: "This wiki action may mutate wiki nodes.",
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

    if (normalized.includes("list") || normalized.includes("tree") || normalized.includes("query") || normalized.includes("search")) {
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "知识库节点查询已执行",
          details: ["wiki query executed"],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          query: {
            wikiSpaceId: context.input.wikiSpaceId,
            wikiNodeToken: context.input.wikiNodeToken,
            query: context.input.query,
          },
          items: [],
        },
        notes: [],
      };
    }

    if (normalized.includes("create")) {
      if (!context.input.title) {
        return buildInputError(context, actionId, "title is required for wiki node creation.");
      }
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "知识库节点创建请求已受理",
          details: [context.input.title],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "accepted",
          domain: context.domain,
          actionId,
          node: {
            wikiNodeToken: context.input.wikiNodeToken ?? `wiki_${Date.now()}`,
            wikiSpaceId: context.input.wikiSpaceId,
            title: context.input.title,
            wikiNodeType: context.input.wikiNodeType,
            wikiObjType: context.input.wikiObjType,
            parentWikiNodeToken: context.input.targetWikiNodeToken,
          },
        },
        notes: [],
      };
    }

    if (normalized.includes("move") || normalized.includes("rename")) {
      if (!context.input.wikiNodeToken) {
        return buildInputError(context, actionId, "wikiNodeToken is required for move/rename action.");
      }
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "知识库节点变更请求已受理",
          details: [`wikiNodeToken: ${context.input.wikiNodeToken}`],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "accepted",
          domain: context.domain,
          actionId,
          node: {
            wikiNodeToken: context.input.wikiNodeToken,
            title: context.input.title,
            targetWikiNodeToken: context.input.targetWikiNodeToken,
            targetWikiSpaceId: context.input.targetWikiSpaceId,
            wikiNodeAction: context.input.wikiNodeAction,
          },
        },
        notes: [],
      };
    }

    if (normalized.includes("bind") || normalized.includes("link")) {
      if (!context.input.originWikiNodeToken || !context.input.targetWikiNodeToken) {
        return buildInputError(context, actionId, "originWikiNodeToken and targetWikiNodeToken are required for bind/link action.");
      }
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "知识库节点关联请求已受理",
          details: ["wiki node link accepted"],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "accepted",
          domain: context.domain,
          actionId,
          binding: {
            originWikiNodeToken: context.input.originWikiNodeToken,
            targetWikiNodeToken: context.input.targetWikiNodeToken,
            targetWikiSpaceId: context.input.targetWikiSpaceId,
          },
        },
        notes: [],
      };
    }

    if (normalized.includes("delete") || normalized.includes("remove")) {
      if (!context.input.wikiNodeToken) {
        return buildInputError(context, actionId, "wikiNodeToken is required for delete action.");
      }
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "知识库节点删除请求已受理",
          details: [`wikiNodeToken: ${context.input.wikiNodeToken}`],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "accepted",
          domain: context.domain,
          actionId,
          removedWikiNodeToken: context.input.wikiNodeToken,
        },
        notes: [],
      };
    }

    return this.genericFallback.execute(context);
  }
}
