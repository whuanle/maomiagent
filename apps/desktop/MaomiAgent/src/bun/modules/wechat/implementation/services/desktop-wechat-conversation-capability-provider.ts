import type { RegisteredToolHandler } from "#maomiagent/kernel/src/adapters";
import type { ToolDescriptor } from "#maomiagent/kernel/core";
import type { ToolSource } from "#maomiagent/kernel/src/host/tools";

import type { DesktopConversationCapabilityProvider } from "../../../conversation/abstraction/ports/desktop-conversation-capabilities.ports";
import type { DesktopWechatPort } from "../../abstraction/ports/desktop-wechat.ports";

const WECHAT_SEND_TEXT_DESCRIPTOR: ToolDescriptor = {
  name: "wechat_send_text",
  description: "Send a text message to the current bound WeChat conversation.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string" },
      contextToken: { type: "string" },
    },
    required: ["text"],
    additionalProperties: false,
  },
  metadata: {
    toolSourceKind: "desktop-wechat",
    operationKind: "tool_execution",
    operationLabel: "Send WeChat text",
  },
};

const WECHAT_SEND_MEDIA_DESCRIPTOR: ToolDescriptor = {
  name: "wechat_send_media_file",
  description: "Send a local image, video, audio, or file from filePath to the current bound WeChat conversation.",
  inputSchema: {
    type: "object",
    properties: {
      filePath: { type: "string" },
      caption: { type: "string" },
      contextToken: { type: "string" },
    },
    required: ["filePath"],
    additionalProperties: false,
  },
  metadata: {
    toolSourceKind: "desktop-wechat",
    operationKind: "tool_execution",
    operationLabel: "Send WeChat media",
  },
};

function readCapabilityEnabled(sessionMetadata: Record<string, unknown> | undefined) {
  const conversationSettings = sessionMetadata?.conversationSettings;
  if (!conversationSettings || typeof conversationSettings !== "object" || Array.isArray(conversationSettings)) {
    return true;
  }

  const capabilityPreferences = (conversationSettings as Record<string, unknown>).capabilityPreferences;
  if (!capabilityPreferences || typeof capabilityPreferences !== "object" || Array.isArray(capabilityPreferences)) {
    return true;
  }

  const explicit = (capabilityPreferences as Record<string, unknown>)["wechat.runtime"];
  return explicit !== false;
}

class DesktopWechatConversationToolSource implements ToolSource {
  constructor(
    private readonly signature: string,
    private readonly pendingMessageCount: number,
    private readonly recentMediaCount: number,
  ) {}

  async listTools() {
    return {
      source: {
        sourceId: "desktop.wechat.conversation",
        signature: this.signature,
        metadata: {
          toolSourceKind: "desktop-wechat",
          pendingMessageCount: this.pendingMessageCount,
          recentMediaCount: this.recentMediaCount,
        },
      },
      tools: [WECHAT_SEND_TEXT_DESCRIPTOR, WECHAT_SEND_MEDIA_DESCRIPTOR],
    };
  }
}

export class DesktopWechatConversationCapabilityProvider
  implements DesktopConversationCapabilityProvider {
  constructor(
    private readonly wechat:
      | Pick<
          DesktopWechatPort,
          "getConversationRuntimeContext" | "sendConversationText" | "sendConversationMedia"
        >
      | (() => Pick<
          DesktopWechatPort,
          "getConversationRuntimeContext" | "sendConversationText" | "sendConversationMedia"
        >),
  ) {}

  private resolveWechat() {
    return typeof this.wechat === "function"
      ? this.wechat()
      : this.wechat;
  }

  async listCapabilities() {
    return [];
  }

  async resolveRuntimeContribution(input: {
    workspaceId: string;
    sessionId?: string;
    sessionMetadata?: Record<string, unknown>;
  }) {
    if (!input.sessionId || !readCapabilityEnabled(input.sessionMetadata)) {
      return undefined;
    }

    const wechat = this.resolveWechat();
    const runtimeContext = await wechat.getConversationRuntimeContext(input.sessionId);
    if (!runtimeContext) {
      return undefined;
    }

    const recentMediaCount = runtimeContext.recentMessages.reduce(
      (
        total: number,
        item: (typeof runtimeContext.recentMessages)[number],
      ) => total + (item.mediaAssets?.length ?? 0),
      0,
    );
    const toolHandlers: RegisteredToolHandler[] = [
      {
        descriptor: WECHAT_SEND_TEXT_DESCRIPTOR,
        execute: async ({ call }) => {
          const toolInput = call.input as Record<string, unknown>;
          const text = typeof toolInput.text === "string" ? toolInput.text.trim() : "";
          if (!text) {
            throw {
              code: "invalid_argument",
              message: "text is required",
              retryable: false,
            };
          }

          return wechat.sendConversationText({
            sessionId: runtimeContext.sessionId,
            text,
            contextToken:
              typeof toolInput.contextToken === "string" && toolInput.contextToken.trim()
                ? toolInput.contextToken.trim()
                : undefined,
          });
        },
      },
      {
        descriptor: WECHAT_SEND_MEDIA_DESCRIPTOR,
        execute: async ({ call }) => {
          const toolInput = call.input as Record<string, unknown>;
          const filePath = typeof toolInput.filePath === "string" ? toolInput.filePath.trim() : "";
          if (!filePath) {
            throw {
              code: "invalid_argument",
              message: "filePath is required",
              retryable: false,
            };
          }

          return wechat.sendConversationMedia({
            sessionId: runtimeContext.sessionId,
            filePath,
            caption:
              typeof toolInput.caption === "string" && toolInput.caption.trim()
                ? toolInput.caption.trim()
                : undefined,
            contextToken:
              typeof toolInput.contextToken === "string" && toolInput.contextToken.trim()
                ? toolInput.contextToken.trim()
                : undefined,
          });
        },
      },
    ];

    return {
      toolSources: [new DesktopWechatConversationToolSource(
        `desktop-wechat-conversation-v1:${runtimeContext.bindingKey}`,
        runtimeContext.pendingMessageCount,
        recentMediaCount,
      )],
      toolHandlers,
    };
  }
}
