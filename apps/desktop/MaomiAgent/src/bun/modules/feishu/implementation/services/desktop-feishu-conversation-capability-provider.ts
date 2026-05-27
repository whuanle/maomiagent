import type { RegisteredToolHandler } from "#maomiagent/kernel/src/adapters";
import type { ToolDescriptor } from "#maomiagent/kernel/core";
import type { ToolSource } from "#maomiagent/kernel/src/host/tools";

import type { DesktopConversationCapabilityProvider } from "../../../conversation/abstraction/ports/desktop-conversation-capabilities.ports";
import type { DesktopFeishuPort } from "../../abstraction/ports/desktop-feishu.ports";
import type { FeishuSmartAssistantExecuteActionInput } from "../../../../../shared/desktop-feishu";
import {
  actionRequiresConfirmation,
} from "./action-handlers/desktop-feishu-smart-assistant-action-handler.utils";
import {
  applyFeishuBotActorToActionInput,
  readFeishuBotActorContext,
} from "./desktop-feishu-bot-actor-context";
import {
  isFeishuBotActionAllowed,
  normalizeFeishuBotTenantActionId,
  readFeishuBotAllowedActionIds,
} from "./desktop-feishu-bot-capability-policy";

const FEISHU_SMART_ASSISTANT_TOOL_NAME = "feishu_execute_smart_assistant_action";

const FEISHU_SMART_ASSISTANT_TOOL_BASE_PROPERTIES = {
  workspaceId: { type: "string" },
  confirm: { type: "boolean" },
  query: { type: "string" },
  docId: { type: "string" },
  text: { type: "string" },
  title: { type: "string" },
  markdown: { type: "string" },
  fields: { type: "object", additionalProperties: true },
  attendeeIds: { type: "array", items: { type: "string" } },
  startAt: { type: "string" },
  endAt: { type: "string" },
  dueAt: { type: "string" },
  createMeeting: { type: "boolean" },
  limit: { type: "number" },
  pageSize: { type: "number" },
  offset: { type: "number" },
  fileTokens: { type: "array", items: { type: "string" } },
  to: { type: "array", items: { type: "string" } },
  cc: { type: "array", items: { type: "string" } },
  bcc: { type: "array", items: { type: "string" } },
  subject: { type: "string" },
} as const;

function buildFeishuSmartAssistantToolDescriptor(options: {
  tenantOnly?: boolean;
  visibleActionIds?: string[];
} = {}): ToolDescriptor {
  const visibleActionIds = options.visibleActionIds?.filter(Boolean) ?? [];
  const description = options.tenantOnly && visibleActionIds.length > 0
    ? `Execute exactly one tenant-only Feishu bot action. Allowed actionId values: ${visibleActionIds.join(", ")}.`
    : "Execute one Feishu smart assistant action for the current workspace conversation.";

  return {
    name: FEISHU_SMART_ASSISTANT_TOOL_NAME,
    description,
    inputSchema: {
      type: "object",
      properties: {
        actionId: visibleActionIds.length > 0
          ? { type: "string", enum: visibleActionIds }
          : { type: "string" },
        ...FEISHU_SMART_ASSISTANT_TOOL_BASE_PROPERTIES,
      },
      required: ["actionId"],
      additionalProperties: true,
    },
    metadata: {
      toolSourceKind: "desktop-feishu",
      operationKind: "tool_execution",
      operationLabel: "Execute Feishu smart assistant action",
      ...(options.tenantOnly && visibleActionIds.length > 0
        ? { visibleActionIds }
        : {}),
    },
  };
}

function readWorkspaceId(metadata: Record<string, unknown> | undefined) {
  return typeof metadata?.workspaceId === "string" && metadata.workspaceId.trim()
    ? metadata.workspaceId.trim()
    : undefined;
}

function readCapabilityEnabled(sessionMetadata: Record<string, unknown> | undefined) {
  const conversationSettings = sessionMetadata?.conversationSettings;
  if (!conversationSettings || typeof conversationSettings !== "object" || Array.isArray(conversationSettings)) {
    return false;
  }

  const settings = conversationSettings as Record<string, unknown>;
  const capabilityPreferences = settings.capabilityPreferences;
  if (capabilityPreferences && typeof capabilityPreferences === "object" && !Array.isArray(capabilityPreferences)) {
    const explicit = (capabilityPreferences as Record<string, unknown>)["feishu.smartAssistant"];
    if (typeof explicit === "boolean") {
      return explicit;
    }
  }

  return settings.feishuSmartAssistantEnabled === true;
}

class DesktopFeishuConversationToolSource implements ToolSource {
  constructor(
    private readonly descriptor: ToolDescriptor,
    private readonly actionCount: number,
    private readonly visibleActionIds: string[] = [],
  ) {}

