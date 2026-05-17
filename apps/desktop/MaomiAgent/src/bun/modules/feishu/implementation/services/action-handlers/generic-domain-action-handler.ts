import type { FeishuSmartAssistantActionExecuteResultView, FeishuSmartAssistantDomainKey } from "../../../../../../shared/desktop-feishu";
import type { DesktopFeishuDomainActionHandler, DomainHandlerContext } from "./desktop-feishu-smart-assistant-action-handler.types";
import {
  actionRequiresConfirmation,
  createRoutedSummary,
  getDomainTitle,
  normalizeActionId,
} from "./desktop-feishu-smart-assistant-action-handler.utils";

export class GenericDomainActionHandler implements DesktopFeishuDomainActionHandler {
  constructor(private readonly domain: FeishuSmartAssistantDomainKey) {}

  supports(domain: FeishuSmartAssistantDomainKey): boolean {
    return this.domain === domain;
  }

  async execute(context: DomainHandlerContext): Promise<FeishuSmartAssistantActionExecuteResultView> {
    const normalizedActionId = normalizeActionId(context.input.actionId);
    const confirmationRequired = actionRequiresConfirmation(normalizedActionId) && !context.input.confirm;

    if (confirmationRequired) {
      return {
        workspaceId: context.input.workspaceId,
        actionId: normalizedActionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: false,
        confirmationRequired: true,
        confirmation: {
          required: true,
          confirmed: false,
          confirmField: "confirm",
          reason: "This action may mutate remote resources.",
          preview: `Action ${normalizedActionId} targets ${getDomainTitle(context.domain)}.`,
        },
        summary: createRoutedSummary(context.domain, context.availableRuntimeCount, normalizedActionId),
        result: {
          ok: false,
          stage: "confirmation_required",
          domain: context.domain,
          actionId: normalizedActionId,
        },
        notes: ["Provide confirm=true to proceed with this action route."],
      };
    }

    return {
      workspaceId: context.input.workspaceId,
      actionId: normalizedActionId,
      domain: context.domain,
      executionMode: "builtin_runtime",
      executed: false,
      confirmationRequired: false,
      summary: createRoutedSummary(context.domain, context.availableRuntimeCount, normalizedActionId),
      result: {
        ok: true,
        stage: "routed",
        domain: context.domain,
        actionId: normalizedActionId,
        input: context.input,
      },
      notes: [
        `Routed to ${getDomainTitle(context.domain)} handler.`,
        "Concrete provider operation can be plugged into this handler without changing the registry contract.",
      ],
    };
  }
}
