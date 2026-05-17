import type {
  DesktopModelBatchToggleInput,
  DesktopModelChannelItem,
  DesktopModelChannelListQuery,
  DesktopModelChannelListResponse,
  DesktopModelChannelModelsResponse,
  DesktopModelChannelStateItem,
  DesktopModelCreateChannelInput,
  DesktopModelCreateChannelResponse,
  DesktopModelDeleteChannelResponse,
  DesktopModelDiscoveryResponse,
  DesktopModelProviderListResponse,
  DesktopModelRuntimeSelectionQuery,
  DesktopModelRuntimeSelectionResponse,
  DesktopModelsMutationAction,
  DesktopModelsMutationEvent,
  DesktopModelsSnapshot,
  DesktopModelUpdateChannelInput,
} from "../../shared/desktop-models";
import { DESKTOP_WINDOW_BRIDGE_READY_EVENT } from "./desktop-window";

type DesktopModelsBridge = {
  listDesktopModelProviders: () => Promise<DesktopModelProviderListResponse>;
  listDesktopModelChannels: (
    query?: DesktopModelChannelListQuery,
  ) => Promise<DesktopModelChannelListResponse>;
  getDesktopModelsSnapshot: () => Promise<DesktopModelsSnapshot>;
  getDesktopModelRuntimeSelectionSnapshot: (
    query?: DesktopModelRuntimeSelectionQuery,
  ) => Promise<DesktopModelRuntimeSelectionResponse>;
  listDesktopChannelModels: (
    providerType: string,
    channelId: string,
  ) => Promise<DesktopModelChannelModelsResponse>;
  createDesktopModelChannel: (
    providerType: string,
    input: DesktopModelCreateChannelInput,
  ) => Promise<DesktopModelCreateChannelResponse>;
  updateDesktopModelChannel: (
    providerType: string,
    channelId: string,
    input: DesktopModelUpdateChannelInput,
  ) => Promise<DesktopModelChannelItem | null>;
  setDesktopModelChannelEnabled: (
    providerType: string,
    channelId: string,
    enabled: boolean,
  ) => Promise<DesktopModelChannelItem | null>;
  removeDesktopModelChannel: (
    providerType: string,
    channelId: string,
  ) => Promise<DesktopModelDeleteChannelResponse>;
  setDesktopChannelModelEnabled: (
    providerType: string,
    channelId: string,
    modelId: string,
    enabled: boolean,
  ) => Promise<DesktopModelChannelStateItem | null>;
  batchSetDesktopChannelModelsEnabled: (
    providerType: string,
    channelId: string,
    updates: DesktopModelBatchToggleInput[],
  ) => Promise<DesktopModelChannelModelsResponse>;
  discoverDesktopChannelModels: (
    providerType: string,
    channelId: string,
  ) => Promise<DesktopModelDiscoveryResponse>;
};

declare global {
  interface Window {
    maomiDesktopModels?: DesktopModelsBridge;
  }
}

export const DESKTOP_MODELS_BRIDGE_READY_EVENT = DESKTOP_WINDOW_BRIDGE_READY_EVENT;
export const DESKTOP_MODELS_INVALIDATED_EVENT = "maomi:desktop-models-invalidated";

function getDesktopModelsBridge(): DesktopModelsBridge {
  const bridge = window.maomiDesktopModels;
  if (!bridge) {
    throw new Error("Desktop models bridge is unavailable.");
  }

  return bridge;
}

function emitDesktopModelsInvalidated(
  action: DesktopModelsMutationAction,
  input: {
    providerType: string;
    channelId?: string;
    modelId?: string;
  },
): void {
  const detail: DesktopModelsMutationEvent = {
    action,
    providerType: input.providerType,
    channelId: input.channelId,
    modelId: input.modelId,
    at: new Date().toISOString(),
  };

  window.dispatchEvent(
    new CustomEvent<DesktopModelsMutationEvent>(
      DESKTOP_MODELS_INVALIDATED_EVENT,
      { detail },
    ),
  );
}

export function hasDesktopModelsBridge(): boolean {
  return Boolean(window.maomiDesktopModels);
}

