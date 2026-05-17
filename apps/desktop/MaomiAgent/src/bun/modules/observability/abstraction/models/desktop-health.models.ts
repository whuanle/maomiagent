export type DesktopHealthStatus = "healthy" | "degraded" | "unhealthy";

export type DesktopHealthCheck = {
  name: string;
  status: DesktopHealthStatus;
  message?: string;
  checkedAt: string;
  attributes?: Record<string, unknown>;
};

export type DesktopHealthReport = {
  status: DesktopHealthStatus;
  checkedAt: string;
  checks: DesktopHealthCheck[];
};