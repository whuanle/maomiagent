import type { FeishuSmartAssistantActionExecuteResultView } from "../../../../../../shared/desktop-feishu";
import type {
  DesktopFeishuDomainActionHandler,
  DomainHandlerContext,
} from "./desktop-feishu-smart-assistant-action-handler.types";
import {
  actionRequiresConfirmation,
  getDomainTitle,
  normalizeActionId,
} from "./desktop-feishu-smart-assistant-action-handler.utils";
import type { DesktopFeishuBotTenantSdkGateway } from "../desktop-feishu-bot-tenant-sdk-gateway";

type CalendarGateway = Pick<
  DesktopFeishuBotTenantSdkGateway,
  "listAgenda" | "findFreeBusy" | "createCalendarEvent"
>;

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

function buildUnsupportedResult(
  context: DomainHandlerContext,
  actionId: string,
): FeishuSmartAssistantActionExecuteResultView {
  return {
    workspaceId: context.input.workspaceId,
    actionId,
    domain: context.domain,
    executionMode: "builtin_runtime",
    executed: false,
    confirmationRequired: false,
    summary: {
      headline: "当前飞书机器人未开通此能力",
      details: ["仅开放 calendar.agenda、calendar.find_slot、calendar.create_event。"],
      nextSuggestedActionIds: [],
    },
    result: {
      ok: false,
      stage: "unsupported",
      domain: context.domain,
      actionId,
      message: "当前飞书机器人未开通此能力。",
    },
    notes: [],
  };
}

export class BotTenantCalendarDomainActionHandler implements DesktopFeishuDomainActionHandler {
  constructor(private readonly gateway: CalendarGateway) {}

  supports(domain: "calendar"): boolean;
  supports(domain: string): boolean;
  supports(domain: string): boolean {
    return domain === "calendar";
  }

  async execute(context: DomainHandlerContext): Promise<FeishuSmartAssistantActionExecuteResultView> {
    const actionId = normalizeActionId(context.input.actionId);

    if (actionId === "calendar.agenda") {
      if (!context.input.userId || !context.input.userIdType || !context.input.startAt || !context.input.endAt) {
        return buildInputError(context, actionId, "userId, userIdType, startAt and endAt are required for agenda query.");
      }

      const items = await this.gateway.listAgenda({
        userId: context.input.userId,
        userIdType: context.input.userIdType as "open_id" | "union_id",
        startAt: context.input.startAt,
        endAt: context.input.endAt,
      });

      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "日程查询已完成",
          details: [`共返回 ${items.length} 条日程`],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          items,
        },
        notes: [],
      };
    }

    if (actionId === "calendar.find_slot") {
      if (!context.input.userId || !context.input.userIdType || !context.input.startAt || !context.input.endAt) {
        return buildInputError(context, actionId, "userId, userIdType, startAt and endAt are required for slot lookup.");
      }

      const attendeeIds = [...new Set([
        context.input.userId,
        ...(context.input.attendeeIds ?? []),
      ].filter(Boolean) as string[])];
      const freebusy = await this.gateway.findFreeBusy({
        attendeeIds,
        userIdType: context.input.userIdType as "open_id" | "union_id",
        startAt: context.input.startAt,
        endAt: context.input.endAt,
      });

      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "忙闲分析已完成",
          details: [`共分析 ${attendeeIds.length} 个参与方`],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          freebusy,
        },
        notes: [],
      };
    }

    if (actionId === "calendar.create_event") {
      if (actionRequiresConfirmation(actionId) && !context.input.confirm) {
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
          summary: {
            headline: "准备创建飞书日程",
            details: [context.input.title ?? "未命名日程"],
            nextSuggestedActionIds: [],
          },
          result: {
            ok: false,
            stage: "confirmation_required",
            domain: context.domain,
            actionId,
          },
          notes: ["Provide confirm=true to proceed with this bot tenant action."],
        };
      }

      if (!context.input.userId || !context.input.userIdType || !context.input.title || !context.input.startAt || !context.input.endAt) {
        return buildInputError(context, actionId, "userId, userIdType, title, startAt and endAt are required for event creation.");
      }

      const attendeeIds = [...new Set([
        context.input.userId,
        ...(context.input.attendeeIds ?? []),
      ].filter(Boolean) as string[])];
      const event = await this.gateway.createCalendarEvent({
        userId: context.input.userId,
        userIdType: context.input.userIdType as "open_id" | "union_id",
        title: context.input.title,
        text: context.input.text,
        startAt: context.input.startAt,
        endAt: context.input.endAt,
        timezone: context.input.timezone,
        attendeeIds,
        createMeeting: context.input.createMeeting === true,
      });

      const details = [context.input.title];
      if (event.failedAttendeeIds.length > 0) {
        details.push(`有 ${event.failedAttendeeIds.length} 个参与人未成功加入。`);
      }

      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "日程已创建",
          details,
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "accepted",
          domain: context.domain,
          actionId,
          event,
        },
        notes: [],
      };
    }

    return buildUnsupportedResult(context, actionId);
  }
}
