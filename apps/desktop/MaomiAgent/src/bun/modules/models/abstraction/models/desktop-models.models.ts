export {
  DESKTOP_MODEL_CHANNEL_ID_RE,
  isValidDesktopModelChannelId,
  normalizeDesktopModelChannelId,
} from "../../../../../shared/desktop-models";

import type { DesktopAiProviderServiceConfig } from "../../../ai/abstraction/models/desktop-ai-runtime.models";

export type {
  DesktopDiscoveredChannelModel,
  DesktopModelBatchToggleInput,
  DesktopModelChannelItem,
  DesktopModelChannelListQuery,
  DesktopModelChannelListResponse,
  DesktopModelChannelModelsResponse,
  DesktopModelChannelStateItem,
  DesktopModelProviderApiStyle,
  DesktopModelProviderConfigField,
  DesktopModelProviderConfigFieldOption,
  DesktopModelProviderConfigFieldRole,
  DesktopModelProviderConfigFieldType,
  DesktopModelProviderDeploymentKind,
  DesktopModelProviderDiscoveryKind,
  DesktopModelCreateChannelInput,
  DesktopModelProviderRuntimeStatus,
  DesktopModelProviderRuntimeSupport,
  DesktopModelCreateChannelResponse,
  DesktopModelDeleteChannelResponse,
  DesktopModelDiscoveryResponse,
  DesktopModelInterleavedConfig,
  DesktopModelModalities,
  DesktopModelProviderConfigValue,
  DesktopModelProviderItem,
  DesktopModelProviderListResponse,
  DesktopModelProviderModelItem,
  DesktopModelProviderProtocolFamily,
  DesktopModelRuntimeSelectionQuery,
  DesktopModelRuntimeSelectionResponse,
  DesktopModelRuntimeSelectionSnapshot,
  DesktopModelsSnapshot,
  DesktopModelUpdateChannelInput,
} from "../../../../../shared/desktop-models";

export type DesktopModelResolvedRuntimeTarget = {
  providerType: string;
  channelId: string;
  modelId: string;
  protocolFamily?: import("../../../../../shared/desktop-models").DesktopModelProviderProtocolFamily;
  apiStyle?: import("../../../../../shared/desktop-models").DesktopModelProviderApiStyle;
  contextWindow?: number;
  maxOutputTokens?: number;
  serviceConfig: DesktopAiProviderServiceConfig;
};