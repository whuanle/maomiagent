export type {
  DesktopObservabilityConfig,
  DesktopObservabilityConfigInput,
} from "./abstraction/models/desktop-observability-config";
export type {
  DesktopHealthCheck,
  DesktopHealthReport,
  DesktopHealthStatus,
} from "./abstraction/models/desktop-health.models";
export type {
  DesktopSpanStatus,
  DesktopTraceInput,
  DesktopTraceSpan,
} from "./abstraction/models/desktop-tracing.models";
export type { DesktopHealthCheckPort } from "./abstraction/ports/desktop-health.port";
export type { DesktopTracePort } from "./abstraction/ports/desktop-tracing.port";
export {
  DESKTOP_HEALTH_CHECK_PORT,
  DESKTOP_OBSERVABILITY_CONFIG,
  DESKTOP_TRACE_PORT,
} from "./abstraction/tokens";
export {
  DESKTOP_OBSERVABILITY_SERVICE_TOKEN,
  DesktopObservabilityModule,
} from "./composition/observability.module";