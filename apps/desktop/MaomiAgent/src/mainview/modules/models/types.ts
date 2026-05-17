import type {
  DesktopModelChannelItem,
  DesktopModelProviderConfigValue,
} from "../../../shared/desktop-models";
import type { LanguageCode } from "../../config/titlebar";
import type { Translate } from "../../i18n";

export type ModelsPageProps = {
  active: boolean;
  language: LanguageCode;
  t: Translate;
};

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
  providerType: string;
  channelId: string;
  name: string;
  baseUrl?: string;
  config: Record<string, DesktopModelProviderConfigValue>;
  enabled: boolean;
};

export type ModelsModalFilter = "all" | "enabled" | "disabled" | "custom";