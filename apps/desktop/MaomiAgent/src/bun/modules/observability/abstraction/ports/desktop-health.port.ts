import type {
  DesktopHealthCheck,
  DesktopHealthReport,
  DesktopHealthStatus,
} from "../models/desktop-health.models";

export type DesktopHealthCheckPort = {
  setCheck: (input: {
    name: string;
    status: DesktopHealthStatus;
    message?: string;
    attributes?: Record<string, unknown>;
  }) => DesktopHealthCheck;
  check: () => Promise<DesktopHealthReport>;
};