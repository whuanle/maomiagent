export type FeishuI18nKey = string;

export type FeishuTranslate = (
  key: FeishuI18nKey,
  params?: Record<string, string | number>,
) => string;
