import type {
  DesktopModelProviderApiStyle,
  DesktopModelProviderProtocolFamily,
} from "../../../../../shared/desktop-models";
import type {
  AiExecutionProfileRef,
  RetryBackoffPolicy,
} from "../../kernel-bridge";

export type DesktopAiProviderRuntimeLookupInput = {
  bindingId?: string;
  protocolFamily?: DesktopModelProviderProtocolFamily;
  apiStyle?: DesktopModelProviderApiStyle;
};

export type DesktopAiProviderRuntimeSupportInput = {
  providerType: string;
  protocolFamily?: DesktopModelProviderProtocolFamily;
  apiStyle?: DesktopModelProviderApiStyle;
};

export type DesktopAiProviderRuntimeBinding = {
  id: string;
  protocolFamily: DesktopModelProviderProtocolFamily;
  apiStyle: DesktopModelProviderApiStyle;
  adapterId: string;
};

export type DesktopAiProviderTelemetryStage =
  | "request_built"
  | "request_sent"
  | "response_headers"
  | "first_byte"
  | "first_protocol_frame"
  | "first_ai_event"
  | "stream_finished";

export type DesktopAiProviderTelemetryEvent = {
  stage: DesktopAiProviderTelemetryStage;
  protocolFamily?: DesktopModelProviderProtocolFamily;
  apiStyle?: DesktopModelProviderApiStyle;
  providerType?: string;
  modelId?: string;
  runId?: string;
  turnId?: string;
  status?: number;
  contentType?: string;
  requestDurationMs?: number;
  firstByteLatencyMs?: number;
  firstEventLatencyMs?: number;
};

export type DesktopAiProviderTelemetrySink = (
  event: DesktopAiProviderTelemetryEvent,
) => void | Promise<void>;

export type DesktopAiRuntimeCapabilities = {
  supportsFunctionCall?: boolean;
  supportsReasoning?: boolean;
  supportsStructuredOutput?: boolean;
  supportsAttachments?: boolean;
  supportsTemperature?: boolean;
  supportsParallelToolCalls?: boolean;
  supportsInterleavedReasoning?: boolean;
  supportsSystemBlocks?: boolean;
  supportsJsonMode?: boolean;
};

export type DesktopAiProviderServiceConfig = {
  apiKey: string;
  baseUrl?: string;
  headers?: Readonly<Record<string, string>>;
  organization?: string;
  project?: string;
  timeoutMs?: number;
  store?: boolean;
  parallelToolCalls?: boolean;
  reasoning?: {
    effort?: string;
    summary?: string;
  };
};

export type DesktopAiProviderServiceConfigResolver = (
  executionProfile: AiExecutionProfileRef,
) => DesktopAiProviderServiceConfig | Promise<DesktopAiProviderServiceConfig>;

export type DesktopAiProviderRuntimeCreateTurnPortInput = {
  resolveServiceConfig: DesktopAiProviderServiceConfigResolver;
  fetchFn?: typeof fetch;
  retryPolicy?: RetryBackoffPolicy;
  sleepFn?: (ms: number) => Promise<void>;
  telemetrySink?: DesktopAiProviderTelemetrySink;
};
