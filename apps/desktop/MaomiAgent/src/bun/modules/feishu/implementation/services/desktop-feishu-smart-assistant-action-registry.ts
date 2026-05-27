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
import {
  FEISHU_BOT_TENANT_ALLOWED_ACTION_IDS,
} from "./desktop-feishu-bot-tenant-capability-catalog";
import { normalizeFeishuBotTenantActionId } from "./desktop-feishu-bot-capability-policy";
import type { DesktopFeishuBotTenantSdkGateway } from "./desktop-feishu-bot-tenant-sdk-gateway";
import { BotTenantCalendarDomainActionHandler } from "./action-handlers/bot-tenant-calendar-domain-action-handler";
import { BotTenantTasksDomainActionHandler } from "./action-handlers/bot-tenant-tasks-domain-action-handler";

export class DesktopFeishuSmartAssistantActionRegistry
  implements DesktopFeishuSmartAssistantActionRegistryPort {
  private readonly handlers: DesktopFeishuDomainActionHandler[];
  private readonly botTenantHandlers: DesktopFeishuDomainActionHandler[];

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
    botTenantGateway: DesktopFeishuBotTenantSdkGateway,
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
    this.botTenantHandlers = [
      new BotTenantCalendarDomainActionHandler(botTenantGateway),
      new BotTenantTasksDomainActionHandler(botTenantGateway),
    ];
  }

  async execute(
    input: FeishuSmartAssistantExecuteActionInput,
  ): Promise<FeishuSmartAssistantActionExecuteResultView> {
    const actionId = normalizeActionId(
      input.executionProfile === "feishu_bot_tenant"
        ? normalizeFeishuBotTenantActionId(input.actionId)
        : input.actionId
    );
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

    if (
      input.executionProfile === "feishu_bot_tenant"
      && !(FEISHU_BOT_TENANT_ALLOWED_ACTION_IDS as readonly string[]).includes(actionId)
    ) {
      return {
        workspaceId: input.workspaceId,
        actionId,
        domain,
        executionMode: "builtin_runtime",
        executed: false,
        confirmationRequired: false,
        summary: {
          headline: "当前飞书机器人未开通此能力",
          details: ["当前 tenant-only 机器人仅开放日历和任务的首批动作。"],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: false,
          stage: "unsupported",
          domain,
          actionId,
          message: "当前飞书机器人未开通此能力。",
        },
        notes: [],
      };
    }

    const handlerPool = input.executionProfile === "feishu_bot_tenant"
      ? [...this.botTenantHandlers, ...this.handlers]
      : this.handlers;
    const handler = handlerPool.find((item) => item.supports(domain));
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
