import type {
  AiExecutionProfileRef,
  OneShotExecutionInput,
  OneShotExecutionResult,
} from "../../kernel-bridge";
import type {
  DesktopModelScope,
  DesktopModelProviderApiStyle,
  DesktopModelProviderProtocolFamily,
} from "../../../../../shared/desktop-models";
import type {
  DesktopAiProviderRuntimeLookupInput,
  DesktopAiRuntimeCapabilities,
  DesktopAiProviderServiceConfigResolver,
} from "./desktop-ai-runtime.models";

export type DesktopAiExecutionProfileMaterializationInput = {
  scope?: DesktopModelScope;
  workspaceId?: string;
  selectedChannelId?: string;
  selectedModelId?: string;
};

export type DesktopAiOneShotInput = DesktopAiExecutionProfileMaterializationInput
  & Omit<OneShotExecutionInput, "executionProfile">;

export type DesktopAiOneShotTarget = {
  providerType: string;
  channelId: string;
  modelId: string;
  protocolFamily?: DesktopModelProviderProtocolFamily;
  apiStyle?: DesktopModelProviderApiStyle;
  supportsFunctionCall?: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
};

export type DesktopAiProtocolIdentity = {
  protocolFamily: DesktopModelProviderProtocolFamily;
  apiStyle: DesktopModelProviderApiStyle;
};

export type DesktopAiExecutionMaterialization = {
  executionProfile: AiExecutionProfileRef;
  runtimeSelector: DesktopAiProviderRuntimeLookupInput;
  protocolIdentity?: DesktopAiProtocolIdentity;
  capabilities?: DesktopAiRuntimeCapabilities;
  resolveServiceConfig: DesktopAiProviderServiceConfigResolver;
  target: DesktopAiOneShotTarget;
};

export type DesktopAiOneShotResult = OneShotExecutionResult & {
  target: DesktopAiOneShotTarget;
};
