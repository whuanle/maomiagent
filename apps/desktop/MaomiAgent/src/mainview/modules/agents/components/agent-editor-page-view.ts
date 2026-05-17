import type { ViewMode } from "@mdxeditor/editor"
import type { AgentsTranslate } from "../agents-i18n"

export type PromptViewNotice = {
  tone: "neutral" | "info"
  message: string
}

export function formatPromptViewModeLabel(t: AgentsTranslate, mode: ViewMode): string {
  if (mode === "diff") return t("智能体页.值.Prompt视图.diff")
  if (mode === "source") return t("智能体页.值.Prompt视图.source")
  return t("智能体页.值.Prompt视图.richText")
}

export function resolvePromptViewNotice(input: {
  baselinePrompt: string
  currentPrompt: string
  mode: ViewMode
  t: AgentsTranslate
}): PromptViewNotice | null {
  const { baselinePrompt, currentPrompt, mode, t } = input
  if (mode === "rich-text") {
    return null
  }

  if (mode === "source") {
    return {
      tone: "info",
      message: t("智能体页.提示.Prompt视图.source"),
    }
  }

  const hasBaseline = baselinePrompt.trim().length > 0
  const hasCurrent = currentPrompt.trim().length > 0
  if (!hasBaseline && !hasCurrent) {
    return {
      tone: "neutral",
      message: t("智能体页.提示.Prompt视图.diffEmpty"),
    }
  }

  if (!hasBaseline) {
    return {
      tone: "neutral",
      message: t("智能体页.提示.Prompt视图.diffFromEmpty"),
    }
  }

  if (baselinePrompt === currentPrompt) {
    return {
      tone: "neutral",
      message: t("智能体页.提示.Prompt视图.diffUnchanged"),
    }
  }

  return {
    tone: "neutral",
    message: t("智能体页.提示.Prompt视图.diffCompare"),
  }
}