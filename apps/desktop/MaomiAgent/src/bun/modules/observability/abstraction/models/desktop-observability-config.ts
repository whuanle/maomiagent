export type DesktopObservabilityConfig = {
  serviceName: string;
  serviceNamespace: string;
  serviceVersion?: string;
  serviceInstanceId: string;
  tracing: {
    enabled: boolean;
    otlpEndpoint?: string;
    consoleExporter: boolean;
    headers?: Record<string, string>;
  };
};

export type DesktopObservabilityConfigInput = Partial<{
  serviceName: string;
  serviceNamespace: string;
  serviceVersion: string;
  serviceInstanceId: string;
  tracing: Partial<{
    enabled: boolean;
    otlpEndpoint: string;
    consoleExporter: boolean;
    headers: Record<string, string>;
  }>;
}>;