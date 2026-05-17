import {
  createServiceCollection,
  type ModuleHost,
} from "./shared/ioc";

import {
  DESKTOP_APP_INFO,
  DESKTOP_STARTUP_TRACE,
} from "./modules/foundation/abstraction/tokens";
import { DESKTOP_CONFIGURATION_PORT } from "./modules/configuration";
import { DESKTOP_DATABASE_PORT } from "./modules/database";
import {
  DESKTOP_HEALTH_CHECK_PORT,
  DESKTOP_OBSERVABILITY_CONFIG,
  DESKTOP_TRACE_PORT,
} from "./modules/observability";
import type { DesktopAppInfo } from "./modules/foundation/abstraction/models/desktop-app-info";
import type {
  DesktopBootstrapInput,
  DesktopLogger,
  DesktopRuntimeContext,
} from "./modules/foundation";
import { DESKTOP_RUNTIME_CONTEXT } from "./modules/foundation";
import { RUNTIME_LOGGER_FACTORY_PORT } from "./modules/logs";
import { createRuntimeProcessErrorHandlers } from "./modules/logs/implementation/services/runtime-process-error-handlers";
import { DesktopShellModule } from "./modules/shell/composition/shell.module";
import type {
  DesktopBrowserWindow,
  DesktopWindowFrame,
  DesktopWindowOptions,
} from "./modules/window/abstraction/models/desktop-window";

export type {
  DesktopAppInfo,
  DesktopBootstrapInput,
  DesktopBrowserWindow,
  DesktopLogger,
  DesktopRuntimeContext,
  DesktopWindowFrame,
  DesktopWindowOptions,
};

export {
  DESKTOP_APP_INFO,
  DESKTOP_CONFIGURATION_PORT,
  DESKTOP_DATABASE_PORT,
  DESKTOP_HEALTH_CHECK_PORT,
  DESKTOP_OBSERVABILITY_CONFIG,
  DESKTOP_STARTUP_TRACE,
  DESKTOP_TRACE_PORT,
};

export {
  DESKTOP_CONVERSATION_COMMAND_PORT,
  DESKTOP_CONVERSATION_PORT,
  DESKTOP_CONVERSATION_QUERY_PORT,
  DesktopConversationModule,
  type DesktopConversationCommandPort,
  type DesktopConversationCreateSessionInput,
  type DesktopConversationCreateSessionResponse,
  type DesktopConversationHideSessionResponse,
  type DesktopConversationPort,
  type DesktopConversationQueryPort,
  type DesktopConversationSessionItem,
  type DesktopConversationSessionListQuery,
  type DesktopConversationSessionListResponse,
  type DesktopConversationSessionStatus,
} from "./modules/conversation";

export {
  DESKTOP_AI_ONE_SHOT_PORT,
  DESKTOP_AI_RUNTIME_PORT,
  DesktopAiModule,
  type DesktopAiExecutionProfileMaterializationInput,
  type DesktopAiOneShotInput,
  type DesktopAiOneShotPort,
  type DesktopAiOneShotResult,
  type DesktopAiOneShotTarget,
  type DesktopAiProviderRuntimeBinding,
  type DesktopAiProviderRuntimeCreateTurnPortInput,
  type DesktopAiProviderRuntimeLookupInput,
  type DesktopAiProviderServiceConfig,
  type DesktopAiProviderServiceConfigResolver,
  type DesktopAiRuntimePort,
} from "./modules/ai";

export {
  DESKTOP_AGENTS_COMMAND_PORT,
  DESKTOP_AGENTS_PORT,
  DESKTOP_AGENTS_QUERY_PORT,
  DesktopAgentsModule,
  type DesktopAgentsCommandPort,
  type DesktopAgentsPort,
  type DesktopAgentsQueryPort,
  type AgentCreateInput,
  type AgentItem,
  type AgentPatchInput,
  type AgentsListQuery,
  type AgentsListResponse,
  type DesktopAgentCreateResponse,
  type DesktopAgentDeleteResponse,
  type OpencodeAgentImportInput,
  type OpencodeAgentImportPreview,
  type OpencodeAgentImportResult,
} from "./modules/agents";

export {
  DESKTOP_MODELS_COMMAND_PORT,
  DESKTOP_MODELS_PORT,
  DESKTOP_MODELS_QUERY_PORT,
  DesktopModelsModule,
  type DesktopModelBatchToggleInput,
  type DesktopModelChannelItem,
  type DesktopModelChannelStateItem,
  type DesktopModelCreateChannelInput,
  type DesktopModelCreateChannelResponse,
  type DesktopModelDeleteChannelResponse,
  type DesktopModelDiscoveryResponse,
  type DesktopModelProviderItem,
  type DesktopModelRuntimeSelectionQuery,
  type DesktopModelRuntimeSelectionSnapshot,
  type DesktopModelsCommandPort,
  type DesktopModelsPort,
  type DesktopModelsQueryPort,
  type DesktopModelsSnapshot,
  type DesktopModelUpdateChannelInput,
} from "./modules/models";

