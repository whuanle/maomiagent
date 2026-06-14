import {
  DependencyModuleBase,
  createServiceToken,
  type DependencyModuleContext,
  type DependencyModuleRuntimeContext,
} from "../../../shared/ioc";

import {
  DESKTOP_CONFIGURATION_PORT,
  DesktopConfigurationModule,
} from "../../configuration";
import type { DesktopConversationCapabilityProvider } from "../../conversation/abstraction/ports/desktop-conversation-capabilities.ports";
import { DESKTOP_CONVERSATION_CAPABILITY_PROVIDER } from "../../conversation/abstraction/tokens/desktop-conversation.tokens";
import { DesktopLogsModule, RUNTIME_LOGGER_FACTORY_PORT } from "../../logs";
import { DESKTOP_WORKSPACE_QUERY_PORT, DesktopWorkspaceModule } from "../../workspace";
import type { DesktopMcpPort } from "../abstraction/ports/desktop-mcp.ports";
import {
  DESKTOP_MCP_COMMAND_PORT,
  DESKTOP_MCP_MARKET_PORT,
  DESKTOP_MCP_PORT,
  DESKTOP_MCP_QUERY_PORT,
} from "../abstraction/tokens/desktop-mcp.tokens";
import { DesktopMcpConversationCapabilityProvider } from "../implementation/services/desktop-mcp-conversation-capability-provider";
import { DesktopMcpService } from "../implementation/services/desktop-mcp-service";

export const DESKTOP_MCP_SERVICE_TOKEN =
  createServiceToken<DesktopMcpPort>("desktop.mcp.service");
export const DESKTOP_MCP_CONVERSATION_CAPABILITY_PROVIDER_TOKEN =
  createServiceToken<DesktopConversationCapabilityProvider>(
    "desktop.mcp.conversation-capability-provider",
  );

export class DesktopMcpModule extends DependencyModuleBase {
  static moduleId = "desktop.mcp";
  static dependencies = [DesktopConfigurationModule, DesktopLogsModule, DesktopWorkspaceModule] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_MCP_SERVICE_TOKEN, {
      useFactory: (services) => new DesktopMcpService(
        services.resolve(DESKTOP_CONFIGURATION_PORT),
        services.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
          source: "desktop",
          module: "desktop.mcp",
        }),
        services.resolve(DESKTOP_WORKSPACE_QUERY_PORT),
      ),
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_MCP_CONVERSATION_CAPABILITY_PROVIDER_TOKEN, {
      useFactory: (services) => new DesktopMcpConversationCapabilityProvider(
        services.resolve(DESKTOP_MCP_PORT),
      ),
      source: context.module.moduleId,
    });

    context.addAlias(DESKTOP_MCP_PORT, DESKTOP_MCP_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_MCP_QUERY_PORT, DESKTOP_MCP_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_MCP_COMMAND_PORT, DESKTOP_MCP_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_MCP_MARKET_PORT, DESKTOP_MCP_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(
      DESKTOP_CONVERSATION_CAPABILITY_PROVIDER,
      DESKTOP_MCP_CONVERSATION_CAPABILITY_PROVIDER_TOKEN,
      {
        source: context.module.moduleId,
      },
    );
  }

  override async onStart(context: DependencyModuleRuntimeContext): Promise<void> {
    const logger = context.container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
      source: "desktop",
      module: "desktop.mcp",
    });
    const mcp = context.container.resolve(DESKTOP_MCP_QUERY_PORT);
    const list = await mcp.list({ limit: 1, offset: 0 });
    await logger.info("Desktop MCP module started", {
      context: {
        total: list.meta.total,
      },
    });
  }
}
