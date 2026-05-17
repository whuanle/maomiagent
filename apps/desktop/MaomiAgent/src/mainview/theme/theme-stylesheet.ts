import type { AppThemeMode } from "./antd-theme"

const THEME_STYLESHEET_ID = "maomiagent-theme-stylesheet"
const darkThemeHref = new URL("./dark.css", import.meta.url).href
const githubThemeHref = new URL("./github.css", import.meta.url).href
const lightEyeCareThemeHref = new URL("./light-eye-care.css", import.meta.url).href
const lightThemeHref = new URL("./light.css", import.meta.url).href
const lightModernThemeHref = new URL("./light-modern.css", import.meta.url).href
const tomorrowNightBlueThemeHref = new URL("./tomorrow-night-blue.css", import.meta.url).href

const THEME_STYLESHEET_MAP: Record<AppThemeMode, string> = {
  light: lightThemeHref,
  "light-modern": lightModernThemeHref,
  "light-eye-care": lightEyeCareThemeHref,
  dark: darkThemeHref,
  "tomorrow-night-blue": tomorrowNightBlueThemeHref,
  github: githubThemeHref,
}

export function applyThemeStylesheet(mode: AppThemeMode) {
  if (typeof document === "undefined") {
    return
  }

  const href = THEME_STYLESHEET_MAP[mode]
  let link = document.getElementById(THEME_STYLESHEET_ID) as HTMLLinkElement | null

  if (!link) {
    link = document.createElement("link")
    link.id = THEME_STYLESHEET_ID
    link.rel = "stylesheet"
    document.head.appendChild(link)
  }

  if (link.href !== href) {
    link.href = href
  }
}
