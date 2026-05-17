import {
  DependencyModuleBase,
  createServiceToken,
  type DependencyModuleContext,
  type DependencyModuleRuntimeContext,
} from "../../../shared/ioc";
import { DESKTOP_AGENTS_QUERY_PORT, DesktopAgentsModule } from "../../agents";
import { RUNTIME_LOGGER_FACTORY_PORT, DesktopLogsModule } from "../../logs";
import { DESKTOP_MODELS_QUERY_PORT, DesktopModelsModule } from "../../models";
import type { DesktopAiConversationRuntimeFactoryPort } from "../abstraction/ports/desktop-ai-conversation-runtime.ports";
import { DESKTOP_AI_CONVERSATION_RUNTIME_FACTORY_PORT } from "../abstraction/tokens/desktop-ai-conversation-runtime.tokens";
import type { DesktopAiExecutionProfileMaterializerPort } from "../abstraction/ports/desktop-ai-one-shot.ports";
import {
  DESKTOP_AI_EXECUTION_PROFILE_MATERIALIZER_PORT,
  DESKTOP_AI_ONE_SHOT_PORT,
} from "../abstraction/tokens/desktop-ai-one-shot.tokens";
import type { DesktopAiRuntimePort } from "../abstraction/ports/desktop-ai-runtime.ports";
import { DESKTOP_AI_RUNTIME_PORT } from "../abstraction/tokens/desktop-ai-runtime.tokens";
import { DesktopAiConversationRuntimeFactoryService } from "../implementation/services/desktop-ai-conversation-runtime-factory-service";
import { DesktopAiExecutionProfileMaterializer } from "../implementation/services/desktop-ai-execution-profile-materializer";
import { DesktopAiOneShotService } from "../implementation/services/desktop-ai-one-shot-service";
import { DesktopAiRuntimeService } from "../implementation/services/desktop-ai-runtime-service";

export const DESKTOP_AI_RUNTIME_SERVICE_TOKEN =
  createServiceToken<DesktopAiRuntimePort>("desktop.ai.runtime.service");
export const DESKTOP_AI_CONVERSATION_RUNTIME_FACTORY_SERVICE_TOKEN =
  createServiceToken<DesktopAiConversationRuntimeFactoryPort>("desktop.ai.conversation-runtime-factory.service");
export const DESKTOP_AI_EXECUTION_PROFILE_MATERIALIZER_SERVICE_TOKEN =
  createServiceToken<DesktopAiExecutionProfileMaterializerPort>("desktop.ai.execution-profile-materializer.service");
export const DESKTOP_AI_ONE_SHOT_SERVICE_TOKEN =
  createServiceToken<DesktopAiOneShotService>("desktop.ai.one-shot.service");

export class DesktopAiModule extends DependencyModuleBase {
  static moduleId = "desktop.ai";
  static dependencies = [DesktopLogsModule, DesktopModelsModule, DesktopAgentsModule] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_AI_RUNTIME_SERVICE_TOKEN, {
      useFactory: () => new DesktopAiRuntimeService(),
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_AI_EXECUTION_PROFILE_MATERIALIZER_SERVICE_TOKEN, {
      useFactory: (services) => new DesktopAiExecutionProfileMaterializer(
        services.resolve(DESKTOP_MODELS_QUERY_PORT),
      ),
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_AI_CONVERSATION_RUNTIME_FACTORY_SERVICE_TOKEN, {
      useFactory: (services) => new DesktopAiConversationRuntimeFactoryService({
        agents: services.resolve(DESKTOP_AGENTS_QUERY_PORT),
        runtime: services.resolve(DESKTOP_AI_RUNTIME_PORT),
        materializer: services.resolve(DESKTOP_AI_EXECUTION_PROFILE_MATERIALIZER_SERVICE_TOKEN),
      }),
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_AI_ONE_SHOT_SERVICE_TOKEN, {
      useFactory: (services) => new DesktopAiOneShotService({
        runtime: services.resolve(DESKTOP_AI_RUNTIME_PORT),
        materializer: services.resolve(DESKTOP_AI_EXECUTION_PROFILE_MATERIALIZER_SERVICE_TOKEN),
      }),
      source: context.module.moduleId,
    });

    context.addAlias(DESKTOP_AI_RUNTIME_PORT, DESKTOP_AI_RUNTIME_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(
      DESKTOP_AI_EXECUTION_PROFILE_MATERIALIZER_PORT,
      DESKTOP_AI_EXECUTION_PROFILE_MATERIALIZER_SERVICE_TOKEN,
      {
        source: context.module.moduleId,
      },
    );
    context.addAlias(
      DESKTOP_AI_CONVERSATION_RUNTIME_FACTORY_PORT,
      DESKTOP_AI_CONVERSATION_RUNTIME_FACTORY_SERVICE_TOKEN,
      {
        source: context.module.moduleId,
      },
    );
    context.addAlias(DESKTOP_AI_ONE_SHOT_PORT, DESKTOP_AI_ONE_SHOT_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
  }

  override async onStart(context: DependencyModuleRuntimeContext): Promise<void> {
    const logger = context.container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
      source: "desktop",
      module: "desktop.ai",
    });
    const runtime = context.container.resolve(DESKTOP_AI_RUNTIME_PORT);

    await logger.info("Desktop ai module started", {
      context: {
        runtimeCount: runtime.listProviderRuntimes().length,
      },
    });
  }
}