export function listDesktopModelProviders(): Promise<DesktopModelProviderListResponse> {
  return getDesktopModelsBridge().listDesktopModelProviders();
}

export function listDesktopModelChannels(
  query: DesktopModelChannelListQuery = {},
): Promise<DesktopModelChannelListResponse> {
  return getDesktopModelsBridge().listDesktopModelChannels(query);
}

export function getDesktopModelsSnapshot(): Promise<DesktopModelsSnapshot> {
  return getDesktopModelsBridge().getDesktopModelsSnapshot();
}

export function getDesktopModelRuntimeSelectionSnapshot(
  query: DesktopModelRuntimeSelectionQuery = {},
): Promise<DesktopModelRuntimeSelectionResponse> {
  return getDesktopModelsBridge().getDesktopModelRuntimeSelectionSnapshot(query);
}

export function listDesktopChannelModels(
  providerType: string,
  channelId: string,
): Promise<DesktopModelChannelModelsResponse> {
  return getDesktopModelsBridge().listDesktopChannelModels(providerType, channelId);
}

export async function createDesktopModelChannel(
  providerType: string,
  input: DesktopModelCreateChannelInput,
): Promise<DesktopModelCreateChannelResponse> {
  const response = await getDesktopModelsBridge().createDesktopModelChannel(
    providerType,
    input,
  );
  emitDesktopModelsInvalidated("channel.created", {
    providerType,
    channelId: response.item.channelId,
  });
  return response;
}

export async function updateDesktopModelChannel(
  providerType: string,
  channelId: string,
  input: DesktopModelUpdateChannelInput,
): Promise<DesktopModelChannelItem | null> {
  const item = await getDesktopModelsBridge().updateDesktopModelChannel(
    providerType,
    channelId,
    input,
  );
  if (item) {
    emitDesktopModelsInvalidated("channel.updated", {
      providerType,
      channelId: item.channelId,
    });
  }
  return item;
}

export async function setDesktopModelChannelEnabled(
  providerType: string,
  channelId: string,
  enabled: boolean,
): Promise<DesktopModelChannelItem | null> {
  const item = await getDesktopModelsBridge().setDesktopModelChannelEnabled(
    providerType,
    channelId,
    enabled,
  );
  if (item) {
    emitDesktopModelsInvalidated(enabled ? "channel.enabled" : "channel.disabled", {
      providerType,
      channelId: item.channelId,
    });
  }
  return item;
}

export async function removeDesktopModelChannel(
  providerType: string,
  channelId: string,
): Promise<DesktopModelDeleteChannelResponse> {
  const response = await getDesktopModelsBridge().removeDesktopModelChannel(
    providerType,
    channelId,
  );
  if (response.deleted) {
    emitDesktopModelsInvalidated("channel.deleted", {
      providerType,
      channelId: response.channelId,
    });
  }
  return response;
}

export async function setDesktopChannelModelEnabled(
  providerType: string,
  channelId: string,
  modelId: string,
  enabled: boolean,
): Promise<DesktopModelChannelStateItem | null> {
  const item = await getDesktopModelsBridge().setDesktopChannelModelEnabled(
    providerType,
    channelId,
    modelId,
    enabled,
  );
  if (item) {
    emitDesktopModelsInvalidated(enabled ? "model.enabled" : "model.disabled", {
      providerType,
      channelId: item.channelId,
      modelId: item.modelId,
    });
  }
  return item;
}

export async function batchSetDesktopChannelModelsEnabled(
  providerType: string,
  channelId: string,
  updates: DesktopModelBatchToggleInput[],
): Promise<DesktopModelChannelModelsResponse> {
  const response = await getDesktopModelsBridge().batchSetDesktopChannelModelsEnabled(
    providerType,
    channelId,
    updates,
  );
  emitDesktopModelsInvalidated("model.batch-updated", {
    providerType,
    channelId,
  });
  return response;
}

export async function discoverDesktopChannelModels(
  providerType: string,
  channelId: string,
): Promise<DesktopModelDiscoveryResponse> {
  const response = await getDesktopModelsBridge().discoverDesktopChannelModels(
    providerType,
    channelId,
  );
  emitDesktopModelsInvalidated("model.discovered", {
    providerType,
    channelId,
  });
  return response;
}