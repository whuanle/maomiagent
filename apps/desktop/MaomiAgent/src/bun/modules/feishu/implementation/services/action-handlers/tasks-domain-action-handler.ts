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

export class TasksDomainActionHandler implements DesktopFeishuDomainActionHandler {
  private readonly genericFallback = new GenericDomainActionHandler("tasks");

  supports(domain: "tasks"): boolean;
  supports(domain: string): boolean;
  supports(domain: string): boolean {
    return domain === "tasks";
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
          reason: "This task action may mutate task data.",
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

    if (normalized.includes("create") || normalized.includes("add")) {
      if (!context.input.title) {
        return buildInputError(context, actionId, "title is required for task creation.");
      }
      const taskId = context.input.taskId ?? `task_${Date.now()}`;
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "任务创建请求已受理",
          details: [context.input.title],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "accepted",
          domain: context.domain,
          actionId,
          task: {
            taskId,
            tasklistId: context.input.tasklistId,
            title: context.input.title,
            dueAt: context.input.dueAt,
            description: context.input.text,
          },
        },
        notes: [],
      };
    }

    if (normalized.includes("update") || normalized.includes("complete") || normalized.includes("done")) {
      if (!context.input.taskId) {
        return buildInputError(context, actionId, "taskId is required for task update.");
      }
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "任务更新请求已受理",
          details: [`taskId: ${context.input.taskId}`],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "accepted",
          domain: context.domain,
          actionId,
          task: {
            taskId: context.input.taskId,
            title: context.input.title,
            dueAt: context.input.dueAt,
            fields: context.input.fields,
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
          headline: "任务查询已执行",
          details: ["task query executed"],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          query: {
            tasklistId: context.input.tasklistId,
            query: context.input.query,
            limit: context.input.limit ?? 20,
            offset: context.input.offset ?? 0,
          },
          items: [],
        },
        notes: [],
      };
    }

    if (normalized.includes("delete") || normalized.includes("remove")) {
      if (!context.input.taskId) {
        return buildInputError(context, actionId, "taskId is required for task delete.");
      }
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "任务删除请求已受理",
          details: [`taskId: ${context.input.taskId}`],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "accepted",
          domain: context.domain,
          actionId,
          removedTaskId: context.input.taskId,
        },
        notes: [],
      };
    }

    return this.genericFallback.execute(context);
  }
}
