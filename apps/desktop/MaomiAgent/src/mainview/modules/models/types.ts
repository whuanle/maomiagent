import type {
  DesktopModelChannelItem,
  DesktopModelChannelHeaderMap,
  DesktopModelProviderConfigValue,
} from "../../../shared/desktop-models";
import type { LanguageCode } from "../../config/titlebar";
import type { Translate } from "../../i18n";

export type ModelsPageProps = {
  active: boolean;
  language: LanguageCode;
  t: Translate;
};

export type ModelsChannelFormMode = "provider" | "protocol";

export type ModelsChannelEditorState =
  | {
      mode: "create";
      preferredProviderType?: string;
    }
  | {
      mode: "edit";
      item: DesktopModelChannelItem;
    };

export type ModelsChannelFormValues = {
  sourceMode: ModelsChannelFormMode;
  providerType: string;
  providerProtocolId?: string;
  protocolId?: string;
  channelId: string;
  name: string;
  baseUrl?: string;
  config: Record<string, DesktopModelProviderConfigValue>;
  headers?: Array<{
    key?: string;
    value?: string;
  }>;
  enabled: boolean;
};

export type ModelsChannelHeaderRow = {
  key: string;
  value: string;
};

export function buildModelsChannelHeaders(
  headers: ModelsChannelFormValues["headers"],
): DesktopModelChannelHeaderMap | undefined {
  if (!Array.isArray(headers)) {
    return undefined;
  }

  const normalized = headers
    .map((entry) => ({
      key: entry?.key?.trim() ?? "",
      value: entry?.value?.trim() ?? "",
    }))
    .filter((entry) => entry.key.length > 0 && entry.value.length > 0);

  return normalized.length > 0
    ? Object.fromEntries(normalized.map((entry) => [entry.key, entry.value] as const))
    : undefined;
}

export type ModelsModalFilter = "all" | "enabled" | "disabled" | "custom";
