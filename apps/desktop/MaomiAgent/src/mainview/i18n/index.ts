import type { LanguageCode } from "../config/titlebar";
import { enUSMessages } from "./en-US";
import { zhCNMessages, type I18nKey } from "./zh-CN";

export type I18nParams = Record<string, string | number>;
export type Translate = (key: I18nKey, params?: I18nParams) => string;

const dictionaries: Record<LanguageCode, Record<I18nKey, string>> = {
  "zh-CN": zhCNMessages,
  "en-US": enUSMessages,
};

export function createTranslator(language: LanguageCode): Translate {
  const dictionary = dictionaries[language] || dictionaries["zh-CN"];

  return (key, params) => {
    const template = dictionary[key] ?? dictionaries["zh-CN"][key] ?? key;
    if (!params) {
      return template;
    }

    return template.replace(/\{([^}]+)\}/g, (token, paramKey: string) => {
      if (!(paramKey in params)) {
        return token;
      }
      return String(params[paramKey]);
    });
  };
}

export type { I18nKey };