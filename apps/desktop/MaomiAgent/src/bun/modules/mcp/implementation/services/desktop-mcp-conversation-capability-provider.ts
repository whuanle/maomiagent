import type { RegisteredToolHandler } from "#maomiagent/kernel/src/adapters";
import type { ToolDescriptor } from "#maomiagent/kernel/core";
import type { ToolSource } from "#maomiagent/kernel/src/host/tools";

import type { DesktopConversationCapabilityProvider } from "../../../conversation/abstraction/ports/desktop-conversation-capabilities.ports";
import type { DesktopMcpPort, DesktopMcpRuntimeTool } from "../../abstraction/ports/desktop-mcp.ports";

type ConversationMcpToolBinding = {
  runtimeTool: DesktopMcpRuntimeTool;
  descriptor: ToolDescriptor;
};

function readCapabilityEnabled(sessionMetadata: Record<string, unknown> | undefined) {
  const conversationSettings = sessionMetadata?.conversationSettings;
  if (!conversationSettings || typeof conversationSettings !== "object" || Array.isArray(conversationSettings)) {
    return false;
  }

  const settings = conversationSettings as Record<string, unknown>;
  const capabilityPreferences = settings.capabilityPreferences;
  if (capabilityPreferences && typeof capabilityPreferences === "object" && !Array.isArray(capabilityPreferences)) {
    const explicit = (capabilityPreferences as Record<string, unknown>)["mcp.runtime"];
    if (typeof explicit === "boolean") {
      return explicit;
    }
  }

  return false;
}

function sanitizeToolSegment(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || "tool";
}

function buildBindingName(runtimeTool: DesktopMcpRuntimeTool, index: number) {
  return `mcp__${sanitizeToolSegment(runtimeTool.mcpName)}__${sanitizeToolSegment(runtimeTool.toolName)}__${index + 1}`;
}

function buildConversationMcpToolBindings(runtimeTools: DesktopMcpRuntimeTool[]): ConversationMcpToolBinding[] {
  return runtimeTools.map((runtimeTool, index) => ({
    runtimeTool,
    descriptor: {
      name: buildBindingName(runtimeTool, index),
      description: [
        `Execute MCP tool \"${runtimeTool.toolName}\" from server \"${runtimeTool.mcpName}\" for the current workspace conversation.`,
        runtimeTool.description,
      ].filter(Boolean).join(" "),
      inputSchema: runtimeTool.inputSchema ?? {
        type: "object",
        additionalProperties: true,
      },
      metadata: {
        toolSourceKind: "desktop-mcp",
        operationKind: "tool_execution",
        operationLabel: `Execute MCP tool ${runtimeTool.mcpName}/${runtimeTool.toolName}`,
        mcpName: runtimeTool.mcpName,
        mcpToolName: runtimeTool.toolName,
      },
    },
  }));
}

class DesktopMcpConversationToolSource implements ToolSource {
  constructor(private readonly bindings: ConversationMcpToolBinding[]) {}

  async listTools() {
    const signature = this.bindings.map((binding) => `${binding.runtimeTool.mcpName}:${binding.runtimeTool.toolName}`).join("|");
    return {
      source: {
        sourceId: "desktop.mcp.conversation",
        signature: `desktop-mcp-conversation-v1:${signature}`,
        metadata: {
          toolSourceKind: "desktop-mcp",
          toolCount: this.bindings.length,
          serverCount: new Set(this.bindings.map((binding) => binding.runtimeTool.mcpName)).size,
        },
      },
      tools: this.bindings.map((binding) => binding.descriptor),
    };
  }
}

export class DesktopMcpConversationCapabilityProvider
  implements DesktopConversationCapabilityProvider {
  constructor(
    private readonly mcp: Pick<DesktopMcpPort, "runtimeTools" | "executeRuntimeTool">,
  ) {}

  async listCapabilities(input: { workspaceId: string; sessionId?: string }) {
    const runtimeTools = await this.mcp.runtimeTools({ workspaceId: input.workspaceId });
    if (runtimeTools.length === 0) {
      return [];
    }

    return [{
      capabilityId: "mcp.runtime",
      moduleId: "desktop.mcp",
      scope: "workspace" as const,
      controlKind: "toggle" as const,
      title: "启用 MCP 工具",
      description: "提供可直接调用的 MCP 工具能力。",
      statusText: `${new Set(runtimeTools.map((item) => item.mcpName)).size} 个 MCP 服务 · ${runtimeTools.length} 个工具已就绪`,
    }];
  }

  async resolveRuntimeContribution(input: {
    workspaceId: string;
    sessionId?: string;
    sessionMetadata?: Record<string, unknown>;
  }) {
    if (!readCapabilityEnabled(input.sessionMetadata)) {
      return undefined;
    }

    const runtimeTools = await this.mcp.runtimeTools({ workspaceId: input.workspaceId });
    if (runtimeTools.length === 0) {
      return undefined;
    }

    const bindings = buildConversationMcpToolBindings(runtimeTools);
    const toolHandlers: RegisteredToolHandler[] = bindings.map((binding) => ({
      descriptor: binding.descriptor,
      execute: async ({ call }) => {
        const args = call.input && typeof call.input === "object" && !Array.isArray(call.input)
          ? call.input as Record<string, unknown>
          : undefined;
        return this.mcp.executeRuntimeTool({
          workspaceId: input.workspaceId,
          mcpName: binding.runtimeTool.mcpName,
          toolName: binding.runtimeTool.toolName,
          arguments: args,
          timeoutMs: binding.runtimeTool.timeoutMs,
        });
      },
    }));

    return {
      toolSources: [new DesktopMcpConversationToolSource(bindings)],
      toolHandlers,
    };
  }
}
