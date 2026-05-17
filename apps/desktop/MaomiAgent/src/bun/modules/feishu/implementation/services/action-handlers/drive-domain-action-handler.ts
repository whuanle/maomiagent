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

export class DriveDomainActionHandler implements DesktopFeishuDomainActionHandler {
  private readonly genericFallback = new GenericDomainActionHandler("drive");

  supports(domain: "drive"): boolean;
  supports(domain: string): boolean;
  supports(domain: string): boolean {
    return domain === "drive";
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
          reason: "This drive action may mutate files/folders.",
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

    if (normalized.includes("list") || normalized.includes("search") || normalized.includes("query")) {
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "云盘查询已执行",
          details: ["drive query executed"],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          query: {
            folderToken: context.input.folderToken,
            query: context.input.query,
            pageToken: context.input.pageToken,
            pageSize: context.input.pageSize ?? 50,
          },
          items: [],
        },
        notes: [],
      };
    }

    if (normalized.includes("upload") || normalized.includes("create")) {
      if (!context.input.localPath) {
        return buildInputError(context, actionId, "localPath is required for upload/create action.");
      }
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "上传请求已受理",
          details: [context.input.localPath],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "accepted",
          domain: context.domain,
          actionId,
          upload: {
            localPath: context.input.localPath,
            folderToken: context.input.folderToken,
            title: context.input.title,
          },
        },
        notes: [],
      };
    }

    if (normalized.includes("download") || normalized.includes("export")) {
      if (!context.input.fileToken) {
        return buildInputError(context, actionId, "fileToken is required for download/export action.");
      }
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "下载请求已受理",
          details: [`fileToken: ${context.input.fileToken}`],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "accepted",
          domain: context.domain,
          actionId,
          download: {
            fileToken: context.input.fileToken,
            outputPath: context.input.outputPath,
            fileExtension: context.input.fileExtension,
          },
        },
        notes: [],
      };
    }

    if (normalized.includes("meta") || normalized.includes("info") || normalized.includes("get")) {
      if (!context.input.fileToken && !context.input.folderToken) {
        return buildInputError(context, actionId, "fileToken or folderToken is required for metadata action.");
      }
      return {
        workspaceId: context.input.workspaceId,
        actionId,
        domain: context.domain,
        executionMode: "builtin_runtime",
        executed: true,
        confirmationRequired: false,
        summary: {
          headline: "云盘元信息已读取",
          details: ["drive metadata action completed"],
          nextSuggestedActionIds: [],
        },
        result: {
          ok: true,
          stage: "completed",
          domain: context.domain,
          actionId,
          metadata: {
            fileToken: context.input.fileToken,
            folderToken: context.input.folderToken,
          },
        },
        notes: [],
      };
    }

    return this.genericFallback.execute(context);
  }
}