  async listTools() {
    return {
      source: {
        sourceId: "desktop.feishu.conversation",
        signature: `desktop-feishu-conversation-v1:${this.actionCount}`,
        metadata: {
          toolSourceKind: "desktop-feishu",
          actionCount: this.actionCount,
          ...(this.visibleActionIds.length > 0
            ? { visibleActionIds: this.visibleActionIds }
            : {}),
        },
      },
      tools: [
        this.descriptor,
      ],
    };
  }
}

function describeAuthStatus(authStatus: string) {
  switch (authStatus) {
    case "authorized":
      return "飞书智能助手已授权";
    case "pending":
      return "飞书智能助手授权中";
    case "expired":
      return "飞书智能助手授权已过期";
    case "error":
      return "飞书智能助手授权异常";
    default:
      return "飞书智能助手待授权";
  }
}

export class DesktopFeishuConversationCapabilityProvider
  implements DesktopConversationCapabilityProvider {
  constructor(
    private readonly feishu: Pick<DesktopFeishuPort, "getState" | "getBotState" | "executeSmartAssistantAction">,
  ) {}

  async listCapabilities() {
    const state = await this.feishu.getState();
    if (!state.smartAssistant.enabled) {
      return [];
    }

    return [
      {
        capabilityId: "feishu.smartAssistant",
        moduleId: "desktop.feishu",
        scope: "workspace" as const,
        controlKind: "toggle" as const,
        title: "启用飞书能力",
        description: "允许当前工作区的 AI 对话默认使用飞书智能助手能力。",
        statusText: `${describeAuthStatus(state.smartAssistant.authStatus)} · ${state.smartAssistant.actions.length} 个动作可用`,
      },
    ];
  }

  async resolveRuntimeContribution(input: {
    workspaceId: string;
    sessionId?: string;
    sessionMetadata?: Record<string, unknown>;
  }) {
    if (!readCapabilityEnabled(input.sessionMetadata)) {
      return undefined;
    }

    const allowedActionIds = readFeishuBotAllowedActionIds(input.sessionMetadata);
    const isBotConversation = Array.isArray(allowedActionIds) && allowedActionIds.length > 0;

    const state = isBotConversation ? undefined : await this.feishu.getState();
    const botState = isBotConversation ? await this.feishu.getBotState() : undefined;

    if (!isBotConversation && !state?.smartAssistant.enabled) {
      return undefined;
    }
    const visibleActions = isBotConversation
      ? (botState?.tenantCapabilities?.actions ?? [])
        .filter((item) => allowedActionIds?.includes(item.actionId))
      : (state?.smartAssistant.actions ?? []);
    const visibleActionIds = visibleActions.map((item) => item.actionId);
    const toolDescriptor = buildFeishuSmartAssistantToolDescriptor({
      tenantOnly: isBotConversation,
      visibleActionIds: isBotConversation ? visibleActionIds : undefined,
    });

    const toolHandler: RegisteredToolHandler = {
      descriptor: toolDescriptor,
      execute: async ({ call, context }) => {
        const toolInput = call.input as FeishuSmartAssistantExecuteActionInput;
        const rawActionId = typeof toolInput.actionId === "string" ? toolInput.actionId.trim() : "";
        const actionId = isBotConversation
          ? normalizeFeishuBotTenantActionId(rawActionId)
          : rawActionId;
        if (!actionId) {
          throw {
            code: "invalid_argument",
            message: "actionId is required",
            retryable: false,
          };
        }
        if (isBotConversation && !isFeishuBotActionAllowed(actionId, input.sessionMetadata)) {
          throw {
            code: "invalid_argument",
            message: "当前飞书机器人未开通此能力。",
            retryable: false,
          };
        }
        const actor = readFeishuBotActorContext(context.run.metadata)
          ?? readFeishuBotActorContext(context.session.metadata);
        const actionInput = isBotConversation
          ? applyFeishuBotActorToActionInput({
            ...toolInput,
            actionId,
            executionProfile: "feishu_bot_tenant",
          }, actor)
          : {
            ...toolInput,
            actionId,
          };
        if (isBotConversation && actionRequiresConfirmation(actionId) && !actionInput.userId) {
          throw {
            code: "invalid_argument",
            message: "This Feishu bot action requires the sender identity, but the current websocket event did not provide a usable user id.",
            retryable: false,
          };
        }

        return this.feishu.executeSmartAssistantAction({
          ...actionInput,
          workspaceId: actionInput.workspaceId
            ?? readWorkspaceId(context.run.metadata)
            ?? readWorkspaceId(context.session.metadata)
            ?? input.workspaceId,
        });
      },
    };

    return {
      toolSources: [new DesktopFeishuConversationToolSource(toolDescriptor, visibleActions.length, visibleActionIds)],
      toolHandlers: [toolHandler],
    };
  }
}
