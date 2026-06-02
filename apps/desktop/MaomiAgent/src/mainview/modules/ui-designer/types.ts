import type { Translate } from "../../i18n";
import type { LanguageCode } from "../../config/titlebar";

export type UiDesignerPageProps = {
  active: boolean;
  language: LanguageCode;
  t: Translate;
};
