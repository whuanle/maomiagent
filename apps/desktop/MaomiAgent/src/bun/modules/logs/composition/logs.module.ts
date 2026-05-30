import {
  DependencyModuleBase,
  createServiceToken,
  type DependencyModuleContext,
  type DependencyModuleRuntimeContext,
} from "../../../shared/ioc";

import {
  RUNTIME_LOGGER_FACTORY_PORT,
  RUNTIME_LOGS_QUERY_PORT,
  RUNTIME_LOG_WRITER_PORT,
} from "../abstraction/tokens/runtime-logs.tokens";
import type {
  RuntimeLoggerFactoryPort,
  RuntimeLogsQueryPort,
  RuntimeLogWriterPort,
} from "../abstraction/ports/runtime-logs.ports";
import { RuntimeLogsService } from "../implementation/services/runtime-logs-service";
import { RuntimeLogsStore } from "../implementation/stores/runtime-logs-store";
import { DESKTOP_RUNTIME_CONTEXT } from "../../foundation";
import { DESKTOP_DATABASE_PORT, DesktopDatabaseModule } from "../../database";

export type RuntimeLogsPort =
  & RuntimeLogWriterPort
  & RuntimeLogsQueryPort
  & RuntimeLoggerFactoryPort
  & { dispose(): void };

export const RUNTIME_LOGS_SERVICE_TOKEN =
  createServiceToken<RuntimeLogsPort>("desktop.runtime.logs.service");

export class DesktopLogsModule extends DependencyModuleBase {
  static moduleId = "desktop.logs";
  static dependencies = [DesktopDatabaseModule] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(RUNTIME_LOGS_SERVICE_TOKEN, {
      useFactory: (services) => new RuntimeLogsService(
        new RuntimeLogsStore(services.resolve(DESKTOP_DATABASE_PORT).getConnection("runtimeLogs")),
        services.resolve(DESKTOP_RUNTIME_CONTEXT).logger,
      ),
      source: context.module.moduleId,
    });

    context.addAlias(RUNTIME_LOG_WRITER_PORT, RUNTIME_LOGS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });

    context.addAlias(RUNTIME_LOGS_QUERY_PORT, RUNTIME_LOGS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });

    context.addAlias(RUNTIME_LOGGER_FACTORY_PORT, RUNTIME_LOGS_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
  }

  override async onStop(context: DependencyModuleRuntimeContext): Promise<void> {
    await context.container.resolve(RUNTIME_LOGS_SERVICE_TOKEN).dispose?.();
  }
}