import {
  SpanStatusCode,
  type Attributes,
  type Span,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  BasicTracerProvider,
  ConsoleSpanExporter,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

import type { RuntimeLogger } from "../../../logs/abstraction/models/runtime-log.models";
import type {
  DesktopHealthCheck,
  DesktopHealthReport,
  DesktopHealthStatus,
} from "../../abstraction/models/desktop-health.models";
import type { DesktopObservabilityConfig } from "../../abstraction/models/desktop-observability-config";
import type {
  DesktopSpanStatus,
  DesktopTraceInput,
  DesktopTraceSpan,
} from "../../abstraction/models/desktop-tracing.models";
import type { DesktopHealthCheckPort } from "../../abstraction/ports/desktop-health.port";
import type { DesktopTracePort } from "../../abstraction/ports/desktop-tracing.port";

function nowIso() {
  return new Date().toISOString();
}

function resolveStatus(status: DesktopSpanStatus) {
  if (status === "ok") {
    return SpanStatusCode.OK;
  }
  if (status === "error") {
    return SpanStatusCode.ERROR;
  }
  return SpanStatusCode.UNSET;
}

function normalizeException(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  return new Error(JSON.stringify(error));
}

function toDesktopSpan(span: Span): DesktopTraceSpan {
  const spanContext = span.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    setAttribute(name, value) {
      if (value !== undefined) {
        span.setAttribute(name, value);
      }
    },
    setAttributes(attributes) {
      span.setAttributes(attributes);
    },
    recordException(error) {
      span.recordException(normalizeException(error));
    },
    setStatus(status, message) {
      span.setStatus({ code: resolveStatus(status), message });
    },
    end() {
      span.end();
    },
  };
}

function buildSpanProcessors(config: DesktopObservabilityConfig): SpanProcessor[] {
  if (!config.tracing.enabled) {
    return [];
  }

  const processors: SpanProcessor[] = [];
  if (config.tracing.otlpEndpoint) {
    processors.push(new BatchSpanProcessor(new OTLPTraceExporter({
      url: config.tracing.otlpEndpoint,
      headers: config.tracing.headers,
    })));
  }

  if (config.tracing.consoleExporter) {
    processors.push(new BatchSpanProcessor(new ConsoleSpanExporter()));
  }

  return processors;
}

function resolveAggregateStatus(checks: DesktopHealthCheck[]): DesktopHealthStatus {
  if (checks.some((item) => item.status === "unhealthy")) {
    return "unhealthy";
  }
  if (checks.some((item) => item.status === "degraded")) {
    return "degraded";
  }
  return "healthy";
}

export class DesktopObservabilityService
  implements DesktopTracePort, DesktopHealthCheckPort {
  private readonly provider: BasicTracerProvider;
  private readonly checks = new Map<string, DesktopHealthCheck>();

  constructor(
    private readonly config: DesktopObservabilityConfig,
    private readonly logger: RuntimeLogger,
  ) {
    this.provider = new BasicTracerProvider({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: config.serviceName,
        [ATTR_SERVICE_NAMESPACE]: config.serviceNamespace,
        [ATTR_SERVICE_INSTANCE_ID]: config.serviceInstanceId,
        ...(config.serviceVersion ? { [ATTR_SERVICE_VERSION]: config.serviceVersion } : {}),
      }),
      spanProcessors: buildSpanProcessors(config),
    });

    this.setCheck({
      name: "desktop.observability",
      status: "healthy",
      message: config.tracing.enabled ? "Tracing configured" : "Tracing disabled",
      attributes: {
        tracingEnabled: config.tracing.enabled,
        otlpEndpointConfigured: Boolean(config.tracing.otlpEndpoint),
        consoleExporter: config.tracing.consoleExporter,
      },
    });
  }

  startSpan(input: DesktopTraceInput): DesktopTraceSpan {
    const tracer = this.provider.getTracer(this.config.serviceName);
    return toDesktopSpan(tracer.startSpan(input.name, {
      attributes: input.attributes,
    }));
  }

  trace<T>(
    input: DesktopTraceInput,
    callback: (span: DesktopTraceSpan) => T | Promise<T>,
  ): T | Promise<T> {
    const span = this.startSpan(input);
    try {
      const result = callback(span);
      if (result instanceof Promise) {
        return result.then(
          (value) => {
            span.setStatus("ok");
            span.end();
            return value;
          },
          (error) => {
            span.recordException(error);
            span.setStatus("error", error instanceof Error ? error.message : String(error));
            span.end();
            throw error;
          },
        );
      }

      span.setStatus("ok");
      span.end();
      return result;
    } catch (error) {
      span.recordException(error);
      span.setStatus("error", error instanceof Error ? error.message : String(error));
      span.end();
      throw error;
    }
  }

  setCheck(input: {
    name: string;
    status: DesktopHealthStatus;
    message?: string;
    attributes?: Record<string, unknown>;
  }): DesktopHealthCheck {
    const check = {
      name: input.name.trim() || "desktop.unknown",
      status: input.status,
      message: input.message,
      checkedAt: nowIso(),
      attributes: input.attributes,
    } satisfies DesktopHealthCheck;
    this.checks.set(check.name, check);
    return check;
  }

  async check(): Promise<DesktopHealthReport> {
    const checks = Array.from(this.checks.values());
    const report = {
      status: resolveAggregateStatus(checks),
      checkedAt: nowIso(),
      checks,
    } satisfies DesktopHealthReport;

    await this.logger.info("Desktop health checked", {
      context: {
        status: report.status,
        checks: report.checks.map((item) => ({
          name: item.name,
          status: item.status,
        })),
      },
    });

    return report;
  }

  async dispose(): Promise<void> {
    await this.provider.shutdown();
  }
}