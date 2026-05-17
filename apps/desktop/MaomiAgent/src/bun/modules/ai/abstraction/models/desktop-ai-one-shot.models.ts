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
  contextWindow?: number;
  maxOutputTokens?: number;
};

export type DesktopAiExecutionMaterialization = {
  executionProfile: AiExecutionProfileRef;
  runtimeSelector: DesktopAiProviderRuntimeLookupInput;
  resolveServiceConfig: DesktopAiProviderServiceConfigResolver;
  target: DesktopAiOneShotTarget;
};

export type DesktopAiOneShotResult = OneShotExecutionResult & {
  target: DesktopAiOneShotTarget;
};