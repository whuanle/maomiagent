import type { FeishuSmartAssistantActionExecuteResultView } from "../../../../../../shared/desktop-feishu";
import type { DesktopFeishuDomainActionHandler, DomainHandlerContext } from "./desktop-feishu-smart-assistant-action-handler.types";
import { normalizeActionId } from "./desktop-feishu-smart-assistant-action-handler.utils";

export class FallbackDomainActionHandler implements DesktopFeishuDomainActionHandler {
  supports(): boolean {
    return true;
  }

  async execute(context: DomainHandlerContext): Promise<FeishuSmartAssistantActionExecuteResultView> {
    return {
      workspaceId: context.input.workspaceId,
      actionId: normalizeActionId(context.input.actionId),
      domain: context.domain,
      executionMode: "builtin_runtime",
      executed: false,
      confirmationRequired: false,
      summary: {
        headline: "动作已进入兜底处理器",
        details: ["No dedicated domain handler matched. Falling back to generic handler."],
        nextSuggestedActionIds: [],
      },
      result: {
        ok: false,
        stage: "fallback",
        domain: context.domain,
      },
      notes: [],
    };
  }
}
