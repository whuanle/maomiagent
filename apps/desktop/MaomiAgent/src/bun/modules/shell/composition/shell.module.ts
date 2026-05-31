import {
  DependencyModuleBase,
  type DependencyModuleRuntimeContext,
} from "../../../shared/ioc";

import { DESKTOP_STARTUP_TRACE } from "../../foundation/abstraction/tokens";
import { DESKTOP_RUNTIME_CONTEXT } from "../../foundation";
import { RUNTIME_LOGGER_FACTORY_PORT } from "../../logs/abstraction/tokens/runtime-logs.tokens";
import { DESKTOP_HEALTH_CHECK_PORT, DESKTOP_TRACE_PORT } from "../../observability";
import { DesktopObservabilityModule } from "../../observability/composition/observability.module";
import { DESKTOP_MAIN_WINDOW_SERVICE } from "../../window/abstraction/tokens";
import { DesktopWindowModule } from "../../window/composition/window.module";
import { DesktopAiModule } from "../../ai";
import { DesktopBrowserModule } from "../../browser";
import { DesktopConversationModule } from "../../conversation";
import { DesktopModelsModule } from "../../models";
import { DesktopMemoryModule } from "../../memory";
import { DesktopMcpModule } from "../../mcp";
import { DesktopSkillsModule } from "../../skills";
import { DesktopTasksModule } from "../../tasks";
import { DesktopAgentsModule } from "../../agents";
import { DesktopGitModule } from "../../git";
import { DesktopTerminalsModule } from "../../terminals";
import { DesktopWorkspaceModule } from "../../workspace";
import { DesktopWechatModule } from "../../wechat";
import { DesktopFeishuModule } from "../../feishu";

export class DesktopShellModule extends DependencyModuleBase {
  static moduleId = "desktop.shell";
  static dependencies = [
    DesktopWindowModule,
    DesktopObservabilityModule,
    DesktopBrowserModule,
    DesktopWorkspaceModule,
    DesktopConversationModule,
    DesktopAiModule,
    DesktopGitModule,
    DesktopTerminalsModule,
    DesktopTasksModule,
    DesktopAgentsModule,
    DesktopMemoryModule,
    DesktopModelsModule,
    DesktopSkillsModule,
    DesktopMcpModule,
    DesktopWechatModule,
    DesktopFeishuModule,
  ] as const;

  override async onStart(context: DependencyModuleRuntimeContext): Promise<void> {
    const runtimeContext = context.container.resolve(DESKTOP_RUNTIME_CONTEXT);
    const trace = context.container.resolve(DESKTOP_STARTUP_TRACE);
    const windowService = context.container.resolve(DESKTOP_MAIN_WINDOW_SERVICE);
    const logger = context.container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
      source: "desktop",
      module: "desktop.shell",
    });
    const tracer = context.container.resolve(DESKTOP_TRACE_PORT);
    const health = context.container.resolve(DESKTOP_HEALTH_CHECK_PORT);

    trace.push(`start:${context.module.moduleId}`);
    await tracer.trace({
      name: "desktop.shell.start",
      attributes: {
        "desktop.channel": runtimeContext.channel,
        "desktop.main_view_url": runtimeContext.mainViewUrl,
      },
    }, async (span) => {
      await logger.info("Desktop shell module starting", {
        traceId: span.traceId,
        context: {
          channel: runtimeContext.channel,
          mainViewUrl: runtimeContext.mainViewUrl,
        },
      });
      runtimeContext.singleInstance.setActivationHandler(() => {
        windowService.activateMainWindow();
      });
      windowService.ensureMainWindow();
      health.setCheck({
        name: "desktop.shell",
        status: "healthy",
        message: "Shell module started",
        attributes: {
          channel: runtimeContext.channel,
        },
      });
    });
  }

  override async onStop(context: DependencyModuleRuntimeContext): Promise<void> {
    const runtimeContext = context.container.resolve(DESKTOP_RUNTIME_CONTEXT);
    const trace = context.container.resolve(DESKTOP_STARTUP_TRACE);
    const logger = context.container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
      source: "desktop",
      module: "desktop.shell",
    });

    trace.push(`stop:${context.module.moduleId}`);
    await logger.info("Desktop shell module stopping");
    await runtimeContext.singleInstance.dispose();
  }
}
