import type { LanguageCode } from "../../config/titlebar";
import type { Translate } from "../../i18n";

export type SkillsPageProps = {
  active: boolean;
  language: LanguageCode;
  t: Translate;
};