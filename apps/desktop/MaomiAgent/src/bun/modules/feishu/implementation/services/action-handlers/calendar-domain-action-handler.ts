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

export class CalendarDomainActionHandler implements DesktopFeishuDomainActionHandler {
  private readonly genericFallback = new GenericDomainActionHandler("calendar");

  supports(domain: "calendar"): boolean;
  supports(domain: string): boolean;
  supports(domain: string): boolean {
    return domain === "calendar";
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
          reason: "This calendar action may mutate schedules.",
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

    if (normalized.includes("free") || normalized.includes("avail")) {
      if (!context.input.startAt || !context.input.endAt) {
        return buildInputError(context, actionId, "startAt and endAt are required for availability query.");
      }
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "日程空闲信息已生成",
          details: ["availability query prepared"],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          availability: {
            attendeeIds: context.input.attendeeIds ?? [],
            startAt: context.input.startAt,
            endAt: context.input.endAt,
            timezone: context.input.timezone ?? "Asia/Shanghai",
            slots: [],
          },
        },
        notes: [],
      };
    }

    if (normalized.includes("create") || normalized.includes("schedule") || normalized.includes("book")) {
      if (!context.input.title || !context.input.startAt || !context.input.endAt) {
        return buildInputError(context, actionId, "title, startAt and endAt are required for event creation.");
      }
      const eventId = `evt_${Date.now()}`;
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "日程创建请求已受理",
          details: [context.input.title],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "accepted",
          domain: context.domain,
          actionId,
          event: {
            eventId,
            title: context.input.title,
            calendarId: context.input.calendarId,
            attendeeIds: context.input.attendeeIds ?? [],
            startAt: context.input.startAt,
            endAt: context.input.endAt,
            timezone: context.input.timezone ?? "Asia/Shanghai",
            durationMinutes: context.input.durationMinutes,
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
          headline: "日程查询已执行",
          details: ["calendar query executed"],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          query: {
            calendarId: context.input.calendarId,
            startAt: context.input.startAt,
            endAt: context.input.endAt,
            query: context.input.query,
            limit: context.input.limit ?? 20,
          },
          items: [],
        },
        notes: [],
      };
    }

    if (normalized.includes("delete") || normalized.includes("cancel")) {
      if (!context.input.meetingId) {
        return buildInputError(context, actionId, "meetingId is required for cancellation.");
      }
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "日程取消请求已受理",
          details: [`meetingId: ${context.input.meetingId}`],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "accepted",
          domain: context.domain,
          actionId,
          cancelledMeetingId: context.input.meetingId,
        },
        notes: [],
      };
    }

    return this.genericFallback.execute(context);
  }
}
