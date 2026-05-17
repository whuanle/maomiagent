import type {
  DesktopModelBatchToggleInput,
  DesktopModelChannelItem,
  DesktopModelChannelListQuery,
  DesktopModelChannelStateItem,
  DesktopModelCreateChannelInput,
  DesktopModelCreateChannelResponse,
  DesktopModelDeleteChannelResponse,
  DesktopModelDiscoveryResponse,
  DesktopModelProviderItem,
  DesktopModelResolvedRuntimeTarget,
  DesktopModelRuntimeSelectionQuery,
  DesktopModelRuntimeSelectionSnapshot,
  DesktopModelsSnapshot,
  DesktopModelUpdateChannelInput,
} from "../models/desktop-models.models";

export interface DesktopModelsQueryPort {
  listProviders(): Promise<DesktopModelProviderItem[]>;
  listChannels(input?: DesktopModelChannelListQuery): Promise<DesktopModelChannelItem[]>;
  getSnapshot(): Promise<DesktopModelsSnapshot>;
  resolveRuntimeTarget(
    input?: DesktopModelRuntimeSelectionQuery,
  ): Promise<DesktopModelResolvedRuntimeTarget>;
  getRuntimeSelectionSnapshot(
    input?: DesktopModelRuntimeSelectionQuery,
  ): Promise<DesktopModelRuntimeSelectionSnapshot>;
  listChannelModels(
    providerType: string,
    channelId: string,
  ): Promise<DesktopModelChannelStateItem[]>;
}

export interface DesktopModelsCommandPort {
  createChannel(
    providerType: string,
    input: DesktopModelCreateChannelInput,
  ): Promise<DesktopModelCreateChannelResponse>;
  updateChannel(
    providerType: string,
    channelId: string,
    input: DesktopModelUpdateChannelInput,
  ): Promise<DesktopModelChannelItem | null>;
  setChannelEnabled(
    providerType: string,
    channelId: string,
    enabled: boolean,
  ): Promise<DesktopModelChannelItem | null>;
  removeChannel(
    providerType: string,
    channelId: string,
  ): Promise<DesktopModelDeleteChannelResponse>;
  setModelEnabled(
    providerType: string,
    channelId: string,
    modelId: string,
    enabled: boolean,
  ): Promise<DesktopModelChannelStateItem | null>;
  batchSetModelEnabled(
    providerType: string,
    channelId: string,
    updates: DesktopModelBatchToggleInput[],
  ): Promise<DesktopModelChannelStateItem[]>;
  discoverChannelModels(
    providerType: string,
    channelId: string,
  ): Promise<DesktopModelDiscoveryResponse>;
}

export type DesktopModelsPort = DesktopModelsQueryPort & DesktopModelsCommandPort;