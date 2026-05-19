import {
  DependencyModuleBase,
  createServiceToken,
  type DependencyModuleContext,
} from "../../../shared/ioc";
import type { DesktopConversationCapabilityProvider } from "../../conversation/abstraction/ports/desktop-conversation-capabilities.ports";
import { DESKTOP_CONVERSATION_CAPABILITY_PROVIDER } from "../../conversation/abstraction/tokens/desktop-conversation.tokens";

import { DESKTOP_AI_RUNTIME_PORT, DesktopAiModule } from "../../ai";
import { DESKTOP_CONFIGURATION_PORT, DesktopConfigurationModule } from "../../configuration";
import { RUNTIME_LOGGER_FACTORY_PORT, DesktopLogsModule } from "../../logs";
import type { DesktopFeishuPort } from "../abstraction/ports/desktop-feishu.ports";
import { DESKTOP_FEISHU_ACTION_EXECUTOR_PORT } from "../abstraction/tokens/desktop-feishu-action-executor.tokens";
import { DESKTOP_FEISHU_DOC_RUNTIME_PORT } from "../abstraction/tokens/desktop-feishu-doc-runtime.tokens";
import { DESKTOP_FEISHU_SMART_ASSISTANT_ACTION_REGISTRY_PORT } from "../abstraction/tokens/desktop-feishu-smart-assistant-action-registry.tokens";
import {
  DESKTOP_FEISHU_COMMAND_PORT,
  DESKTOP_FEISHU_PORT,
  DESKTOP_FEISHU_QUERY_PORT,
} from "../abstraction/tokens/desktop-feishu.tokens";
import { DESKTOP_FEISHU_STORE_PORT } from "../abstraction/tokens/desktop-feishu-store.tokens";
import { DesktopFeishuDocRuntime } from "../implementation/services/desktop-feishu-doc-runtime";
import { DesktopFeishuConversationCapabilityProvider } from "../implementation/services/desktop-feishu-conversation-capability-provider";
import { DesktopFeishuSmartAssistantActionRegistry } from "../implementation/services/desktop-feishu-smart-assistant-action-registry";
import { DesktopFeishuSmartAssistantActionExecutor } from "../implementation/services/desktop-feishu-smart-assistant-action-executor";
import { DesktopFeishuService } from "../implementation/services/desktop-feishu-service";
import { DesktopFeishuStore } from "../implementation/stores/desktop-feishu-store";

export const DESKTOP_FEISHU_SERVICE_TOKEN =
  createServiceToken<DesktopFeishuPort>("desktop.feishu.service");
export const DESKTOP_FEISHU_CONVERSATION_CAPABILITY_PROVIDER_TOKEN =
  createServiceToken<DesktopConversationCapabilityProvider>(
    "desktop.feishu.conversation-capability-provider",
  );

export class DesktopFeishuModule extends DependencyModuleBase {
  static moduleId = "desktop.feishu";
  static dependencies = [DesktopConfigurationModule, DesktopLogsModule, DesktopAiModule] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_FEISHU_STORE_PORT, {
      useFactory: (services) => new DesktopFeishuStore(
        services.resolve(DESKTOP_CONFIGURATION_PORT),
        services.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
          source: "desktop",
          module: "desktop.feishu.store",
        }),
      ),
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_FEISHU_DOC_RUNTIME_PORT, {
      useFactory: (services) => new DesktopFeishuDocRuntime(
        services.resolve(DESKTOP_FEISHU_STORE_PORT),
      ),
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_FEISHU_SMART_ASSISTANT_ACTION_REGISTRY_PORT, {
      useFactory: (services) => new DesktopFeishuSmartAssistantActionRegistry(
        services.resolve(DESKTOP_AI_RUNTIME_PORT),
        services.resolve(DESKTOP_FEISHU_DOC_RUNTIME_PORT),
      ),
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_FEISHU_ACTION_EXECUTOR_PORT, {
      useFactory: (services) => new DesktopFeishuSmartAssistantActionExecutor(
        services.resolve(DESKTOP_FEISHU_SMART_ASSISTANT_ACTION_REGISTRY_PORT),
      ),
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_FEISHU_SERVICE_TOKEN, {
      useFactory: (services) => new DesktopFeishuService(
        services.resolve(DESKTOP_FEISHU_STORE_PORT),
        services.resolve(DESKTOP_FEISHU_ACTION_EXECUTOR_PORT),
        services.resolve(DESKTOP_FEISHU_DOC_RUNTIME_PORT),
      ),
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_FEISHU_CONVERSATION_CAPABILITY_PROVIDER_TOKEN, {
      useFactory: (services) => new DesktopFeishuConversationCapabilityProvider(
        services.resolve(DESKTOP_FEISHU_PORT),
      ),
      source: context.module.moduleId,
    });

    context.addAlias(DESKTOP_FEISHU_PORT, DESKTOP_FEISHU_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_FEISHU_QUERY_PORT, DESKTOP_FEISHU_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_FEISHU_COMMAND_PORT, DESKTOP_FEISHU_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(
      DESKTOP_CONVERSATION_CAPABILITY_PROVIDER,
      DESKTOP_FEISHU_CONVERSATION_CAPABILITY_PROVIDER_TOKEN,
      {
        source: context.module.moduleId,
      },
    );
  }
}
