import {
  DependencyModuleBase,
  createServiceToken,
  type DependencyModuleContext,
  type DependencyModuleRuntimeContext,
} from "../../../shared/ioc";

import { DESKTOP_DATABASE_PORT, DesktopDatabaseModule } from "../../database";
import {
  DESKTOP_AI_CONVERSATION_RUNTIME_FACTORY_PORT,
  DESKTOP_AI_ONE_SHOT_PORT,
  DesktopAiModule,
} from "../../ai";
import {
  DESKTOP_GIT_QUERY_PORT,
  DesktopGitModule,
} from "../../git";
import { RUNTIME_LOGGER_FACTORY_PORT, DesktopLogsModule } from "../../logs";
import {
  DESKTOP_TERMINALS_COMMAND_PORT,
  DESKTOP_TERMINALS_QUERY_PORT,
  DesktopTerminalsModule,
} from "../../terminals";
import {
  DESKTOP_CONVERSATION_TASK_BRIDGE_PORT,
  DESKTOP_TASKS_QUERY_PORT,
  DesktopTasksModule,
} from "../../tasks";
import {
  DESKTOP_WORKSPACE_COMMAND_PORT,
  DESKTOP_WORKSPACE_QUERY_PORT,
  DesktopWorkspaceModule,
} from "../../workspace";
import type { DesktopConversationPort } from "../abstraction/ports/desktop-conversation.ports";
import type { DesktopConversationCapabilityRegistryPort } from "../abstraction/ports/desktop-conversation-capabilities.ports";
import {
  DESKTOP_CONVERSATION_CAPABILITY_PROVIDER,
  DESKTOP_CONVERSATION_CAPABILITY_REGISTRY_PORT,
  DESKTOP_CONVERSATION_COMMAND_PORT,
  DESKTOP_CONVERSATION_PORT,
  DESKTOP_CONVERSATION_QUERY_PORT,
} from "../abstraction/tokens/desktop-conversation.tokens";
import { DesktopConversationCapabilityRegistryService } from "../implementation/services/desktop-conversation-capability-registry-service";
import { createDesktopConversationBuiltinToolBundle } from "../implementation/services/desktop-conversation-builtin-tools";
import { DesktopConversationService } from "../implementation/services/desktop-conversation-service";
import { DesktopConversationWorkspaceSettingsService } from "../implementation/services/desktop-conversation-workspace-settings-service";
import { DesktopConversationStore } from "../implementation/stores/desktop-conversation-store";

export const DESKTOP_CONVERSATION_SERVICE_TOKEN =
  createServiceToken<DesktopConversationPort>("desktop.conversation.service");
export const DESKTOP_CONVERSATION_CAPABILITY_REGISTRY_SERVICE_TOKEN =
  createServiceToken<DesktopConversationCapabilityRegistryPort>(
    "desktop.conversation.capability-registry.service",
  );

export class DesktopConversationModule extends DependencyModuleBase {
  static moduleId = "desktop.conversation";
  static dependencies = [
    DesktopDatabaseModule,
    DesktopLogsModule,
    DesktopWorkspaceModule,
    DesktopGitModule,
    DesktopAiModule,
    DesktopTerminalsModule,
    DesktopTasksModule,
  ] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_CONVERSATION_CAPABILITY_REGISTRY_SERVICE_TOKEN, {
      useFactory: (services) => new DesktopConversationCapabilityRegistryService(
        services.resolveAll(DESKTOP_CONVERSATION_CAPABILITY_PROVIDER),
      ),
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_CONVERSATION_SERVICE_TOKEN, {
      useFactory: (services) => {
        const database = services.resolve(DESKTOP_DATABASE_PORT);
        const capabilityProviders = services.resolveAll(DESKTOP_CONVERSATION_CAPABILITY_PROVIDER);
        database.registerEntity({
          name: "DesktopConversationSession",
          tableName: "desktop_conversation_sessions",
          connectionName: "conversation",
          primaryKey: "session_id",
        });
        const connection = database.getConnection("conversation");
        const builtinTools = createDesktopConversationBuiltinToolBundle({
          workspaceQuery: services.resolve(DESKTOP_WORKSPACE_QUERY_PORT),
          workspaceCommand: services.resolve(DESKTOP_WORKSPACE_COMMAND_PORT),
          gitQuery: services.resolve(DESKTOP_GIT_QUERY_PORT),
          terminalQuery: services.resolve(DESKTOP_TERMINALS_QUERY_PORT),
          terminalCommand: services.resolve(DESKTOP_TERMINALS_COMMAND_PORT),
          taskBridge: services.resolve(DESKTOP_CONVERSATION_TASK_BRIDGE_PORT),
        });
        const workspaceSettingsService = new DesktopConversationWorkspaceSettingsService(
          services.resolve(DESKTOP_WORKSPACE_QUERY_PORT),
        );

        return new DesktopConversationService(
          new DesktopConversationStore(connection),
          services.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
            source: "desktop",
            module: "desktop.conversation",
          }),
          {
            conversationDbPath: connection.path,
            conversationRuntimeFactory: services.resolve(DESKTOP_AI_CONVERSATION_RUNTIME_FACTORY_PORT),
            aiOneShot: services.resolve(DESKTOP_AI_ONE_SHOT_PORT),
            taskBridge: services.resolve(DESKTOP_CONVERSATION_TASK_BRIDGE_PORT),
            tasksQuery: services.resolve(DESKTOP_TASKS_QUERY_PORT),
            capabilityRegistry: services.resolve(DESKTOP_CONVERSATION_CAPABILITY_REGISTRY_PORT),
            capabilityProviders,
            toolSources: builtinTools.toolSources,
            toolHandlers: builtinTools.toolHandlers,
            workspaceSettingsService,
          },
        );
      },
      source: context.module.moduleId,
    });

    context.addAlias(
      DESKTOP_CONVERSATION_CAPABILITY_REGISTRY_PORT,
      DESKTOP_CONVERSATION_CAPABILITY_REGISTRY_SERVICE_TOKEN,
      {
        source: context.module.moduleId,
      },
    );

    context.addAlias(DESKTOP_CONVERSATION_PORT, DESKTOP_CONVERSATION_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_CONVERSATION_QUERY_PORT, DESKTOP_CONVERSATION_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_CONVERSATION_COMMAND_PORT, DESKTOP_CONVERSATION_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
  }

  override async onStart(context: DependencyModuleRuntimeContext): Promise<void> {
    const logger = context.container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
      source: "desktop",
      module: "desktop.conversation",
    });
    const conversation = context.container.resolve(DESKTOP_CONVERSATION_PORT);
    const list = await conversation.listSessions({ limit: 1 });

    await logger.info("Desktop conversation module started", {
      context: {
        total: list.meta.total,
      },
    });
  }
}
