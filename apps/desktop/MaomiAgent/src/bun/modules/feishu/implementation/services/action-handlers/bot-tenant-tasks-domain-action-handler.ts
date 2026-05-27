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

type TasksGateway = Pick<DesktopFeishuBotTenantSdkGateway, "createTask" | "completeTask">;

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
      details: ["仅开放 tasks.create、tasks.complete。"],
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

export class BotTenantTasksDomainActionHandler implements DesktopFeishuDomainActionHandler {
  constructor(private readonly gateway: TasksGateway) {}

  supports(domain: "tasks"): boolean;
  supports(domain: string): boolean;
  supports(domain: string): boolean {
    return domain === "tasks";
  }

  async execute(context: DomainHandlerContext): Promise<FeishuSmartAssistantActionExecuteResultView> {
    const actionId = normalizeActionId(context.input.actionId);

    if (actionId === "tasks.create") {
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
            reason: "This task action may mutate task data.",
            preview: `Action ${actionId} targets ${getDomainTitle(context.domain)}.`,
          },
          summary: {
            headline: "准备创建飞书任务",
            details: [context.input.title ?? "未命名任务"],
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

      if (!context.input.title) {
        return buildInputError(context, actionId, "title is required for task creation.");
      }

      const task = await this.gateway.createTask({
        title: context.input.title,
        text: context.input.text,
        dueAt: context.input.dueAt,
        userId: context.input.userId,
        userIdType: context.input.userIdType as "open_id" | "union_id" | undefined,
      });

      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "任务已创建",
          details: [context.input.title],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "accepted",
          domain: context.domain,
          actionId,
          task,
        },
        notes: [],
      };
    }

    if (actionId === "tasks.complete") {
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
            reason: "This task action may mutate task data.",
            preview: `Action ${actionId} targets ${getDomainTitle(context.domain)}.`,
          },
          summary: {
            headline: "准备完成飞书任务",
            details: [context.input.taskId ?? "未指定任务"],
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

      if (!context.input.taskId) {
        return buildInputError(context, actionId, "taskId is required for task completion.");
      }

      const task = await this.gateway.completeTask({
        taskId: context.input.taskId,
      });

      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "任务已完成",
          details: [`taskId: ${context.input.taskId}`],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "accepted",
          domain: context.domain,
          actionId,
          task,
        },
        notes: [],
      };
    }

    return buildUnsupportedResult(context, actionId);
  }
}
