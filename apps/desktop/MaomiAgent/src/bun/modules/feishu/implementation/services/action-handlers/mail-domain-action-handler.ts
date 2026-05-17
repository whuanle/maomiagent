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

export class MailDomainActionHandler implements DesktopFeishuDomainActionHandler {
  private readonly genericFallback = new GenericDomainActionHandler("mail");

  supports(domain: "mail"): boolean;
  supports(domain: string): boolean;
  supports(domain: string): boolean {
    return domain === "mail";
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
          reason: "This mail action may send or mutate mailbox data.",
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

    if (normalized.includes("send") || normalized.includes("draft") || normalized.includes("reply")) {
      if (!context.input.subject || !context.input.text) {
        return buildInputError(context, actionId, "subject and text are required for send/reply action.");
      }
      if (!context.input.to || context.input.to.length === 0) {
        return buildInputError(context, actionId, "to is required for send/reply action.");
      }
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "邮件发送请求已受理",
          details: [context.input.subject],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "accepted",
          domain: context.domain,
          actionId,
          message: {
            mailbox: context.input.mailbox,
            subject: context.input.subject,
            to: context.input.to,
            cc: context.input.cc ?? [],
            bcc: context.input.bcc ?? [],
            body: context.input.text,
          },
        },
        notes: [],
      };
    }

    if (normalized.includes("list") || normalized.includes("query") || normalized.includes("search")) {
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "邮件查询已执行",
          details: ["mail query executed"],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          query: {
            mailbox: context.input.mailbox,
            query: context.input.query,
            limit: context.input.limit ?? 20,
            offset: context.input.offset ?? 0,
          },
          items: [],
        },
        notes: [],
      };
    }

    if (normalized.includes("mark") || normalized.includes("archive")) {
      if (!context.input.messageId) {
        return buildInputError(context, actionId, "messageId is required for mark/archive action.");
      }
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "邮件状态变更请求已受理",
          details: [`messageId: ${context.input.messageId}`],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "accepted",
          domain: context.domain,
          actionId,
          messageId: context.input.messageId,
        },
        notes: [],
      };
    }

    if (normalized.includes("delete") || normalized.includes("remove")) {
      if (!context.input.messageId) {
        return buildInputError(context, actionId, "messageId is required for delete action.");
      }
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "邮件删除请求已受理",
          details: [`messageId: ${context.input.messageId}`],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "accepted",
          domain: context.domain,
          actionId,
          removedMessageId: context.input.messageId,
        },
        notes: [],
      };
    }

    return this.genericFallback.execute(context);
  }
}
