import type { DesktopAiRuntimePort } from "../../../ai";
import type { DesktopFeishuSmartAssistantActionRegistryPort } from "../../abstraction/ports/desktop-feishu-smart-assistant-action-registry.ports";
import type {
  FeishuSmartAssistantActionExecuteResultView,
  FeishuSmartAssistantExecuteActionInput,
} from "../../../../../shared/desktop-feishu";
import type { DesktopFeishuDocRuntimePort } from "../../abstraction/ports/desktop-feishu-doc-runtime.ports";
import type {
  DesktopFeishuDomainActionHandler,
  DomainHandlerContext,
} from "./action-handlers/desktop-feishu-smart-assistant-action-handler.types";
import {
  inferActionDomain,
  normalizeActionId,
} from "./action-handlers/desktop-feishu-smart-assistant-action-handler.utils";
import { DocsDomainActionHandler } from "./action-handlers/docs-domain-action-handler";
import { CalendarDomainActionHandler } from "./action-handlers/calendar-domain-action-handler";
import { MessengerDomainActionHandler } from "./action-handlers/messenger-domain-action-handler";
import { DriveDomainActionHandler } from "./action-handlers/drive-domain-action-handler";
import { BaseDomainActionHandler } from "./action-handlers/base-domain-action-handler";
import { SheetsDomainActionHandler } from "./action-handlers/sheets-domain-action-handler";
import { TasksDomainActionHandler } from "./action-handlers/tasks-domain-action-handler";
import { WikiDomainActionHandler } from "./action-handlers/wiki-domain-action-handler";
import { ContactDomainActionHandler } from "./action-handlers/contact-domain-action-handler";
import { MailDomainActionHandler } from "./action-handlers/mail-domain-action-handler";
import { MeetingsDomainActionHandler } from "./action-handlers/meetings-domain-action-handler";
import { FallbackDomainActionHandler } from "./action-handlers/fallback-domain-action-handler";

export class DesktopFeishuSmartAssistantActionRegistry
  implements DesktopFeishuSmartAssistantActionRegistryPort {
  private readonly handlers: DesktopFeishuDomainActionHandler[];

  constructor(
    private readonly aiRuntime: Pick<DesktopAiRuntimePort, "listProviderRuntimes">,
    docRuntime: Pick<DesktopFeishuDocRuntimePort,
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
    >,
  ) {
    this.handlers = [
      new DocsDomainActionHandler(docRuntime),
      new CalendarDomainActionHandler(),
      new MessengerDomainActionHandler(),
      new DriveDomainActionHandler(),
      new BaseDomainActionHandler(),
      new SheetsDomainActionHandler(),
      new TasksDomainActionHandler(),
      new WikiDomainActionHandler(),
      new ContactDomainActionHandler(),
      new MailDomainActionHandler(),
      new MeetingsDomainActionHandler(),
      new FallbackDomainActionHandler(),
    ];
  }

  async execute(
    input: FeishuSmartAssistantExecuteActionInput,
  ): Promise<FeishuSmartAssistantActionExecuteResultView> {
    const actionId = normalizeActionId(input.actionId);
    const domain = inferActionDomain(actionId);
    const availableRuntimeCount = this.aiRuntime.listProviderRuntimes().length;

    const context: DomainHandlerContext = {
      input: {
        ...input,
        actionId,
      },
      domain,
      availableRuntimeCount,
    };

    const handler = this.handlers.find((item) => item.supports(domain));
    if (!handler) {
      return {
        workspaceId: input.workspaceId,
        actionId,
        domain,
        executionMode: "builtin_runtime",
        executed: false,
        confirmationRequired: false,
        summary: {
          headline: "No action handler available",
          details: ["smart assistant action registry has no matching handler"],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: false,
          domain,
          actionId,
        },
        notes: [],
      };
    }

    return handler.execute(context);
  }
}
