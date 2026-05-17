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
};