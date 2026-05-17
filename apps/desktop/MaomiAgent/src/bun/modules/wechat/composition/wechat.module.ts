import {
  DependencyModuleBase,
  createServiceToken,
  type DependencyModuleContext,
} from "../../../shared/ioc";
import type { DesktopConversationCapabilityProvider } from "../../conversation/abstraction/ports/desktop-conversation-capabilities.ports";
import { DESKTOP_CONVERSATION_CAPABILITY_PROVIDER } from "../../conversation/abstraction/tokens/desktop-conversation.tokens";

import {
  DESKTOP_CONVERSATION_COMMAND_PORT,
  DesktopConversationModule,
} from "../../conversation";
import { DESKTOP_CONFIGURATION_PORT, DesktopConfigurationModule } from "../../configuration";
import { RUNTIME_LOGGER_FACTORY_PORT, DesktopLogsModule } from "../../logs";
import { DESKTOP_MODELS_QUERY_PORT, DesktopModelsModule } from "../../models";
import { DESKTOP_WORKSPACE_QUERY_PORT, DesktopWorkspaceModule } from "../../workspace";
import type { DesktopWechatPort } from "../abstraction/ports/desktop-wechat.ports";
import {
  DESKTOP_WECHAT_COMMAND_PORT,
  DESKTOP_WECHAT_PORT,
  DESKTOP_WECHAT_QUERY_PORT,
} from "../abstraction/tokens/desktop-wechat.tokens";
import { DesktopWechatConversationCapabilityProvider } from "../implementation/services/desktop-wechat-conversation-capability-provider";
import { DesktopWechatService } from "../implementation/services/desktop-wechat-service";

export const DESKTOP_WECHAT_SERVICE_TOKEN =
  createServiceToken<DesktopWechatPort>("desktop.wechat.service");
export const DESKTOP_WECHAT_CONVERSATION_CAPABILITY_PROVIDER_TOKEN =
  createServiceToken<DesktopConversationCapabilityProvider>(
    "desktop.wechat.conversation-capability-provider",
  );

export class DesktopWechatModule extends DependencyModuleBase {
  static moduleId = "desktop.wechat";
  static dependencies = [
    DesktopConfigurationModule,
    DesktopLogsModule,
    DesktopConversationModule,
    DesktopModelsModule,
    DesktopWorkspaceModule,
  ] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_WECHAT_SERVICE_TOKEN, {
      useFactory: (services) => new DesktopWechatService(
        services.resolve(DESKTOP_CONFIGURATION_PORT),
        services.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
          source: "desktop",
          module: "desktop.wechat",
        }),
        services.resolve(DESKTOP_CONVERSATION_COMMAND_PORT),
        services.resolve(DESKTOP_WORKSPACE_QUERY_PORT),
        services.resolve(DESKTOP_MODELS_QUERY_PORT),
      ),
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_WECHAT_CONVERSATION_CAPABILITY_PROVIDER_TOKEN, {
      useFactory: (services) => new DesktopWechatConversationCapabilityProvider(
        () => services.resolve(DESKTOP_WECHAT_PORT),
      ),
      source: context.module.moduleId,
    });

    context.addAlias(DESKTOP_WECHAT_PORT, DESKTOP_WECHAT_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_WECHAT_QUERY_PORT, DESKTOP_WECHAT_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_WECHAT_COMMAND_PORT, DESKTOP_WECHAT_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(
      DESKTOP_CONVERSATION_CAPABILITY_PROVIDER,
      DESKTOP_WECHAT_CONVERSATION_CAPABILITY_PROVIDER_TOKEN,
      {
        source: context.module.moduleId,
      },
    );
  }
}
