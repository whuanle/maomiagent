import {
  DependencyModuleBase,
  createServiceToken,
  type DependencyModuleContext,
  type DependencyModuleRuntimeContext,
} from "../../../shared/ioc";
import type { DesktopConversationCapabilityProvider } from "../../conversation/abstraction/ports/desktop-conversation-capabilities.ports";
import { DESKTOP_CONVERSATION_CAPABILITY_PROVIDER } from "../../conversation/abstraction/tokens/desktop-conversation.tokens";
import { DesktopLogsModule, RUNTIME_LOGGER_FACTORY_PORT } from "../../logs";
import type { DesktopMemoryPort } from "../abstraction/ports/desktop-memory.ports";
import {
  DESKTOP_MEMORY_COMMAND_PORT,
  DESKTOP_MEMORY_PORT,
  DESKTOP_MEMORY_QUERY_PORT,
  DESKTOP_MEMORY_RUNTIME_PORT,
} from "../abstraction/tokens/desktop-memory.tokens";
import { DesktopMemoryConversationCapabilityProvider } from "../implementation/services/desktop-memory-conversation-capability-provider";
import { DesktopMemoryService } from "../implementation/services/desktop-memory-service";

export const DESKTOP_MEMORY_SERVICE_TOKEN =
  createServiceToken<DesktopMemoryPort>("desktop.memory.service");
export const DESKTOP_MEMORY_CONVERSATION_CAPABILITY_PROVIDER_TOKEN =
  createServiceToken<DesktopConversationCapabilityProvider>(
    "desktop.memory.conversation-capability-provider",
  );

export class DesktopMemoryModule extends DependencyModuleBase {
  static moduleId = "desktop.memory";
  static dependencies = [DesktopLogsModule] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_MEMORY_SERVICE_TOKEN, {
      useFactory: (services) => new DesktopMemoryService(
        services.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
          source: "desktop",
          module: "desktop.memory",
        }),
      ),
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_MEMORY_CONVERSATION_CAPABILITY_PROVIDER_TOKEN, {
      useFactory: (services) => new DesktopMemoryConversationCapabilityProvider(
        services.resolve(DESKTOP_MEMORY_QUERY_PORT),
      ),
      source: context.module.moduleId,
    });

    context.addAlias(DESKTOP_MEMORY_PORT, DESKTOP_MEMORY_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_MEMORY_QUERY_PORT, DESKTOP_MEMORY_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_MEMORY_COMMAND_PORT, DESKTOP_MEMORY_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_MEMORY_RUNTIME_PORT, DESKTOP_MEMORY_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(
      DESKTOP_CONVERSATION_CAPABILITY_PROVIDER,
      DESKTOP_MEMORY_CONVERSATION_CAPABILITY_PROVIDER_TOKEN,
      {
        source: context.module.moduleId,
      },
    );
  }

  override async onStart(context: DependencyModuleRuntimeContext): Promise<void> {
    const logger = context.container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
      source: "desktop",
      module: "desktop.memory",
    });

    await logger.info("Desktop memory module started", {
      context: {
        status: "skeleton",
      },
    });
  }
}