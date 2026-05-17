import {
  DependencyModuleBase,
  createServiceToken,
  type DependencyModuleContext,
  type DependencyModuleRuntimeContext,
} from "../../../shared/ioc";
import { DESKTOP_AGENTS_QUERY_PORT, DesktopAgentsModule } from "../../agents";
import type { DesktopConversationCapabilityProvider } from "../../conversation/abstraction/ports/desktop-conversation-capabilities.ports";
import { DESKTOP_CONVERSATION_CAPABILITY_PROVIDER } from "../../conversation/abstraction/tokens/desktop-conversation.tokens";
import { RUNTIME_LOGGER_FACTORY_PORT, DesktopLogsModule } from "../../logs";
import type { DesktopSkillsMarketPort, DesktopSkillsPort } from "../abstraction/ports/desktop-skills.ports";
import {
  DESKTOP_SKILLS_COMMAND_PORT,
  DESKTOP_SKILLS_MARKET_PORT,
  DESKTOP_SKILLS_PORT,
  DESKTOP_SKILLS_QUERY_PORT,
} from "../abstraction/tokens/desktop-skills.tokens";
import { DesktopSkillsConversationCapabilityProvider } from "../implementation/services/desktop-skills-conversation-capability-provider";
import { ManagedSkillsService } from "../implementation/services/managed-skills-service";
import { SkillsMarketService } from "../implementation/services/skills-market-service";

export const DESKTOP_SKILLS_SERVICE_TOKEN =
  createServiceToken<DesktopSkillsPort>("desktop.skills.service");

export const DESKTOP_SKILLS_MARKET_SERVICE_TOKEN =
  createServiceToken<DesktopSkillsMarketPort>("desktop.skills.market.service");

export const DESKTOP_SKILLS_CONVERSATION_CAPABILITY_PROVIDER_TOKEN =
  createServiceToken<DesktopConversationCapabilityProvider>(
    "desktop.skills.conversation-capability-provider",
  );

export class DesktopSkillsModule extends DependencyModuleBase {
  static moduleId = "desktop.skills";
  static dependencies = [DesktopLogsModule, DesktopAgentsModule] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_SKILLS_SERVICE_TOKEN, {
      useFactory: (services) => new ManagedSkillsService(
        services.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
          source: "desktop",
          module: "desktop.skills",
        }),
      ),
      source: context.module.moduleId,
    });

    context.addAlias(DESKTOP_SKILLS_PORT, DESKTOP_SKILLS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_SKILLS_QUERY_PORT, DESKTOP_SKILLS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_SKILLS_COMMAND_PORT, DESKTOP_SKILLS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_SKILLS_CONVERSATION_CAPABILITY_PROVIDER_TOKEN, {
      useFactory: (services) => new DesktopSkillsConversationCapabilityProvider(
        services.resolve(DESKTOP_SKILLS_QUERY_PORT),
        services.resolve(DESKTOP_AGENTS_QUERY_PORT),
      ),
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_SKILLS_MARKET_SERVICE_TOKEN, {
      useFactory: (services) => new SkillsMarketService(
        services.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
          source: "desktop",
          module: "desktop.skills.market",
        }),
        services.resolve(DESKTOP_SKILLS_PORT),
      ),
      source: context.module.moduleId,
    });

    context.addAlias(DESKTOP_SKILLS_MARKET_PORT, DESKTOP_SKILLS_MARKET_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(
      DESKTOP_CONVERSATION_CAPABILITY_PROVIDER,
      DESKTOP_SKILLS_CONVERSATION_CAPABILITY_PROVIDER_TOKEN,
      {
        source: context.module.moduleId,
      },
    );
  }

  override async onStart(context: DependencyModuleRuntimeContext): Promise<void> {
    const logger = context.container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
      source: "desktop",
      module: "desktop.skills",
    });
    const skills = context.container.resolve(DESKTOP_SKILLS_PORT);
    const snapshot = await skills.list({ limit: 1, offset: 0 });
    await logger.info("Desktop skills module started", {
      context: {
        managedCount: snapshot.meta.total,
      },
    });
  }
}