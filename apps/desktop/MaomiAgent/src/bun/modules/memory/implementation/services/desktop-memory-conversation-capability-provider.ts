import type { RegisteredToolHandler } from "#maomiagent/kernel/src/adapters";
import type { ToolDescriptor } from "#maomiagent/kernel/core";
import type { ToolSource } from "#maomiagent/kernel/src/host/tools";

import type { DesktopConversationCapabilityProvider } from "../../../conversation/abstraction/ports/desktop-conversation-capabilities.ports";
import type { DesktopMemoryQueryPort } from "../../abstraction/ports/desktop-memory.ports";

const MEMORY_SEARCH_DESCRIPTOR: ToolDescriptor = {
  name: "memory_search_context",
  description: "Search desktop memory for context relevant to the current workspace conversation.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      topK: { type: "number" },
    },
    required: ["query"],
    additionalProperties: false,
  },
  metadata: {
    toolSourceKind: "desktop-memory",
    operationKind: "workspace_access",
    operationLabel: "Search memory context",
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
    const explicit = (capabilityPreferences as Record<string, unknown>)["memory.runtime"];
    if (typeof explicit === "boolean") {
      return explicit;
    }
  }

  return settings.memoryEnabled === true;
}

class DesktopMemoryConversationToolSource implements ToolSource {
  async listTools() {
    return {
      source: {
        sourceId: "desktop.memory.conversation",
        signature: "desktop-memory-conversation-v1",
        metadata: {
          toolSourceKind: "desktop-memory",
        },
      },
      tools: [MEMORY_SEARCH_DESCRIPTOR],
    };
  }
}

export class DesktopMemoryConversationCapabilityProvider
  implements DesktopConversationCapabilityProvider {
  constructor(private readonly memoryQuery: Pick<DesktopMemoryQueryPort, "search">) {}

  async listCapabilities() {
    return [
      {
        capabilityId: "memory.runtime",
        moduleId: "desktop.memory",
        scope: "workspace" as const,
        controlKind: "toggle" as const,
        title: "启用记忆",
        description: "提供桌面记忆检索能力，可在对话中调用已有记忆内容。",
        statusText: "记忆检索工具已注册",
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

    const toolHandler: RegisteredToolHandler = {
      descriptor: MEMORY_SEARCH_DESCRIPTOR,
      execute: async ({ call, context }) => {
        const inputValue = call.input as Record<string, unknown>;
        const query = typeof inputValue.query === "string" ? inputValue.query.trim() : "";
        if (!query) {
          throw {
            code: "invalid_argument",
            message: "query is required",
            retryable: false,
          };
        }

        const rawTopK = inputValue.topK;
        const topK = typeof rawTopK === "number" && Number.isFinite(rawTopK)
          ? Math.max(1, Math.min(20, Math.trunc(rawTopK)))
          : 5;
        const workspaceId = readWorkspaceId(context.run.metadata)
          ?? readWorkspaceId(context.session.metadata)
          ?? input.workspaceId;

        return this.memoryQuery.search({
          workspaceId,
          query,
          topK,
          includeGlobalFallback: true,
        });
      },
    };

    return {
      toolSources: [new DesktopMemoryConversationToolSource()],
      toolHandlers: [toolHandler],
    };
  }
}