export {
  DESKTOP_MEMORY_COMMAND_PORT,
  DESKTOP_MEMORY_PORT,
  DESKTOP_MEMORY_QUERY_PORT,
  DESKTOP_MEMORY_RUNTIME_PORT,
  DesktopMemoryModule,
  type DesktopMemoryAgentMemoryPack,
  type DesktopMemoryAppendInput,
  type DesktopMemoryCommandPort,
  type DesktopMemoryDeleteResponse,
  type DesktopMemoryDomain,
  type DesktopMemoryKind,
  type DesktopMemoryListQuery,
  type DesktopMemoryListResponse,
  type DesktopMemoryMaintenanceApply,
  type DesktopMemoryMaintenancePreview,
  type DesktopMemoryPatchInput,
  type DesktopMemoryPort,
  type DesktopMemoryProjection,
  type DesktopMemoryProjectionQuery,
  type DesktopMemoryQueryPort,
  type DesktopMemoryRuntimeContext,
  type DesktopMemoryRuntimePort,
  type DesktopMemorySearchQuery,
  type DesktopMemorySearchResponse,
  type DesktopMemoryStatus,
  type DesktopMemoryTier,
  type DesktopMemoryTrace,
  type DesktopMemoryTraceListQuery,
  type DesktopMemoryUnit,
  type DesktopMemoryWorkingSetPullQuery,
  type DesktopMemoryWorkingSetPullResult,
  type DesktopMemoryWorkingSetPushInput,
  type DesktopMemoryWorkingSetPushResult,
} from "./modules/memory";

export {
  DESKTOP_SKILLS_COMMAND_PORT,
  DESKTOP_SKILLS_MARKET_PORT,
  DESKTOP_SKILLS_PORT,
  DESKTOP_SKILLS_QUERY_PORT,
  DesktopSkillsModule,
  type DesktopDiscoveredSkillItem,
  type DesktopSkillEffectiveRow,
  type DesktopSkillItem,
  type DesktopSkillsAdoptInput,
  type DesktopSkillsAdoptResponse,
  type DesktopSkillsCommandPort,
  type DesktopSkillsDeleteResponse,
  type DesktopSkillsDiscoveryConflictType,
  type DesktopSkillsDiscoveryResponse,
  type DesktopSkillsDiscoverySourceStatus,
  type DesktopSkillsDiscoveryState,
  type DesktopSkillsListMeta,
  type DesktopSkillsListQuery,
  type DesktopSkillsListResponse,
  type DesktopSkillsMarketInstallInput,
  type DesktopSkillsMarketInstallResponse,
  type DesktopSkillsMarketItem,
  type DesktopSkillsMarketPort,
  type DesktopSkillsMarketProvider,
  type DesktopSkillsMarketProviderId,
  type DesktopSkillsMarketProviderListResponse,
  type DesktopSkillsMarketSearchQuery,
  type DesktopSkillsMarketSearchResponse,
  type DesktopSkillsPatchInput,
  type DesktopSkillsPort,
  type DesktopSkillsQueryPort,
  type DesktopSkillsRuntimeEffectiveResult,
} from "./modules/skills";

export {
  DESKTOP_MCP_COMMAND_PORT,
  DESKTOP_MCP_MARKET_PORT,
  DESKTOP_MCP_PORT,
  DESKTOP_MCP_QUERY_PORT,
  DesktopMcpModule,
  type DesktopMcpAuth,
  type DesktopMcpAuthMode,
  type DesktopMcpCapabilityProbeResult,
  type DesktopMcpCommandPort,
  type DesktopMcpCreateResponse,
  type DesktopMcpDeleteResponse,
  type DesktopMcpDraftInput,
  type DesktopMcpEffectiveResponse,
  type DesktopMcpHealthRecord,
  type DesktopMcpHealthStatus,
  type DesktopMcpItem,
  type DesktopMcpListParams,
  type DesktopMcpListResponse,
  type DesktopMcpListStatus,
  type DesktopMcpMarketAutoInstallInput,
  type DesktopMcpMarketAutoInstallResponse,
  type DesktopMcpMarketInstallInput,
  type DesktopMcpMarketInstallResponse,
  type DesktopMcpMarketIntentItem,
  type DesktopMcpMarketItem,
  type DesktopMcpMarketPort,
  type DesktopMcpMarketProvider,
  type DesktopMcpMarketProviderId,
  type DesktopMcpMarketProvidersResponse,
  type DesktopMcpMarketRequirementQuery,
  type DesktopMcpMarketSearchByRequirementResponse,
  type DesktopMcpMarketSearchQuery,
  type DesktopMcpMarketSearchResponse,
  type DesktopMcpPort,
  type DesktopMcpQueryPort,
  type DesktopMcpRecommendedItem,
  type DesktopMcpRetry,
  type DesktopMcpRuntimeConfig,
  type DesktopMcpRuntimeEntry,
  type DesktopMcpScope,
  type DesktopMcpTestConnectionResult,
  type DesktopMcpToolDescriptor,
  type DesktopMcpTransport,
  type DesktopMcpView,
} from "./modules/mcp";

