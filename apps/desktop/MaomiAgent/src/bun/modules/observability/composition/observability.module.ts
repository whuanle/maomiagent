import {
  DependencyModuleBase,
  createServiceToken,
  type DependencyResolver,
  type DependencyModuleContext,
  type DependencyModuleRuntimeContext,
} from "../../../shared/ioc";

import { DESKTOP_CONFIGURATION_PORT, DesktopConfigurationModule } from "../../configuration";
import { DESKTOP_APP_INFO, DESKTOP_RUNTIME_CONTEXT } from "../../foundation/abstraction/tokens";
import { DesktopFoundationModule } from "../../foundation/composition/foundation.module";
import { RUNTIME_LOGGER_FACTORY_PORT } from "../../logs/abstraction/tokens/runtime-logs.tokens";
import { DesktopLogsModule } from "../../logs/composition/logs.module";
import type { DesktopObservabilityConfig } from "../abstraction/models/desktop-observability-config";
import {
  DESKTOP_HEALTH_CHECK_PORT,
  DESKTOP_OBSERVABILITY_CONFIG,
  DESKTOP_TRACE_PORT,
} from "../abstraction/tokens";
import { DesktopObservabilityService } from "../implementation/services/desktop-observability-service";

type DesktopObservabilityServicePort = DesktopObservabilityService;

export const DESKTOP_OBSERVABILITY_SERVICE_TOKEN =
  createServiceToken<DesktopObservabilityServicePort>("desktop.observability.service");

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function buildObservabilityConfig(services: DependencyResolver): DesktopObservabilityConfig {
  const runtimeContext = services.resolve(DESKTOP_RUNTIME_CONTEXT);
  const appInfo = services.resolve(DESKTOP_APP_INFO);
  const configuration = services.resolve(DESKTOP_CONFIGURATION_PORT);
  const input = runtimeContext.observability;
  const otlpEndpoint =
    trimText(input?.tracing?.otlpEndpoint)
    ?? configuration.getString("observability.tracing.otlpEndpoint");
  const consoleExporter =
    input?.tracing?.consoleExporter
    ?? configuration.getBoolean("observability.tracing.consoleExporter")
    ?? false;
  const enabled = input?.tracing?.enabled ?? Boolean(otlpEndpoint || consoleExporter);

  return {
    serviceName: trimText(input?.serviceName) ?? configuration.getString("observability.serviceName") ?? appInfo.appName,
    serviceNamespace: trimText(input?.serviceNamespace) ?? configuration.getString("observability.serviceNamespace") ?? "maomiagent.desktop",
    serviceVersion: trimText(input?.serviceVersion) ?? configuration.getString("observability.serviceVersion"),
    serviceInstanceId:
      trimText(input?.serviceInstanceId)
      ?? configuration.getString("observability.serviceInstanceId")
      ?? `${runtimeContext.appIdentifier}:${runtimeContext.channel}:${process.pid}`,
    tracing: {
      enabled,
      otlpEndpoint,
      consoleExporter,
      headers: input?.tracing?.headers ?? configuration.get<Record<string, string>>("observability.tracing.headers"),
    },
  };
}

export class DesktopObservabilityModule extends DependencyModuleBase {
  static moduleId = "desktop.observability";
  static dependencies = [DesktopConfigurationModule, DesktopFoundationModule, DesktopLogsModule] as const;

  override configureServices(context: DependencyModuleContext): void {
    context.addSingleton(DESKTOP_OBSERVABILITY_CONFIG, {
      useFactory: buildObservabilityConfig,
      source: context.module.moduleId,
    });

    context.addSingleton(DESKTOP_OBSERVABILITY_SERVICE_TOKEN, {
      useFactory: (services) => new DesktopObservabilityService(
        services.resolve(DESKTOP_OBSERVABILITY_CONFIG),
        services.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
          source: "desktop",
          module: "desktop.observability",
        }),
      ),
      source: context.module.moduleId,
    });

    context.addAlias(DESKTOP_TRACE_PORT, DESKTOP_OBSERVABILITY_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
    context.addAlias(DESKTOP_HEALTH_CHECK_PORT, DESKTOP_OBSERVABILITY_SERVICE_TOKEN, {
      source: context.module.moduleId,
    });
  }

  override async onStart(context: DependencyModuleRuntimeContext): Promise<void> {
    const config = context.container.resolve(DESKTOP_OBSERVABILITY_CONFIG);
    const logger = context.container.resolve(RUNTIME_LOGGER_FACTORY_PORT).createLogger({
      source: "desktop",
      module: "desktop.observability",
    });
    const tracer = context.container.resolve(DESKTOP_TRACE_PORT);

    await tracer.trace({
      name: "desktop.observability.start",
      attributes: {
        "desktop.channel": context.container.resolve(DESKTOP_RUNTIME_CONTEXT).channel,
        "otel.tracing.enabled": config.tracing.enabled,
        "otel.otlp.configured": Boolean(config.tracing.otlpEndpoint),
      },
    }, async (span) => {
      await logger.info("Desktop observability module started", {
        traceId: span.traceId,
        context: {
          serviceName: config.serviceName,
          serviceNamespace: config.serviceNamespace,
          tracingEnabled: config.tracing.enabled,
          otlpEndpointConfigured: Boolean(config.tracing.otlpEndpoint),
          consoleExporter: config.tracing.consoleExporter,
        },
      });
    });
  }

  override async onStop(context: DependencyModuleRuntimeContext): Promise<void> {
    await context.container.resolve(DESKTOP_OBSERVABILITY_SERVICE_TOKEN).dispose();
  }
}