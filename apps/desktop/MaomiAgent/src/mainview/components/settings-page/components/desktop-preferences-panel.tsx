import { Button } from "antd";
import { Check, Globe2, Palette } from "lucide-react";
import type { LanguageCode } from "../../../config/titlebar";
import type { Translate } from "../../../i18n";
import { APP_THEME_MODES, type AppThemeMode } from "../../../theme/antd-theme";

type Props = {
  t: Translate;
  language: LanguageCode;
  themeMode: AppThemeMode;
  onSelectTheme: (mode: AppThemeMode) => void;
  onSelectLanguage: (language: LanguageCode) => void;
};

function resolveThemeLabel(mode: AppThemeMode, t: Translate) {
  if (mode === "light-modern") {
    return t("标题栏.主题.LightModern");
  }
  if (mode === "light-eye-care") {
    return t("标题栏.主题.LightEyeCare");
  }
  if (mode === "dark") {
    return t("标题栏.主题.暗色");
  }
  if (mode === "tomorrow-night-blue") {
    return t("标题栏.主题.TomorrowNightBlue");
  }
  if (mode === "github") {
    return t("标题栏.主题.GitHub");
  }
  return t("标题栏.主题.亮色");
}

export function DesktopPreferencesPanel(props: Props) {
  return (
    <>
      <section className="settings-page-card">
        <header className="settings-page-card-header">
          <div className="settings-page-card-title-row">
            <Palette size={16} strokeWidth={1.9} />
            <h2>{props.t("设置页.标题.外观主题")}</h2>
          </div>
        </header>

        <div className="settings-page-theme-grid">
          {APP_THEME_MODES.map((mode) => {
            const active = props.themeMode === mode;
            return (
              <button
                key={mode}
                type="button"
                className={`settings-page-theme-option${active ? " is-active" : ""}`}
                onClick={() => props.onSelectTheme(mode)}
              >
                <span className="settings-page-theme-option-copy">
                  <span className="settings-page-theme-option-name">
                    {resolveThemeLabel(mode, props.t)}
                  </span>
                  <span className={`settings-page-theme-option-swatch settings-page-theme-option-swatch-${mode}`} />
                </span>
                {active ? <Check size={16} strokeWidth={2} /> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-page-card">
        <header className="settings-page-card-header">
          <div className="settings-page-card-title-row">
            <Globe2 size={16} strokeWidth={1.9} />
            <h2>{props.t("设置页.标题.界面语言")}</h2>
          </div>
        </header>

        <div className="settings-page-language-grid">
          <Button
            type={props.language === "zh-CN" ? "primary" : "default"}
            onClick={() => props.onSelectLanguage("zh-CN")}
          >
            {props.t("设置页.语言.简体中文")}
          </Button>
          <Button
            type={props.language === "en-US" ? "primary" : "default"}
            onClick={() => props.onSelectLanguage("en-US")}
          >
            {props.t("设置页.语言.English")}
          </Button>
        </div>
      </section>
    </>
  );
}