export {
  DESKTOP_WORKSPACE_COMMAND_PORT,
  DESKTOP_WORKSPACE_PORT,
  DESKTOP_WORKSPACE_QUERY_PORT,
  DesktopWorkspaceModule,
  type DesktopWorkspaceCommandPort,
  type DesktopWorkspaceItem,
  type DesktopWorkspacePort,
  type DesktopWorkspaceQueryPort,
} from "./modules/workspace";

export {
  DESKTOP_SCHEDULED_TASK_HANDLER,
  DESKTOP_SCHEDULED_TASK_REGISTRY_PORT,
  DESKTOP_TASKS_COMMAND_PORT,
  DESKTOP_TASKS_PORT,
  DESKTOP_TASKS_QUERY_PORT,
  DesktopTasksModule,
  type DesktopScheduledTaskDefinition,
  type DesktopScheduledTaskExecutionContext,
  type DesktopScheduledTaskExecutionResult,
  type DesktopScheduledTaskHandler,
  type DesktopScheduledTaskRegistryPort,
  type DesktopTasksCommandPort,
  type DesktopTaskActionInput,
  type DesktopTaskDetailQuery,
  type DesktopTaskDetailResponse,
  type DesktopTaskListQuery,
  type DesktopTaskListResponse,
  type DesktopTaskRecord,
  type DesktopTasksPort,
  type DesktopTasksQueryPort,
  type DesktopTaskRunsListQuery,
  type DesktopTaskRunsResponse,
  type DesktopTaskWorkspacesResponse,
} from "./modules/tasks";

export async function startDesktopApplication(
  input: DesktopBootstrapInput,
): Promise<ModuleHost> {
  const runtimeContext = normalizeDesktopRuntimeContext(input);
  const services = createServiceCollection();

  services.addSingleton(DESKTOP_RUNTIME_CONTEXT, {
    useValue: runtimeContext,
    source: "desktop.bootstrap",
  });
  services.addModule(DesktopShellModule);

  const host = services.buildModuleHost();
  input.onHostCreated?.(host);

  try {
    await host.start();
  } catch (error) {
    await host.dispose().catch(() => undefined);
    throw error;
  }

  runtimeContext.logger.log(
    `Desktop IOC host started with modules: ${host
      .listModules()
      .map((module) => module.moduleId)
      .join(", ")}`,
  );

  if (runtimeContext.installProcessHandlers) {
    installProcessHandlers(host, runtimeContext.logger);
  }

  return host;
}

function normalizeDesktopRuntimeContext(
  input: DesktopBootstrapInput,
): DesktopRuntimeContext {
  return {
    appIdentifier: input.appIdentifier,
    appName: input.appName,
    channel: input.channel,
    mainViewUrl: input.mainViewUrl,
    singleInstance: input.singleInstance,
    logger: input.logger ?? console,
    configuration: input.configuration,
    observability: input.observability,
    window: {
      title: input.window.title,
      frame: { ...input.window.frame },
    },
    createWindow: input.createWindow,
    installProcessHandlers: input.installProcessHandlers ?? true,
  };
}

function installProcessHandlers(host: ModuleHost, logger: DesktopLogger): void {
  let stopping = false;
  const runtimeLogger = host.container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
    source: "desktop",
    module: "desktop.process",
  });

  const stopHost = async (signal: string) => {
    if (stopping) {
      return;
    }

    stopping = true;
    logger.log(`Stopping desktop IOC host due to ${signal}.`);
    try {
      await host.dispose();
    } catch (error) {
      logger.warn(`Desktop IOC host stop failed during ${signal}.`, error);
    }
  };

  const runtimeErrorHandlers = createRuntimeProcessErrorHandlers({
    logger: runtimeLogger,
    fallbackLogger: logger,
    stopHost,
  });

  process.once("uncaughtException", runtimeErrorHandlers.handleUncaughtException);
  process.on("unhandledRejection", runtimeErrorHandlers.handleUnhandledRejection);

  process.once("SIGINT", () => {
    void stopHost("SIGINT").finally(() => {
      process.exit(0);
    });
  });

  process.once("SIGTERM", () => {
    void stopHost("SIGTERM").finally(() => {
      process.exit(0);
    });
  });
}