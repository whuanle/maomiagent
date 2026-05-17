import { createServiceNamespace } from "../../../shared/ioc";
import type { DesktopObservabilityConfig } from "./models/desktop-observability-config";
import type { DesktopHealthCheckPort } from "./ports/desktop-health.port";
import type { DesktopTracePort } from "./ports/desktop-tracing.port";

const desktopObservability = createServiceNamespace("desktop.observability");

export const DESKTOP_OBSERVABILITY_CONFIG =
  desktopObservability.token<DesktopObservabilityConfig>("config");

export const DESKTOP_TRACE_PORT =
  desktopObservability.token<DesktopTracePort>("tracing");

export const DESKTOP_HEALTH_CHECK_PORT =
  desktopObservability.token<DesktopHealthCheckPort>("health");