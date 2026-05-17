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

export class MessengerDomainActionHandler implements DesktopFeishuDomainActionHandler {
  private readonly genericFallback = new GenericDomainActionHandler("messenger");

  supports(domain: "messenger"): boolean;
  supports(domain: string): boolean;
  supports(domain: string): boolean {
    return domain === "messenger";
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
          reason: "This messaging action may send content to users/chats.",
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

    if (normalized.includes("send") || normalized.includes("reply")) {
      if (!context.input.text) {
        return buildInputError(context, actionId, "text is required for send/reply action.");
      }
      if (!context.input.chatId && !context.input.threadId) {
        return buildInputError(context, actionId, "chatId or threadId is required for send/reply action.");
      }
      const messageId = `msg_${Date.now()}`;
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "消息发送请求已受理",
          details: [context.input.threadId ? "thread reply" : "chat message"],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "accepted",
          domain: context.domain,
          actionId,
          receipt: {
            messageId,
            chatId: context.input.chatId,
            threadId: context.input.threadId,
            replyInThread: Boolean(context.input.replyInThread),
            text: context.input.text,
          },
        },
        notes: [],
      };
    }

    if (normalized.includes("list") || normalized.includes("query") || normalized.includes("search") || normalized.includes("history")) {
      if (!context.input.chatId && !context.input.threadId && !context.input.query) {
        return buildInputError(context, actionId, "chatId/threadId/query is required for message query.");
      }
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "消息查询已执行",
          details: ["message query executed"],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          query: {
            chatId: context.input.chatId,
            threadId: context.input.threadId,
            query: context.input.query,
            limit: context.input.limit ?? 20,
            offset: context.input.offset ?? 0,
          },
          items: [],
        },
        notes: [],
      };
    }

    return this.genericFallback.execute(context);
  }
}
