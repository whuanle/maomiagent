import type { RegisteredToolHandler } from "#maomiagent/kernel/src/adapters";
import type { ToolDescriptor } from "#maomiagent/kernel/core";
import type { ToolSource } from "#maomiagent/kernel/src/host/tools";

import type { DesktopConversationCapabilityProvider } from "../../../conversation/abstraction/ports/desktop-conversation-capabilities.ports";
import type { DesktopFeishuPort } from "../../abstraction/ports/desktop-feishu.ports";
import type { FeishuSmartAssistantExecuteActionInput } from "../../../../../shared/desktop-feishu";

const FEISHU_SMART_ASSISTANT_TOOL_DESCRIPTOR: ToolDescriptor = {
  name: "feishu_execute_smart_assistant_action",
  description: "Execute one Feishu smart assistant action for the current workspace conversation.",
  inputSchema: {
    type: "object",
    properties: {
      actionId: { type: "string" },
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
      limit: { type: "number" },
      pageSize: { type: "number" },
      offset: { type: "number" },
      fileTokens: { type: "array", items: { type: "string" } },
      to: { type: "array", items: { type: "string" } },
      cc: { type: "array", items: { type: "string" } },
      bcc: { type: "array", items: { type: "string" } },
      subject: { type: "string" },
    },
    required: ["actionId"],
    additionalProperties: true,
  },
  metadata: {
    toolSourceKind: "desktop-feishu",
    operationKind: "tool_execution",
    operationLabel: "Execute Feishu smart assistant action",
  },
};

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
  constructor(private readonly actionCount: number) {}

  async listTools() {
    return {
      source: {
        sourceId: "desktop.feishu.conversation",
        signature: `desktop-feishu-conversation-v1:${this.actionCount}`,
        metadata: {
          toolSourceKind: "desktop-feishu",
          actionCount: this.actionCount,
        },
      },
      tools: [
        {
          ...FEISHU_SMART_ASSISTANT_TOOL_DESCRIPTOR,
          description: this.actionCount > 0
            ? `Execute one of ${this.actionCount} available Feishu smart assistant actions for the current workspace conversation.`
            : FEISHU_SMART_ASSISTANT_TOOL_DESCRIPTOR.description,
        },
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
    private readonly feishu: Pick<DesktopFeishuPort, "getState" | "executeSmartAssistantAction">,
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

    const state = await this.feishu.getState();
    if (!state.smartAssistant.enabled) {
      return undefined;
    }

    const toolHandler: RegisteredToolHandler = {
      descriptor: FEISHU_SMART_ASSISTANT_TOOL_DESCRIPTOR,
      execute: async ({ call, context }) => {
        const toolInput = call.input as FeishuSmartAssistantExecuteActionInput;
        const actionId = typeof toolInput.actionId === "string" ? toolInput.actionId.trim() : "";
        if (!actionId) {
          throw {
            code: "invalid_argument",
            message: "actionId is required",
            retryable: false,
          };
        }

        return this.feishu.executeSmartAssistantAction({
          ...toolInput,
          actionId,
          workspaceId: toolInput.workspaceId
            ?? readWorkspaceId(context.run.metadata)
            ?? readWorkspaceId(context.session.metadata)
            ?? input.workspaceId,
        });
      },
    };

    return {
      toolSources: [new DesktopFeishuConversationToolSource(state.smartAssistant.actions.length)],
      toolHandlers: [toolHandler],
    };
  }
}